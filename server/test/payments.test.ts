import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Payment Certificates CRUD integration tests", () => {
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
  async function createPackage(opts?: { contractValue?: number; retentionPercent?: number; maxRetentionPercent?: number }): Promise<{ packageId: string }> {
    const progRes = await app.inject({
      method: "POST",
      url: "/programmes",
      headers: { cookie: `session=${cookieA}` },
      payload: { name: "Test Programme", totalBudget: 50_000_000 },
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
        contractValue: opts?.contractValue ?? 1_000_000,
        retentionPercent: opts?.retentionPercent ?? 5,
        maxRetentionPercent: opts?.maxRetentionPercent ?? 5,
      },
    });
    const packageId = (pkgRes.json() as Record<string, unknown>)["id"] as string;

    return { packageId };
  }

  /** Helper: promote user A to ADMIN role for payment approval tests. */
  async function promoteToAdmin() {
    // Directly update the membership role in the database
    await prisma.membership.updateMany({
      where: { tenantId: tenantIdA },
      data: { role: "ADMIN" },
    });
  }

  describe("CRUD lifecycle", () => {
    test("create payment certificate returns 201 with auto-calculated fields", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage({ contractValue: 1_000_000, retentionPercent: 10, maxRetentionPercent: 10 });

      const res = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          grossAmount: 200000,
          periodStart: "2024-01-01",
          periodEnd: "2024-01-31",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.certNumber, 1);
      assert.equal(Number(body.grossAmount), 200000);
      // retention = 200000 * 10/100 = 20000
      assert.equal(Number(body.retentionDeducted), 20000);
      // net = 200000 - 20000 = 180000
      assert.equal(Number(body.netAmount), 180000);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list payment certificates returns all for a package ordered by certNumber", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 150000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/payments?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as Record<string, unknown>[];
      assert.equal(list.length, 2);
      assert.equal(list[0]["certNumber"], 1);
      assert.equal(list[1]["certNumber"], 2);
    });

    test("get payment certificate by id includes cumulative calculations", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage({ contractValue: 1_000_000, retentionPercent: 5, maxRetentionPercent: 5 });

      // Create first certificate
      await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });

      // Create second certificate
      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 200000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      // Cumulative gross = 100000 + 200000 = 300000
      assert.equal(body.cumulativeGross, 300000);
      // Cumulative net = (100000 - 5000) + (200000 - 10000) = 95000 + 190000 = 285000
      assert.equal(body.cumulativeNet, 285000);
    });

    test("update payment certificate returns updated data", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { paymentRef: "BNK-REF-001" },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().paymentRef, "BNK-REF-001");
    });

    test("soft-delete payment removes it from list and GET returns 404", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      const getRes = await app.inject({
        method: "GET",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);
    });
  });

  describe("Retention calculation", () => {
    test("retention is calculated as grossAmount * retentionPercent / 100", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage({ contractValue: 2_000_000, retentionPercent: 8, maxRetentionPercent: 10 });

      const res = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 500000 },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      // retention = 500000 * 8/100 = 40000
      assert.equal(Number(body.retentionDeducted), 40000);
      // net = 500000 - 40000 = 460000
      assert.equal(Number(body.netAmount), 460000);
    });

    test("retention is capped at maxRetentionPercent of contractValue", async () => {
      await setupTwoTenants();
      // contractValue=100000, retentionPercent=10, maxRetentionPercent=5
      // Max retention total = 5% of 100000 = 5000
      const { packageId } = await createPackage({ contractValue: 100000, retentionPercent: 10, maxRetentionPercent: 5 });

      // First cert: grossAmount=80000, retention would be 8000, but max is 5000
      const res = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 80000 },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      // Capped at 5000 (maxRetentionPercent 5% of 100000)
      assert.equal(Number(body.retentionDeducted), 5000);
      assert.equal(Number(body.netAmount), 75000);
    });

    test("retention reduces to zero once cap reached across multiple certs", async () => {
      await setupTwoTenants();
      // contractValue=200000, retentionPercent=10, maxRetentionPercent=5
      // Max retention total = 5% of 200000 = 10000
      const { packageId } = await createPackage({ contractValue: 200000, retentionPercent: 10, maxRetentionPercent: 5 });

      // First cert: grossAmount=80000, retention = 8000 (within cap)
      const res1 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 80000 },
      });
      assert.equal(Number((res1.json() as Record<string, unknown>)["retentionDeducted"]), 8000);

      // Second cert: grossAmount=80000, retention would be 8000, but only 2000 remaining under cap
      const res2 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 80000 },
      });
      assert.equal(Number((res2.json() as Record<string, unknown>)["retentionDeducted"]), 2000);
      assert.equal(Number((res2.json() as Record<string, unknown>)["netAmount"]), 78000);

      // Third cert: grossAmount=40000, retention would be 4000, but cap already reached so 0
      const res3 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 40000 },
      });
      assert.equal(Number((res3.json() as Record<string, unknown>)["retentionDeducted"]), 0);
      assert.equal(Number((res3.json() as Record<string, unknown>)["netAmount"]), 40000);
    });
  });

  describe("Cumulative tracking", () => {
    test("certNumber auto-increments sequentially", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const res1 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 50000 },
      });
      assert.equal((res1.json() as Record<string, unknown>)["certNumber"], 1);

      const res2 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 75000 },
      });
      assert.equal((res2.json() as Record<string, unknown>)["certNumber"], 2);

      const res3 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      assert.equal((res3.json() as Record<string, unknown>)["certNumber"], 3);
    });

    test("previousCertified tracks sum of all prior gross amounts", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const res1 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      assert.equal(Number((res1.json() as Record<string, unknown>)["previousCertified"]), 0);

      const res2 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 150000 },
      });
      assert.equal(Number((res2.json() as Record<string, unknown>)["previousCertified"]), 100000);

      const res3 = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 200000 },
      });
      assert.equal(Number((res3.json() as Record<string, unknown>)["previousCertified"]), 250000);
    });
  });

  describe("Status transitions", () => {
    test("valid transition chain DRAFT -> SUBMITTED -> CERTIFIED -> APPROVED -> PAID", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();
      await promoteToAdmin();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      let res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "SUBMITTED");

      res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CERTIFIED", certifiedBy: "Engineer A" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "CERTIFIED");

      res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED", approvedBy: "Client PM" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "APPROVED");

      res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "PAID", paymentRef: "BNK-12345" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "PAID");
    });

    test("any status -> REJECTED is valid", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "REJECTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "REJECTED");
    });

    test("invalid transition DRAFT -> CERTIFIED returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CERTIFIED" },
      });
      assert.equal(res.statusCode, 400);
    });

    test("invalid transition DRAFT -> PAID returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();
      await promoteToAdmin();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "PAID" },
      });
      assert.equal(res.statusCode, 400);
    });
  });

  describe("ADMIN role requirement", () => {
    test("MANAGER cannot transition to APPROVED (returns 403)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();
      // User A is OWNER by default after registration, let's create a manager-level user
      // Actually the registering user is OWNER. Let's just test without promoting.
      // We need to ensure we're testing a MANAGER. Let's downgrade.
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "MANAGER" },
      });

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "CERTIFIED" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });
      assert.equal(res.statusCode, 403);
    });

    test("MANAGER cannot transition to PAID (returns 403)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      // First approve as ADMIN
      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "SUBMITTED" } });
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "CERTIFIED" } });

      // Approve as OWNER (who has ADMIN+)
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "APPROVED" } });

      // Downgrade to MANAGER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "MANAGER" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "PAID" },
      });
      assert.equal(res.statusCode, 403);
    });

    test("ADMIN can transition to APPROVED and PAID", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();
      await promoteToAdmin();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "SUBMITTED" } });
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "CERTIFIED" } });

      let res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "APPROVED" },
      });
      assert.equal(res.statusCode, 200);

      res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "PAID" },
      });
      assert.equal(res.statusCode, 200);
    });
  });

  describe("Package.cumulativePaid update on PAID", () => {
    test("PAID status updates Package.cumulativePaid by netAmount", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage({ contractValue: 1_000_000, retentionPercent: 5, maxRetentionPercent: 5 });
      await promoteToAdmin();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 200000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;
      // netAmount = 200000 - (200000 * 5/100) = 200000 - 10000 = 190000

      // Transition through the workflow
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "SUBMITTED" } });
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "CERTIFIED" } });
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "APPROVED" } });
      await app.inject({ method: "PATCH", url: `/payments/${paymentId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "PAID" } });

      // Check package cumulativePaid
      const pkgRes = await app.inject({
        method: "GET",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(Number(pkgRes.json().cumulativePaid), 190000);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's payment certificates", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/payments?packageId=${packageId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot get user A's payment by id", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot update user A's payment", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieB}` },
        payload: { paymentRef: "HACK" },
      });
      assert.equal(res.statusCode, 404);
    });
  });

  describe("Delete restrictions", () => {
    test("can delete DRAFT payment certificate", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(res.statusCode, 200);
    });

    test("cannot delete SUBMITTED payment certificate (returns 400)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, grossAmount: 100000 },
      });
      const paymentId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/payments/${paymentId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/payments/${paymentId}`,
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
