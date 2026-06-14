import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Shares integration tests", () => {
  let app: FastifyInstance;

  // User A context
  let cookieA: string;
  let tenantIdA: string;
  let projectIdA: string;

  // User B context
  let cookieB: string;
  let tenantIdB: string;
  let projectIdB: string;

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

  /** Setup two users in different tenants with projects. */
  async function setupTwoTenants() {
    const regA = await registerUser(app, {
      email: "userA@alpha.com",
      password: "SecurePass123!",
      tenantName: "Alpha",
      displayName: "User A",
    });
    tenantIdA = regA.body["tenantId"] as string;
    cookieA = extractSessionCookie(regA.cookie);

    const regB = await registerUser(app, {
      email: "userB@beta.com",
      password: "SecurePass123!",
      tenantName: "Beta",
      displayName: "User B",
    });
    tenantIdB = regB.body["tenantId"] as string;
    cookieB = extractSessionCookie(regB.cookie);

    // Create project for tenant A
    const projA = await prisma.project.create({
      data: { tenantId: tenantIdA, name: "Project Alpha" },
    });
    projectIdA = projA.id;

    // Create project for tenant B
    const projB = await prisma.project.create({
      data: { tenantId: tenantIdB, name: "Project Beta" },
    });
    projectIdB = projB.id;
  }

  describe("POST /shares", () => {
    test("create share token returns 201 with token info", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          projectId: projectIdA,
          scope: "VIEWER",
          expiresInHours: 24,
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.ok(body.token, "Should return the raw token");
      assert.equal(body.scope, "VIEWER");
      assert.equal(body.projectId, projectIdA);
      assert.ok(body.expiresAt);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/shares",
        payload: {
          projectId: "some-id",
          scope: "VIEWER",
          expiresInHours: 24,
        },
      });

      assert.equal(res.statusCode, 401);
    });

    test("with invalid scope returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          projectId: projectIdA,
          scope: "ADMIN",
          expiresInHours: 24,
        },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("GET /shares", () => {
    test("lists active share tokens for a project", async () => {
      await setupTwoTenants();

      // Create two shares
      await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });
      await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "MANAGER", expiresInHours: 48 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/shares?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 2);
    });

    test("without projectId returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("DELETE /shares/:id", () => {
    test("revokes a share token", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });
      const shareId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/shares/${shareId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // Listing should not include revoked tokens
      const listRes = await app.inject({
        method: "GET",
        url: `/shares?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("GET /shared/:token (public endpoint)", () => {
    test("valid token returns project data without auth", async () => {
      await setupTwoTenants();

      // Create a share token
      const createRes = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });
      const token = (createRes.json() as Record<string, unknown>)["token"] as string;

      // Access via public endpoint (no cookie)
      const res = await app.inject({
        method: "GET",
        url: `/shared/${token}`,
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.project, "Should return project data");
      assert.equal(body.project.id, projectIdA);
      assert.equal(body.scope, "VIEWER");
      assert.ok(Array.isArray(body.cases));
      assert.ok(Array.isArray(body.registers));
    });

    test("expired token is rejected (returns 404)", async () => {
      await setupTwoTenants();

      // Create a share token with 1 hour expiry
      const createRes = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 1 },
      });
      const shareBody = createRes.json() as Record<string, unknown>;
      const token = shareBody["token"] as string;
      const shareId = shareBody["id"] as string;

      // Manually set expiresAt to the past in DB to simulate expiry
      await prisma.shareToken.update({
        where: { id: shareId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      // Try to access
      const res = await app.inject({
        method: "GET",
        url: `/shared/${token}`,
      });

      assert.equal(res.statusCode, 404, "Expired token should return 404");
    });

    test("revoked token is rejected (returns 404)", async () => {
      await setupTwoTenants();

      // Create then revoke
      const createRes = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });
      const shareBody = createRes.json() as Record<string, unknown>;
      const token = shareBody["token"] as string;
      const shareId = shareBody["id"] as string;

      // Revoke
      await app.inject({
        method: "DELETE",
        url: `/shares/${shareId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      // Try to access with revoked token
      const res = await app.inject({
        method: "GET",
        url: `/shared/${token}`,
      });

      assert.equal(res.statusCode, 404, "Revoked token should return 404");
    });

    test("invalid token returns 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/shared/totally-invalid-token-value",
      });

      assert.equal(res.statusCode, 404);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot create share for user A's project (returns 404)", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieB}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });

      assert.equal(res.statusCode, 404, "Should return 404 for cross-tenant project");
    });

    test("user B cannot list user A's share tokens", async () => {
      await setupTwoTenants();

      // User A creates a share
      await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });

      // User B tries to list shares for A's project
      const res = await app.inject({
        method: "GET",
        url: `/shares?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 0, "User B should not see user A's share tokens");
    });

    test("user B cannot revoke user A's share token (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/shares",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, scope: "VIEWER", expiresInHours: 24 },
      });
      const shareId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/shares/${shareId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
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
