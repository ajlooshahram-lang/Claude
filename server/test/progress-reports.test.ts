import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildTestApp, registerUser, cleanDatabase, prisma } from "./helpers.js";

describe("Progress Reports / EVM Engine integration tests", () => {
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
      email: "evmA@alpha.com",
      password: "SecurePass123!",
      tenantName: "Alpha EVM",
      displayName: "EVM User A",
    });
    tenantIdA = regA.body["tenantId"] as string;
    cookieA = extractSessionCookie(regA.cookie);

    const regB = await registerUser(app, {
      email: "evmB@beta.com",
      password: "SecurePass123!",
      tenantName: "Beta EVM",
      displayName: "EVM User B",
    });
    cookieB = extractSessionCookie(regB.cookie);
  }

  /**
   * Helper: create a programme with start/end dates for EVM testing.
   * The programme spans 12 months: 2025-01-01 to 2025-12-31.
   */
  async function createProgramme(opts?: {
    startDate?: string;
    endDate?: string;
    totalBudget?: number;
  }): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/programmes",
      headers: { cookie: `session=${cookieA}` },
      payload: {
        name: "EVM Test Programme",
        totalBudget: opts?.totalBudget ?? 5_000_000,
        startDate: opts?.startDate ?? "2025-01-01",
        endDate: opts?.endDate ?? "2025-12-31",
      },
    });
    return (res.json() as Record<string, unknown>)["id"] as string;
  }

  /** Helper: create a project. */
  async function createProject(): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { cookie: `session=${cookieA}` },
      payload: { name: "EVM Test Project" },
    });
    return (res.json() as Record<string, unknown>)["id"] as string;
  }

  /** Helper: create a package with a specific contract value. */
  async function createPackage(programmeId: string, projectId: string, contractValue: number, ref?: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      headers: { cookie: `session=${cookieA}` },
      payload: {
        programmeId,
        projectId,
        contractRef: ref ?? "PKG-001",
        title: `Package ${ref ?? "PKG-001"}`,
        contractValue,
        retentionPercent: 5,
        maxRetentionPercent: 5,
      },
    });
    return (res.json() as Record<string, unknown>)["id"] as string;
  }

  /** Helper: create a work order with a specific percentComplete. */
  async function createWorkOrder(packageId: string, percentComplete: number, ref?: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/work-orders",
      headers: { cookie: `session=${cookieA}` },
      payload: {
        packageId,
        reference: ref ?? "WO-001",
        percentComplete,
      },
    });
    return (res.json() as Record<string, unknown>)["id"] as string;
  }

  describe("EVM calculation verification", () => {
    test("auto-calculates EVM metrics from programme data with known inputs", async () => {
      await setupTwoTenants();

      // Setup:
      // Programme: 12 months (2025-01-01 to 2025-12-31)
      // Package 1: contractValue = 600,000, cumulativePaid = 200,000
      //   - WO1: 50% complete
      //   - WO2: 70% complete
      //   Average WO% = (50+70)/2 = 60%
      //   EV contribution = 600,000 * 0.60 = 360,000
      //
      // Package 2: contractValue = 400,000, cumulativePaid = 150,000
      //   - WO3: 40% complete
      //   Average WO% = 40%
      //   EV contribution = 400,000 * 0.40 = 160,000
      //
      // BAC = 600,000 + 400,000 = 1,000,000
      // EV = 360,000 + 160,000 = 520,000
      // AC = 200,000 + 150,000 = 350,000
      //
      // Period: 2025-06 (end of June)
      // PV = BAC * (elapsed/total)
      //   Programme starts Jan 1, ends Dec 31 = 12 months total
      //   Elapsed from Jan 1 to June 30 = 6 months
      //   PV = 1,000,000 * (6/12) = 500,000
      //
      // SPI = 520,000 / 500,000 = 1.04
      // CPI = 520,000 / 350,000 = 1.49 (rounded to 2dp)
      // EAC = 1,000,000 / 1.49 = 671,140.94 (rounded)
      // ETC = EAC - AC = 671,140.94 - 350,000 = 321,140.94
      // percentComplete = (520,000 / 1,000,000) * 100 = 52.00

      const programmeId = await createProgramme();
      const projectId = await createProject();

      const pkg1Id = await createPackage(programmeId, projectId, 600_000, "PKG-001");
      const pkg2Id = await createPackage(programmeId, projectId, 400_000, "PKG-002");

      // Create work orders
      await createWorkOrder(pkg1Id, 50, "WO-001");
      await createWorkOrder(pkg1Id, 70, "WO-002");
      await createWorkOrder(pkg2Id, 40, "WO-003");

      // Set cumulativePaid via Prisma directly
      await prisma.package.update({ where: { id: pkg1Id }, data: { cumulativePaid: 200_000 } });
      await prisma.package.update({ where: { id: pkg2Id }, data: { cumulativePaid: 150_000 } });

      // Create progress report for period 2025-06
      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          period: "2025-06",
        },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      // Verify EVM metrics
      assert.equal(Number(report.budgetAtCompletion), 1_000_000);
      assert.equal(Number(report.earnedValue), 520_000);
      assert.equal(Number(report.actualCost), 350_000);

      // PV check: 6 months elapsed out of ~12 total
      // Due to monthsBetween using day fractions, accept a range
      const pv = Number(report.plannedValue);
      assert.ok(pv > 490_000 && pv < 510_000, `PV should be around 500,000 but got ${pv}`);

      // SPI = EV / PV
      assert.ok(report.spiValue !== null);
      const spi = Number(report.spiValue);
      assert.ok(spi > 1.0 && spi < 1.1, `SPI should be around 1.04 but got ${spi}`);

      // CPI = EV / AC = 520,000 / 350,000 = 1.49
      assert.ok(report.cpiValue !== null);
      const cpi = Number(report.cpiValue);
      assert.ok(cpi > 1.4 && cpi < 1.5, `CPI should be around 1.49 but got ${cpi}`);

      // EAC = BAC / CPI
      assert.ok(report.eacValue !== null);
      const eac = Number(report.eacValue);
      // EAC = 1,000,000 / 1.49 ~ 671,141
      assert.ok(eac > 660_000 && eac < 680_000, `EAC should be around 671,141 but got ${eac}`);

      // ETC = EAC - AC
      assert.ok(report.etcValue !== null);
      const etc = Number(report.etcValue);
      assert.ok(etc > 310_000 && etc < 330_000, `ETC should be around 321,141 but got ${etc}`);

      // percentComplete
      // actualProgress = EV/BAC = 520,000/1,000,000 = 0.52
      assert.equal(report.actualProgress, 0.52);
    });

    test("EVM with single package and single work order yields exact values", async () => {
      await setupTwoTenants();

      // Simple case:
      // Package: contractValue = 1,000,000, cumulativePaid = 400,000
      // WO: 50% complete
      //
      // BAC = 1,000,000
      // EV = 1,000,000 * 0.50 = 500,000
      // AC = 400,000
      // Period: 2025-06 (midway through 12-month programme)
      // PV ~ 500,000 (approximately, depends on day fraction)
      // CPI = 500,000 / 400,000 = 1.25
      // EAC = 1,000,000 / 1.25 = 800,000
      // ETC = 800,000 - 400,000 = 400,000

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 400_000 } });

      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      assert.equal(Number(report.budgetAtCompletion), 1_000_000);
      assert.equal(Number(report.earnedValue), 500_000);
      assert.equal(Number(report.actualCost), 400_000);

      // CPI = 500,000/400,000 = 1.25
      assert.equal(report.cpiValue, 1.25);

      // EAC = 1,000,000/1.25 = 800,000
      assert.equal(Number(report.eacValue), 800_000);

      // ETC = 800,000 - 400,000 = 400,000
      assert.equal(Number(report.etcValue), 400_000);
    });

    test("package with no work orders contributes 0 to EV", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 500_000, "PKG-001");
      // No work orders created
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 100_000 } });

      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      assert.equal(Number(report.budgetAtCompletion), 500_000);
      assert.equal(Number(report.earnedValue), 0);
      assert.equal(Number(report.actualCost), 100_000);
    });
  });

  describe("Division by zero cases", () => {
    test("SPI is null when PV is 0 (report before programme start)", async () => {
      await setupTwoTenants();

      // Programme starts 2026-01-01, report period 2025-06 is before start
      const programmeId = await createProgramme({ startDate: "2026-01-01", endDate: "2026-12-31" });
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      // PV should be 0 (capped at minimum 0 since elapsed is negative)
      assert.equal(Number(report.plannedValue), 0);
      // SPI should be null (division by zero)
      assert.equal(report.spiValue, null);
    });

    test("CPI is null when AC is 0", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");
      // cumulativePaid defaults to 0, so AC = 0

      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      assert.equal(Number(report.actualCost), 0);
      // CPI should be null (division by zero)
      assert.equal(report.cpiValue, null);
      // EAC should be null (CPI is null)
      assert.equal(report.eacValue, null);
      // ETC should be null (EAC is null)
      assert.equal(report.etcValue, null);
    });
  });

  describe("Override values", () => {
    test("POST with override values stores those instead of calculated", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      // Override EVM values
      const res = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          period: "2025-06",
          budgetAtCompletion: 2_000_000,
          earnedValue: 800_000,
          actualCost: 900_000,
          spiValue: 0.85,
          cpiValue: 0.89,
        },
      });

      assert.equal(res.statusCode, 201);
      const report = res.json();

      // Should use overridden values, not calculated
      assert.equal(Number(report.budgetAtCompletion), 2_000_000);
      assert.equal(Number(report.earnedValue), 800_000);
      assert.equal(Number(report.actualCost), 900_000);
      assert.equal(report.spiValue, 0.85);
      assert.equal(report.cpiValue, 0.89);
    });
  });

  describe("PATCH updates", () => {
    test("PATCH updates narrative fields without recalculating EVM", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 400_000 } });

      // Create report
      const createRes = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });
      const reportId = (createRes.json() as Record<string, unknown>)["id"] as string;
      const originalReport = createRes.json() as Record<string, unknown>;

      // Patch narrative
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/progress-reports/${reportId}`,
        headers: { cookie: `session=${cookieA}` },
        payload: {
          narrative: "Project on track. No major issues.",
          keyIssues: ["Supply chain delays"],
          forecastCost: 1_200_000,
        },
      });

      assert.equal(patchRes.statusCode, 200);
      const patched = patchRes.json();

      // Narrative updated
      assert.equal(patched.narrative, "Project on track. No major issues.");
      assert.deepEqual(patched.keyIssues, ["Supply chain delays"]);
      assert.equal(Number(patched.forecastCost), 1_200_000);

      // EVM values unchanged
      assert.equal(Number(patched.budgetAtCompletion), Number(originalReport["budgetAtCompletion"]));
      assert.equal(Number(patched.earnedValue), Number(originalReport["earnedValue"]));
      assert.equal(Number(patched.actualCost), Number(originalReport["actualCost"]));
      assert.equal(patched.cpiValue, originalReport["cpiValue"]);
    });
  });

  describe("GET single report with derived metrics", () => {
    test("GET /progress-reports/:id returns VAC, TCPI, percentComplete", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 400_000 } });

      const createRes = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });
      const reportId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const getRes = await app.inject({
        method: "GET",
        url: `/progress-reports/${reportId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(getRes.statusCode, 200);
      const body = getRes.json();

      // Should have derived fields
      assert.ok(body.derived !== undefined);
      assert.ok(body.derived.percentComplete !== undefined);
      // percentComplete = EV/BAC*100 = 500,000/1,000,000*100 = 50
      assert.equal(body.derived.percentComplete, 50);

      // TCPI = (BAC - EV) / (BAC - AC) = (1,000,000 - 500,000) / (1,000,000 - 400,000) = 500,000/600,000 = 0.83
      assert.ok(body.derived.tcpi !== null);
      assert.equal(body.derived.tcpi, 0.83);

      // VAC = BAC - EAC; EAC = BAC/CPI = 1,000,000/1.25 = 800,000
      // VAC = 1,000,000 - 800,000 = 200,000
      assert.ok(body.derived.vac !== null);
      assert.equal(body.derived.vac, 200_000);
    });
  });

  describe("Forecast generation", () => {
    test("GET /progress-reports/:programmeId/forecast returns monthly projections", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme({ endDate: "2026-06-30" });
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 30, "WO-001");
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 250_000 } });

      // Create a progress report so the forecast endpoint has data
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      const forecastRes = await app.inject({
        method: "GET",
        url: `/progress-reports/${programmeId}/forecast`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(forecastRes.statusCode, 200);
      const forecast = forecastRes.json();

      // Should have forecast array
      assert.ok(Array.isArray(forecast.forecast));
      assert.ok(forecast.forecast.length > 0);

      // Each entry should have month, projectedSpend, cumulativeSpend
      const first = forecast.forecast[0] as Record<string, unknown>;
      assert.ok(first.month !== undefined);
      assert.ok(typeof first.projectedSpend === "number");
      assert.ok(typeof first.cumulativeSpend === "number");

      // CumulativeSpend should accumulate
      if (forecast.forecast.length >= 2) {
        const second = forecast.forecast[1] as Record<string, unknown>;
        assert.ok(
          (second.cumulativeSpend as number) > (first.cumulativeSpend as number),
        );
      }

      // BAC and current values should be present
      assert.equal(forecast.bac, 1_000_000);
      assert.equal(forecast.currentEV, 300_000); // 1,000,000 * 0.30
      assert.equal(forecast.currentAC, 250_000);
      assert.equal(forecast.remainingWork, 700_000); // BAC - EV = 1,000,000 - 300,000
    });

    test("forecast returns 404 when no reports exist", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();

      const res = await app.inject({
        method: "GET",
        url: `/progress-reports/${programmeId}/forecast`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 404);
    });

    test("forecast uses average CPI from recent reports", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme({ endDate: "2026-12-31" });
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");
      await prisma.package.update({ where: { id: pkgId }, data: { cumulativePaid: 400_000 } });

      // Create reports with known CPI values (using overrides)
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          period: "2025-01",
          budgetAtCompletion: 1_000_000,
          earnedValue: 100_000,
          actualCost: 120_000,
          cpiValue: 0.83,
          plannedValue: 100_000,
          spiValue: 1.0,
        },
      });
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          period: "2025-02",
          budgetAtCompletion: 1_000_000,
          earnedValue: 200_000,
          actualCost: 220_000,
          cpiValue: 0.91,
          plannedValue: 200_000,
          spiValue: 1.0,
        },
      });
      // Most recent report (this determines BAC, EV, AC for forecast)
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: {
          programmeId,
          period: "2025-03",
          budgetAtCompletion: 1_000_000,
          earnedValue: 300_000,
          actualCost: 350_000,
          cpiValue: 0.86,
          plannedValue: 300_000,
          spiValue: 1.0,
        },
      });

      const forecastRes = await app.inject({
        method: "GET",
        url: `/progress-reports/${programmeId}/forecast`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(forecastRes.statusCode, 200);
      const forecast = forecastRes.json();

      // avgCPI = (0.83 + 0.91 + 0.86) / 3 = 0.8667 -> rounded to 0.87
      assert.ok(forecast.avgCPI > 0.85 && forecast.avgCPI < 0.88, `avgCPI should be ~0.87 but got ${forecast.avgCPI}`);

      // remainingWork = BAC - EV = 1,000,000 - 300,000 = 700,000
      assert.equal(forecast.remainingWork, 700_000);

      // Verify projected monthly spend uses avgCPI
      // monthlySpend = (remainingWork / remainingMonths) * (1/avgCPI)
      const monthlySpend = forecast.forecast[0].projectedSpend as number;
      assert.ok(monthlySpend > 0, "Monthly spend should be positive");
    });
  });

  describe("List progress reports", () => {
    test("GET /progress-reports?programmeId lists reports ordered by period DESC", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      // Create reports for multiple periods
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-01" },
      });
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-03" },
      });
      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-02" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/progress-reports?programmeId=${programmeId}`,
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 200);
      const list = res.json() as Array<Record<string, unknown>>;
      assert.equal(list.length, 3);
      // Should be ordered by period DESC
      assert.equal(list[0]!["period"], "2025-03");
      assert.equal(list[1]!["period"], "2025-02");
      assert.equal(list[2]!["period"], "2025-01");
    });

    test("GET /progress-reports returns 400 without programmeId", async () => {
      await setupTwoTenants();

      const res = await app.inject({
        method: "GET",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("Tenant isolation", () => {
    test("user B cannot see user A's progress reports", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      // User B tries to list A's programme reports
      const res = await app.inject({
        method: "GET",
        url: `/progress-reports?programmeId=${programmeId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      // Programme not found for B's tenant -> 404
      assert.equal(res.statusCode, 404);
    });

    test("user B cannot access user A's forecast", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });

      // User B tries to access A's forecast
      const res = await app.inject({
        method: "GET",
        url: `/progress-reports/${programmeId}/forecast`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404);
    });

    test("user B cannot get user A's progress report by ID", async () => {
      await setupTwoTenants();

      const programmeId = await createProgramme();
      const projectId = await createProject();
      const pkgId = await createPackage(programmeId, projectId, 1_000_000, "PKG-001");
      await createWorkOrder(pkgId, 50, "WO-001");

      const createRes = await app.inject({
        method: "POST",
        url: "/progress-reports",
        headers: { cookie: `session=${cookieA}` },
        payload: { programmeId, period: "2025-06" },
      });
      const reportId = (createRes.json() as Record<string, unknown>)["id"] as string;

      const res = await app.inject({
        method: "GET",
        url: `/progress-reports/${reportId}`,
        headers: { cookie: `session=${cookieB}` },
      });

      assert.equal(res.statusCode, 404);
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
