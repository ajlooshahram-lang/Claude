import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens } from "../../src/auth/routes.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ORIGINS: "http://localhost:5173",
  DATA_REGION: "eu-west",
});

function createMockUser(): DbUser {
  return {
    id: "user-1",
    tenantId: "tenant-1",
    email: "test@example.com",
    passwordHash: "",
    displayName: "Test User",
    mfaSecret: null,
    mfaEnabled: false,
    mfaLastUsedStep: null,
    lastLoginAt: null,
    createdAt: new Date(),
  };
}

function createMockSession(user: DbUser, tokenHash: string): DbSession {
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
  };
}

function createMockDb(overrides: Partial<AuthDbHelpers> = {}): AuthDbHelpers {
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createUserWithTenant: async (data) => ({
      user: { ...createMockUser(), email: data.email, passwordHash: data.passwordHash, displayName: data.displayName },
      tenantId: "tenant-1",
      membershipId: "membership-1",
    }),
    createSession: async () => ({ id: "session-new" }),
    findSessionByTokenHash: async () => null,
    revokeSession: async () => {},
    revokeAllUserSessions: async () => {},
    findMembershipByUserId: async () => ({ id: "m-1", tenantId: "tenant-1", userId: "user-1", role: "OWNER" as const }),
    updateUserMfa: async () => {},
    updateUserMfaLastStep: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

const CSRF_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

beforeEach(() => {
  clearLockoutStore();
  clearPendingMfaTokens();
});

test("csrf-enforcement: POST /auth/register is CSRF-exempt", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // No CSRF token provided - should still work (exempt route)
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "new@example.com",
      password: "StrongP@ss2024!",
      displayName: "New User",
    },
  });
  assert.equal(res.statusCode, 201);
});

test("csrf-enforcement: POST /auth/login is CSRF-exempt", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // No CSRF token provided - should still work (exempt route)
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "SomePassword123!" },
  });
  // 401 because user not found, not 403 (CSRF)
  assert.equal(res.statusCode, 401);
});

test("csrf-enforcement: POST /auth/login/mfa is CSRF-exempt", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // No CSRF token - should get 401 (invalid token), not 403 (CSRF)
  const res = await app.inject({
    method: "POST",
    url: "/auth/login/mfa",
    payload: { pendingToken: "fake-token", totpCode: "123456" },
  });
  assert.equal(res.statusCode, 401);
});

test("csrf-enforcement: POST /auth/logout returns 403 without CSRF token", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/logout",
    cookies: { [SESSION_COOKIE_NAME]: token },
    // No CSRF cookie or header
  });
  assert.equal(res.statusCode, 403);
  const body = res.json();
  assert.equal(body.error, "CSRF validation failed");
});

test("csrf-enforcement: POST /auth/logout succeeds with valid CSRF", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    revokeSession: async () => {},
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/logout",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
});

test("csrf-enforcement: POST /auth/mfa/enroll returns 403 without CSRF", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/enroll",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 403);
});

test("csrf-enforcement: mismatched CSRF header and cookie returns 403", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    revokeSession: async () => {},
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/logout",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: "wrong-token-value-does-not-match-the-cookie-at-all-padding!" },
  });
  assert.equal(res.statusCode, 403);
});

test("csrf-enforcement: GET /auth/me does not require CSRF", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // GET is not a state-changing method - no CSRF needed
  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
});
