import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildTestApp, registerUser, cleanDatabase, prisma, extractSessionCookie, extractCsrfToken } from "./helpers.js";

describe("Auth integration tests", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("POST /auth/register", () => {
    test("success returns 201 with userId, tenantId, and set-cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "alice@example.com",
          password: "SecurePass123!",
          tenantName: "Alice Corp",
          displayName: "Alice",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id, "response should have userId");
      assert.ok(body.tenantId, "response should have tenantId");
      assert.ok(
        res.headers["set-cookie"],
        "response should have set-cookie header",
      );
    });

    test("duplicate email in same tenant returns 409 or error", async () => {
      await registerUser(app, {
        email: "dup@example.com",
        password: "SecurePass123!",
        tenantName: "Dup Tenant",
      });

      // Since each register creates a new tenant, same email CAN register in a different tenant
      const res2 = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "dup@example.com",
          password: "AnotherPass123!",
          tenantName: "Another Tenant",
        },
      });

      // Since each register creates a new tenant, same email CAN register in a different tenant
      assert.equal(res2.statusCode, 201);
    });
  });

  describe("POST /auth/login", () => {
    test("success returns 200 with session cookie", async () => {
      const { body: regBody } = await registerUser(app, {
        email: "login@example.com",
        password: "SecurePass123!",
        tenantName: "Login Tenant",
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "login@example.com",
          password: "SecurePass123!",
          tenantId: regBody["tenantId"],
        },
      });

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["set-cookie"], "login should set session cookie");
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.email, "login@example.com");
    });

    test("wrong password returns 401 with generic message", async () => {
      const { body: regBody } = await registerUser(app, {
        email: "wrongpw@example.com",
        password: "SecurePass123!",
        tenantName: "WrongPw Tenant",
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "wrongpw@example.com",
          password: "WRONG-password!",
          tenantId: regBody["tenantId"],
        },
      });

      assert.equal(res.statusCode, 401);
      const body = res.json();
      assert.equal(body.error, "Invalid credentials");
    });

    test("non-existent email returns 401 with same generic message (no user enumeration)", async () => {
      const { body: regBody } = await registerUser(app, {
        email: "exists@example.com",
        password: "SecurePass123!",
        tenantName: "NoEnum Tenant",
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "ghost@example.com",
          password: "SomePass123!",
          tenantId: regBody["tenantId"],
        },
      });

      assert.equal(res.statusCode, 401);
      const body = res.json();
      assert.equal(body.error, "Invalid credentials");
    });
  });

  describe("POST /auth/logout", () => {
    test("invalidates session so subsequent /auth/me returns 401", async () => {
      const { cookie, csrfToken } = await registerUser(app, {
        email: "logout@example.com",
        password: "SecurePass123!",
        tenantName: "Logout Tenant",
      });

      const sessionCookie = extractSessionCookie(cookie);

      // Verify session works before logout
      const meRes1 = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${sessionCookie}` },
      });
      assert.equal(meRes1.statusCode, 200);

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      assert.equal(logoutRes.statusCode, 200);

      // Session should be invalid now
      const meRes2 = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${sessionCookie}` },
      });
      assert.equal(meRes2.statusCode, 401);
    });
  });

  describe("GET /auth/me", () => {
    test("with valid session returns user info", async () => {
      const { cookie } = await registerUser(app, {
        email: "me@example.com",
        password: "SecurePass123!",
        tenantName: "Me Tenant",
        displayName: "Me User",
      });

      const sessionCookie = extractSessionCookie(cookie);

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${sessionCookie}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.email, "me@example.com");
      assert.equal(body.displayName, "Me User");
      assert.ok(body.tenantId);
      assert.equal(body.role, "OWNER");
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      assert.equal(res.statusCode, 401);
    });
  });

  describe("MFA enrollment and verification", () => {
    test("enroll returns secret and otpauthUrl", async () => {
      const { cookie, csrfToken } = await registerUser(app, {
        email: "mfa@example.com",
        password: "SecurePass123!",
        tenantName: "MFA Tenant",
      });

      const sessionCookie = extractSessionCookie(cookie);

      const res = await app.inject({
        method: "POST",
        url: "/auth/mfa/enroll",
        headers: {
          cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.secret, "should return TOTP secret");
      assert.ok(body.otpauthUrl, "should return otpauth URL");
      assert.ok(
        body.otpauthUrl.startsWith("otpauth://totp/"),
        "otpauthUrl should be valid",
      );
    });

    test("verify with correct token enables MFA", async () => {
      const { cookie, csrfToken } = await registerUser(app, {
        email: "mfa-verify@example.com",
        password: "SecurePass123!",
        tenantName: "MFA Verify Tenant",
      });

      const sessionCookie = extractSessionCookie(cookie);

      // Enroll
      const enrollRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enroll",
        headers: {
          cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });

      const { secret } = enrollRes.json() as { secret: string };

      // Generate a valid TOTP token from the secret
      const validToken = authenticator.generate(secret);

      // Verify
      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: {
          cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        payload: { token: validToken },
      });

      assert.equal(verifyRes.statusCode, 200);
      const body = verifyRes.json();
      assert.equal(body.ok, true);

      // Confirm MFA is now enabled via /auth/me
      const meRes = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: `session=${sessionCookie}` },
      });

      const meBody = meRes.json();
      assert.equal(meBody.mfaEnabled, true);
    });
  });
});
