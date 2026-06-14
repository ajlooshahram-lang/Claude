import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Packages CRUD integration tests", () => {
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

  /** Helper: create a programme and project for tenant A, return their IDs. */
  async function createProgrammeAndProject(): Promise<{ programmeId: string; projectId: string }> {
    const progRes = await app.inject({
      method: "POST",
      url: "/programmes",
      headers: { cookie: `session=${cookieA}` },
      payload: { name: "Test Programme", totalBudget: 1_000_000 },
    });
    const programmeId = (progRes.json() as Record<string, unknown>)["id"] as string;

    const projRes = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { cookie: `session=${cookieA}` },
      payload: { name: "Test Project" },
    });
    const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

    return { programmeId, projectId };
  }

  describe("CRUD lifecycle", () => {
    test("create package returns 201 with package data", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-001",
          title: "Backbone Ducting Lot 1",
          contractValue: 500000,
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.contractRef, "PKG-001");
      assert.equal(body.title, "Backbone Ducting Lot 1");
      assert.equal(body.status, "DRAFT");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list packages returns all tenant packages", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Package One", contractValue: 100000 },
      });
      await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-002", title: "Package Two", contractValue: 200000 },
      });

      const res = await app.inject({
        method: "GET",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("list packages filterable by programmeId", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Package One", contractValue: 100000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/packages?programmeId=${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 1);
    });

    test("get package by id returns package with work order summary", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Single Package", contractValue: 300000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.id, packageId);
      assert.equal(body.title, "Single Package");
      assert.ok(body.workOrderSummary);
      assert.equal(body.workOrderSummary.total, 0);
    });

    test("update package returns updated data", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Before Update", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { title: "After Update", contractValue: 200000 },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.title, "After Update");
    });

    test("soft-delete package removes it from list and GET returns 404", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "To Delete", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // GET by id should return 404
      const getRes = await app.inject({
        method: "GET",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      // List should not include deleted package
      const listRes = await app.inject({
        method: "GET",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Status transitions", () => {
    test("valid transition DRAFT -> TENDERED succeeds", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Transition Test", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "TENDERED" },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "TENDERED");
    });

    test("valid transition chain DRAFT -> TENDERED -> AWARDED -> ACTIVE succeeds", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Chain Test", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      let res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "TENDERED" },
      });
      assert.equal(res.statusCode, 200);

      res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "AWARDED" },
      });
      assert.equal(res.statusCode, 200);

      res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ACTIVE" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "ACTIVE");
    });

    test("invalid transition DRAFT -> CLOSED returns 400", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Invalid Transition", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CLOSED" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("invalid transition DRAFT -> ACTIVE returns 400", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Skip Transition", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ACTIVE" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("ACTIVE -> SUSPENDED -> ACTIVE round-trip succeeds", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Suspend Test", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to ACTIVE
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "TENDERED" } });
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "AWARDED" } });
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "ACTIVE" } });

      // Suspend
      let res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUSPENDED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "SUSPENDED");

      // Resume
      res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ACTIVE" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "ACTIVE");
    });

    test("any status -> TERMINATED succeeds", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Terminate Test", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "TERMINATED" },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "TERMINATED");
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot create package with user A's projectId (returns 404)", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieB}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-HACK",
          title: "Cross-tenant Package",
          contractValue: 100000,
        },
      });

      assert.equal(res.statusCode, 404, "Should return 404 for cross-tenant projectId");
    });

    test("user B cannot see user A's packages", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "A's Package", contractValue: 100000 },
      });

      const res = await app.inject({
        method: "GET",
        url: "/packages",
        headers: { cookie: `session=${cookieB}` },
      });

      const list = res.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Delete restrictions", () => {
    test("can delete DRAFT package", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Draft Package", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
    });

    test("cannot delete ACTIVE package (returns 400)", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Active Package", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to ACTIVE
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "TENDERED" } });
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "AWARDED" } });
      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "ACTIVE" } });

      const res = await app.inject({
        method: "DELETE",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });

    test("cannot delete TENDERED package (returns 400)", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const createRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, projectId, contractRef: "PKG-001", title: "Tendered Package", contractValue: 100000 },
      });
      const packageId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({ method: "PATCH", url: `/packages/${packageId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "TENDERED" } });

      const res = await app.inject({
        method: "DELETE",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("Validation", () => {
    test("retentionPercent > 100 returns 400", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-001",
          title: "Bad Retention",
          contractValue: 100000,
          retentionPercent: 101,
        },
      });

      assert.equal(res.statusCode, 400);
    });

    test("defectsLiabilityMonths > 60 returns 400", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-001",
          title: "Bad Liability",
          contractValue: 100000,
          defectsLiabilityMonths: 61,
        },
      });

      assert.equal(res.statusCode, 400);
    });

    test("contractValue > 10_000_000_000 returns 400", async () => {
      await setupTwoTenants();
      const { programmeId, projectId } = await createProgrammeAndProject();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-001",
          title: "Too Expensive",
          contractValue: 10_000_000_001,
        },
      });

      assert.equal(res.statusCode, 400);
    });

    test("missing required fields returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: { title: "Incomplete" },
      });

      assert.equal(res.statusCode, 400);
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
