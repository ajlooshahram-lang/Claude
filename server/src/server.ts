import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaDbHelpers } from "./auth/db-helpers.js";
import { createPrismaDataDbHelpers } from "./data/db-helpers.js";
import { createPrismaInviteDbHelpers } from "./invite/db-helpers.js";
import { attachWebSocketServer, stopPresenceInterval } from "./ws.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Wire the real Prisma-backed database helpers so the auth, data, and invite
  // routes — and the CSRF enforcement hook that is registered alongside them —
  // are actually active in the running server. Without these, buildApp would
  // only expose /health and /ready. The helpers import PrismaClient lazily and
  // do not open a database connection until the first query, so this is safe
  // even when the database is briefly unavailable at startup.
  const [dbHelpers, dataDbHelpers, inviteDbHelpers] = await Promise.all([
    createPrismaDbHelpers(),
    createPrismaDataDbHelpers(),
    createPrismaInviteDbHelpers(),
  ]);

  const app = await buildApp({ config, dbHelpers, dataDbHelpers, inviteDbHelpers });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    stopPresenceInterval();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: "0.0.0.0" });

  // Attach the WebSocket server to the underlying Node HTTP server.
  // This must happen after listen() so the server object exists. The configured
  // CORS origins double as the WebSocket Origin allowlist; when empty (the
  // same-origin production topology) the WS layer enforces strict same-origin.
  const httpServer = app.server;
  attachWebSocketServer(httpServer, dbHelpers, { allowedOrigins: config.corsOrigins });
  app.log.info("WebSocket server attached at /ws");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
