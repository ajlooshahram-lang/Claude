import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { authenticate, requireRole } from "../middleware/rbac.js";

const dateString = z
  .string()
  .max(50)
  .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date format" });

const CreateExchangeRateBody = z.object({
  fromCurrency: z.string().min(1).max(10),
  toCurrency: z.string().min(1).max(10),
  rate: z.number().gt(0),
  effectiveDate: dateString,
  source: z.enum(["MANUAL", "API", "CENTRAL_BANK"]).optional(),
  programmeId: z.string().optional(),
  metadata: z.unknown().optional(),
});

const ListQuery = z.object({
  fromCurrency: z.string().optional(),
  toCurrency: z.string().optional(),
});

const ConvertQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.string().refine((s) => !isNaN(Number(s)) && Number(s) >= 0, {
    message: "amount must be a non-negative number",
  }),
  date: z.string().refine((s) => !isNaN(Date.parse(s)), {
    message: "Invalid date format",
  }),
});

export default async function exchangeRatesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /exchange-rates - list all rates for tenant (filterable by fromCurrency, toCurrency)
  app.get(
    "/exchange-rates",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const parsed = ListQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query parameters", details: parsed.error.issues });
      }

      const { fromCurrency, toCurrency } = parsed.data;

      const where: Record<string, unknown> = {
        tenantId: request.tenantId,
      };

      if (fromCurrency) {
        where["fromCurrency"] = fromCurrency;
      }
      if (toCurrency) {
        where["toCurrency"] = toCurrency;
      }

      const rates = await prisma.exchangeRate.findMany({
        where,
        orderBy: { effectiveDate: "desc" },
      });

      return rates;
    },
  );

  // POST /exchange-rates - create new rate (ADMIN+)
  app.post(
    "/exchange-rates",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateExchangeRateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const data = parsed.data;

      const createData: Record<string, unknown> = {
        tenantId: request.tenantId,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: data.rate,
        effectiveDate: new Date(data.effectiveDate),
        source: data.source ?? "MANUAL",
      };

      if (data.programmeId !== undefined) {
        createData["programmeId"] = data.programmeId;
      }
      if (data.metadata !== undefined) {
        createData["metadata"] = data.metadata;
      }

      const created = await prisma.exchangeRate.create({ data: createData as never });
      return reply.code(201).send(created);
    },
  );

  // DELETE /exchange-rates/:id - hard delete (ADMIN+)
  app.delete(
    "/exchange-rates/:id",
    { preHandler: [requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.exchangeRate.findFirst({
        where: {
          id,
          tenantId: request.tenantId,
        },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Not found" });
      }

      await prisma.exchangeRate.delete({ where: { id } });

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /exchange-rates/convert - convert an amount using most recent rate on or before date
  app.get(
    "/exchange-rates/convert",
    { preHandler: [requireRole("VIEWER")] },
    async (request, reply) => {
      const parsed = ConvertQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query parameters", details: parsed.error.issues });
      }

      const { from, to, amount, date } = parsed.data;
      const numericAmount = Number(amount);
      const requestedDate = new Date(date);

      // Find the most recent rate where effectiveDate <= requested date
      const rate = await prisma.exchangeRate.findFirst({
        where: {
          tenantId: request.tenantId,
          fromCurrency: from,
          toCurrency: to,
          effectiveDate: { lte: requestedDate },
        },
        orderBy: { effectiveDate: "desc" },
      });

      if (!rate) {
        return reply.code(404).send({
          error: "No exchange rate found",
          details: `No rate found for ${from} to ${to} on or before ${date}`,
        });
      }

      const rateValue = Number(rate.rate);
      const convertedAmount = Math.round(rateValue * numericAmount * 100) / 100;

      return {
        from,
        to,
        amount: numericAmount,
        rate: rateValue,
        convertedAmount,
        effectiveDate: rate.effectiveDate,
        source: rate.source,
      };
    },
  );
}
