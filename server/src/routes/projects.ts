import type { FastifyInstance } from "fastify";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";
import { CreateProjectBody, UpdateProjectBody } from "../validation/schemas.js";
import { validateId } from "../validation/index.js";
import { logMutation } from "../logging.js";

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
      if (!validateId(id, reply)) return;

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

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "project.create",
          entity: "Project",
          entityId: created.id,
          detail: { name: data.name },
          ip: request.ip,
        },
      }).catch(() => { /* non-blocking */ });

      logMutation(request, "project.create", "Project", created.id, { name: data.name });

      return reply.code(201).send(created);
    },
  );

  // PATCH /projects/:id - update a project
  app.patch(
    "/projects/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!validateId(id, reply)) return;

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

      // Audit log with changed fields
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "project.update",
          entity: "Project",
          entityId: id,
          detail: { changedFields: Object.keys(updateData) },
          ip: request.ip,
        },
      }).catch(() => { /* non-blocking */ });

      logMutation(request, "project.update", "Project", id, { changedFields: Object.keys(updateData) });

      return updated;
    },
  );

  // DELETE /projects/:id - soft-delete a project
  app.delete(
    "/projects/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!validateId(id, reply)) return;

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

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "project.delete",
          entity: "Project",
          entityId: id,
          detail: { name: String((existing as Record<string, unknown>)["name"] ?? "") },
          ip: request.ip,
        },
      }).catch(() => { /* non-blocking */ });

      logMutation(request, "project.delete", "Project", id);

      return reply.code(200).send({ ok: true });
    },
  );
}
