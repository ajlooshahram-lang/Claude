import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma, extractSessionCookie } from "./helpers.js";

describe("Registers CRUD integration tests", () => {
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
    const regA = await registerUser(app, {
      email: "userA@alpha.com",
      password: "SecurePass123!",
      tenantName: "Alpha",
      displayName: "User A",
    });
    tenantIdA = regA.body["tenantId"] as string;
    cookieA = extractSessionCookie(regA.cookie);
    csrfA = regA.csrfToken;

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

  describe("POST /registers/:type", () => {
    test("create hazop register row returns 201", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: {
          projectId: projectIdA,
          data: { node: "P-101", deviation: "High pressure", consequence: "Pipe burst" },
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.registerType, "hazop");
      assert.equal(body.projectId, projectIdA);
      assert.equal(body.tenantId, tenantIdA);
      assert.deepEqual(body.data, { node: "P-101", deviation: "High pressure", consequence: "Pipe burst" });
    });

    test("create calibration register row returns 201", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/registers/calibration",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: {
          projectId: projectIdA,
          data: { instrument: "PT-200", dueDate: "2025-06-15", tolerance: "0.1%" },
          pinned: true,
          sortOrder: 1,
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.equal(body.registerType, "calibration");
      assert.equal(body.pinned, true);
      assert.equal(body.sortOrder, 1);
    });

    test("invalid register type returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/registers/invalid_type",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { foo: "bar" } },
      });

      assert.equal(res.statusCode, 400);
      const body = res.json();
      assert.equal(body.error, "Invalid register type");
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        payload: { projectId: "some-id", data: {} },
      });

      assert.equal(res.statusCode, 401);
    });
  });

  describe("GET /registers/:type", () => {
    test("lists register rows by type and projectId", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { node: "P-101" }, sortOrder: 2 },
      });
      await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { node: "P-102" }, sortOrder: 1 },
      });

      await app.inject({
        method: "POST",
        url: "/registers/calibration",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { instrument: "TT-100" } },
      });

      const res = await app.inject({
        method: "GET",
        url: `/registers/hazop?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 2);
      assert.equal((body[0] as Record<string, unknown>)["sortOrder"], 1);
      assert.equal((body[1] as Record<string, unknown>)["sortOrder"], 2);
    });

    test("without projectId returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });

    test("invalid type on GET returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: `/registers/bogus?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("PATCH /registers/:type/:id", () => {
    test("updates register row data", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { node: "P-101", status: "open" } },
      });
      const rowId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/registers/hazop/${rowId}`,
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { data: { node: "P-101", status: "closed" }, pinned: true },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.deepEqual(body.data, { node: "P-101", status: "closed" });
      assert.equal(body.pinned, true);
    });
  });

  describe("DELETE /registers/:type/:id", () => {
    test("soft-deletes a register row (subsequent GET does not include it)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/registers/calibration",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { instrument: "TT-100" } },
      });
      const rowId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/registers/calibration/${rowId}`,
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
      });
      assert.equal(delRes.statusCode, 200);

      const listRes = await app.inject({
        method: "GET",
        url: `/registers/calibration?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot create register row in user A's project (returns 404)", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieB}; csrf_token=${csrfB}`, "x-csrf-token": csrfB },
        payload: { projectId: projectIdA, data: { attack: true } },
      });

      assert.equal(res.statusCode, 404, "Should return 404 for cross-tenant project");
    });

    test("user B cannot see user A's register rows", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { secret: "data" } },
      });

      const res = await app.inject({
        method: "GET",
        url: `/registers/hazop?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 0, "User B should see no rows from user A's project");
    });

    test("user B cannot PATCH user A's register row (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { original: true } },
      });
      const rowId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/registers/hazop/${rowId}`,
        headers: { cookie: `session=${cookieB}; csrf_token=${csrfB}`, "x-csrf-token": csrfB },
        payload: { data: { hacked: true } },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot DELETE user A's register row (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}; csrf_token=${csrfA}`, "x-csrf-token": csrfA },
        payload: { projectId: projectIdA, data: { protected: true } },
      });
      const rowId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/registers/hazop/${rowId}`,
        headers: { cookie: `session=${cookieB}; csrf_token=${csrfB}`, "x-csrf-token": csrfB },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });
  });
});
