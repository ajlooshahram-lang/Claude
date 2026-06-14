import { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";

const prisma = new PrismaClient();

export default prisma;

export type DbHealth = { ok: boolean; error?: string };

/** Best-effort connectivity probe used by the readiness endpoint. Never throws. */
export async function checkDatabase(config: AppConfig): Promise<DbHealth> {
  if (!config.databaseUrl) return { ok: false, error: "DATABASE_URL not configured" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
