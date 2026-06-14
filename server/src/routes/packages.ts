import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const ContractTypeEnum = z.enum([
  "NEC4_OPTION_A",
  "NEC4_OPTION_B",
  "NEC4_OPTION_C",
  "NEC4_OPTION_D",
  "FIDIC_RED",
  "FIDIC_YELLOW",
  "FIDIC_SILVER",
  "OTHER",
]);

const CreatePackageBody = z.object({
  programmeId: z.string().min(1),
  projectId: z.string().min(1),
  contractRef: z.string().max(100),
  title: z.string().min(1).max(200),
  contractType: ContractTypeEnum.optional(),
  contractor: z.string().max(200).optional(),
  contractValue: z.number().min(0).max(10_000_000_000),
  currency: z.string().max(10).optional(),
  retentionPercent: z.number().min(0).max(100).optional(),
  maxRetentionPercent: z.number().min(0).max(100).optional(),
  defectsLiabilityMonths: z.number().int().min(0).max(60).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
  metadata: z.unknown().optional(),
});

const UpdatePackageBody = CreatePackageBody.omit({ programmeId: true, projectId: true }).partial().extend({
  status: z.enum([
    "DRAFT",
    "TENDERED",
    "AWARDED",
    "ACTIVE",
    "SUBSTANTIALLY_COMPLETE",
    "DEFECTS_LIABILITY",
    "FINAL_ACCOUNT",
    "CLOSED",
    "SUSPENDED",
    "TERMINATED",
  ]).optional(),
});

// Valid status transitions for packages
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["TENDERED", "TERMINATED"],
  TENDERED: ["AWARDED", "TERMINATED"],
  AWARDED: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUBSTANTIALLY_COMPLETE", "SUSPENDED", "TERMINATED"],
  SUBSTANTIALLY_COMPLETE: ["DEFECTS_LIABILITY", "TERMINATED"],
  DEFECTS_LIABILITY: ["FINAL_ACCOUNT", "TERMINATED"],
  FINAL_ACCOUNT: ["CLOSED", "TERMINATED"],
  CLOSED: ["TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

export default async function packagesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /packages - list packages (filterable by programmeId, projectId)
  app.get(
    "/packages",
    { preHandler: [requireRole("VIEWER")] },
    async (request, _reply) => {
      const query = request.query as { programmeId?: string; projectId?: string };

      const where: Record<string, unknown> = {
        tenantId: request.tenantId,
        deletedAt: null,
      };

      if (query.programmeId) {
        where["programmeId"] = query.programmeId;
      }
      if (query.projectId) {
        where["projectId"] = query.projectId;
      }

      const packages = await prisma.package.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
      });
      return packages;
    },
  );

  // GET /packages/:id - get package with work order summary
  app.get(
    "/packages/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const found = await prisma.package.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!found) {
        return reply.code(404).send({ error: "Not found" });
      }

      const workOrderCount = await prisma.workOrder.count({
        where: {
          packageId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      const workOrders = await prisma.workOrder.findMany({
        where: {
          packageId: id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { percentComplete: true, status: true },
      });

      const completedCount = workOrders.filter((wo) => wo.status === "COMPLETED" || wo.status === "VERIFIED" || wo.status === "CLOSED").length;
      const averageProgress =
        workOrders.length > 0
          ? workOrders.reduce((sum, wo) => sum + wo.percentComplete, 0) / workOrders.length
          : 0;

      return {
        ...found,
        workOrderSummary: {
          total: workOrderCount,
          completed: completedCount,
          averageProgress: Math.round(averageProgress * 100) / 100,
        },
      };
    },
  );

  // POST /packages - create package (MANAGER+)
  app.post(
    "/packages",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreatePackageBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      // Verify projectId belongs to tenant
      const project = await prisma.project.findFirst({
        where: {
          id: data.projectId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        programmeId: data.programmeId,
        projectId: data.projectId,
        contractRef: data.contractRef,
        title: data.title,
        contractValue: data.contractValue,
      };

      if (data.contractType !== undefined) createData["contractType"] = data.contractType;
      if (data.contractor !== undefined) createData["contractor"] = data.contractor;
      if (data.currency !== undefined) createData["currency"] = data.currency;
      if (data.retentionPercent !== undefined) createData["retentionPercent"] = data.retentionPercent;
      if (data.maxRetentionPercent !== undefined) createData["maxRetentionPercent"] = data.maxRetentionPercent;
      if (data.defectsLiabilityMonths !== undefined) createData["defectsLiabilityMonths"] = data.defectsLiabilityMonths;
      if (data.startDate !== undefined) createData["startDate"] = new Date(data.startDate);
      if (data.endDate !== undefined) createData["endDate"] = new Date(data.endDate);
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.package.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /packages/:id - update package with status transitions (MANAGER+)
  app.patch(
    "/packages/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdatePackageBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.package.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      const data = parsed.data;

      // Validate status transition
      if (data.status !== undefined && data.status !== existing.status) {
        // TERMINATED requires ADMIN role
        if (data.status === "TERMINATED") {
          const userRole = request.membership.role;
          const roleHierarchy = ["VIEWER", "MANAGER", "ADMIN", "OWNER"];
          if (roleHierarchy.indexOf(userRole) < roleHierarchy.indexOf("ADMIN")) {
            return reply.code(403).send({ error: "Forbidden" });
          }
        }

        const allowed = VALID_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(data.status)) {
          return reply.code(400).send({
            error: "Invalid status transition",
            details: `Cannot transition from ${existing.status} to ${data.status}`,
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.contractRef !== undefined) updateData["contractRef"] = data.contractRef;
      if (data.title !== undefined) updateData["title"] = data.title;
      if (data.contractType !== undefined) updateData["contractType"] = data.contractType;
      if (data.contractor !== undefined) updateData["contractor"] = data.contractor;
      if (data.contractValue !== undefined) updateData["contractValue"] = data.contractValue;
      if (data.currency !== undefined) updateData["currency"] = data.currency;
      if (data.retentionPercent !== undefined) updateData["retentionPercent"] = data.retentionPercent;
      if (data.maxRetentionPercent !== undefined) updateData["maxRetentionPercent"] = data.maxRetentionPercent;
      if (data.defectsLiabilityMonths !== undefined) updateData["defectsLiabilityMonths"] = data.defectsLiabilityMonths;
      if (data.startDate !== undefined) updateData["startDate"] = new Date(data.startDate);
      if (data.endDate !== undefined) updateData["endDate"] = new Date(data.endDate);
      if (data.status !== undefined) updateData["status"] = data.status;
      if (data.metadata !== undefined) updateData["metadata"] = data.metadata;

      const updated = await prisma.package.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /packages/:id - soft-delete only if DRAFT or CLOSED (MANAGER+)
  app.delete(
    "/packages/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.package.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      if (existing.status !== "DRAFT" && existing.status !== "CLOSED") {
        return reply.code(400).send({
          error: "Cannot delete package",
          details: "Package can only be deleted when in DRAFT or CLOSED status",
        });
      }

      await prisma.package.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
