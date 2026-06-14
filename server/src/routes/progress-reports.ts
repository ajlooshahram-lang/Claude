import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z
  .string()
  .max(50)
  .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreateProgressReportBody = z.object({
  programmeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM format"),
  reportDate: dateString.optional(),
  // Optional override fields
  budgetAtCompletion: z.number().min(0).optional(),
  plannedValue: z.number().min(0).optional(),
  earnedValue: z.number().min(0).optional(),
  actualCost: z.number().min(0).optional(),
  spiValue: z.number().optional().nullable(),
  cpiValue: z.number().optional().nullable(),
  eacValue: z.number().min(0).optional().nullable(),
  etcValue: z.number().min(0).optional().nullable(),
  plannedProgress: z.number().min(0).max(1).optional(),
  actualProgress: z.number().min(0).max(1).optional(),
  narrative: z.string().max(10000).optional().nullable(),
  keyIssues: z.unknown().optional(),
  keyRisks: z.unknown().optional(),
  decisionsRequired: z.unknown().optional(),
  forecastCompletion: dateString.optional().nullable(),
  forecastCost: z.number().min(0).optional().nullable(),
  metadata: z.unknown().optional(),
});

const UpdateProgressReportBody = z.object({
  narrative: z.string().max(10000).optional().nullable(),
  keyIssues: z.unknown().optional(),
  keyRisks: z.unknown().optional(),
  decisionsRequired: z.unknown().optional(),
  forecastCompletion: dateString.optional().nullable(),
  forecastCost: z.number().min(0).optional().nullable(),
  metadata: z.unknown().optional(),
});

/**
 * Calculate the number of months between two dates.
 * Returns a float representing elapsed months.
 */
function monthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  const dayFraction = (endDate.getDate() - startDate.getDate()) / 30;
  return years * 12 + months + dayFraction;
}

/**
 * Round a number to 2 decimal places.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate EVM metrics from programme packages and work orders.
 */
async function calculateEVM(programmeId: string, tenantId: string, period: string) {
  // Fetch programme for start/end dates
  const programme = await prisma.programme.findFirst({
    where: { id: programmeId, tenantId, deletedAt: null },
  });

  if (!programme) {
    return null;
  }

  // Get all active packages for the programme
  const packages = await prisma.package.findMany({
    where: {
      programmeId,
      tenantId,
      deletedAt: null,
    },
    include: {
      workOrders: {
        where: { deletedAt: null },
        select: { percentComplete: true },
      },
    },
  });

  // BAC = sum of all Package.contractValue
  let bac = 0;
  for (const pkg of packages) {
    bac += Number(pkg.contractValue);
  }

  // EV = sum of (Package.contractValue * average WO percentComplete / 100) for each package
  let ev = 0;
  for (const pkg of packages) {
    const contractValue = Number(pkg.contractValue);
    if (pkg.workOrders.length > 0) {
      const avgPercent =
        pkg.workOrders.reduce((sum, wo) => sum + wo.percentComplete, 0) / pkg.workOrders.length;
      ev += contractValue * (avgPercent / 100);
    }
    // If no work orders, this package contributes 0 to EV
  }

  // AC = sum of all Package.cumulativePaid
  let ac = 0;
  for (const pkg of packages) {
    ac += Number(pkg.cumulativePaid);
  }

  // PV = BAC * (elapsed time / total duration) -- linear baseline, capped at BAC
  let pv = 0;
  if (programme.startDate && programme.endDate) {
    const totalDuration = monthsBetween(programme.startDate, programme.endDate);
    // Period end: last day of the period month
    const parts = period.split("-");
    const periodYear = parseInt(parts[0] ?? "2025", 10);
    const periodMonth = parseInt(parts[1] ?? "01", 10);
    // End of the period month
    const periodEnd = new Date(periodYear, periodMonth, 0); // last day of month

    const elapsed = monthsBetween(programme.startDate, periodEnd);

    if (totalDuration > 0) {
      const ratio = Math.min(Math.max(elapsed / totalDuration, 0), 1);
      pv = bac * ratio;
    }
    // Cap PV at BAC
    if (pv > bac) {
      pv = bac;
    }
  }

  // SPI = EV / PV (null if PV=0)
  const spiValue = pv !== 0 ? round2(ev / pv) : null;

  // CPI = EV / AC (null if AC=0)
  const cpiValue = ac !== 0 ? round2(ev / ac) : null;

  // EAC = BAC / CPI (null if CPI is null or 0)
  const eacValue = cpiValue !== null && cpiValue !== 0 ? round2(bac / cpiValue) : null;

  // ETC = EAC - AC (null if EAC is null)
  const etcValue = eacValue !== null ? round2(eacValue - ac) : null;

  // VAC = BAC - EAC (null if EAC is null) -- not stored but can be derived
  // TCPI = (BAC - EV) / (BAC - AC) (null if BAC=AC)
  // percentComplete = EV / BAC * 100 (0 if BAC=0)
  const percentComplete = bac !== 0 ? round2((ev / bac) * 100) : 0;

  return {
    budgetAtCompletion: round2(bac),
    plannedValue: round2(pv),
    earnedValue: round2(ev),
    actualCost: round2(ac),
    spiValue,
    cpiValue,
    eacValue,
    etcValue,
    plannedProgress: pv > 0 && bac > 0 ? round2(pv / bac) : 0,
    actualProgress: bac > 0 ? round2(ev / bac) : 0,
    percentComplete,
  };
}

export default async function progressReportsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /progress-reports?programmeId=xxx - list monthly reports for a programme
  app.get(
    "/progress-reports",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { programmeId } = request.query as { programmeId?: string };

      if (!programmeId) {
        return reply.code(400).send({ error: "programmeId query parameter is required" });
      }

      // Verify programme belongs to tenant
      const programme = await prisma.programme.findFirst({
        where: { id: programmeId, tenantId: request.tenantId, deletedAt: null },
      });

      if (!programme) {
        return reply.code(404).send({ error: "Programme not found" });
      }

      const reports = await prisma.progressReport.findMany({
        where: {
          tenantId: request.tenantId,
          programmeId,
        },
        orderBy: { period: "desc" },
      });

      return reports;
    },
  );

  // GET /progress-reports/:programmeId/forecast - project future disbursement
  // IMPORTANT: Route ordering dependency. This route MUST be registered BEFORE the
  // generic /progress-reports/:id route below. Both use a single path parameter, and
  // Fastify resolves parametric routes by registration order. If this route is moved
  // after /:id, requests to /progress-reports/<programmeId>/forecast will be incorrectly
  // matched by the /:id handler (treating "programmeId" as "id"), returning 404.
  app.get(
    "/progress-reports/:programmeId/forecast",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { programmeId } = request.params as { programmeId: string };

      // Verify programme belongs to tenant
      const programme = await prisma.programme.findFirst({
        where: { id: programmeId, tenantId: request.tenantId, deletedAt: null },
      });

      if (!programme) {
        return reply.code(404).send({ error: "Programme not found" });
      }

      // Fetch last 6 progress reports for the programme
      const recentReports = await prisma.progressReport.findMany({
        where: {
          tenantId: request.tenantId,
          programmeId,
        },
        orderBy: { period: "desc" },
        take: 6,
      });

      if (recentReports.length === 0) {
        return reply.code(404).send({ error: "No progress reports found for this programme" });
      }

      // Calculate average CPI (skip nulls)
      const cpiValues = recentReports
        .map((r) => r.cpiValue)
        .filter((v): v is number => v !== null);
      const avgCPI =
        cpiValues.length > 0
          ? cpiValues.reduce((sum, v) => sum + v, 0) / cpiValues.length
          : 1; // Default to 1 if no CPI values

      // Get BAC, EV, AC from most recent report
      const latestReport = recentReports[0]!;
      const bac = Number(latestReport.budgetAtCompletion);
      const ev = Number(latestReport.earnedValue);
      const ac = Number(latestReport.actualCost);

      // Remaining work = BAC - EV
      const remainingWork = bac - ev;

      // Determine remaining months from current date to programme.endDate
      const now = new Date();
      let remainingMonths = 1; // Default minimum
      if (programme.endDate) {
        const months = monthsBetween(now, programme.endDate);
        remainingMonths = Math.max(Math.ceil(months), 1);
      }

      // Use avgCPI (default to 1 if 0 to avoid division by zero)
      const effectiveCPI = avgCPI !== 0 ? avgCPI : 1;

      // For each remaining month: projectedSpend = remainingWork / remainingMonths * (1/avgCPI)
      const monthlySpend = round2((remainingWork / remainingMonths) * (1 / effectiveCPI));

      const forecast: Array<{ month: string; projectedSpend: number; cumulativeSpend: number }> = [];
      let cumulative = 0;

      for (let i = 0; i < remainingMonths; i++) {
        const forecastDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
        const month = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, "0")}`;
        cumulative += monthlySpend;
        forecast.push({
          month,
          projectedSpend: monthlySpend,
          cumulativeSpend: round2(cumulative),
        });
      }

      return {
        programmeId,
        bac: round2(bac),
        currentEV: round2(ev),
        currentAC: round2(ac),
        remainingWork: round2(remainingWork),
        avgCPI: round2(effectiveCPI),
        remainingMonths,
        forecast,
      };
    },
  );

  // GET /progress-reports/:id - get a single report
  app.get(
    "/progress-reports/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const report = await prisma.progressReport.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
        },
      });

      if (!report) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Calculate derived metrics for display
      const bac = Number(report.budgetAtCompletion);
      const ev = Number(report.earnedValue);
      const ac = Number(report.actualCost);

      // VAC = BAC - EAC
      const eac = report.eacValue !== null ? Number(report.eacValue) : null;
      const vac = eac !== null ? round2(bac - eac) : null;

      // TCPI = (BAC - EV) / (BAC - AC) (null if BAC=AC)
      const tcpi = bac !== ac ? round2((bac - ev) / (bac - ac)) : null;

      // percentComplete = EV / BAC * 100
      const percentComplete = bac !== 0 ? round2((ev / bac) * 100) : 0;

      return {
        ...report,
        derived: {
          vac,
          tcpi,
          percentComplete,
        },
      };
    },
  );

  // POST /progress-reports - create monthly progress report (ADMIN+)
  app.post(
    "/progress-reports",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateProgressReportBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      // Verify programme belongs to tenant
      const programme = await prisma.programme.findFirst({
        where: { id: data.programmeId, tenantId: request.tenantId, deletedAt: null },
      });

      if (!programme) {
        return reply.code(404).send({ error: "Programme not found" });
      }

      // Check for duplicate period: only one report allowed per (programmeId, period)
      const existing = await prisma.progressReport.findFirst({
        where: {
          tenantId: request.tenantId,
          programmeId: data.programmeId,
          period: data.period,
        },
      });

      if (existing) {
        return reply
          .code(409)
          .send({ error: "A progress report already exists for this programme and period" });
      }

      // Auto-calculate EVM metrics
      const calculated = await calculateEVM(data.programmeId, request.tenantId, data.period);
      if (!calculated) {
        return reply.code(404).send({ error: "Programme not found" });
      }

      // Build create data, using overrides where provided
      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        programmeId: data.programmeId,
        period: data.period,
        reportDate: data.reportDate ? new Date(data.reportDate) : new Date(),
        // EVM values: use override if provided, otherwise use calculated
        budgetAtCompletion:
          data.budgetAtCompletion !== undefined ? data.budgetAtCompletion : calculated.budgetAtCompletion,
        plannedValue: data.plannedValue !== undefined ? data.plannedValue : calculated.plannedValue,
        earnedValue: data.earnedValue !== undefined ? data.earnedValue : calculated.earnedValue,
        actualCost: data.actualCost !== undefined ? data.actualCost : calculated.actualCost,
        spiValue: data.spiValue !== undefined ? data.spiValue : calculated.spiValue,
        cpiValue: data.cpiValue !== undefined ? data.cpiValue : calculated.cpiValue,
        eacValue: data.eacValue !== undefined ? data.eacValue : calculated.eacValue,
        etcValue: data.etcValue !== undefined ? data.etcValue : calculated.etcValue,
        plannedProgress:
          data.plannedProgress !== undefined ? data.plannedProgress : calculated.plannedProgress,
        actualProgress:
          data.actualProgress !== undefined ? data.actualProgress : calculated.actualProgress,
      };

      // Optional fields
      if (data.narrative !== undefined) createData["narrative"] = data.narrative;
      if (data.keyIssues !== undefined) createData["keyIssues"] = data.keyIssues;
      if (data.keyRisks !== undefined) createData["keyRisks"] = data.keyRisks;
      if (data.decisionsRequired !== undefined) createData["decisionsRequired"] = data.decisionsRequired;
      if (data.forecastCompletion !== undefined) {
        createData["forecastCompletion"] = data.forecastCompletion ? new Date(data.forecastCompletion) : null;
      }
      if (data.forecastCost !== undefined) createData["forecastCost"] = data.forecastCost;
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.progressReport.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /progress-reports/:id - update narrative/forecast fields (MANAGER+)
  app.patch(
    "/progress-reports/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateProgressReportBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.progressReport.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      const updateData: Record<string, unknown> = {};
      const d = parsed.data;
      if (d.narrative !== undefined) updateData["narrative"] = d.narrative;
      if (d.keyIssues !== undefined) updateData["keyIssues"] = d.keyIssues;
      if (d.keyRisks !== undefined) updateData["keyRisks"] = d.keyRisks;
      if (d.decisionsRequired !== undefined) updateData["decisionsRequired"] = d.decisionsRequired;
      if (d.forecastCompletion !== undefined) {
        updateData["forecastCompletion"] = d.forecastCompletion ? new Date(d.forecastCompletion) : null;
      }
      if (d.forecastCost !== undefined) updateData["forecastCost"] = d.forecastCost;
      if (d.metadata !== undefined) updateData["metadata"] = d.metadata;

      const updated = await prisma.progressReport.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );
}
