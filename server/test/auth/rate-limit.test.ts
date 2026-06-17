import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens } from "../../src/auth/routes.js";
import type { AuthDbHelpers, DbUser } from "../../src/auth/db-helpers.js";

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

function createMockDb(overrides: Partial<AuthDbHelpers> = {}): AuthDbHelpers {
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createUserWithTenant: async () => ({
      user: createMockUser(),
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
    replaceRecoveryCodes: async () => {},
    listRecoveryCodes: async () => [],
    markRecoveryCodeUsed: async () => {},
    countUnusedRecoveryCodes: async () => 0,
    deleteExpiredSessions: async () => 0,
    deleteAuditLogsOlderThan: async () => 0,
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  clearLockoutStore();
  clearPendingMfaTokens();
});

test("rate-limit: POST /auth/login returns 429 after exceeding the per-route limit", async (t) => {
  // User does not exist -> every login returns 401 (no account lockout is
  // triggered for a non-existent email beyond the in-memory counter), so the
  // status transition we observe is purely the rate limiter kicking in.
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const limit = 10;
  let sawRateLimited = false;

  // Fire limit + 2 requests; the requests beyond the limit must be rejected
  // with HTTP 429 (Too Many Requests) by the limiter, not reach the handler.
  for (let i = 0; i < limit + 2; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "SomePassword123!" },
    });
    if (res.statusCode === 429) {
      sawRateLimited = true;
    }
  }

  assert.equal(sawRateLimited, true, "expected at least one 429 after exceeding the login rate limit");
});

test("rate-limit: POST /auth/login/mfa returns 429 after exceeding the per-route limit", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const limit = 10;
  let sawRateLimited = false;

  for (let i = 0; i < limit + 2; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login/mfa",
      payload: { pendingToken: "fake-token", totpCode: "123456" },
    });
    if (res.statusCode === 429) {
      sawRateLimited = true;
    }
  }

  assert.equal(sawRateLimited, true, "expected at least one 429 after exceeding the MFA login rate limit");
});

test("rate-limit: a normal single login attempt is not rate limited", async (t) => {
  const db = createMockDb();
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "nobody@example.com", password: "SomePassword123!" },
  });
  // 401 (invalid credentials), definitely not 429.
  assert.equal(res.statusCode, 401);
});
