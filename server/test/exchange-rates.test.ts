import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Exchange Rates CRUD integration tests", () => {
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
      email: "rateA@alpha.com",
      password: "SecurePass123!",
      tenantName: "Alpha Corp",
      displayName: "Rate User A",
    });
    tenantIdA = regA.body["tenantId"] as string;
    cookieA = extractSessionCookie(regA.cookie);

    const regB = await registerUser(app, {
      email: "rateB@beta.com",
      password: "SecurePass123!",
      tenantName: "Beta Corp",
      displayName: "Rate User B",
    });
    cookieB = extractSessionCookie(regB.cookie);
  }

  describe("CRUD lifecycle", () => {
    test("POST /exchange-rates creates rate and returns 201", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          fromCurrency: "USD",
          toCurrency: "THB",
          rate: 34.5,
          effectiveDate: "2025-01-15",
          source: "MANUAL",
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.id);
      assert.equal(body.fromCurrency, "USD");
      assert.equal(body.toCurrency, "THB");
      assert.equal(Number(body.rate), 34.5);
      assert.equal(body.tenantId, tenantIdA);
      assert.equal(body.source, "MANUAL");
    });

    test("GET /exchange-rates returns all rates for tenant", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-10" },
      });
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "EUR", toCurrency: "USD", rate: 1.08, effectiveDate: "2025-01-11" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 2);
    });

    test("GET /exchange-rates filters by fromCurrency", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-10" },
      });
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "EUR", toCurrency: "THB", rate: 37.2, effectiveDate: "2025-01-11" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates?fromCurrency=USD",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 1);
    });

    test("GET /exchange-rates filters by toCurrency", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-10" },
      });
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "VND", rate: 25000, effectiveDate: "2025-01-11" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates?toCurrency=VND",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 1);
    });

    test("DELETE /exchange-rates/:id removes the rate", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });
      const rateId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/exchange-rates/${rateId}`,
        headers: { cookie: `session=${cookieA}` },
      });
      assert.equal(delRes.statusCode, 200);

      // Verify it's gone
      const listRes = await app.inject({
        method: "GET",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
      });
      const list = listRes.json() as unknown[];
      assert.equal(list.length, 0);
    });
  });

  describe("Currency conversion", () => {
    test("convert uses most recent rate on or before requested date", async () => {
      await setupTwoTenants();

      // Create rates for multiple dates
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 33.0, effectiveDate: "2025-01-01" },
      });
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.0, effectiveDate: "2025-01-10" },
      });
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 35.0, effectiveDate: "2025-01-20" },
      });

      // Query for Jan 15 should use Jan 10 rate (34.0), not Jan 20 (future) or Jan 1 (older)
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=1000&date=2025-01-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.rate, 34.0);
      assert.equal(body.convertedAmount, 34000.0);
    });

    test("convert with exact date match uses that rate", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "VND", rate: 25000, effectiveDate: "2025-03-01" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=VND&amount=100&date=2025-03-01",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.rate, 25000);
      assert.equal(body.convertedAmount, 2500000.0);
    });

    test("convert does not use future rates", async () => {
      await setupTwoTenants();

      // Only a future rate exists
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 35.0, effectiveDate: "2025-06-01" },
      });
      // An older rate exists
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 33.0, effectiveDate: "2025-01-01" },
      });

      // Query for March 15 - should use Jan 1 rate (33.0), not June 1 (future)
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=1000&date=2025-03-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.rate, 33.0);
      assert.equal(body.convertedAmount, 33000.0);
    });

    test("convert returns 404 when no matching rate exists", async () => {
      await setupTwoTenants();

      // No rates created at all
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=JPY&amount=1000&date=2025-01-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 404);
    });

    test("convert returns 404 when only future rates exist", async () => {
      await setupTwoTenants();

      // Only a rate after the requested date
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 35.0, effectiveDate: "2025-06-01" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=1000&date=2025-03-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 404);
    });

    test("convert rounds to 2 decimal places", async () => {
      await setupTwoTenants();

      // Use a rate that will produce fractional amounts
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.567, effectiveDate: "2025-01-01" },
      });

      // 34.567 * 333 = 11510.811 -> rounds to 11510.81
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=333&date=2025-01-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.convertedAmount, 11510.81);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's exchange rates", async () => {
      await setupTwoTenants();

      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });

      // User B lists rates - should be empty
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as unknown[];
      assert.equal(list.length, 0);
    });

    test("user B cannot delete user A's exchange rate", async () => {
      await setupTwoTenants();

      const createRes = await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });
      const rateId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // User B tries to delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/exchange-rates/${rateId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(delRes.statusCode, 404);
    });

    test("user B's convert does not use user A's rates", async () => {
      await setupTwoTenants();

      // User A creates a rate
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });

      // User B tries to convert - no rate found for their tenant
      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=1000&date=2025-01-15",
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404);
    });
  });

  describe("Role enforcement", () => {
    test("VIEWER can list exchange rates", async () => {
      await setupTwoTenants();

      // Downgrade User A to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
    });

    test("VIEWER can use convert endpoint", async () => {
      await setupTwoTenants();

      // First create a rate as OWNER
      await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });

      // Downgrade to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/exchange-rates/convert?from=USD&to=THB&amount=1000&date=2025-01-15",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
    });

    test("VIEWER cannot create exchange rate (403)", async () => {
      await setupTwoTenants();

      // Downgrade to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });

      assert.equal(res.statusCode, 403);
    });

    test("VIEWER cannot delete exchange rate (403)", async () => {
      await setupTwoTenants();

      // Create a rate as OWNER first
      const createRes = await app.inject({
        method: "POST",
        url: "/exchange-rates",
        headers: { cookie: `session=${cookieA}` },
        payload: { fromCurrency: "USD", toCurrency: "THB", rate: 34.5, effectiveDate: "2025-01-15" },
      });
      const rateId = (createRes.json() as Record<string, unknown>)["id"] as string;

      // Downgrade to VIEWER
      await prisma.membership.updateMany({
        where: { tenantId: tenantIdA },
        data: { role: "VIEWER" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/exchange-rates/${rateId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 403);
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
