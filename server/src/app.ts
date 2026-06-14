import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { loadConfig, type AppConfig } from "./config.js";
import { checkDatabase } from "./db.js";
import authRoutes from "./auth/routes.js";
import casesRoutes from "./routes/cases.js";

const SERVICE = "qi-platform-server";
const VERSION = "0.1.0";

export type BuildOptions = { config?: AppConfig };

/**
 * Build the Fastify application. Pure factory (no listen) so tests can drive it
 * via `app.inject(...)` with no open socket and no database.
 */
export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();

  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: true,
    // Do not leak internal error details to clients.
    disableRequestLogging: config.nodeEnv === "test",
  });

  // Security headers on every response.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Strict CORS: only the configured UI origins, credentials allowed for sessions.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
  });

  // Baseline abuse protection; per-route auth limits tightened below.
  // In test mode, disable rate limiting so integration tests are not throttled.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: config.nodeEnv === "test" ? ["127.0.0.1"] : [],
  });

  // Cookie support for session tokens.
  const cookieSecret = config.sessionSecret ?? "dev-secret-not-for-prod";
  await app.register(cookie, { secret: cookieSecret });

  // Liveness: process is up. Never touches the database.
  app.get("/health", async () => ({
    status: "ok",
    service: SERVICE,
    version: VERSION,
    region: config.dataRegion,
    time: new Date().toISOString(),
  }));

  // Readiness: can the process serve traffic (incl. database connectivity)?
  app.get("/ready", async (_req, reply) => {
    const db = await checkDatabase(config);
    const ready = db.ok;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      checks: { database: db },
      time: new Date().toISOString(),
    });
  });

  // Auth routes (register, login, logout, me, mfa)
  await app.register(authRoutes);

  // Case CRUD routes
  await app.register(casesRoutes);

  return app;
}
