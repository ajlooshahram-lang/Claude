import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import { hashPassword } from "../../src/auth/password.js";
import { generateTotpSecret } from "../../src/auth/totp.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens } from "../../src/auth/routes.js";
import {
  generateRecoveryCodes,
  generateRecoveryCode,
  normalizeCode,
} from "../../src/auth/recovery.js";
import type {
  AuthDbHelpers,
  DbUser,
  DbSession,
  DbRecoveryCode,
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
const PASSWORD = "Correct@Pass123!";

function createMockUser(overrides: Partial<DbUser> = {}): DbUser {
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
    updateUserMfaLastStep: async () => {},
    replaceRecoveryCodes: async () => {},
    listRecoveryCodes: async () => [],
    markRecoveryCodeUsed: async () => {},
    countUnusedRecoveryCodes: async () => 0,
    updateUserPassword: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

/**
 * A small stateful, in-memory recovery-code store the mock DB can delegate to,
 * so tests can exercise generate -> store -> verify -> mark-used end to end.
 */
function makeRecoveryStore() {
  let codes: DbRecoveryCode[] = [];
  let seq = 0;
  return {
    helpers: {
      replaceRecoveryCodes: async (_userId: string, hashes: string[]) => {
        codes = hashes.map((codeHash) => ({ id: "rc-" + seq++, codeHash, usedAt: null }));
      },
      listRecoveryCodes: async () => codes.map((c) => ({ ...c })),
      markRecoveryCodeUsed: async (id: string) => {
        const c = codes.find((x) => x.id === id);
        if (c) c.usedAt = new Date();
      },
      countUnusedRecoveryCodes: async () => codes.filter((c) => c.usedAt === null).length,
    },
    get codes() {
      return codes;
    },
  };
}

beforeEach(() => {
  clearLockoutStore();
  clearPendingMfaTokens();
});

// ---------------------------------------------------------------------------
// normalizeCode unit tests
// ---------------------------------------------------------------------------

test("normalizeCode: strips hyphens, spaces and uppercases", () => {
  assert.equal(normalizeCode("7k9qd-2mxr4"), "7K9QD2MXR4");
  assert.equal(normalizeCode("7K9QD 2MXR4"), "7K9QD2MXR4");
  assert.equal(normalizeCode("  7k9qd - 2mxr4  "), "7K9QD2MXR4");
  assert.equal(normalizeCode("7K9QD2MXR4"), "7K9QD2MXR4");
});

test("generateRecoveryCode: matches XXXXX-XXXXX format from the safe alphabet", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateRecoveryCode();
    assert.match(code, /^[2-9A-HJ-NP-TV-Z]{5}-[2-9A-HJ-NP-TV-Z]{5}$/);
  }
});

test("generateRecoveryCodes: returns the requested count of distinct codes", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
});

// ---------------------------------------------------------------------------
// POST /auth/mfa/recovery-codes/generate
// ---------------------------------------------------------------------------

test("generate: returns 10 codes, replaces existing set, audits (MFA enabled)", async (t) => {
  const user = createMockUser({ mfaEnabled: true, mfaSecret: generateTotpSecret() });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const store = makeRecoveryStore();
  const auditActions: string[] = [];

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    ...store.helpers,
    createAuditLog: async (data: CreateAuditLogInput) => {
      auditActions.push(data.action);
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/recovery-codes/generate",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.codes.length, 10);
  assert.equal(body.count, 10);
  // Codes are stored (hashed) and the plaintext is NOT any of the hashes.
  assert.equal(store.codes.length, 10);
  assert.ok(store.codes.every((c) => c.codeHash !== ""));
  assert.ok(!store.codes.some((c) => body.codes.includes(c.codeHash)));
  assert.ok(auditActions.includes("auth.mfa.recovery.generate"));
});

test("generate: regenerating replaces the previous set", async (t) => {
  const user = createMockUser({ mfaEnabled: true, mfaSecret: generateTotpSecret() });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  const store = makeRecoveryStore();

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    ...store.helpers,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: "/auth/mfa/recovery-codes/generate",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  const firstCodes = first.json().codes as string[];
  const firstHashes = store.codes.map((c) => c.codeHash);

  const second = await app.inject({
    method: "POST",
    url: "/auth/mfa/recovery-codes/generate",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  const secondCodes = second.json().codes as string[];
  const secondHashes = store.codes.map((c) => c.codeHash);

  assert.equal(store.codes.length, 10); // not 20 — replaced, not appended
  assert.notDeepEqual(firstCodes, secondCodes);
  assert.notDeepEqual(firstHashes, secondHashes);
});

test("generate: MFA not enabled returns 400", async (t) => {
  const user = createMockUser({ mfaEnabled: false });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);
  let replaceCalled = false;

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    replaceRecoveryCodes: async () => {
      replaceCalled = true;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/recovery-codes/generate",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "MFA is not enabled");
  assert.equal(replaceCalled, false);
});

test("generate: unauthenticated returns 401", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/recovery-codes/generate",
    cookies: { [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });

  assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// GET /auth/mfa/recovery-codes/status
// ---------------------------------------------------------------------------

test("status: returns enabled flag and remaining count", async (t) => {
  const user = createMockUser({ mfaEnabled: true, mfaSecret: generateTotpSecret() });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    countUnusedRecoveryCodes: async () => 7,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/auth/mfa/recovery-codes/status",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { enabled: true, remaining: 7 });
});

// ---------------------------------------------------------------------------
// POST /auth/login/mfa/recovery
// ---------------------------------------------------------------------------

/**
 * Build an app whose mock DB holds a known set of recovery codes for an
 * MFA-enabled user, returning the plaintext codes so tests can log in with them.
 */
async function setupRecoveryLoginApp(t: { after: (fn: () => unknown) => void }) {
  const pw = await hashPassword(PASSWORD);
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });

  const plaintext = generateRecoveryCodes(10);
  const stored: DbRecoveryCode[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    stored.push({ id: "rc-" + i, codeHash: await hashPassword(normalizeCode(plaintext[i] as string)), usedAt: null });
  }
  const auditActions: string[] = [];

  const db = createMockDb({
    findUserByEmail: async () => user,
    findUserById: async () => user,
    listRecoveryCodes: async () => stored.map((c) => ({ ...c })),
    markRecoveryCodeUsed: async (id: string) => {
      const c = stored.find((x) => x.id === id);
      if (c) c.usedAt = new Date();
    },
    countUnusedRecoveryCodes: async () => stored.filter((c) => c.usedAt === null).length,
    createAuditLog: async (data: CreateAuditLogInput) => {
      auditActions.push(data.action);
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  async function login() {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@example.com", password: PASSWORD },
    });
    return res.json().pendingToken as string;
  }

  return { app, plaintext, stored, auditActions, login };
}

test("recovery login: valid code returns 200 + session, marks code used, audits", async (t) => {
  const { app, plaintext, stored, auditActions, login } = await setupRecoveryLoginApp(t);

  const pendingToken = await login();
  const res = await app.inject({
    method: "POST",
    url: "/auth/login/mfa/recovery",
    // Use a forgiving (lowercased) form to exercise normalization.
    payload: { pendingToken, recoveryCode: (plaintext[0] as string).toLowerCase() },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.user.email, "test@example.com");
  assert.equal(body.remainingRecoveryCodes, 9);
  // Session cookie minted.
  const sessionCookie = res.cookies.find((c: { name: string }) => c.name === SESSION_COOKIE_NAME);
  assert.ok(sessionCookie);
  // The matched code is now marked used.
  assert.notEqual(stored[0]!.usedAt, null);
  assert.ok(auditActions.includes("auth.login.mfa.recovery"));
});

test("recovery login: a used code cannot be reused (second attempt 401)", async (t) => {
  const { app, plaintext, login } = await setupRecoveryLoginApp(t);

  const firstToken = await login();
  const first = await app.inject({
    method: "POST",
    url: "/auth/login/mfa/recovery",
    payload: { pendingToken: firstToken, recoveryCode: plaintext[0] as string },
  });
  assert.equal(first.statusCode, 200);

  const secondToken = await login();
  const second = await app.inject({
    method: "POST",
    url: "/auth/login/mfa/recovery",
    payload: { pendingToken: secondToken, recoveryCode: plaintext[0] as string },
  });
  assert.equal(second.statusCode, 401);
  assert.equal(second.json().error, "Invalid recovery code");
});

test("recovery login: wrong code feeds lockout; 6th attempt returns 423", async (t) => {
  const { app, login } = await setupRecoveryLoginApp(t);

  // 5 wrong recovery codes -> each 401, accumulating the per-user MFA lockout.
  for (let i = 0; i < 5; i++) {
    const token = await login();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login/mfa/recovery",
      payload: { pendingToken: token, recoveryCode: "ZZZZZ-ZZZZZ" },
    });
    assert.equal(res.statusCode, 401);
  }

  // 6th attempt is blocked by the lockout before code verification.
  const lockedToken = await login();
  const locked = await app.inject({
    method: "POST",
    url: "/auth/login/mfa/recovery",
    payload: { pendingToken: lockedToken, recoveryCode: "ZZZZZ-ZZZZZ" },
  });
  assert.equal(locked.statusCode, 423);
});

test("recovery login: invalid pending token returns 401", async (t) => {
  const { app } = await setupRecoveryLoginApp(t);

  const res = await app.inject({
    method: "POST",
    url: "/auth/login/mfa/recovery",
    payload: { pendingToken: "not-a-real-token", recoveryCode: "ZZZZZ-ZZZZZ" },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "Invalid or expired pending token");
});

// ---------------------------------------------------------------------------
// Disable MFA clears recovery codes
// ---------------------------------------------------------------------------

test("disable MFA: clears recovery codes (replaceRecoveryCodes called with [])", async (t) => {
  const { generateCurrentTotp } = await import("../../src/auth/totp.js");
  const pw = await hashPassword(PASSWORD);
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });
  const { token, tokenHash } = generateSessionToken();
  const session = createMockSession(user, tokenHash);

  let clearedWith: string[] | null = null;
  const db = createMockDb({
    findSessionByTokenHash: async () => session,
    findUserById: async () => user,
    replaceRecoveryCodes: async (_userId, hashes) => {
      clearedWith = hashes;
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const code = generateCurrentTotp(secret);
  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/disable",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { password: PASSWORD, totpCode: code },
  });

  assert.equal(res.statusCode, 200);
  assert.notEqual(clearedWith, null);
  assert.deepEqual(clearedWith, []);
});
