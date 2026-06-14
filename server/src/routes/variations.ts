import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z.string().max(50).refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreateVariationBody = z.object({
  packageId: z.string().min(1),
  reference: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
  amount: z.number().min(-10_000_000_000).max(10_000_000_000),
  currency: z.string().max(10).optional(),
  timeImpactDays: z.number().int().optional(),
  assessedAmount: z.number().min(-10_000_000_000).max(10_000_000_000).optional(),
  assessedTimeDays: z.number().int().optional(),
  submittedDate: dateString.optional(),
  metadata: z.unknown().optional(),
});

const UpdateVariationBody = z.object({
  reference: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
  amount: z.number().min(-10_000_000_000).max(10_000_000_000).optional(),
  currency: z.string().max(10).optional(),
  timeImpactDays: z.number().int().optional(),
  assessedAmount: z.number().min(-10_000_000_000).max(10_000_000_000).optional(),
  assessedTimeDays: z.number().int().optional(),
  submittedDate: dateString.optional(),
  assessedDate: dateString.optional(),
  approvedBy: z.string().max(200).optional(),
  status: z.enum(["PROPOSED", "ASSESSED", "APPROVED", "REJECTED", "IMPLEMENTED"]).optional(),
  metadata: z.unknown().optional(),
});

// Valid status transitions for variations
const VALID_TRANSITIONS: Record<string, string[]> = {
  PROPOSED: ["ASSESSED"],
  ASSESSED: ["APPROVED", "REJECTED"],
  APPROVED: ["IMPLEMENTED"],
  REJECTED: [],
  IMPLEMENTED: [],
};

export default async function variationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /variations?packageId=xxx - list variations for a package
  app.get(
    "/variations",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const query = request.query as { packageId?: string };

      if (!query.packageId) {
        return reply.code(400).send({ error: "packageId query parameter is required" });
      }

      // Verify package belongs to tenant
      const pkg = await prisma.package.findFirst({
        where: {
          id: query.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!pkg) {
        return reply.code(404).send({ error: "Not found" });
      }

      const variations = await prisma.contractVariation.findMany({
        where: {
          packageId: query.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });

      return variations;
    },
  );

  // GET /variations/:id - get single variation
  app.get(
    "/variations/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const variation = await prisma.contractVariation.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!variation) {
        return reply.code(404).send({ error: "Not found" });
      }

      return variation;
    },
  );

  // POST /variations - create variation (MANAGER+)
  app.post(
    "/variations",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateVariationBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      // Verify packageId belongs to tenant
      const pkg = await prisma.package.findFirst({
        where: {
          id: data.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!pkg) {
        return reply.code(404).send({ error: "Not found" });
      }

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        packageId: data.packageId,
        reference: data.reference,
        title: data.title,
        amount: data.amount,
      };

      if (data.description !== undefined) createData["description"] = data.description;
      if (data.reason !== undefined) createData["reason"] = data.reason;
      if (data.currency !== undefined) createData["currency"] = data.currency;
      if (data.timeImpactDays !== undefined) createData["timeImpactDays"] = data.timeImpactDays;
      if (data.assessedAmount !== undefined) createData["assessedAmount"] = data.assessedAmount;
      if (data.assessedTimeDays !== undefined) createData["assessedTimeDays"] = data.assessedTimeDays;
      if (data.submittedDate !== undefined) createData["submittedDate"] = new Date(data.submittedDate);
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.contractVariation.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /variations/:id - update + status transitions (MANAGER+)
  app.patch(
    "/variations/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateVariationBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.contractVariation.findFirst({
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
        const allowed = VALID_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(data.status)) {
          return reply.code(400).send({
            error: "Invalid status transition",
            details: `Cannot transition from ${existing.status} to ${data.status}`,
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.reference !== undefined) updateData["reference"] = data.reference;
      if (data.title !== undefined) updateData["title"] = data.title;
      if (data.description !== undefined) updateData["description"] = data.description;
      if (data.reason !== undefined) updateData["reason"] = data.reason;
      if (data.amount !== undefined) updateData["amount"] = data.amount;
      if (data.currency !== undefined) updateData["currency"] = data.currency;
      if (data.timeImpactDays !== undefined) updateData["timeImpactDays"] = data.timeImpactDays;
      if (data.assessedAmount !== undefined) updateData["assessedAmount"] = data.assessedAmount;
      if (data.assessedTimeDays !== undefined) updateData["assessedTimeDays"] = data.assessedTimeDays;
      if (data.submittedDate !== undefined) updateData["submittedDate"] = new Date(data.submittedDate);
      if (data.assessedDate !== undefined) updateData["assessedDate"] = new Date(data.assessedDate);
      if (data.approvedBy !== undefined) updateData["approvedBy"] = data.approvedBy;
      if (data.metadata !== undefined) updateData["metadata"] = data.metadata;

      if (data.status !== undefined) {
        updateData["status"] = data.status;

        // Set date fields on status transitions
        if (data.status === "ASSESSED" && !data.assessedDate) {
          updateData["assessedDate"] = new Date();
        }
        if (data.status === "APPROVED") {
          updateData["approvedDate"] = new Date();
        }
        if (data.status === "IMPLEMENTED") {
          updateData["implementedDate"] = new Date();
        }
      }

      // When APPROVED: update Package.contractValue by adding agreedValue
      if (data.status === "APPROVED" && existing.status !== "APPROVED") {
        const agreedValue = existing.assessedAmount !== null
          ? Number(existing.assessedAmount)
          : Number(existing.amount);

        // If assessedAmount was just set in the same request, use it
        const finalAgreedValue = data.assessedAmount !== undefined
          ? data.assessedAmount
          : agreedValue;

        const pkg = await prisma.package.findFirst({
          where: { id: existing.packageId, tenantId: request.tenantId },
        });

        if (pkg) {
          const newContractValue = Math.round((Number(pkg.contractValue) + finalAgreedValue) * 100) / 100;
          await prisma.package.update({
            where: { id: existing.packageId },
            data: { contractValue: newContractValue },
          });
        }
      }

      const updated = await prisma.contractVariation.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /variations/:id - soft-delete only if PROPOSED (MANAGER+)
  app.delete(
    "/variations/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.contractVariation.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      if (existing.status !== "PROPOSED") {
        return reply.code(400).send({
          error: "Cannot delete variation",
          details: "Variation can only be deleted when in PROPOSED status",
        });
      }

      await prisma.contractVariation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
