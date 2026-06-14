import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Contract Variations CRUD integration tests", () => {
  let app: FastifyInstance;

  // User A context
  let cookieA: string;
  let tenantIdA: string;

  // User B context
  let cookieB: string;

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
    cookieB = extractSessionCookie(regB.cookie);
  }

  /** Helper: create a programme, project, and package for tenant A. */
  async function createPackage(contractValue = 1_000_000): Promise<{ packageId: string; programmeId: string; projectId: string }> {
    const progRes = await app.inject({
      method: "POST",
      url: "/programmes",
      headers: { cookie: `session=${cookieA}` },
      payload: { name: "Test Programme", totalBudget: 5_000_000 },
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
        contractValue,
        retentionPercent: 5,
        maxRetentionPercent: 5,
      },
    });
    const packageId = (pkgRes.json() as Record<string, unknown>)["id"] as string;

    return { packageId, programmeId, projectId };
  }

  describe("CRUD lifecycle", () => {
    test("create variation returns 201 with variation data", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const res = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "VO-001",
          title: "Additional duct route",
          description: "Extended route by 500m",
          amount: 75000,
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.reference, "VO-001");
      assert.equal(body.title, "Additional duct route");
      assert.equal(body.status, "PROPOSED");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list variations returns all variations for a package", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Variation 1", amount: 10000 },
      });
      await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-002", title: "Variation 2", amount: 20000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/variations?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("get variation by id returns variation", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Get Test", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().id, variationId);
      assert.equal(res.json().title, "Get Test");
    });

    test("update variation returns updated data", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Before Update", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { title: "After Update", amount: 75000 },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().title, "After Update");
    });

    test("soft-delete variation removes it from list and GET returns 404", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "To Delete", amount: 10000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      const getRes = await app.inject({
        method: "GET",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      const listRes = await app.inject({
        method: "GET",
        url: `/variations?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Status transitions", () => {
    test("valid transition chain PROPOSED -> ASSESSED -> APPROVED -> IMPLEMENTED succeeds", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Full Chain", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      let res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED", assessedAmount: 45000 },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "ASSESSED");

      res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "APPROVED");

      res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "IMPLEMENTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "IMPLEMENTED");
    });

    test("ASSESSED -> REJECTED is valid", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Reject Test", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "REJECTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "REJECTED");
    });

    test("invalid transition PROPOSED -> APPROVED returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Skip Test", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });
      assert.equal(res.statusCode, 400);
    });

    test("invalid transition REJECTED -> IMPLEMENTED returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Rejected Impl", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "REJECTED" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "IMPLEMENTED" },
      });
      assert.equal(res.statusCode, 400);
    });
  });

  describe("Contract value update on approval", () => {
    test("approving variation increases package contractValue by assessedAmount", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage(1_000_000);

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Value Increase", amount: 100000, assessedAmount: 85000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Transition to ASSESSED then APPROVED
      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });

      // Check package contractValue updated
      const pkgRes = await app.inject({
        method: "GET",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(pkgRes.statusCode, 200);
      // Original 1,000,000 + assessed 85,000 = 1,085,000
      assert.equal(Number(pkgRes.json().contractValue), 1085000);
    });

    test("approving variation uses amount when assessedAmount is null", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage(500_000);

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Amount Fallback", amount: 30000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });

      const pkgRes = await app.inject({
        method: "GET",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      // Original 500,000 + amount 30,000 = 530,000
      assert.equal(Number(pkgRes.json().contractValue), 530000);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's variations", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "A's Variation", amount: 50000 },
      });

      // User B tries to list with user A's packageId
      const res = await app.inject({
        method: "GET",
        url: `/variations?packageId=${packageId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      // Package not found for tenant B
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot get user A's variation by id", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "A's Variation", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot update user A's variation", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "A's Variation", amount: 50000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieB}` },
        payload: { title: "Hacked" },
      });
      assert.equal(res.statusCode, 404);
    });
  });

  describe("Delete restrictions", () => {
    test("can delete PROPOSED variation", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Draft Delete", amount: 10000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(res.statusCode, 200);
    });

    test("cannot delete ASSESSED variation (returns 400)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Assessed Delete", amount: 10000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(res.statusCode, 400);
    });

    test("cannot delete APPROVED variation (returns 400)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/variations",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "VO-001", title: "Approved Delete", amount: 10000 },
      });
      const variationId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/variations/${variationId}`,
        headers: { cookie: `session=${cookieA}` },
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
