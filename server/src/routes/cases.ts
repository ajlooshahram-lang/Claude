import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const CreateCaseBody = z.object({
  projectId: z.string().min(1),
  problem: z.string().min(1).max(2000),
  category: z.string().max(200).optional(),
  priority: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  owner: z.string().max(200).optional(),
  sev: z.number().int().min(1).max(10).optional(),
  occ: z.number().int().min(1).max(10).optional(),
  det: z.number().int().min(1).max(10).optional(),
  rootCause: z.string().max(2000).optional(),
  leanMethod: z.string().max(200).optional(),
  target: z.string().max(500).optional(),
  whys: z.array(z.string()).optional(),
  dateLogged: z.string().optional(),
  startDate: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  costCat: z.string().max(200).optional(),
  estCost: z.number().optional(),
  actCost: z.number().optional(),
  reach: z.number().optional(),
  impact: z.number().optional(),
  confidence: z.number().optional(),
  effort: z.number().optional(),
  userValue: z.number().optional(),
  timeCrit: z.number().optional(),
  riskRed: z.number().optional(),
  jobSize: z.number().optional(),
  pinned: z.boolean().optional(),
});

const UpdateCaseBody = CreateCaseBody.partial().omit({ projectId: true });

const ListCasesQuery = z.object({
  projectId: z.string().min(1),
});

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

      return reply.code(201).send(created);
    },
  );

  // PATCH /cases/:id - update a case
  app.patch(
    "/cases/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
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

      return updated;
    },
  );

  // DELETE /cases/:id - soft-delete a case
  app.delete(
    "/cases/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

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

      return reply.code(200).send({ ok: true });
    },
  );
}
