import type { FastifyInstance } from "fastify";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";
import { CreateCaseBody, UpdateCaseBody, ListCasesQuery } from "../validation/schemas.js";
import { validateId } from "../validation/index.js";
import { logMutation, logger } from "../logging.js";

export default async function casesRoutes(app: FastifyInstance): Promise<void> {
  // All case routes require authentication
  app.addHook("preHandler", authenticate);

  // GET /cases - list cases for a project
  app.get(
    "/cases",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const parsed = ListCasesQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "projectId query parameter is required" });
      }
      const { projectId } = parsed.data;

      const cases = await prisma.case.findMany({
        where: {
          tenantId: request.tenantId,
          projectId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });

      return cases;
    },
  );

  // GET /cases/:id - get a single case
  app.get(
    "/cases/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!validateId(id, reply)) return reply;

      const found = await prisma.case.findFirst({
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

  // POST /cases - create a case
  app.post(
    "/cases",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateCaseBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      // Verify the project belongs to the authenticated user's tenant
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, tenantId: request.tenantId },
      });
      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      const created = await prisma.case.create({
        data: {
          tenantId: request.tenantId,
          projectId: data.projectId,
          problem: data.problem,
          category: data.category ?? null,
          priority: data.priority ?? null,
          status: data.status ?? null,
          owner: data.owner ?? null,
          sev: data.sev ?? null,
          occ: data.occ ?? null,
          det: data.det ?? null,
          rootCause: data.rootCause ?? null,
          leanMethod: data.leanMethod ?? null,
          target: data.target ?? null,
          whys: data.whys ?? [],
          dateLogged: data.dateLogged ?? null,
          startDate: data.startDate ?? null,
          percent: data.percent ?? 0,
          costCat: data.costCat ?? null,
          estCost: data.estCost ?? 0,
          actCost: data.actCost ?? 0,
          reach: data.reach ?? null,
          impact: data.impact ?? null,
          confidence: data.confidence ?? null,
          effort: data.effort ?? null,
          userValue: data.userValue ?? null,
          timeCrit: data.timeCrit ?? null,
          riskRed: data.riskRed ?? null,
          jobSize: data.jobSize ?? null,
          pinned: data.pinned ?? false,
        },
      });

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "case.create",
          entity: "Case",
          entityId: created.id,
          detail: { problem: data.problem, projectId: data.projectId },
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logMutation(request, "case.create", "Case", created.id, { projectId: data.projectId });

      return reply.code(201).send(created);
    },
  );

  // PATCH /cases/:id - update a case
  app.patch(
    "/cases/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!validateId(id, reply)) return reply;

      const parsed = UpdateCaseBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      // Verify the case belongs to this tenant
      const existing = await prisma.case.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Strip undefined values to satisfy exactOptionalPropertyTypes
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      const updated = await prisma.case.update({
        where: { id },
        data: updateData,
      });

      // Audit log with changed fields
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "case.update",
          entity: "Case",
          entityId: id,
          detail: { changedFields: Object.keys(updateData) },
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logMutation(request, "case.update", "Case", id, { changedFields: Object.keys(updateData) });

      return updated;
    },
  );

  // DELETE /cases/:id - soft-delete a case
  app.delete(
    "/cases/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!validateId(id, reply)) return reply;

      // Verify the case belongs to this tenant
      const existing = await prisma.case.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.case.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "case.delete",
          entity: "Case",
          entityId: id,
          detail: { problem: existing.problem },
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logMutation(request, "case.delete", "Case", id);

      return reply.code(200).send({ ok: true });
    },
  );
}
