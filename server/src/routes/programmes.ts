import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const CreateProgrammeBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  totalBudget: z.number().min(0).max(10_000_000_000),
  baseCurrency: z.string().max(10).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
  metadata: z.unknown().optional(),
});

const UpdateProgrammeBody = CreateProgrammeBody.partial();

export default async function programmesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /programmes - list programmes for tenant
  app.get(
    "/programmes",
    { preHandler: [requireRole("VIEWER")] },
    async (request, _reply) => {
      const programmes = await prisma.programme.findMany({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      return programmes;
    },
  );

  // GET /programmes/:id - get programme with summary stats
  app.get(
    "/programmes/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const found = await prisma.programme.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!found) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Summary stats
      const projectCount = await prisma.project.count({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      const workOrders = await prisma.workOrder.findMany({
        where: {
          package: { programmeId: id },
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { percentComplete: true },
      });

      const overallProgress =
        workOrders.length > 0
          ? workOrders.reduce((sum, wo) => sum + wo.percentComplete, 0) / workOrders.length
          : 0;

      return {
        ...found,
        summary: {
          projectCount,
          totalBudget: found.totalBudget,
          overallProgress: Math.round(overallProgress * 100) / 100,
        },
      };
    },
  );

  // POST /programmes - create programme (ADMIN+)
  app.post(
    "/programmes",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateProgrammeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        name: data.name,
        totalBudget: data.totalBudget ?? 0,
      };

      if (data.description !== undefined) createData["description"] = data.description;
      if (data.baseCurrency !== undefined) createData["baseCurrency"] = data.baseCurrency;
      if (data.startDate !== undefined) createData["startDate"] = new Date(data.startDate);
      if (data.endDate !== undefined) createData["endDate"] = new Date(data.endDate);
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.programme.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /programmes/:id - update programme (ADMIN+)
  app.patch(
    "/programmes/:id",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateProgrammeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.programme.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      const updateData: Record<string, unknown> = {};
      const d = parsed.data;
      if (d.name !== undefined) updateData["name"] = d.name;
      if (d.description !== undefined) updateData["description"] = d.description;
      if (d.totalBudget !== undefined) updateData["totalBudget"] = d.totalBudget;
      if (d.baseCurrency !== undefined) updateData["baseCurrency"] = d.baseCurrency;
      if (d.startDate !== undefined) updateData["startDate"] = new Date(d.startDate);
      if (d.endDate !== undefined) updateData["endDate"] = new Date(d.endDate);
      if (d.metadata !== undefined) updateData["metadata"] = d.metadata;

      const updated = await prisma.programme.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /programmes/:id - soft-delete (ADMIN+)
  app.delete(
    "/programmes/:id",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.programme.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.programme.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /programmes/:id/dashboard - aggregated stats
  app.get(
    "/programmes/:id/dashboard",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const programme = await prisma.programme.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!programme) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Total projects count
      const totalProjects = await prisma.project.count({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      // Active packages count
      const activePackages = await prisma.package.count({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          status: "ACTIVE",
          deletedAt: null,
        },
      });

      // Total work orders
      const totalWorkOrders = await prisma.workOrder.count({
        where: {
          package: { programmeId: id },
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      // Budget summary - committed via packages contractValue sum
      const packagesAgg = await prisma.package.aggregate({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        _sum: {
          contractValue: true,
          cumulativePaid: true,
        },
      });

      // Schedule summary - earliest start, latest end across packages
      const scheduleAgg = await prisma.package.aggregate({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          deletedAt: null,
          startDate: { not: null },
        },
        _min: { startDate: true },
        _max: { endDate: true },
      });

      // Progress - weighted average of work order percentComplete
      const workOrders = await prisma.workOrder.findMany({
        where: {
          package: { programmeId: id },
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { percentComplete: true },
      });

      const overallProgress =
        workOrders.length > 0
          ? workOrders.reduce((sum, wo) => sum + wo.percentComplete, 0) / workOrders.length
          : 0;

      // Top risks - highest RPN cases across programme projects
      const projectIds = await prisma.project.findMany({
        where: {
          programmeId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      const topRisks = await prisma.case.findMany({
        where: {
          tenantId: request.tenantId,
          projectId: { in: projectIds.map((p) => p.id) },
          deletedAt: null,
          sev: { not: null },
          occ: { not: null },
          det: { not: null },
        },
        orderBy: [{ sev: "desc" }, { occ: "desc" }, { det: "desc" }],
        take: 10,
      });

      return {
        totalProjects,
        activePackages,
        totalWorkOrders,
        budgetSummary: {
          totalBudget: programme.totalBudget,
          committed: packagesAgg._sum.contractValue ?? 0,
          spent: packagesAgg._sum.cumulativePaid ?? 0,
        },
        scheduleSummary: {
          earliestStart: scheduleAgg._min.startDate ?? null,
          latestEnd: scheduleAgg._max.endDate ?? null,
        },
        progress: {
          overallPercent: Math.round(overallProgress * 100) / 100,
          totalWorkOrders: workOrders.length,
        },
        topRisks: topRisks.map((c) => ({
          id: c.id,
          problem: c.problem,
          rpn: (c.sev ?? 0) * (c.occ ?? 0) * (c.det ?? 0),
          sev: c.sev,
          occ: c.occ,
          det: c.det,
          status: c.status,
        })),
      };
    },
  );
}
