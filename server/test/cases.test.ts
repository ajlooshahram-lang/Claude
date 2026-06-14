import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma, extractSessionCookie } from "./helpers.js";

describe("Cases CRUD integration tests", () => {
  let app: FastifyInstance;

  // User A context
  let cookieA: string;
  let csrfA: string;
  let tenantIdA: string;
  let projectIdA: string;

  // User B context
  let cookieB: string;
  let csrfB: string;
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
    // Register user A
    const regA = await registerUser(app, {
      email: "userA@alpha.com",
      password: "SecurePass123!",
      tenantName: "Alpha",
      displayName: "User A",
    });
    tenantIdA = regA.body["tenantId"] as string;
    cookieA = extractSessionCookie(regA.cookie);
    csrfA = regA.csrfToken;

    // Register user B
    const regB = await registerUser(app, {
      email: "userB@beta.com",
      password: "SecurePass123!",
      tenantName: "Beta",
      displayName: "User B",
    });
    tenantIdB = regB.body["tenantId"] as string;
    cookieB = extractSessionCookie(regB.cookie);
    csrfB = regB.csrfToken;

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

  describe("POST /cases", () => {
    test("create case returns 201 with case data", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Widget defect rate too high",
          category: "Quality",
          priority: "High",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.problem, "Widget defect rate too high");
      assert.equal(body.category, "Quality");
      assert.equal(body.priority, "High");
      assert.equal(body.tenantId, tenantIdA);
      assert.equal(body.projectId, projectIdA);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/cases",
        payload: {
          projectId: "some-project-id",
          problem: "Test problem",
        },
      });

      assert.equal(res.statusCode, 401);
    });
  });

  describe("GET /cases", () => {
    test("lists cases for user's project", async () => {
      await setupTwoTenants();

      // Create a case first
      await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Issue to list",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/cases?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 1);
      assert.equal((body[0] as Record<string, unknown>)["problem"], "Issue to list");
    });

    test("without projectId returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: "/cases",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("GET /cases/:id", () => {
    test("returns the specific case", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Specific case",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/cases/${caseId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.id, caseId);
      assert.equal(body.problem, "Specific case");
    });
  });

  describe("PATCH /cases/:id", () => {
    test("updates case fields and returns updated case", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Before update",
          priority: "Low",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/cases/${caseId}`,
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          problem: "After update",
          priority: "High",
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.problem, "After update");
      assert.equal(body.priority, "High");
    });
  });

  describe("DELETE /cases/:id", () => {
    test("soft-deletes the case (subsequent GET returns 404, not in list)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "To be deleted",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/cases/${caseId}`,
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
      });
      assert.equal(delRes.statusCode, 200);

      // GET by id should return 404
      const getRes = await app.inject({
        method: "GET",
        url: `/cases/${caseId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      // List should not include deleted case
      const listRes = await app.inject({
        method: "GET",
        url: `/cases?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot POST a case with user A's projectId (returns 404)", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieB}; csrf_token=${csrfB}`,
          "x-csrf-token": csrfB,
        },
        payload: {
          projectId: projectIdA,
          problem: "Cross-tenant write attempt",
        },
      });

      assert.equal(res.statusCode, 404, "Should return 404 when projectId belongs to another tenant");
    });

    test("user B cannot GET user A's case (returns 404, not 403)", async () => {
      await setupTwoTenants();

      // Create case in tenant A
      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Tenant A secret",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // User B tries to access it
      const res = await app.inject({
        method: "GET",
        url: `/cases/${caseId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot PATCH user A's case (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Tenant A data",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/cases/${caseId}`,
        headers: {
          cookie: `session=${cookieB}; csrf_token=${csrfB}`,
          "x-csrf-token": csrfB,
        },
        payload: { problem: "Hacked" },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot DELETE user A's case (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: {
          cookie: `session=${cookieA}; csrf_token=${csrfA}`,
          "x-csrf-token": csrfA,
        },
        payload: {
          projectId: projectIdA,
          problem: "Tenant A protected",
        },
      });

      const caseId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/cases/${caseId}`,
        headers: {
          cookie: `session=${cookieB}; csrf_token=${csrfB}`,
          "x-csrf-token": csrfB,
        },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });
  });
});
