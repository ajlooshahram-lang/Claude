import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Snapshots CRUD integration tests", () => {
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

  describe("POST /snapshots", () => {
    test("take snapshot returns 201 with snapshot data", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Initial snapshot" },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.projectId, projectIdA);
      assert.equal(body.tenantId, tenantIdA);
      assert.equal(body.label, "Initial snapshot");
      assert.ok(body.data, "snapshot should contain data payload");
    });

    test("snapshot captures cases and register rows", async () => {
      await setupTwoTenants();

      // Create a case in the project
      await app.inject({
        method: "POST",
        url: "/cases",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, problem: "Test case for snapshot" },
      });

      // Create a register row
      await app.inject({
        method: "POST",
        url: "/registers/hazop",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, data: { node: "P-101" } },
      });

      // Take snapshot
      const res = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      const snapshotData = body.data as { cases: unknown[]; registers: unknown[] };
      assert.equal(snapshotData.cases.length, 1);
      assert.equal(snapshotData.registers.length, 1);
    });

    test("without session returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/snapshots",
        payload: { projectId: "some-id" },
      });

      assert.equal(res.statusCode, 401);
    });
  });

  describe("GET /snapshots", () => {
    test("lists snapshots for a project", async () => {
      await setupTwoTenants();

      // Create two snapshots
      await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Snap 1" },
      });
      await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Snap 2" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/snapshots?projectId=${projectIdA}`,
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
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("PATCH /snapshots/:id", () => {
    test("renames snapshot label", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Old label" },
      });
      const snapshotId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/snapshots/${snapshotId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: { label: "New label" },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.label, "New label");
    });
  });

  describe("DELETE /snapshots/:id", () => {
    test("deletes a snapshot (hard delete)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "To be deleted" },
      });
      const snapshotId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/snapshots/${snapshotId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // List should not include deleted snapshot
      const listRes = await app.inject({
        method: "GET",
        url: `/snapshots?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("POST /snapshots/:id/restore", () => {
    test("restores project state from snapshot (cases come back after deletion)", async () => {
      await setupTwoTenants();

      // Create a case
      const caseRes = await app.inject({
        method: "POST",
        url: "/cases",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, problem: "Important case" },
      });
      const caseId = (caseRes.json() as Record<string, unknown>)["id"] as string;

      // Take snapshot (captures the case)
      const snapRes = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Before deletion" },
      });
      const snapshotId = (snapRes.json() as Record<string, unknown>)["id"] as string;

      // Delete the case
      await app.inject({
        method: "DELETE",
        url: `/cases/${caseId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      // Verify case is gone
      const listBefore = await app.inject({
        method: "GET",
        url: `/cases?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal((listBefore.json() as unknown[]).length, 0);

      // Restore from snapshot
      const restoreRes = await app.inject({
        method: "POST",
        url: `/snapshots/${snapshotId}/restore`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(restoreRes.statusCode, 200);
      const restoreBody = restoreRes.json();
      assert.equal(restoreBody.ok, true);
      assert.equal(restoreBody.restoredFrom, snapshotId);

      // Verify case is back
      const listAfter = await app.inject({
        method: "GET",
        url: `/cases?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieA}` },
      });
      const casesAfter = listAfter.json() as Array<Record<string, unknown>>;
      assert.equal(casesAfter.length, 1);
      assert.equal(casesAfter[0]!["problem"], "Important case");
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot take snapshot of user A's project (returns 404)", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieB}` },
        payload: { projectId: projectIdA },
      });

      assert.equal(res.statusCode, 404, "Should return 404 for cross-tenant project");
    });

    test("user B cannot see user A's snapshots", async () => {
      await setupTwoTenants();

      // User A takes a snapshot
      await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "A's snapshot" },
      });

      // User B queries for A's project
      const res = await app.inject({
        method: "GET",
        url: `/snapshots?projectId=${projectIdA}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json() as unknown[];
      assert.equal(body.length, 0, "User B should not see user A's snapshots");
    });

    test("user B cannot delete user A's snapshot (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "Protected" },
      });
      const snapshotId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/snapshots/${snapshotId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404, "Should return 404, not 403");
    });

    test("user B cannot restore user A's snapshot (returns 404)", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/snapshots",
        headers: { cookie: `session=${cookieA}` },
        payload: { projectId: projectIdA, label: "A's restorable" },
      });
      const snapshotId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "POST",
        url: `/snapshots/${snapshotId}/restore`,
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
