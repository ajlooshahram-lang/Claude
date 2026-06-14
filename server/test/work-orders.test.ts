import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Work Orders CRUD integration tests", () => {
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

  /** Helper: create programme, project, and package for tenant A, return packageId. */
  async function createPackageForTenantA(): Promise<string> {
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

    const pkgRes = await app.inject({
      method: "POST",
      url: "/packages",
      headers: { cookie: `session=${cookieA}` },
      payload: {
        programmeId,
        projectId,
        contractRef: "PKG-001",
        title: "Test Package",
        contractValue: 500000,
      },
    });
    return (pkgRes.json() as Record<string, unknown>)["id"] as string;
  }

  describe("CRUD lifecycle", () => {
    test("create work order returns 201 with work order data", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const res = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "WO-001",
          description: "Trenching section A1",
          workType: "trenching",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.reference, "WO-001");
      assert.equal(body.description, "Trenching section A1");
      assert.equal(body.workType, "trenching");
      assert.equal(body.status, "DRAFT");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list work orders returns all tenant work orders", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-002" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("list work orders filterable by packageId", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/work-orders?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 1);
    });

    test("get work order by id returns work order with progress details", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "WO-001",
          percentComplete: 45,
          plannedQuantity: 1000,
          unit: "m",
        },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.id, workOrderId);
      assert.equal(body.reference, "WO-001");
      assert.ok(body.progressDetails);
      assert.equal(body.progressDetails.percentComplete, 45);
      assert.equal(body.progressDetails.plannedQuantity, 1000);
      assert.equal(body.progressDetails.unit, "m");
    });

    test("update work order returns updated data", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001", description: "Before" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { description: "After", percentComplete: 50 },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.description, "After");
      assert.equal(body.percentComplete, 50);
    });

    test("soft-delete work order removes it from list and GET returns 404", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // GET by id should return 404
      const getRes = await app.inject({
        method: "GET",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      // List should not include deleted work order
      const listRes = await app.inject({
        method: "GET",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Status transitions", () => {
    test("valid transition DRAFT -> ISSUED succeeds", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ISSUED" },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "ISSUED");
    });

    test("valid transition chain DRAFT -> ISSUED -> IN_PROGRESS -> COMPLETED -> VERIFIED -> CLOSED", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const transitions = ["ISSUED", "IN_PROGRESS", "COMPLETED", "VERIFIED", "CLOSED"];
      for (const status of transitions) {
        const res = await app.inject({
          method: "PATCH",
          url: `/work-orders/${workOrderId}`,
          headers: { cookie: `session=${cookieA}` },
          payload: { status },
        });
        assert.equal(res.statusCode, 200, `Transition to ${status} should succeed`);
        assert.equal(res.json().status, status);
      }
    });

    test("invalid transition DRAFT -> CLOSED returns 400", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CLOSED" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("invalid transition DRAFT -> COMPLETED returns 400", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "COMPLETED" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("any status -> CANCELLED succeeds", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to ISSUED first
      await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ISSUED" },
      });

      // Cancel from ISSUED
      const res = await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CANCELLED" },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "CANCELLED");
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot create work order with user A's packageId (returns 404)", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const res = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieB}` },
        payload: {
          packageId,
          reference: "WO-HACK",
        },
      });

      assert.equal(res.statusCode, 404, "Should return 404 for cross-tenant packageId");
    });

    test("user B cannot see user A's work orders", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/work-orders",
        headers: { cookie: `session=${cookieB}` },
      });

      const list = res.json() as unknown[];
      assert.equal(list.length, 0);
    });

    test("user B cannot GET user A's work order by id (returns 404)", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });
  });

  describe("Delete restrictions", () => {
    test("can delete DRAFT work order", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
    });

    test("cannot delete ISSUED work order (returns 400)", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to ISSUED
      await app.inject({
        method: "PATCH",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ISSUED" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });

    test("cannot delete IN_PROGRESS work order (returns 400)", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const createRes = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "WO-001" },
      });
      const workOrderId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to IN_PROGRESS
      await app.inject({ method: "PATCH", url: `/work-orders/${workOrderId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "ISSUED" } });
      await app.inject({ method: "PATCH", url: `/work-orders/${workOrderId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "IN_PROGRESS" } });

      const res = await app.inject({
        method: "DELETE",
        url: `/work-orders/${workOrderId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("Validation", () => {
    test("missing required fields returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { description: "No packageId or reference" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("missing reference returns 400", async () => {
      await setupTwoTenants();
      const packageId = await createPackageForTenantA();

      const res = await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId },
      });

      assert.equal(res.statusCode, 400);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/work-orders",
        payload: { packageId: "fake-id", reference: "WO-001" },
      });

      assert.equal(res.statusCode, 401);
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
