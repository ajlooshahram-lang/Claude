import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken } from "../../src/auth/session.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import type { AuthDbHelpers, DbSession, DbUser, DbMembership } from "../../src/auth/db-helpers.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ORIGINS: "http://localhost:5173",
  DATA_REGION: "eu-west",
});

function createMockUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: "user-1",
    tenantId: "tenant-1",
    email: "test@example.com",
    passwordHash: "hashedpw",
    displayName: "Test User",
    mfaSecret: null,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockSession(user: DbUser, overrides: Partial<DbSession> = {}): DbSession {
  return {
    id: "session-1",
    userId: user.id,
    tokenHash: "tokenhash",
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
    createUserWithTenant: async () => ({ user: createMockUser(), tenantId: "t-1", membershipId: "m-1" }),
    createSession: async () => ({ id: "s-1" }),
    findSessionByTokenHash: async () => null,
    revokeSession: async () => {},
    revokeAllUserSessions: async () => {},
    findMembershipByUserId: async () => null,
    updateUserMfa: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

test("middleware: requireAuth allows valid session", async (t) => {
  const user = createMockUser();
  const { token } = generateSessionToken();
  const session = createMockSession(user);

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.id, "user-1");
  assert.equal(body.user.email, "test@example.com");
});

test("middleware: requireAuth rejects missing session cookie", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
  });
  assert.equal(res.statusCode, 401);
  const body = res.json();
  assert.equal(body.error, "Authentication required");
});

test("middleware: requireAuth rejects expired session", async (t) => {
  const user = createMockUser();
  const { token } = generateSessionToken();
  const session = createMockSession(user, {
    expiresAt: new Date(Date.now() - 1000), // expired
  });

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 401);
  const body = res.json();
  assert.equal(body.error, "Session expired");
});

test("middleware: requireAuth rejects revoked session", async (t) => {
  const user = createMockUser();
  const { token } = generateSessionToken();
  const session = createMockSession(user, {
    revokedAt: new Date(), // revoked
  });

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 401);
  const body = res.json();
  assert.equal(body.error, "Session revoked");
});

test("middleware: requireAuth rejects invalid token (no session found)", async (t) => {
  const { token } = generateSessionToken();

  const db = createMockDb({
    findSessionByTokenHash: async () => null,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/me",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 401);
  const body = res.json();
  assert.equal(body.error, "Invalid session");
});
