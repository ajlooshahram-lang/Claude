/**
 * GET /metrics - operational metrics endpoint.
 * Protected: only accessible from localhost or with valid METRICS_TOKEN header.
 * Returns JSON with request counts, response times, error counts, and active sessions.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import prisma, { getPoolStats } from "../db.js";

// In-memory metrics storage
let requestCount = 0;
let errorCount5xx = 0;

// Circular buffer for response times - avoids O(n) shift() on every request
const MAX_RESPONSE_TIMES = 10000;
const responseTimes = new Float64Array(MAX_RESPONSE_TIMES);
let responseTimeCount = 0; // total entries written (may exceed buffer size)
let writeIndex = 0;

function recordResponseTime(ms: number): void {
  responseTimes[writeIndex] = ms;
  writeIndex = (writeIndex + 1) % MAX_RESPONSE_TIMES;
  responseTimeCount++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function getPercentiles(): { p50: number; p95: number; p99: number } {
  const size = Math.min(responseTimeCount, MAX_RESPONSE_TIMES);
  if (size === 0) return { p50: 0, p95: 0, p99: 0 };
  const values: number[] = new Array(size);
  for (let i = 0; i < size; i++) {
    values[i] = responseTimes[i] as number;
  }
  values.sort((a, b) => a - b);
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

export function incrementRequestCount(): void {
  requestCount++;
}

export function incrementErrorCount(): void {
  errorCount5xx++;
}

export function trackResponseTime(ms: number): void {
  recordResponseTime(ms);
}

function isAuthorized(request: FastifyRequest): boolean {
  // Use the raw socket address to bypass trustProxy layer.
  // request.ip reflects X-Forwarded-For when trustProxy is enabled,
  // which allows spoofing. The socket address cannot be spoofed.
  const ip = request.raw.socket.remoteAddress;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }

  // Check METRICS_TOKEN header
  const metricsToken = process.env["METRICS_TOKEN"];
  if (metricsToken) {
    const headerToken = request.headers["x-metrics-token"];
    if (headerToken === metricsToken) {
      return true;
    }
  }

  return false;
}

export default async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // Track metrics on all requests
  app.addHook("onResponse", async (request, reply) => {
    incrementRequestCount();
    const responseTime = reply.elapsedTime;
    trackResponseTime(responseTime);
    if (reply.statusCode >= 500) {
      incrementErrorCount();
    }
  });

  app.get(
    "/metrics",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isAuthorized(request)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      let activeSessions = 0;
      try {
        activeSessions = await prisma.session.count({
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
      } catch {
        // If DB is unavailable, report 0
        activeSessions = 0;
      }

      const percentiles = getPercentiles();
      const poolStats = getPoolStats();

      return {
        request_count: requestCount,
        response_time_p50: percentiles.p50,
        response_time_p95: percentiles.p95,
        response_time_p99: percentiles.p99,
        active_sessions: activeSessions,
        error_count_5xx: errorCount5xx,
        pool: poolStats,
        timestamp: new Date().toISOString(),
      };
    },
  );
}
