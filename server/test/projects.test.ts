import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Projects CRUD integration tests", () => {
  let app: FastifyInstance;

  // User A context
  let cookieA: string;
  let tenantIdA: string;

  // User B context
  let cookieB: string;
  let tenantIdB: string;

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

  /** Setup two users in different tenants. */
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
  }

  describe("POST /projects", () => {
    test("create project returns 201 with project data", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          name: "Fiber Cable Network",
          sponsor: "ACME Corp",
          manager: "Alice",
          status: "PLANNING",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.name, "Fiber Cable Network");
      assert.equal(body.sponsor, "ACME Corp");
      assert.equal(body.manager, "Alice");
      assert.equal(body.status, "PLANNING");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/projects",
        payload: { name: "Unauthorized Project" },
      });

      assert.equal(res.statusCode, 401);
    });

    test("missing name returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { sponsor: "No name provided" },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("GET /projects", () => {
    test("lists projects for user's tenant", async () => {
      await setupTwoTenants();

      // Create two projects
      await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Project One" },
      });
      await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Project Two" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 2);
    });

    test("does not include soft-deleted projects", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Will be deleted" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Soft-delete
      await app.inject({
        method: "DELETE",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      const listRes = await app.inject({
        method: "GET",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
      });

      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("GET /projects/:id", () => {
    test("returns a single project", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Single Project" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.id, projectId);
      assert.equal(body.name, "Single Project");
    });

    test("returns 404 for nonexistent project", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: "/projects/00000000-0000-0000-0000-000000000000",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 404);
    });
  });

  describe("PATCH /projects/:id", () => {
    test("updates project fields and returns updated project", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Before Update", status: "PLANNING" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "After Update", status: "IN_PROGRESS" },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.name, "After Update");
      assert.equal(body.status, "IN_PROGRESS");
    });
  });

  describe("DELETE /projects/:id", () => {
    test("soft-deletes the project (subsequent GET returns 404, not in list)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "To be deleted" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // GET by id should return 404
      const getRes = await app.inject({
        method: "GET",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      // List should not include deleted project
      const listRes = await app.inject({
        method: "GET",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot GET user A's project (returns 404, not 403)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Tenant A Secret Project" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot PATCH user A's project (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Tenant A Protected" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieB}` },
        payload: { name: "Hacked" },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot DELETE user A's project (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Tenant A Indestructible" },
      });
      const projectId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/projects/${projectId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B's project list does not include user A's projects", async () => {
      await setupTwoTenants();

      // Create project for user A
      await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "A's Project" },
      });

      // Create project for user B
      await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieB}` },
        payload: { name: "B's Project" },
      });

      // User B's list should only have their own project
      const res = await app.inject({
        method: "GET",
        url: "/projects",
        headers: { cookie: `session=${cookieB}` },
      });

      const list = res.json() as Array<Record<string, unknown>>;
      assert.equal(list.length, 1);
      assert.equal(list[0]!["name"], "B's Project");
      assert.equal(list[0]!["tenantId"], tenantIdB);
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
