import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import type { AppConfig } from "./config.js";

const databaseUrl = process.env["DATABASE_URL"] ?? "";

// Parse the DATABASE_URL to extract a potential Unix socket host parameter.
// If `host=/path` is present, use pg Pool with Unix socket for driver adapter.
function createPrismaClient(): PrismaClient {
  const url = new URL(databaseUrl.replace("postgresql://", "http://").replace("postgres://", "http://"));
  const socketHost = url.searchParams.get("host");

  if (socketHost) {
    // Use driver adapter with pg Pool for Unix socket connectivity
    const pool = new pg.Pool({
      host: socketHost,
      port: parseInt(url.searchParams.get("port") ?? url.port ?? "5432", 10),
      user: url.username || "qi",
      password: url.password || "qi",
      database: url.pathname.replace("/", "") || "qi_platform",
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  }

  // Fallback: standard TCP connection via Prisma's built-in engine
  return new PrismaClient();
}

const prisma = createPrismaClient();

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
