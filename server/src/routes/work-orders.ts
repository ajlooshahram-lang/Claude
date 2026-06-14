import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z.string().max(50).refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreateWorkOrderBody = z.object({
  packageId: z.string().min(1),
  reference: z.string().max(100),
  description: z.string().max(5000).optional(),
  workType: z.string().max(100).optional(),
  location: z.unknown().optional(),
  routeKmStart: z.number().optional(),
  routeKmEnd: z.number().optional(),
  plannedStart: dateString.optional(),
  plannedEnd: dateString.optional(),
  assignedTo: z.string().max(200).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  plannedQuantity: z.number().min(0).max(10_000_000_000).optional(),
  unit: z.string().max(50).optional(),
  metadata: z.unknown().optional(),
});

const UpdateWorkOrderBody = CreateWorkOrderBody.omit({ packageId: true }).partial().extend({
  status: z.enum([
    "DRAFT",
    "ISSUED",
    "IN_PROGRESS",
    "COMPLETED",
    "VERIFIED",
    "CLOSED",
    "CANCELLED",
  ]).optional(),
});

// Valid status transitions for work orders
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["VERIFIED", "CANCELLED"],
  VERIFIED: ["CLOSED", "CANCELLED"],
  CLOSED: ["CANCELLED"],
  CANCELLED: [],
};

export default async function workOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /work-orders - list work orders for a package
  app.get(
    "/work-orders",
    { preHandler: [requireRole("VIEWER")] },
    async (request, _reply) => {
      const query = request.query as { packageId?: string };

      const where: Record<string, unknown> = {
        tenantId: request.tenantId,
        deletedAt: null,
      };

      if (query.packageId) {
        where["packageId"] = query.packageId;
      }

      const workOrders = await prisma.workOrder.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
      });
      return workOrders;
    },
  );

  // GET /work-orders/:id - get work order with progress details
  app.get(
    "/work-orders/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const found = await prisma.workOrder.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!found) {
        return reply.code(404).send({ error: "Not found" });
      }

      return {
        ...found,
        progressDetails: {
          percentComplete: found.percentComplete,
          plannedQuantity: found.plannedQuantity,
          actualQuantity: found.actualQuantity,
          unit: found.unit,
          isOverdue:
            found.plannedEnd !== null &&
            found.actualEnd === null &&
            found.status !== "COMPLETED" &&
            found.status !== "VERIFIED" &&
            found.status !== "CLOSED" &&
            found.status !== "CANCELLED" &&
            new Date(found.plannedEnd) < new Date(),
        },
      };
    },
  );

  // POST /work-orders - create work order (MANAGER+)
  app.post(
    "/work-orders",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateWorkOrderBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      // Verify packageId chain belongs to tenant
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
      };

      if (data.description !== undefined) createData["description"] = data.description;
      if (data.workType !== undefined) createData["workType"] = data.workType;
      if (data.location !== undefined) createData["location"] = data.location;
      if (data.routeKmStart !== undefined) createData["routeKmStart"] = data.routeKmStart;
      if (data.routeKmEnd !== undefined) createData["routeKmEnd"] = data.routeKmEnd;
      if (data.plannedStart !== undefined) createData["plannedStart"] = new Date(data.plannedStart);
      if (data.plannedEnd !== undefined) createData["plannedEnd"] = new Date(data.plannedEnd);
      if (data.assignedTo !== undefined) createData["assignedTo"] = data.assignedTo;
      if (data.percentComplete !== undefined) createData["percentComplete"] = data.percentComplete;
      if (data.plannedQuantity !== undefined) createData["plannedQuantity"] = data.plannedQuantity;
      if (data.unit !== undefined) createData["unit"] = data.unit;
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.workOrder.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /work-orders/:id - update with status transitions (MANAGER+)
  app.patch(
    "/work-orders/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateWorkOrderBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.workOrder.findFirst({
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
      if (data.description !== undefined) updateData["description"] = data.description;
      if (data.workType !== undefined) updateData["workType"] = data.workType;
      if (data.location !== undefined) updateData["location"] = data.location;
      if (data.routeKmStart !== undefined) updateData["routeKmStart"] = data.routeKmStart;
      if (data.routeKmEnd !== undefined) updateData["routeKmEnd"] = data.routeKmEnd;
      if (data.plannedStart !== undefined) updateData["plannedStart"] = new Date(data.plannedStart);
      if (data.plannedEnd !== undefined) updateData["plannedEnd"] = new Date(data.plannedEnd);
      if (data.assignedTo !== undefined) updateData["assignedTo"] = data.assignedTo;
      if (data.percentComplete !== undefined) updateData["percentComplete"] = data.percentComplete;
      if (data.plannedQuantity !== undefined) updateData["plannedQuantity"] = data.plannedQuantity;
      if (data.unit !== undefined) updateData["unit"] = data.unit;
      if (data.status !== undefined) updateData["status"] = data.status;
      if (data.metadata !== undefined) updateData["metadata"] = data.metadata;

      const updated = await prisma.workOrder.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /work-orders/:id - soft-delete only if DRAFT (MANAGER+)
  app.delete(
    "/work-orders/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.workOrder.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      if (existing.status !== "DRAFT") {
        return reply.code(400).send({
          error: "Cannot delete work order",
          details: "Work order can only be deleted when in DRAFT status",
        });
      }

      await prisma.workOrder.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
