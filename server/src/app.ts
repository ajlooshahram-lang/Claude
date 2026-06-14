import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { loadConfig, type AppConfig } from "./config.js";
import { checkDatabase } from "./db.js";
import requestIdPlugin from "./middleware/request-id.js";
import limitsPlugin from "./middleware/limits.js";
import csrfPlugin from "./middleware/csrf.js";
import errorHandlerPlugin from "./middleware/errors.js";
import authRoutes from "./auth/routes.js";
import casesRoutes from "./routes/cases.js";
import projectsRoutes from "./routes/projects.js";
import registersRoutes from "./routes/registers.js";
import snapshotsRoutes from "./routes/snapshots.js";
import sharesRoutes from "./routes/shares.js";
import metricsRoutes from "./routes/metrics.js";

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
    disableRequestLogging: config.nodeEnv === "test",
    bodyLimit: 1_048_576, // 1MB
  });

  // Request-ID: must be registered first so all other hooks can reference it
  await app.register(requestIdPlugin);

  // Security headers on every response.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    xFrameOptions: { action: "deny" },
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  // Permissions-Policy header (not supported by helmet directly)
  app.addHook("onSend", async (_request, reply, payload) => {
    void reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });

  // Strict CORS: only the configured UI origins, credentials allowed for sessions.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
  });

  // Global rate limit: 1000/min per IP.
  // In test mode, allowList 127.0.0.1 so integration tests are not throttled.
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    allowList: config.nodeEnv === "test" ? ["127.0.0.1"] : [],
  });

  // Cookie support for session tokens.
  const cookieSecret = config.sessionSecret ?? "dev-secret-not-for-prod";
  await app.register(cookie, { secret: cookieSecret });

  // Request size limits (URL length)
  await app.register(limitsPlugin);

  // CSRF protection (double-submit cookie pattern)
  await app.register(csrfPlugin);

  // Global error handler (must be after request-id so it can reference requestId)
  await app.register(errorHandlerPlugin);

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

  // Project CRUD routes
  await app.register(projectsRoutes);

  // Register CRUD routes
  await app.register(registersRoutes);

  // Snapshot CRUD routes
  await app.register(snapshotsRoutes);

  // Share token routes (includes public /shared/:token endpoint)
  await app.register(sharesRoutes);

  // Metrics endpoint (protected: localhost or METRICS_TOKEN)
  await app.register(metricsRoutes);

  return app;
}
