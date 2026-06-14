import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import prisma from "../src/db.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://qi:qi@localhost:5432/qi_platform?schema=public";

const SESSION_SECRET =
  process.env["SESSION_SECRET"] ?? "test-session-secret-not-for-production";

export async function buildTestApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    CORS_ORIGINS: "http://localhost:5173",
    DATABASE_URL,
    SESSION_SECRET,
    DATA_REGION: "eu-west",
  });

  return buildApp({ config });
}

export async function registerUser(
  app: FastifyInstance,
  opts: {
    email: string;
    password: string;
    tenantName: string;
    displayName?: string;
  },
): Promise<{ cookie: string; body: Record<string, unknown> }> {
  const payload: Record<string, string> = {
    email: opts.email,
    password: opts.password,
    tenantName: opts.tenantName,
  };
  if (opts.displayName) {
    payload["displayName"] = opts.displayName;
  }

  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload,
  });

  if (res.statusCode !== 201) {
    throw new Error(
      `registerUser failed: ${res.statusCode} ${res.body}`,
    );
  }

  const cookie = res.headers["set-cookie"] as string;
  const body = res.json() as Record<string, unknown>;

  return { cookie, body };
}

export async function cleanDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "SyncQueue", "RouteSection", "ProgressReport", "ExchangeRate", "PaymentCertificate", "ContractClaim", "ContractVariation", "WorkOrder", "Package", "Programme", "AuditLog", "ShareToken", "Snapshot", "RegisterRow", "Case", "Session", "Membership", "User", "Project", "Tenant" CASCADE`,
  );
}

export { prisma };
