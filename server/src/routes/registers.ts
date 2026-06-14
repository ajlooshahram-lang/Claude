import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const VALID_REGISTER_TYPES = [
  "hazop",
  "calibration",
  "punch",
  "sil",
  "rtm",
  "docs",
  "ncr",
  "moc",
  "milestones",
  "decisions",
  "procurement",
  "resources",
  "okr",
] as const;

const RegisterTypeParam = z.enum(VALID_REGISTER_TYPES);

const CreateRegisterBody = z.object({
  projectId: z.string().min(1),
  data: z.unknown().default({}),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const UpdateRegisterBody = z.object({
  data: z.unknown().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const ListRegistersQuery = z.object({
  projectId: z.string().min(1),
});

export default async function registersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /registers/:type?projectId=xxx - list register rows
  app.get(
    "/registers/:type",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { type } = request.params as { type: string };
      const typeParsed = RegisterTypeParam.safeParse(type);
      if (!typeParsed.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const queryParsed = ListRegistersQuery.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: "projectId query parameter is required" });
      }

      const rows = await prisma.registerRow.findMany({
        where: {
          tenantId: request.tenantId,
          projectId: queryParsed.data.projectId,
          registerType: typeParsed.data,
          deletedAt: null,
        },
        orderBy: { sortOrder: "asc" },
      });

      return rows;
    },
  );

  // POST /registers/:type - create a register row
  app.post(
    "/registers/:type",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { type } = request.params as { type: string };
      const typeParsed = RegisterTypeParam.safeParse(type);
      if (!typeParsed.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const parsed = CreateRegisterBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const { projectId, data, pinned, sortOrder } = parsed.data;

      // Verify project belongs to tenant
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: request.tenantId, deletedAt: null },
      });
      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        projectId,
        registerType: typeParsed.data,
        data: data ?? {},
      };
      if (pinned !== undefined) createData["pinned"] = pinned;
      if (sortOrder !== undefined) createData["sortOrder"] = sortOrder;

      const created = await prisma.registerRow.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /registers/:type/:id - update a register row
  app.patch(
    "/registers/:type/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };
      const typeParsed = RegisterTypeParam.safeParse(type);
      if (!typeParsed.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const parsed = UpdateRegisterBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.registerRow.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          registerType: typeParsed.data,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.data !== undefined) updateData["data"] = parsed.data.data;
      if (parsed.data.pinned !== undefined) updateData["pinned"] = parsed.data.pinned;
      if (parsed.data.sortOrder !== undefined) updateData["sortOrder"] = parsed.data.sortOrder;

      const updated = await prisma.registerRow.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /registers/:type/:id - soft-delete a register row
  app.delete(
    "/registers/:type/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };
      const typeParsed = RegisterTypeParam.safeParse(type);
      if (!typeParsed.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const existing = await prisma.registerRow.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          registerType: typeParsed.data,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.registerRow.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
