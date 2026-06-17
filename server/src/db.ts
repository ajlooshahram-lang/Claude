import type { AppConfig } from "./config.js";

/**
 * Lazy Prisma access. The client is imported dynamically so the process (and the
 * CI health test) can start without the generated client or a live database.
 * A real connection is only established the first time a query is needed.
 */
let clientPromise: Promise<unknown> | null = null;

async function getPrisma(): Promise<{ $queryRaw: (q: TemplateStringsArray) => Promise<unknown> }> {
  if (!clientPromise) {
    clientPromise = import("@prisma/client").then((m) => new m.PrismaClient());
  }
  return clientPromise as Promise<{ $queryRaw: (q: TemplateStringsArray) => Promise<unknown> }>;
}

export type DbHealth = { ok: boolean; error?: string };

/** Best-effort connectivity probe used by the readiness endpoint. Never throws. */
export async function checkDatabase(config: AppConfig): Promise<DbHealth> {
  if (!config.databaseUrl) return { ok: false, error: "DATABASE_URL not configured" };
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
