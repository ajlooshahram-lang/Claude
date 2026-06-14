import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const CreateProjectBody = z.object({
  name: z.string().min(1).max(500),
  sponsor: z.string().max(200).optional(),
  manager: z.string().max(200).optional(),
  org: z.string().max(200).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  version: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
  spec: z.unknown().optional(),
  roster: z.unknown().optional(),
  stakeholders: z.unknown().optional(),
  sigma: z.unknown().optional(),
  gage: z.unknown().optional(),
  cashflow: z.unknown().optional(),
  xbarR: z.unknown().optional(),
});

const UpdateProjectBody = CreateProjectBody.partial();

export default async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /projects - list projects for tenant
  app.get(
    "/projects",
    { preHandler: [requireRole("VIEWER")] },
    async (request, _reply) => {
      const projects = await prisma.project.findMany({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      return projects;
    },
  );

  // GET /projects/:id - get a single project
  app.get(
    "/projects/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const found = await prisma.project.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!found) {
        return reply.code(404).send({ error: "Not found" });
      }
      return found;
    },
  );

  // POST /projects - create a project
  app.post(
    "/projects",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateProjectBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        name: data.name,
      };

      // Only set optional fields if provided (exactOptionalPropertyTypes)
      if (data.sponsor !== undefined) createData["sponsor"] = data.sponsor;
      if (data.manager !== undefined) createData["manager"] = data.manager;
      if (data.org !== undefined) createData["org"] = data.org;
      if (data.startDate !== undefined) createData["startDate"] = data.startDate;
      if (data.endDate !== undefined) createData["endDate"] = data.endDate;
      if (data.status !== undefined) createData["status"] = data.status;
      if (data.version !== undefined) createData["version"] = data.version;
      if (data.currency !== undefined) createData["currency"] = data.currency;
      if (data.sortOrder !== undefined) createData["sortOrder"] = data.sortOrder;
      if (data.spec !== undefined) createData["spec"] = data.spec;
      if (data.roster !== undefined) createData["roster"] = data.roster;
      if (data.stakeholders !== undefined) createData["stakeholders"] = data.stakeholders;
      if (data.sigma !== undefined) createData["sigma"] = data.sigma;
      if (data.gage !== undefined) createData["gage"] = data.gage;
      if (data.cashflow !== undefined) createData["cashflow"] = data.cashflow;
      if (data.xbarR !== undefined) createData["xbarR"] = data.xbarR;

      const created = await prisma.project.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /projects/:id - update a project
  app.patch(
    "/projects/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateProjectBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.project.findFirst({
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
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      const updated = await prisma.project.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /projects/:id - soft-delete a project
  app.delete(
    "/projects/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.project.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.project.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
