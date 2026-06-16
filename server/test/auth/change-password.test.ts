import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import { hashPassword } from "../../src/auth/password.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens } from "../../src/auth/routes.js";
import type {
  AuthDbHelpers,
  DbUser,
  DbSession,
  DbMembership,
  CreateAuditLogInput,
} from "../../src/auth/db-helpers.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ORIGINS: "http://localhost:5173",
  DATA_REGION: "eu-west",
});

/** CSRF token value used in tests to satisfy the double-submit cookie check. */
const TEST_CSRF_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const CURRENT_PASSWORD = "Correct@Pass123!";
const NEW_PASSWORD = "Brand@NewPass456!";

function createMockUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: "user-1",
    tenantId: "tenant-1",
    email: "test@example.com",
    passwordHash: "",
    displayName: "Test User",
    mfaSecret: null,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockSession(user: DbUser, tokenHash: string, overrides: Partial<DbSession> = {}): DbSession {
  return {
    id: "session-1",
    userId: user.id,
    tokenHash,
    userAgent: "test",
    ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    user,
    ...overrides,
  };
}

function createMockDb(overrides: Partial<AuthDbHelpers> = {}): AuthDbHelpers {
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createUserWithTenant: async (data) => {
      const user = createMockUser({
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
      });
      return { user, tenantId: "tenant-1", membershipId: "membership-1" };
    },
    createSession: async () => ({ id: "session-new" }),
    findSessionByTokenHash: async () => null,
    revokeSession: async () => {},
    revokeAllUserSessions: async () => {},
    findMembershipByUserId: async () =>
      ({ id: "m-1", tenantId: "tenant-1", userId: "user-1", role: "OWNER" as const }),
    updateUserMfa: async () => {},
    updateUserPassword: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  clearLockoutStore();
  clearPendingMfaTokens();
});

// ---------------------------------------------------------------------------
// POST /auth/change-password
// ---------------------------------------------------------------------------

test("change-password: success returns 200, rotates password, revokes other sessions, audits", async (t) => {
  const pw = await hashPassword(CURRENT_PASSWORD);
  const user = createMockUser({ passwordHash: pw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  let updatedUserId: string | null = null;
  let revokeArgs: { userId: string; exceptSessionId?: string } | null = null;
  const auditActions: string[] = [];

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserPassword: async (userId) => {
      updatedUserId = userId;
    },
    revokeAllUserSessions: async (userId, exceptSessionId) => {
      revokeArgs = { userId, exceptSessionId };
    },
    createAuditLog: async (data: CreateAuditLogInput) => {
      auditActions.push(data.action);
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { success: true });
  assert.equal(updatedUserId, "user-1");
  // Other sessions revoked, but the current session kept alive as the exception.
  assert.ok(revokeArgs);
  assert.equal(revokeArgs!.userId, "user-1");
  assert.equal(revokeArgs!.exceptSessionId, "session-1");
  assert.ok(auditActions.includes("auth.password.change"));
});

test("change-password: wrong current password returns 401 and does not update", async (t) => {
  const pw = await hashPassword(CURRENT_PASSWORD);
  const user = createMockUser({ passwordHash: pw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  let updateCalled = false;
  const auditActions: string[] = [];

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserPassword: async () => {
      updateCalled = true;
    },
    createAuditLog: async (data: CreateAuditLogInput) => {
      auditActions.push(data.action);
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { currentPassword: "WrongPassword99!", newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "Invalid password");
  assert.equal(updateCalled, false);
  assert.ok(auditActions.includes("auth.password.change.failed"));
});

test("change-password: weak new password returns 400", async (t) => {
  const pw = await hashPassword(CURRENT_PASSWORD);
  const user = createMockUser({ passwordHash: pw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  let updateCalled = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserPassword: async () => {
      updateCalled = true;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { currentPassword: CURRENT_PASSWORD, newPassword: "short" },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(updateCalled, false);
});

test("change-password: new password equal to current returns 400", async (t) => {
  const pw = await hashPassword(CURRENT_PASSWORD);
  const user = createMockUser({ passwordHash: pw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  let updateCalled = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserPassword: async () => {
      updateCalled = true;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { currentPassword: CURRENT_PASSWORD, newPassword: CURRENT_PASSWORD },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "New password must be different from the current password");
  assert.equal(updateCalled, false);
});

test("change-password: unauthenticated returns 401", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 401);
});

test("change-password: missing CSRF token returns 403", async (t) => {
  const pw = await hashPassword(CURRENT_PASSWORD);
  const user = createMockUser({ passwordHash: pw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/change-password",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------------------
// POST /auth/admin/reset-password
// ---------------------------------------------------------------------------

test("admin reset-password: success returns 200, revokes ALL target sessions, audits", async (t) => {
  const adminPw = await hashPassword(CURRENT_PASSWORD);
  const admin = createMockUser({ id: "admin-1", passwordHash: adminPw, email: "admin@example.com" });
  const target = createMockUser({ id: "target-1", email: "target@example.com" });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(admin, tokenHash);

  let updatedUserId: string | null = null;
  let revokeArgs: { userId: string; exceptSessionId?: string } | null = null;
  const auditActions: string[] = [];

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async (id) => (id === "target-1" ? target : id === "admin-1" ? admin : null),
    findMembershipByUserId: async () =>
      ({ id: "m-admin", tenantId: "tenant-1", userId: "admin-1", role: "ADMIN" as const } as DbMembership),
    updateUserPassword: async (userId) => {
      updatedUserId = userId;
    },
    revokeAllUserSessions: async (userId, exceptSessionId) => {
      revokeArgs = { userId, exceptSessionId };
    },
    createAuditLog: async (data: CreateAuditLogInput) => {
      auditActions.push(data.action);
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/admin/reset-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { userId: "target-1", newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { success: true });
  assert.equal(updatedUserId, "target-1");
  // ALL sessions revoked: no exception passed.
  assert.ok(revokeArgs);
  assert.equal(revokeArgs!.userId, "target-1");
  assert.equal(revokeArgs!.exceptSessionId, undefined);
  assert.ok(auditActions.includes("auth.password.admin-reset"));
});

test("admin reset-password: cross-tenant target returns 404", async (t) => {
  const adminPw = await hashPassword(CURRENT_PASSWORD);
  const admin = createMockUser({ id: "admin-1", passwordHash: adminPw, tenantId: "tenant-1" });
  // Target lives in a different tenant.
  const target = createMockUser({ id: "target-1", tenantId: "tenant-2" });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(admin, tokenHash);

  let updateCalled = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async (id) => (id === "target-1" ? target : id === "admin-1" ? admin : null),
    findMembershipByUserId: async () =>
      ({ id: "m-admin", tenantId: "tenant-1", userId: "admin-1", role: "ADMIN" as const } as DbMembership),
    updateUserPassword: async () => {
      updateCalled = true;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/admin/reset-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { userId: "target-1", newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "User not found");
  assert.equal(updateCalled, false);
});

test("admin reset-password: insufficient role (MANAGER) returns 403", async (t) => {
  const managerPw = await hashPassword(CURRENT_PASSWORD);
  const manager = createMockUser({ id: "manager-1", passwordHash: managerPw });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(manager, tokenHash);

  let updateCalled = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => manager,
    findMembershipByUserId: async () =>
      ({ id: "m-mgr", tenantId: "tenant-1", userId: "manager-1", role: "MANAGER" as const } as DbMembership),
    updateUserPassword: async () => {
      updateCalled = true;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/admin/reset-password",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { userId: "target-1", newPassword: NEW_PASSWORD },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(updateCalled, false);
});
