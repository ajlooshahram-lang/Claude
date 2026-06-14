import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Programmes CRUD integration tests", () => {
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

  describe("CRUD lifecycle", () => {
    test("create programme returns 201 with programme data", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          name: "Asia Fibre Network Phase 1",
          totalBudget: 1_300_000_000,
          description: "5-year fibre optic deployment",
          baseCurrency: "USD",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.name, "Asia Fibre Network Phase 1");
      assert.equal(body.description, "5-year fibre optic deployment");
      assert.equal(body.baseCurrency, "USD");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list programmes returns all tenant programmes", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Programme One", totalBudget: 100000 },
      });
      await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Programme Two", totalBudget: 200000 },
      });

      const res = await app.inject({
        method: "GET",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("get programme by id returns programme with summary", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Single Programme", totalBudget: 500000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.id, programmeId);
      assert.equal(body.name, "Single Programme");
      assert.ok(body.summary);
    });

    test("update programme returns updated data", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Before Update", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "After Update", totalBudget: 200000 },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.name, "After Update");
    });

    test("soft-delete programme removes it from list and GET returns 404", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "To be deleted", totalBudget: 50000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // GET by id should return 404
      const getRes = await app.inject({
        method: "GET",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      // List should not include deleted programme
      const listRes = await app.inject({
        method: "GET",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's programmes in list", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "A's Programme", totalBudget: 100000 },
      });

      const res = await app.inject({
        method: "GET",
        url: "/programmes",
        headers: { cookie: `session=${cookieB}` },
      });

      const list = res.json() as unknown[];
      assert.equal(list.length, 0);
    });

    test("user B cannot GET user A's programme (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Secret Programme", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot PATCH user A's programme (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Protected Programme", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieB}` },
        payload: { name: "Hacked" },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot DELETE user A's programme (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Indestructible Programme", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });
  });

  describe("Role enforcement", () => {
    test("VIEWER role cannot POST programme (gets 403)", async () => {
      await setupTwoTenants();

      // Downgrade user A to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Forbidden Programme", totalBudget: 100000 },
      });

      assert.equal(res.statusCode, 403);
    });

    test("VIEWER role cannot PATCH programme (gets 403)", async () => {
      await setupTwoTenants();

      // Create programme first as OWNER
      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Test Programme", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Downgrade user A to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Hacked" },
      });

      assert.equal(res.statusCode, 403);
    });

    test("VIEWER role cannot DELETE programme (gets 403)", async () => {
      await setupTwoTenants();

      // Create programme first as OWNER
      const createRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Protected Programme", totalBudget: 100000 },
      });
      const programmeId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Downgrade user A to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/programmes/${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 403);
    });

    test("VIEWER role can GET programmes (allowed)", async () => {
      await setupTwoTenants();

      // Create programme as OWNER
      await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Visible Programme", totalBudget: 100000 },
      });

      // Downgrade user A to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 1);
    });
  });

  describe("Dashboard aggregation", () => {
    test("returns correct counts, budget summaries, and top risks", async () => {
      await setupTwoTenants();

      // Create a programme
      const progRes = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Dashboard Programme", totalBudget: 5_000_000 },
      });
      const programmeId = (progRes.json() as Record<string, unknown>)["id"] as string;

      // Create a project linked to the programme
      const projRes = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Project Alpha" },
      });
      const projectId = (projRes.json() as Record<string, unknown>)["id"] as string;

      // Link project to programme via Prisma
      await prisma.project.update({
        where: { id: projectId },
        data: { programmeId },
      });

      // Create a package
      const pkgRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          projectId,
          contractRef: "PKG-001",
          title: "Backbone Ducting",
          contractValue: 1_000_000,
        },
      });
      const packageId = (pkgRes.json() as Record<string, unknown>)["id"] as string;

      // Transition package to ACTIVE: DRAFT -> TENDERED -> AWARDED -> ACTIVE
      await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "TENDERED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "AWARDED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/packages/${packageId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ACTIVE" },
      });

      // Create work orders
      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "WO-001",
          percentComplete: 75,
        },
      });
      await app.inject({
        method: "POST",
        url: "/work-orders",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "WO-002",
          percentComplete: 50,
        },
      });

      // Create cases with RPN values
      await prisma.case.create({
        data: {
          tenantId: tenantIdA,
          projectId,
          problem: "High voltage risk",
          sev: 9,
          occ: 7,
          det: 5,
          status: "OPEN",
        },
      });
      await prisma.case.create({
        data: {
          tenantId: tenantIdA,
          projectId,
          problem: "Minor cable damage",
          sev: 3,
          occ: 4,
          det: 2,
          status: "OPEN",
        },
      });

      // Fetch dashboard
      const dashRes = await app.inject({
        method: "GET",
        url: `/programmes/${programmeId}/dashboard`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(dashRes.statusCode, 200);
      const dash = dashRes.json();

      assert.equal(dash.totalProjects, 1);
      assert.equal(dash.activePackages, 1);
      assert.equal(dash.totalWorkOrders, 2);

      // Budget summary (Decimal fields are serialized as strings by Prisma)
      assert.equal(Number(dash.budgetSummary.totalBudget), 5_000_000);
      assert.equal(Number(dash.budgetSummary.committed), 1_000_000);

      // Progress
      assert.equal(dash.progress.overallPercent, 62.5);
      assert.equal(dash.progress.totalWorkOrders, 2);

      // Top risks - sorted by sev desc
      assert.ok(dash.topRisks.length >= 2);
      assert.equal(dash.topRisks[0].problem, "High voltage risk");
      assert.equal(dash.topRisks[0].rpn, 9 * 7 * 5); // 315
      assert.equal(dash.topRisks[1].problem, "Minor cable damage");
      assert.equal(dash.topRisks[1].rpn, 3 * 4 * 2); // 24
    });
  });

  describe("Validation", () => {
    test("missing name returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { totalBudget: 100000 },
      });

      assert.equal(res.statusCode, 400);
    });

    test("totalBudget over 10_000_000_000 returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "Too Expensive", totalBudget: 10_000_000_001 },
      });

      assert.equal(res.statusCode, 400);
    });

    test("missing totalBudget returns 400", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        headers: { cookie: `session=${cookieA}` },
        payload: { name: "No Budget" },
      });

      assert.equal(res.statusCode, 400);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/programmes",
        payload: { name: "Unauthorized", totalBudget: 100000 },
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
