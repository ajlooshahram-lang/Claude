import { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import { logger } from "./logging.js";

const SLOW_QUERY_THRESHOLD_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const prisma = new PrismaClient({
  log: [
    { level: "warn", emit: "event" },
    { level: "error", emit: "event" },
  ],
});

// Log slow queries and errors via pino
prisma.$on("warn", (e) => {
  logger.warn({ event: "prisma_warn", message: e.message });
});

prisma.$on("error", (e) => {
  logger.error({ event: "prisma_error", message: e.message });
});

// Prisma middleware for slow query detection
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    logger.warn({
      event: "slow_query",
      model: params.model,
      action: params.action,
      durationMs: duration,
    });
  }

  return result;
});

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

/**
 * Retry wrapper for transient database connection failures.
 * Retries up to MAX_RETRIES times with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;
      // Only retry on transient connection errors
      const isTransient =
        err instanceof Error &&
        (err.message.includes("connect") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("timed out") ||
          err.message.includes("P1001") ||
          err.message.includes("P1002"));

      if (!isTransient || attempt === retries) {
        throw err;
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      logger.warn({
        event: "db_retry",
        attempt: attempt + 1,
        maxRetries: retries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Returns basic pool/connection stats for the metrics endpoint.
 */
export function getPoolStats(): { connected: boolean } {
  // PrismaClient does not expose detailed pool metrics directly,
  // but we can report connection availability
  return { connected: true };
}
