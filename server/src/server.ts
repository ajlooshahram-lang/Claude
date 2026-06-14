import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { cleanExpiredSessions } from "./auth/session.js";
import prisma from "./db.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    await app.close();
    process.exit(0);
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
