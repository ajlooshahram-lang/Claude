import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z.string().max(50).refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreateClaimBody = z.object({
  packageId: z.string().min(1),
  reference: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  claimType: z.string().max(100).optional(),
  contractClause: z.string().max(200).optional(),
  amount: z.number().min(0).max(10_000_000_000),
  currency: z.string().max(10).optional(),
  timeClaimedDays: z.number().int().min(0).optional(),
  submittedDate: dateString.optional(),
  responseDeadline: dateString.optional(),
  metadata: z.unknown().optional(),
});

const UpdateClaimBody = z.object({
  reference: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  claimType: z.string().max(100).optional(),
  contractClause: z.string().max(200).optional(),
  amount: z.number().min(0).max(10_000_000_000).optional(),
  assessedAmount: z.number().min(0).max(10_000_000_000).optional(),
  currency: z.string().max(10).optional(),
  timeClaimedDays: z.number().int().min(0).optional(),
  timeAwardedDays: z.number().int().min(0).optional(),
  submittedDate: dateString.optional(),
  responseDeadline: dateString.optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "ASSESSED", "AGREED", "PAID", "DISPUTED", "WITHDRAWN"]).optional(),
  metadata: z.unknown().optional(),
});

// Valid status transitions for claims
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["ASSESSED"],
  ASSESSED: ["AGREED", "DISPUTED"],
  AGREED: ["PAID"],
  DISPUTED: ["SUBMITTED", "WITHDRAWN"],
  PAID: [],
  WITHDRAWN: [],
};

export default async function claimsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /claims?packageId=xxx - list claims for a package
  app.get(
    "/claims",
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

      const claims = await prisma.contractClaim.findMany({
        where: {
          packageId: query.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });

      return claims;
    },
  );

  // GET /claims/:id - get single claim
  app.get(
    "/claims/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const claim = await prisma.contractClaim.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!claim) {
        return reply.code(404).send({ error: "Not found" });
      }

      return claim;
    },
  );

  // POST /claims - create claim (MANAGER+)
  app.post(
    "/claims",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreateClaimBody.safeParse(request.body);
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
      if (data.claimType !== undefined) createData["claimType"] = data.claimType;
      if (data.contractClause !== undefined) createData["contractClause"] = data.contractClause;
      if (data.currency !== undefined) createData["currency"] = data.currency;
      if (data.timeClaimedDays !== undefined) createData["timeClaimedDays"] = data.timeClaimedDays;
      if (data.submittedDate !== undefined) createData["submittedDate"] = new Date(data.submittedDate);
      if (data.responseDeadline !== undefined) createData["responseDeadline"] = new Date(data.responseDeadline);
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      const created = await prisma.contractClaim.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // PATCH /claims/:id - update + status transitions (MANAGER+)
  app.patch(
    "/claims/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateClaimBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.contractClaim.findFirst({
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
      if (data.claimType !== undefined) updateData["claimType"] = data.claimType;
      if (data.contractClause !== undefined) updateData["contractClause"] = data.contractClause;
      if (data.amount !== undefined) updateData["amount"] = data.amount;
      if (data.assessedAmount !== undefined) updateData["assessedAmount"] = data.assessedAmount;
      if (data.currency !== undefined) updateData["currency"] = data.currency;
      if (data.timeClaimedDays !== undefined) updateData["timeClaimedDays"] = data.timeClaimedDays;
      if (data.timeAwardedDays !== undefined) updateData["timeAwardedDays"] = data.timeAwardedDays;
      if (data.submittedDate !== undefined) updateData["submittedDate"] = new Date(data.submittedDate);
      if (data.responseDeadline !== undefined) updateData["responseDeadline"] = new Date(data.responseDeadline);
      if (data.metadata !== undefined) updateData["metadata"] = data.metadata;

      if (data.status !== undefined) {
        updateData["status"] = data.status;

        // Set date fields on status transitions
        if (data.status === "SUBMITTED" && !data.submittedDate) {
          updateData["submittedDate"] = new Date();
        }
        if (data.status === "ASSESSED") {
          updateData["assessedDate"] = new Date();
        }
        if (data.status === "AGREED") {
          updateData["agreedDate"] = new Date();
        }
        if (data.status === "PAID") {
          updateData["paidDate"] = new Date();
        }
      }

      const updated = await prisma.contractClaim.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /claims/:id - soft-delete only if DRAFT (MANAGER+)
  app.delete(
    "/claims/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.contractClaim.findFirst({
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
          error: "Cannot delete claim",
          details: "Claim can only be deleted when in DRAFT status",
        });
      }

      await prisma.contractClaim.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
