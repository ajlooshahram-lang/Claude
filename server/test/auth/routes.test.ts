import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken } from "../../src/auth/session.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { hashPassword } from "../../src/auth/password.js";
import { generateTotpSecret, generateCurrentTotp } from "../../src/auth/totp.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens } from "../../src/auth/routes.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";

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
    findMembershipByUserId: async () => ({ id: "m-1", tenantId: "tenant-1", userId: "user-1", role: "OWNER" as const }),
    updateUserMfa: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  clearLockoutStore();
  clearPendingMfaTokens();
});

test("routes: POST /auth/register success returns 201", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

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
  const body = res.json();
  assert.equal(body.user.email, "new@example.com");
  const cookies = res.cookies;
  const sessionCookie = cookies.find((c: { name: string }) => c.name === SESSION_COOKIE_NAME);
  assert.ok(sessionCookie, "Session cookie should be set");
});

test("routes: POST /auth/register duplicate email returns 409", async (t) => {
  const db = createMockDb({
    findUserByEmail: async () => createMockUser(),
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "existing@example.com",
      password: "StrongP@ss2024!",
      displayName: "Existing User",
    },
  });
  assert.equal(res.statusCode, 409);
});

test("routes: POST /auth/register weak password returns 400", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "new@example.com",
      password: "short",
      displayName: "New User",
    },
  });
  assert.equal(res.statusCode, 400);
});

test("routes: POST /auth/login success returns 200 with cookie", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const user = createMockUser({ passwordHash: pw });
  const db = createMockDb({
    findUserByEmail: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "Correct@Pass123!" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.email, "test@example.com");
  const cookies = res.cookies;
  const sessionCookie = cookies.find((c: { name: string }) => c.name === SESSION_COOKIE_NAME);
  assert.ok(sessionCookie);
});

test("routes: POST /auth/login wrong password returns 401", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const user = createMockUser({ passwordHash: pw });
  const db = createMockDb({
    findUserByEmail: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "WrongPassword99!" },
  });
  assert.equal(res.statusCode, 401);
});

test("routes: POST /auth/login locked account returns 423", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const user = createMockUser({ passwordHash: pw });
  const db = createMockDb({
    findUserByEmail: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // Trigger lockout
  for (let i = 0; i < 5; i++) {
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@example.com", password: "WrongPassword99!" },
    });
  }

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "Correct@Pass123!" },
  });
  assert.equal(res.statusCode, 423);
});

test("routes: POST /auth/login with MFA returns pendingToken", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });
  const db = createMockDb({
    findUserByEmail: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "Correct@Pass123!" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.mfaRequired, true);
  assert.ok(body.pendingToken);
});

test("routes: POST /auth/login/mfa with valid code succeeds", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });
  const db = createMockDb({
    findUserByEmail: async () => user,
    findUserById: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // Login to get pending token
  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "Correct@Pass123!" },
  });
  const { pendingToken } = loginRes.json();

  const code = generateCurrentTotp(secret);
  const res = await app.inject({
    method: "POST",
    url: "/auth/login/mfa",
    payload: { pendingToken, totpCode: code },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.email, "test@example.com");
});

test("routes: POST /auth/logout clears session", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  let revoked = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    revokeSession: async () => { revoked = true; },
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/logout",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(revoked, true);
});

test("routes: GET /auth/me with valid session returns user", async (t) => {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
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
});

test("routes: GET /auth/me without session returns 401", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({ method: "GET", url: "/auth/me" });
  assert.equal(res.statusCode, 401);
});

test("routes: POST /auth/mfa/enroll returns secret and URI", async (t) => {
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
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.secret);
  assert.ok(body.uri.startsWith("otpauth://totp/"));
});

test("routes: POST /auth/mfa/verify enables MFA", async (t) => {
  const secret = generateTotpSecret();
  const user = createMockUser({ mfaSecret: secret });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  let mfaUpdated = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserMfa: async () => { mfaUpdated = true; },
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const code = generateCurrentTotp(secret);
  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/verify",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { totpCode: code },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(mfaUpdated, true);
});

test("routes: POST /auth/mfa/disable with valid creds succeeds", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  let mfaDisabled = false;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    updateUserMfa: async (_id, data) => { if (!data.mfaEnabled) mfaDisabled = true; },
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const code = generateCurrentTotp(secret);
  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/disable",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { password: "Correct@Pass123!", totpCode: code },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(mfaDisabled, true);
});
