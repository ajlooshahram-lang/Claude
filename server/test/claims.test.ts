import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Contract Claims CRUD integration tests", () => {
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
  async function createPackage(): Promise<{ packageId: string }> {
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
        contractValue: 1_000_000,
      },
    });
    const packageId = (pkgRes.json() as Record<string, unknown>)["id"] as string;

    return { packageId };
  }

  describe("CRUD lifecycle", () => {
    test("create claim returns 201 with claim data", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const res = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          packageId,
          reference: "CE-001",
          title: "Unforeseen ground conditions",
          description: "Encountered rock at 2m depth",
          claimType: "COMPENSATION_EVENT",
          amount: 150000,
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.reference, "CE-001");
      assert.equal(body.title, "Unforeseen ground conditions");
      assert.equal(body.status, "DRAFT");
      assert.equal(body.tenantId, tenantIdA);
    });

    test("list claims returns all claims for a package", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Claim 1", amount: 50000 },
      });
      await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-002", title: "Claim 2", amount: 75000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/claims?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("get claim by id returns claim", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Get Test", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().id, claimId);
      assert.equal(res.json().title, "Get Test");
    });

    test("update claim returns updated data", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Before Update", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { title: "After Update", amount: 75000 },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().title, "After Update");
    });

    test("soft-delete claim removes it from list and GET returns 404", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "To Delete", amount: 10000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      const getRes = await app.inject({
        method: "GET",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(getRes.statusCode, 404);

      const listRes = await app.inject({
        method: "GET",
        url: `/claims?packageId=${packageId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Status transitions", () => {
    test("valid transition chain DRAFT -> SUBMITTED -> ASSESSED -> AGREED -> PAID succeeds", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Full Chain", amount: 100000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      let res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "SUBMITTED");

      res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED", assessedAmount: 80000 },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "ASSESSED");

      res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "AGREED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "AGREED");

      res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "PAID" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "PAID");
    });

    test("dispute workflow: ASSESSED -> DISPUTED -> SUBMITTED retry", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Dispute Test", amount: 200000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });

      // Dispute
      let res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "DISPUTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "DISPUTED");

      // Retry (back to SUBMITTED)
      res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "SUBMITTED");
    });

    test("dispute workflow: DISPUTED -> WITHDRAWN", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Withdraw Test", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "ASSESSED" },
      });
      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "DISPUTED" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "WITHDRAWN" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, "WITHDRAWN");
    });

    test("invalid transition DRAFT -> AGREED returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Skip Test", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "AGREED" },
      });
      assert.equal(res.statusCode, 400);
    });

    test("invalid transition PAID -> SUBMITTED returns 400", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Paid Revert", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Move to PAID
      await app.inject({ method: "PATCH", url: `/claims/${claimId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "SUBMITTED" } });
      await app.inject({ method: "PATCH", url: `/claims/${claimId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "ASSESSED" } });
      await app.inject({ method: "PATCH", url: `/claims/${claimId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "AGREED" } });
      await app.inject({ method: "PATCH", url: `/claims/${claimId}`, headers: { cookie: `session=${cookieA}` }, payload: { status: "PAID" } });

      const res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });
      assert.equal(res.statusCode, 400);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's claims", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "A's Claim", amount: 50000 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/claims?packageId=${packageId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot get user A's claim by id", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "A's Claim", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieB}` },
      });
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot update user A's claim", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "A's Claim", amount: 50000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieB}` },
        payload: { title: "Hacked" },
      });
      assert.equal(res.statusCode, 404);
    });
  });

  describe("Delete restrictions", () => {
    test("can delete DRAFT claim", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Draft Delete", amount: 10000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(res.statusCode, 200);
    });

    test("cannot delete SUBMITTED claim (returns 400)", async () => {
      await setupTwoTenants();
      const { packageId } = await createPackage();

      const createRes = await app.inject({
        method: "POST",
        url: "/claims",
        headers: { cookie: `session=${cookieA}` },
        payload: { packageId, reference: "CE-001", title: "Submitted Delete", amount: 10000 },
      });
      const claimId = (createRes.json() as Record<string, unknown>)["id"] as string;

      await app.inject({
        method: "PATCH",
        url: `/claims/${claimId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { status: "SUBMITTED" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/claims/${claimId}`,
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
