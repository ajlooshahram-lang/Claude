import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";
import { cleanExpiredSessions } from "../src/auth/session.js";

describe("Security integration tests", () => {
  let app: FastifyInstance;

  before(async () => {
    // Ensure DATA_ENCRYPTION_KEY is set for MFA encryption tests
    process.env["DATA_ENCRYPTION_KEY"] = "test-encryption-key-32chars-ok!";
    app = await buildTestApp();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  after(async () => {
    delete process.env["DATA_ENCRYPTION_KEY"];
    await app.close();
    await prisma.$disconnect();
  });

  describe("MFA encryption at rest", () => {
    test("after MFA enroll+verify, mfaSecret in DB is encrypted (not raw base32)", async () => {
      const { cookie, body } = await registerUser(app, {
        email: "mfa-enc@example.com",
        password: "SecurePass123!",
        tenantName: "MFA Encryption Tenant",
      });
      const userId = body["id"] as string;
      const sessionCookie = extractSessionCookie(cookie);

      // Enroll MFA
      const enrollRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enroll",
        headers: { cookie: `session=${sessionCookie}` },
      });
      assert.equal(enrollRes.statusCode, 200);
      const { secret } = enrollRes.json() as { secret: string };

      // Verify MFA with valid TOTP
      const validToken = authenticator.generate(secret);
      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: { cookie: `session=${sessionCookie}` },
        payload: { token: validToken },
      });
      assert.equal(verifyRes.statusCode, 200);

      // Query DB directly for the stored mfaSecret
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      assert.ok(dbUser, "User should exist in DB");
      assert.ok(dbUser.mfaSecret, "mfaSecret should be set");

      // The stored value should NOT be the raw base32 secret
      assert.notEqual(
        dbUser.mfaSecret,
        secret,
        "mfaSecret stored in DB should be encrypted, not the raw base32 secret",
      );

      // The stored value should be in the encrypted format (iv:authTag:ciphertext)
      const parts = dbUser.mfaSecret.split(":");
      assert.equal(parts.length, 3, "Encrypted value should have format iv:authTag:ciphertext");
    });
  });

  describe("POST /auth/change-password", () => {
    test("changes password and old sessions are revoked", async () => {
      const { cookie } = await registerUser(app, {
        email: "changepw@example.com",
        password: "OldPassword123!",
        tenantName: "ChangePassword Tenant",
      });
      const sessionCookie = extractSessionCookie(cookie);

      // Create a second session by logging in again
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "changepw@example.com",
          password: "OldPassword123!",
          tenantId: (
            await app.inject({
              method: "GET",
              url: "/auth/me",
              headers: { cookie: `session=${sessionCookie}` },
            })
          ).json().tenantId as string,
        },
      });
      assert.equal(loginRes.statusCode, 200);
      const secondCookie = extractSessionCookie(loginRes.headers["set-cookie"] as string);

      // Change password using the first session
      const changeRes = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { cookie: `session=${sessionCookie}` },
        payload: {
          currentPassword: "OldPassword123!",
          newPassword: "NewPassword456!",
        },
      });

      assert.equal(changeRes.statusCode, 200);
      const changeBody = changeRes.json();
      assert.equal(changeBody.ok, true);

      // The current session (used for the change) should still work
      const meRes = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${sessionCookie}` },
      });
      assert.equal(meRes.statusCode, 200);

      // The second session should be revoked (401)
      const meRes2 = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${secondCookie}` },
      });
      assert.equal(meRes2.statusCode, 401, "Old session should be revoked after password change");
    });

    test("wrong current password returns 401", async () => {
      const { cookie } = await registerUser(app, {
        email: "wrongcurrent@example.com",
        password: "CorrectPass123!",
        tenantName: "WrongCurrent Tenant",
      });
      const sessionCookie = extractSessionCookie(cookie);

      const res = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { cookie: `session=${sessionCookie}` },
        payload: {
          currentPassword: "WrongPassword123!",
          newPassword: "NewPassword456!",
        },
      });

      assert.equal(res.statusCode, 401);
    });

    test("after password change, login with new password succeeds", async () => {
      const { cookie, body } = await registerUser(app, {
        email: "newlogin@example.com",
        password: "OldPassword123!",
        tenantName: "NewLogin Tenant",
      });
      const sessionCookie = extractSessionCookie(cookie);
      const tenantId = body["tenantId"] as string;

      // Change password
      await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { cookie: `session=${sessionCookie}` },
        payload: {
          currentPassword: "OldPassword123!",
          newPassword: "BrandNewPass789!",
        },
      });

      // Login with new password should succeed
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "newlogin@example.com",
          password: "BrandNewPass789!",
          tenantId,
        },
      });
      assert.equal(loginRes.statusCode, 200);

      // Login with old password should fail
      const oldLoginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "newlogin@example.com",
          password: "OldPassword123!",
          tenantId,
        },
      });
      assert.equal(oldLoginRes.statusCode, 401);
    });
  });

  describe("cleanExpiredSessions", () => {
    test("removes sessions with past expiresAt", async () => {
      const { body } = await registerUser(app, {
        email: "expired@example.com",
        password: "SecurePass123!",
        tenantName: "Expired Tenant",
      });
      const userId = body["id"] as string;

      // Manually create an expired session in DB
      await prisma.session.create({
        data: {
          userId,
          tokenHash: "expired-session-hash-for-test-0001",
          expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
        },
      });

      // Also create a valid session for contrast
      await prisma.session.create({
        data: {
          userId,
          tokenHash: "valid-session-hash-for-test-00002",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        },
      });

      // Count sessions before cleanup (user has: registration session + expired + valid)
      const beforeCount = await prisma.session.count({ where: { userId } });
      assert.ok(beforeCount >= 3, `Expected at least 3 sessions, got ${beforeCount}`);

      // Run cleanup
      await cleanExpiredSessions(prisma);

      // The expired session should be gone
      const expiredSession = await prisma.session.findUnique({
        where: { tokenHash: "expired-session-hash-for-test-0001" },
      });
      assert.equal(expiredSession, null, "Expired session should be deleted");

      // The valid session should still exist
      const validSession = await prisma.session.findUnique({
        where: { tokenHash: "valid-session-hash-for-test-00002" },
      });
      assert.ok(validSession, "Valid session should still exist");
    });

    test("removes revoked sessions", async () => {
      const { body } = await registerUser(app, {
        email: "revoked@example.com",
        password: "SecurePass123!",
        tenantName: "Revoked Tenant",
      });
      const userId = body["id"] as string;

      // Manually create a revoked session in DB
      await prisma.session.create({
        data: {
          userId,
          tokenHash: "revoked-session-hash-for-test-003",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(Date.now() - 60_000), // revoked 1 min ago
        },
      });

      // Run cleanup
      await cleanExpiredSessions(prisma);

      // The revoked session should be gone
      const revokedSession = await prisma.session.findUnique({
        where: { tokenHash: "revoked-session-hash-for-test-003" },
      });
      assert.equal(revokedSession, null, "Revoked session should be deleted");
    });
  });
});

/** Extract the raw session token value from a set-cookie header string. */
function extractSessionCookie(setCookieHeader: string): string {
  const match = setCookieHeader.match(/session=([^;]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract session cookie from: ${setCookieHeader}`);
  }
  return match[1];
}
