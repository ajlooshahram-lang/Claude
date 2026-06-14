import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z.string().max(50).refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreatePaymentBody = z.object({
  packageId: z.string().min(1),
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
  workDoneThisPeriod: z.number().min(0).max(10_000_000_000).optional(),
  materialsOnSite: z.number().min(0).max(10_000_000_000).optional(),
  variationsIncluded: z.number().min(0).max(10_000_000_000).optional(),
  grossAmount: z.number().min(0).max(10_000_000_000),
  currency: z.string().max(10).optional(),
  metadata: z.unknown().optional(),
});

const UpdatePaymentBody = z.object({
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
  workDoneThisPeriod: z.number().min(0).max(10_000_000_000).optional(),
  materialsOnSite: z.number().min(0).max(10_000_000_000).optional(),
  variationsIncluded: z.number().min(0).max(10_000_000_000).optional(),
  grossAmount: z.number().min(0).max(10_000_000_000).optional(),
  currency: z.string().max(10).optional(),
  certifiedBy: z.string().max(200).optional(),
  approvedBy: z.string().max(200).optional(),
  paymentRef: z.string().max(200).optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "CERTIFIED", "APPROVED", "PAID", "REJECTED"]).optional(),
  metadata: z.unknown().optional(),
});

// Valid status transitions for payment certificates
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["CERTIFIED", "REJECTED"],
  CERTIFIED: ["APPROVED", "REJECTED"],
  APPROVED: ["PAID", "REJECTED"],
  PAID: ["REJECTED"],
  REJECTED: [],
};

const ROLE_HIERARCHY = ["VIEWER", "MANAGER", "ADMIN", "OWNER"] as const;

function roleIndex(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as (typeof ROLE_HIERARCHY)[number]);
  return idx === -1 ? -1 : idx;
}

export default async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /payments?packageId=xxx - list payment certificates for a package
  app.get(
    "/payments",
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

      const payments = await prisma.paymentCertificate.findMany({
        where: {
          packageId: query.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        orderBy: { certNumber: "asc" },
      });

      return payments;
    },
  );

  // GET /payments/:id - get single payment certificate with retention details
  app.get(
    "/payments/:id",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const payment = await prisma.paymentCertificate.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      });

      if (!payment) {
        return reply.code(404).send({ error: "Not found" });
      }

      // Include cumulative calculations
      const previousCerts = await prisma.paymentCertificate.findMany({
        where: {
          packageId: payment.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
          certNumber: { lte: payment.certNumber },
        },
        orderBy: { certNumber: "asc" },
      });

      const cumulativeGross = previousCerts.reduce((sum, cert) => sum + Number(cert.grossAmount), 0);
      const cumulativeNet = previousCerts.reduce((sum, cert) => sum + Number(cert.netAmount), 0);
      const cumulativeRetention = previousCerts.reduce((sum, cert) => sum + Number(cert.retentionDeducted), 0);

      return {
        ...payment,
        cumulativeGross: Math.round(cumulativeGross * 100) / 100,
        cumulativeNet: Math.round(cumulativeNet * 100) / 100,
        cumulativeRetention: Math.round(cumulativeRetention * 100) / 100,
      };
    },
  );

  // POST /payments - create payment certificate (MANAGER+)
  app.post(
    "/payments",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const parsed = CreatePaymentBody.safeParse(request.body);
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

      // Auto-assign next sequential certNumber
      const lastCert = await prisma.paymentCertificate.findFirst({
        where: {
          packageId: data.packageId,
          tenantId: request.tenantId,
        },
        orderBy: { certNumber: "desc" },
      });
      const certNumber = (lastCert?.certNumber ?? 0) + 1;

      // Calculate retention
      const grossAmount = data.grossAmount;
      const retentionPercent = pkg.retentionPercent;
      const maxRetentionPercent = pkg.maxRetentionPercent;
      const contractValue = Number(pkg.contractValue);

      // Calculate retention for this certificate
      let retentionDeducted = Math.round(grossAmount * retentionPercent / 100 * 100) / 100;

      // Cap: total retention held cannot exceed maxRetentionPercent of contractValue
      const maxRetentionTotal = Math.round(maxRetentionPercent / 100 * contractValue * 100) / 100;
      const currentRetentionHeld = Number(pkg.retentionHeld);

      if (currentRetentionHeld + retentionDeducted > maxRetentionTotal) {
        retentionDeducted = Math.round((maxRetentionTotal - currentRetentionHeld) * 100) / 100;
        if (retentionDeducted < 0) retentionDeducted = 0;
      }

      // Calculate net amount
      const netAmount = Math.round((grossAmount - retentionDeducted) * 100) / 100;

      // Get previous certified amount
      const previousCerts = await prisma.paymentCertificate.findMany({
        where: {
          packageId: data.packageId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { grossAmount: true, netAmount: true },
      });

      const previousCertified = previousCerts.reduce((sum, cert) => sum + Number(cert.grossAmount), 0);

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        packageId: data.packageId,
        certNumber,
        grossAmount,
        retentionDeducted,
        netAmount,
        previousCertified: Math.round(previousCertified * 100) / 100,
      };

      if (data.periodStart !== undefined) createData["periodStart"] = new Date(data.periodStart);
      if (data.periodEnd !== undefined) createData["periodEnd"] = new Date(data.periodEnd);
      if (data.workDoneThisPeriod !== undefined) createData["workDoneThisPeriod"] = data.workDoneThisPeriod;
      if (data.materialsOnSite !== undefined) createData["materialsOnSite"] = data.materialsOnSite;
      if (data.variationsIncluded !== undefined) createData["variationsIncluded"] = data.variationsIncluded;
      if (data.currency !== undefined) createData["currency"] = data.currency;
      if (data.metadata !== undefined) createData["metadata"] = data.metadata;

      // Wrap certificate creation and package update in a transaction for atomicity.
      // Also handles certNumber unique constraint race (P2002) with a conflict response.
      try {
        const created = await prisma.$transaction(async (tx) => {
          const cert = await tx.paymentCertificate.create({ data: createData as never });

          await tx.package.update({
            where: { id: data.packageId },
            data: {
              retentionHeld: Math.round((currentRetentionHeld + retentionDeducted) * 100) / 100,
              cumulativeCertified: Math.round((previousCertified + grossAmount) * 100) / 100,
            },
          });

          return cert;
        });

        return reply.code(201).send(created);
      } catch (err) {
        // Handle certNumber unique constraint violation (concurrent creation race)
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return reply.code(409).send({
            error: "Conflict",
            details: "A payment certificate with this number already exists. Please retry.",
          });
        }
        throw err;
      }
    },
  );

  // PATCH /payments/:id - update + status transitions (MANAGER+, ADMIN+ for APPROVED/PAID)
  app.patch(
    "/payments/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdatePaymentBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const existing = await prisma.paymentCertificate.findFirst({
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

      // Reject grossAmount changes once certificate leaves DRAFT status.
      // Changing grossAmount after retention has been calculated would make the
      // financial breakdown inconsistent (grossAmount - retentionDeducted != netAmount).
      if (data.grossAmount !== undefined && existing.status !== "DRAFT") {
        return reply.code(400).send({
          error: "Cannot modify grossAmount",
          details: "grossAmount can only be changed while the certificate is in DRAFT status",
        });
      }

      // Validate status transition
      if (data.status !== undefined && data.status !== existing.status) {
        const allowed = VALID_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(data.status)) {
          return reply.code(400).send({
            error: "Invalid status transition",
            details: `Cannot transition from ${existing.status} to ${data.status}`,
          });
        }

        // APPROVED and PAID transitions require ADMIN+ role
        if (data.status === "APPROVED" || data.status === "PAID") {
          const userRole = request.membership.role;
          if (roleIndex(userRole) < roleIndex("ADMIN")) {
            return reply.code(403).send({ error: "Forbidden" });
          }
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.periodStart !== undefined) updateData["periodStart"] = new Date(data.periodStart);
      if (data.periodEnd !== undefined) updateData["periodEnd"] = new Date(data.periodEnd);
      if (data.workDoneThisPeriod !== undefined) updateData["workDoneThisPeriod"] = data.workDoneThisPeriod;
      if (data.materialsOnSite !== undefined) updateData["materialsOnSite"] = data.materialsOnSite;
      if (data.variationsIncluded !== undefined) updateData["variationsIncluded"] = data.variationsIncluded;
      if (data.grossAmount !== undefined) updateData["grossAmount"] = data.grossAmount;
      if (data.currency !== undefined) updateData["currency"] = data.currency;
      if (data.certifiedBy !== undefined) updateData["certifiedBy"] = data.certifiedBy;
      if (data.approvedBy !== undefined) updateData["approvedBy"] = data.approvedBy;
      if (data.paymentRef !== undefined) updateData["paymentRef"] = data.paymentRef;
      if (data.metadata !== undefined) updateData["metadata"] = data.metadata;

      if (data.status !== undefined) {
        updateData["status"] = data.status;

        // Set date fields on status transitions
        if (data.status === "SUBMITTED") {
          updateData["submittedDate"] = new Date();
        }
        if (data.status === "CERTIFIED") {
          updateData["certifiedDate"] = new Date();
        }
        if (data.status === "APPROVED") {
          updateData["approvedDate"] = new Date();
        }
        if (data.status === "PAID") {
          updateData["paidDate"] = new Date();
        }
      }

      // When PAID: update Package.cumulativePaid += netAmount (in a transaction)
      if (data.status === "PAID" && existing.status !== "PAID") {
        const pkg = await prisma.package.findFirst({
          where: { id: existing.packageId, tenantId: request.tenantId },
        });

        if (pkg) {
          const netAmount = Number(existing.netAmount);
          const newCumulativePaid = Math.round((Number(pkg.cumulativePaid) + netAmount) * 100) / 100;

          const updated = await prisma.$transaction(async (tx) => {
            await tx.package.update({
              where: { id: existing.packageId },
              data: { cumulativePaid: newCumulativePaid },
            });

            return tx.paymentCertificate.update({
              where: { id },
              data: updateData,
            });
          });

          return updated;
        }
      }

      // When PAID -> REJECTED: reverse Package.cumulativePaid and retentionHeld (in a transaction)
      if (data.status === "REJECTED" && existing.status === "PAID") {
        const pkg = await prisma.package.findFirst({
          where: { id: existing.packageId, tenantId: request.tenantId },
        });

        if (pkg) {
          const netAmount = Number(existing.netAmount);
          const retentionDeducted = Number(existing.retentionDeducted);
          const newCumulativePaid = Math.round((Number(pkg.cumulativePaid) - netAmount) * 100) / 100;
          const newRetentionHeld = Math.round((Number(pkg.retentionHeld) - retentionDeducted) * 100) / 100;
          const newCumulativeCertified = Math.round(
            (Number(pkg.cumulativeCertified) - Number(existing.grossAmount)) * 100,
          ) / 100;

          const updated = await prisma.$transaction(async (tx) => {
            await tx.package.update({
              where: { id: existing.packageId },
              data: {
                cumulativePaid: Math.max(0, newCumulativePaid),
                retentionHeld: Math.max(0, newRetentionHeld),
                cumulativeCertified: Math.max(0, newCumulativeCertified),
              },
            });

            return tx.paymentCertificate.update({
              where: { id },
              data: updateData,
            });
          });

          return updated;
        }
      }

      const updated = await prisma.paymentCertificate.update({
        where: { id },
        data: updateData,
      });

      return updated;
    },
  );

  // DELETE /payments/:id - soft-delete only if DRAFT (MANAGER+)
  app.delete(
    "/payments/:id",
    { preHandler: [requireRole("MANAGER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.paymentCertificate.findFirst({
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
          error: "Cannot delete payment certificate",
          details: "Payment certificate can only be deleted when in DRAFT status",
        });
      }

      await prisma.paymentCertificate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
