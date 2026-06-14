import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const CreateShareBody = z.object({
  projectId: z.string().min(1),
  scope: z.enum(["VIEWER", "MANAGER"]),
  expiresInHours: z.number().min(1).max(8760), // max 1 year
});

function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default async function sharesRoutes(app: FastifyInstance): Promise<void> {
  // Authenticated share management routes
  app.post(
    "/shares",
    { preHandler: [authenticate, requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateShareBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const { projectId, scope, expiresInHours } = parsed.data;

      // Verify project belongs to tenant
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: request.tenantId, deletedAt: null },
      });
      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Generate token: 32 random bytes, URL-safe base64
      const tokenBuffer = randomBytes(32);
      const token = tokenBuffer.toString("base64url");
      const tokenHash = hashShareToken(token);

      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const shareToken = await prisma.shareToken.create({
        data: {
          tenantId: request.tenantId,
          projectId,
          tokenHash,
          scope,
          expiresAt,
          createdBy: request.user.id,
        },
      });

      return reply.code(201).send({
        id: shareToken.id,
        token,
        scope: shareToken.scope,
        expiresAt: shareToken.expiresAt,
        projectId: shareToken.projectId,
      });
    },
  );

  // GET /shares?projectId=xxx - list active shares
  app.get(
    "/shares",
    { preHandler: [authenticate, requireRole("VIEWER")] },
    async (request, reply) => {
      const projectId = (request.query as Record<string, unknown>)["projectId"];
      if (!projectId || typeof projectId !== "string") {
        return reply.code(400).send({ error: "projectId query parameter is required" });
      }

      const shares = await prisma.shareToken.findMany({
        where: {
          tenantId: request.tenantId,
          projectId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          scope: true,
          expiresAt: true,
          createdBy: true,
          createdAt: true,
        },
      });

      return shares;
    },
  );

  // DELETE /shares/:id - revoke a share
  app.delete(
    "/shares/:id",
    { preHandler: [authenticate, requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.shareToken.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          revokedAt: null,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.shareToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /shared/:token - PUBLIC endpoint (no auth required)
  app.get(
    "/shared/:token",
    async (request, reply) => {
      const { token } = request.params as { token: string };

      const tokenHash = hashShareToken(token);
      const shareToken = await prisma.shareToken.findUnique({
        where: { tokenHash },
      });

      if (!shareToken) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Check expiry
      if (shareToken.expiresAt < new Date()) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Check revocation
      if (shareToken.revokedAt) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Fetch project data at granted scope level
      const project = await prisma.project.findFirst({
        where: { id: shareToken.projectId, deletedAt: null },
      });

      if (!project) {
        return reply.code(404).send({ error: "Not found" });
      }

      const cases = await prisma.case.findMany({
        where: { projectId: project.id, tenantId: shareToken.tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });

      const registers = await prisma.registerRow.findMany({
        where: { projectId: project.id, tenantId: shareToken.tenantId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      });

      return {
        project,
        cases,
        registers,
        scope: shareToken.scope,
      };
    },
  );
}
