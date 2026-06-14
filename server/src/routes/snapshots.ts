import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const ListSnapshotsQuery = z.object({
  projectId: z.string().min(1),
});

const CreateSnapshotBody = z.object({
  projectId: z.string().min(1),
  label: z.string().max(500).optional(),
});

const UpdateSnapshotBody = z.object({
  label: z.string().max(500),
});

export default async function snapshotsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /snapshots?projectId=xxx - list snapshots
  app.get(
    "/snapshots",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const parsed = ListSnapshotsQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "projectId query parameter is required" });
      }

      const snapshots = await prisma.snapshot.findMany({
        where: {
          tenantId: request.tenantId,
          projectId: parsed.data.projectId,
        },
        orderBy: { createdAt: "desc" },
      });

      return snapshots;
    },
  );

  // POST /snapshots - create a snapshot (capture project state)
  app.post(
    "/snapshots",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateSnapshotBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const { projectId, label } = parsed.data;

      // Verify project belongs to tenant
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: request.tenantId, deletedAt: null },
      });
      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Capture full project state
      const cases = await prisma.case.findMany({
        where: { projectId, tenantId: request.tenantId, deletedAt: null },
      });

      const registers = await prisma.registerRow.findMany({
        where: { projectId, tenantId: request.tenantId, deletedAt: null },
      });

      const snapshotData = {
        project,
        cases,
        registers,
      };

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        projectId,
        data: snapshotData,
        createdBy: request.user.id,
      };
      if (label !== undefined) createData["label"] = label;

      const created = await prisma.snapshot.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /snapshots/:id - rename a snapshot
  app.patch(
    "/snapshots/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateSnapshotBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.snapshot.findFirst({
        where: { id, tenantId: request.tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      const updated = await prisma.snapshot.update({
        where: { id },
        data: { label: parsed.data.label },
      });

      return updated;
    },
  );

  // DELETE /snapshots/:id - delete a snapshot
  app.delete(
    "/snapshots/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.snapshot.findFirst({
        where: { id, tenantId: request.tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.snapshot.delete({ where: { id } });
      return reply.code(200).send({ ok: true });
    },
  );

  // POST /snapshots/:id/restore - restore project from snapshot
  app.post(
    "/snapshots/:id/restore",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const snapshot = await prisma.snapshot.findFirst({
        where: { id, tenantId: request.tenantId },
      });

      if (!snapshot) {
        return reply.code(404).send({ error: "Not found" });
      }

      const snapshotData = snapshot.data as {
        project?: Record<string, unknown>;
        cases?: Array<Record<string, unknown>>;
        registers?: Array<Record<string, unknown>>;
      };

      const projectId = snapshot.projectId;

      // Verify the project still exists and belongs to tenant
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: request.tenantId, deletedAt: null },
      });
      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Create a backup snapshot before restoring (outside transaction for safety)
      const currentCases = await prisma.case.findMany({
        where: { projectId, tenantId: request.tenantId, deletedAt: null },
      });
      const currentRegisters = await prisma.registerRow.findMany({
        where: { projectId, tenantId: request.tenantId, deletedAt: null },
      });

      await prisma.snapshot.create({
        data: {
          tenantId: request.tenantId,
          projectId,
          label: `Pre-restore backup (${new Date().toISOString()})`,
          data: { project, cases: currentCases, registers: currentRegisters },
          createdBy: request.user.id,
        },
      });

      // Perform the restore inside a transaction to prevent data loss on failure
      await prisma.$transaction(async (tx) => {
        // Delete existing cases and registers for this project
        await tx.case.deleteMany({
          where: { projectId, tenantId: request.tenantId },
        });
        await tx.registerRow.deleteMany({
          where: { projectId, tenantId: request.tenantId },
        });

        // Recreate from snapshot data using createMany for efficiency
        const casesData = snapshotData.cases ?? [];
        if (casesData.length > 0) {
          const casesPayload = casesData.map((c) => {
            const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, ...rest } = c;
            return { ...rest, tenantId: request.tenantId, projectId } as never;
          });
          await tx.case.createMany({ data: casesPayload });
        }

        const registersData = snapshotData.registers ?? [];
        if (registersData.length > 0) {
          const registersPayload = registersData.map((r) => {
            const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, ...rest } = r;
            return { ...rest, tenantId: request.tenantId, projectId } as never;
          });
          await tx.registerRow.createMany({ data: registersPayload });
        }
      });

      return reply.code(200).send({ ok: true, restoredFrom: id });
    },
  );
}
