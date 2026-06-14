import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { cleanExpiredSessions } from "./auth/session.js";
import prisma from "./db.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const SHUTDOWN_TIMEOUT_MS = 30_000; // 30 seconds max wait

let shuttingDown = false;

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Override /health to return 503 during graceful shutdown
  app.addHook("onRequest", async (_request, reply) => {
    if (shuttingDown && _request.url === "/health") {
      return reply.code(503).send({
        status: "shutting_down",
        service: "qi-platform-server",
        time: new Date().toISOString(),
      });
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // Prevent duplicate shutdown
    shuttingDown = true;

    app.log.info({ signal }, "Graceful shutdown initiated");

    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }

    // Force exit after timeout
    const forceTimer = setTimeout(() => {
      app.log.error("Shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Unref so it doesn't keep the process alive if everything else cleans up
    forceTimer.unref();

    try {
      // Stop accepting new connections and wait for in-flight requests
      await app.close();
      // Disconnect database
      await prisma.$disconnect();
      app.log.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: "0.0.0.0" });

  // Run session cleanup at startup and every 15 minutes
  void cleanExpiredSessions(prisma).catch(() => {
    // Non-fatal: log and continue
  });
  cleanupTimer = setInterval(() => {
    void cleanExpiredSessions(prisma).catch(() => {
      // Non-fatal: log and continue
    });
  }, CLEANUP_INTERVAL_MS);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
