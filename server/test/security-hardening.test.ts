import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  registerUser,
  extractCsrfToken,
  extractSessionCookie,
  cleanDatabase,
  prisma,
} from "./helpers.js";

describe("Security hardening tests", () => {
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

  // -------------------------------------------------------------------------
  // 1. Oversized request body
  // -------------------------------------------------------------------------
  test("oversized request body returns 413", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "oversized@test.com",
      password: "SecurePass123!",
      tenantName: "Oversized Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Create a payload larger than 1MB (1048576 bytes)
    const largePayload = JSON.stringify({
      projectId: "some-project-id",
      problem: "x".repeat(1_100_000),
    });

    const res = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      body: largePayload,
    });

    assert.equal(res.statusCode, 413);
  });

  // -------------------------------------------------------------------------
  // 2. Unknown fields rejected
  // -------------------------------------------------------------------------
  test("unknown fields in request body returns 400", async () => {
    const { cookie, csrfToken, body } = await registerUser(app, {
      email: "unknown-fields@test.com",
      password: "SecurePass123!",
      tenantName: "Unknown Fields Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);
    const tenantId = body["tenantId"] as string;

    // First create a project so we have a valid projectId
    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "Test Project" },
    });
    assert.equal(projRes.statusCode, 201);
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    // Now try to create a case with an extra unknown field
    const res = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId,
        problem: "Test problem",
        hackerField: "evil",
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 3. XSS payload stored safely
  // -------------------------------------------------------------------------
  test("XSS payload in problem field is stored as-is and returned literally", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "xss@test.com",
      password: "SecurePass123!",
      tenantName: "XSS Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Create a project first
    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "XSS Test Project" },
    });
    assert.equal(projRes.statusCode, 201);
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    const xssPayload = "<script>alert(1)</script>";

    // Create a case with XSS payload
    const createRes = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId,
        problem: xssPayload,
      },
    });

    assert.equal(createRes.statusCode, 201);
    const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

    // GET it back and verify the XSS payload is returned literally (not escaped server-side)
    const getRes = await app.inject({
      method: "GET",
      url: `/cases/${caseId}`,
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });

    assert.equal(getRes.statusCode, 200);
    const caseData = getRes.json() as Record<string, unknown>;
    assert.equal(caseData["problem"], xssPayload);
  });

  // -------------------------------------------------------------------------
  // 4. SQL injection in params
  // -------------------------------------------------------------------------
  test("SQL injection in query params does not cause server error", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "sqli@test.com",
      password: "SecurePass123!",
      tenantName: "SQLi Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Test SQL injection via query parameter (goes through Zod validation, then Prisma parameterized query)
    const sqlInjection = "'; DROP TABLE \"Case\";--";
    const res = await app.inject({
      method: "GET",
      url: `/cases?projectId=${encodeURIComponent(sqlInjection)}`,
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });

    // Should return 200 with empty results (parameterized query finds nothing) - NOT 500
    assert.equal(res.statusCode, 200);
    const body = res.json() as unknown[];
    assert.ok(Array.isArray(body), "Response should be an array");

    // Verify the Cases table still exists by making a normal query
    const checkRes = await app.inject({
      method: "GET",
      url: "/cases?projectId=test-project-id",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });
    assert.equal(checkRes.statusCode, 200, "Cases table should still exist after injection attempt");
  });

  // -------------------------------------------------------------------------
  // 5. CSRF token missing
  // -------------------------------------------------------------------------
  test("CSRF token missing returns 403", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "csrf-missing@test.com",
      password: "SecurePass123!",
      tenantName: "CSRF Missing Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Make POST request with session cookie but WITHOUT x-csrf-token header
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        // Intentionally omitting x-csrf-token header
      },
    });

    assert.equal(res.statusCode, 403);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body["error"], "CSRF token missing");
  });

  // -------------------------------------------------------------------------
  // 6. CSRF token mismatch
  // -------------------------------------------------------------------------
  test("CSRF token mismatch returns 403", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "csrf-mismatch@test.com",
      password: "SecurePass123!",
      tenantName: "CSRF Mismatch Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Make POST request with session cookie but WRONG x-csrf-token header
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": "wrong-token-value",
      },
    });

    assert.equal(res.statusCode, 403);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body["error"], "CSRF token mismatch");
  });

  // -------------------------------------------------------------------------
  // 7. Expired session
  // -------------------------------------------------------------------------
  test("expired session returns 401 not 500", async () => {
    const { cookie, csrfToken, body } = await registerUser(app, {
      email: "expired-session@test.com",
      password: "SecurePass123!",
      tenantName: "Expired Session Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);
    const userId = body["id"] as string;

    // Expire all sessions for this user
    await prisma.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 60_000) }, // expired 1 minute ago
    });

    // Try to make an authenticated request
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
  });

  // -------------------------------------------------------------------------
  // 8. Rate limit exceeded (verify rate limiting is configured and enforced)
  // -------------------------------------------------------------------------
  test("rate limit is enforced when not allowlisted", async () => {
    // Build a separate app with rate limiting NOT allowlisting 127.0.0.1
    // by using production mode (requires proper env vars)
    const { buildApp } = await import("../src/app.js");
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig({
      NODE_ENV: "development",
      PORT: "0",
      CORS_ORIGINS: "http://localhost:5173",
      DATABASE_URL: process.env["DATABASE_URL"] ?? "postgresql://qi:qi@localhost:5432/qi_platform?schema=public&host=/projects/sandbox/.pgrun_new",
      SESSION_SECRET: "test-session-secret-not-for-production",
      DATA_REGION: "eu-west",
    });

    const rateLimitApp = await buildApp({ config });

    try {
      // Hit a simple endpoint repeatedly - global limit is 1000 which is too high
      // But auth routes have max: 3 and max: 5, and NODE_ENV != 'test' so no allowList
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const res = await rateLimitApp.inject({
          method: "POST",
          url: "/auth/register",
          payload: {
            email: `ratelimit${i}@dev.com`,
            password: "SecurePass123!",
            tenantName: `Rate Limit Dev Tenant ${i}`,
          },
        });
        responses.push(res);
      }

      // register has max: 3 per minute, no allowlist in dev mode
      const statusCodes = responses.map((r) => r.statusCode);
      const has429 = statusCodes.some((code) => code === 429);
      assert.ok(has429, `Expected at least one 429 response, got status codes: ${statusCodes.join(", ")}`);

      // Verify 429 response includes retry-after header
      const rateLimitedRes = responses.find((r) => r.statusCode === 429);
      assert.ok(rateLimitedRes, "Should have a rate-limited response");
      assert.ok(
        rateLimitedRes.headers["retry-after"] !== undefined,
        "429 response should include Retry-After header",
      );
    } finally {
      await rateLimitApp.close();
    }
  });

  // -------------------------------------------------------------------------
  // 9. Password too short
  // -------------------------------------------------------------------------
  test("password too short on register returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "short-pass@test.com",
        password: "short",
        tenantName: "Short Password Tenant",
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 10. Password too long
  // -------------------------------------------------------------------------
  test("password too long on register returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "long-pass@test.com",
        password: "A".repeat(129),
        tenantName: "Long Password Tenant",
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 11. Invalid enum value
  // -------------------------------------------------------------------------
  test("invalid enum value in project status returns 400", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "invalid-enum@test.com",
      password: "SecurePass123!",
      tenantName: "Invalid Enum Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: {
        name: "Test Project",
        status: "INVALID_STATUS",
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 12. Numeric field out of bounds
  // -------------------------------------------------------------------------
  test("numeric field out of bounds (sev: 11) returns 400", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "out-of-bounds@test.com",
      password: "SecurePass123!",
      tenantName: "OOB Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Create a project first
    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "OOB Test Project" },
    });
    assert.equal(projRes.statusCode, 201);
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    const res = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId,
        problem: "Test problem",
        sev: 11,
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 13. Invalid ID format in path
  // -------------------------------------------------------------------------
  test("invalid ID format is rejected", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "invalid-id@test.com",
      password: "SecurePass123!",
      tenantName: "Invalid ID Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Test via POST /cases with clearly invalid projectId
    // The CreateCaseBody schema passes projectId as z.string().min(1) but
    // the route then does a findFirst which safely returns no results
    // The key assertion: no 500 error (the app handles it gracefully)
    const res = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId: "not-a-valid-id-format!!!",
        problem: "Test problem",
      },
    });

    // Should return 404 (project not found) - NOT 500
    assert.equal(res.statusCode, 404);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body["error"], "Not found");
  });

  // -------------------------------------------------------------------------
  // 14. Soft-deleted resource returns 404
  // -------------------------------------------------------------------------
  test("soft-deleted project returns 404", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "soft-delete@test.com",
      password: "SecurePass123!",
      tenantName: "Soft Delete Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Create a project
    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "Will Be Deleted" },
    });
    assert.equal(projRes.statusCode, 201);
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    // Soft-delete the project
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/projects/${projectId}`,
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
    });
    assert.equal(deleteRes.statusCode, 200);

    // Try to GET the deleted project - should return 404
    const getRes = await app.inject({
      method: "GET",
      url: `/projects/${projectId}`,
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });

    assert.equal(getRes.statusCode, 404);
  });

  // -------------------------------------------------------------------------
  // 15. Non-admin creating share token returns 403
  // -------------------------------------------------------------------------
  test("non-admin (VIEWER) creating share token returns 403", async () => {
    // Register the first user (OWNER role) - create a project
    const { cookie, csrfToken, body } = await registerUser(app, {
      email: "owner@test.com",
      password: "SecurePass123!",
      tenantName: "Share RBAC Tenant",
    });
    const ownerSessionCookie = extractSessionCookie(cookie);
    const tenantId = body["tenantId"] as string;

    // Create a project
    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        cookie: `session=${ownerSessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "RBAC Test Project" },
    });
    assert.equal(projRes.statusCode, 201);
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    // Create a VIEWER user in the same tenant directly via Prisma
    const { hashPassword } = await import("../src/auth/password.js");
    const viewerHash = await hashPassword("ViewerPass123!");
    const viewer = await prisma.user.create({
      data: {
        tenantId,
        email: "viewer@test.com",
        passwordHash: viewerHash,
      },
    });
    await prisma.membership.create({
      data: {
        tenantId,
        userId: viewer.id,
        role: "VIEWER",
      },
    });

    // Login as the VIEWER user
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@test.com",
        password: "ViewerPass123!",
        tenantId,
      },
    });
    assert.equal(loginRes.statusCode, 200);
    const viewerCookie = extractSessionCookie(loginRes.headers["set-cookie"] as string | string[]);
    const viewerCsrf = extractCsrfToken(loginRes.headers["set-cookie"] as string | string[]);

    // Attempt to create a share token as VIEWER - should get 403
    const shareRes = await app.inject({
      method: "POST",
      url: "/shares",
      headers: {
        cookie: `session=${viewerCookie}; csrf_token=${viewerCsrf}`,
        "x-csrf-token": viewerCsrf,
      },
      payload: {
        projectId,
        scope: "VIEWER",
        expiresInHours: 24,
      },
    });

    assert.equal(shareRes.statusCode, 403);
  });

  // -------------------------------------------------------------------------
  // 16. RequestId present in all responses
  // -------------------------------------------------------------------------
  test("X-Request-Id header is present in all responses", async () => {
    // Test on GET /health (no auth needed)
    const healthRes = await app.inject({ method: "GET", url: "/health" });
    assert.ok(
      healthRes.headers["x-request-id"],
      "X-Request-Id should be present on GET /health",
    );
    assert.ok(
      (healthRes.headers["x-request-id"] as string).length > 0,
      "X-Request-Id should be non-empty",
    );

    // Test on POST /auth/register
    const registerRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "requestid@test.com",
        password: "SecurePass123!",
        tenantName: "RequestId Tenant",
      },
    });
    assert.ok(
      registerRes.headers["x-request-id"],
      "X-Request-Id should be present on POST /auth/register",
    );

    const sessionCookie = extractSessionCookie(registerRes.headers["set-cookie"] as string | string[]);
    const csrf = extractCsrfToken(registerRes.headers["set-cookie"] as string | string[]);

    // Test on GET /cases (authenticated endpoint)
    const casesRes = await app.inject({
      method: "GET",
      url: "/cases?projectId=fake-project-id",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrf}`,
      },
    });
    assert.ok(
      casesRes.headers["x-request-id"],
      "X-Request-Id should be present on GET /cases",
    );

    // Verify all IDs are unique (UUID format)
    const ids = new Set([
      healthRes.headers["x-request-id"],
      registerRes.headers["x-request-id"],
      casesRes.headers["x-request-id"],
    ]);
    assert.equal(ids.size, 3, "Each request should have a unique request ID");
  });

  // -------------------------------------------------------------------------
  // 17. Error responses never leak internals
  // -------------------------------------------------------------------------
  test("error responses never leak stack traces, SQL, or file paths", async () => {
    const { cookie, csrfToken } = await registerUser(app, {
      email: "no-leak@test.com",
      password: "SecurePass123!",
      tenantName: "No Leak Tenant",
    });
    const sessionCookie = extractSessionCookie(cookie);

    // Trigger various error conditions and check none leak internals
    const errorResponses: string[] = [];

    // 400 from validation
    const res400 = await app.inject({
      method: "POST",
      url: "/cases",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      payload: { invalid: "data" },
    });
    errorResponses.push(res400.body);

    // 404 from nonexistent resource
    const res404 = await app.inject({
      method: "GET",
      url: "/cases/clxnotarealidentifier123",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });
    errorResponses.push(res404.body);

    // 401 from no auth
    const res401 = await app.inject({
      method: "GET",
      url: "/auth/me",
    });
    errorResponses.push(res401.body);

    // 403 from CSRF
    const res403 = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `session=${sessionCookie}; csrf_token=${csrfToken}`,
      },
    });
    errorResponses.push(res403.body);

    // Check no error response leaks internals
    const dangerousPatterns = [
      "at Object",
      "node_modules",
      ".ts:",
      "SELECT",
      "FROM",
      "ENOENT",
      "stack",
      "prisma",
    ];

    for (const responseBody of errorResponses) {
      for (const pattern of dangerousPatterns) {
        // Case-sensitive check for SQL keywords, case-insensitive for others
        const bodyLower = responseBody.toLowerCase();
        const patternLower = pattern.toLowerCase();
        // Allow "error" field key but not stack-revealing patterns
        if (pattern === "prisma") {
          assert.ok(
            !bodyLower.includes("prisma"),
            `Error response should not contain '${pattern}': ${responseBody}`,
          );
        } else if (pattern === "SELECT" || pattern === "FROM") {
          // These are SQL keywords - check exact case
          assert.ok(
            !responseBody.includes(pattern),
            `Error response should not contain '${pattern}': ${responseBody}`,
          );
        } else {
          assert.ok(
            !bodyLower.includes(patternLower),
            `Error response should not contain '${pattern}': ${responseBody}`,
          );
        }
      }
    }
  });
});
