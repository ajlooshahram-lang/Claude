import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { hashPassword } from "../../src/auth/password.js";
import { generateTotpSecret } from "../../src/auth/totp.js";
import { clearLockoutStore } from "../../src/auth/lockout.js";
import { clearPendingMfaTokens, sweepExpiredMfaTokens } from "../../src/auth/routes.js";
import type { AuthDbHelpers, DbUser } from "../../src/auth/db-helpers.js";

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
    mfaLastUsedStep: null,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
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

test("mfa-gc: sweepExpiredMfaTokens removes expired tokens", async (t) => {
  const pw = await hashPassword("Correct@Pass123!");
  const secret = generateTotpSecret();
  const user = createMockUser({ passwordHash: pw, mfaEnabled: true, mfaSecret: secret });
  const db = createMockDb({
    findUserByEmail: async () => user,
  });
  const app = await buildApp({ config: testConfig, dbHelpers: db });
  t.after(() => app.close());

  // Login to create a pending MFA token
  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@example.com", password: "Correct@Pass123!" },
  });
  assert.equal(loginRes.statusCode, 200);
  const { pendingToken } = loginRes.json();
  assert.ok(pendingToken, "Should have a pending token");

  // Sweeping now should NOT remove it (not yet expired)
  const sweptBefore = sweepExpiredMfaTokens();
  assert.equal(sweptBefore, 0, "No tokens should be swept yet");

  // Advance time past expiry (5 minutes + 1 second)
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => originalNow() + 5 * 60 * 1000 + 1000;

  // Now sweep should remove the expired token
  const sweptAfter = sweepExpiredMfaTokens();
  assert.equal(sweptAfter, 1, "Should have swept 1 expired token");

  // Trying to use the token should fail
  Date.now = originalNow; // restore for the request
  const mfaRes = await app.inject({
    method: "POST",
    url: "/auth/login/mfa",
    payload: { pendingToken, totpCode: "123456" },
  });
  assert.equal(mfaRes.statusCode, 401);
});

test("mfa-gc: sweepExpiredMfaTokens returns 0 when store is empty", () => {
  clearPendingMfaTokens();
  const swept = sweepExpiredMfaTokens();
  assert.equal(swept, 0);
});
