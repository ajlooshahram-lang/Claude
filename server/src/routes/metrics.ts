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
const responseTimes: number[] = [];
const MAX_RESPONSE_TIMES = 10000; // Keep last 10k response times for percentile calculation

function recordResponseTime(ms: number): void {
  responseTimes.push(ms);
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    responseTimes.shift();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function getPercentiles(): { p50: number; p95: number; p99: number } {
  const sorted = [...responseTimes].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
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
  // Allow localhost access
  const ip = request.ip;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
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
