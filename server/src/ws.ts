/**
 * Real-time WebSocket server for multi-user collaboration.
 *
 * Features:
 * - Session-cookie authentication on connection upgrade
 * - Tenant-scoped broadcast (only same-tenant users see each other)
 * - Change events: { type: "change", entity, action, data, user }
 * - Online presence: periodic ping/pong with user list broadcast
 * - Activity feed: last N events available on connect
 */
import { type IncomingMessage } from "node:http";
import { type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { hashToken, SESSION_COOKIE_NAME } from "./auth/session.js";
import type { AuthDbHelpers } from "./auth/db-helpers.js";

// ---- Types ----

export type WsChangeEvent = {
  type: "change";
  entity: "case" | "milestone" | "risk" | string;
  action: "add" | "update" | "delete" | string;
  data: Record<string, unknown>;
  user: string;
  ts: string;
};

export type WsPresenceEvent = {
  type: "presence";
  users: Array<{ name: string; connectedAt: string }>;
};

export type WsActivityEvent = {
  type: "activity";
  events: WsChangeEvent[];
};

type WsInboundMessage =
  | { type: "change"; entity: string; action: string; data: Record<string, unknown> }
  | { type: "ping" };

type ConnectedClient = {
  ws: WebSocket;
  userId: string;
  tenantId: string;
  displayName: string;
  connectedAt: string;
};

// ---- State ----

const clients = new Map<WebSocket, ConnectedClient>();
const activityLog = new Map<string, WsChangeEvent[]>(); // tenantId -> last N events
const ACTIVITY_LOG_MAX = 20;

// ---- Cookie parsing helper ----

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const pair of header.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

// ---- Public API ----

let presenceInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Authenticates connections via the session cookie used by the REST API.
 */
export function attachWebSocketServer(
  httpServer: HttpServer,
  db: AuthDbHelpers,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, client: ConnectedClient) => {
    const connectedClient = client;
    clients.set(ws, connectedClient);

    // Send existing activity log for this tenant
    const tenantLog = activityLog.get(connectedClient.tenantId) || [];
    if (tenantLog.length > 0) {
      safeSend(ws, { type: "activity", events: tenantLog });
    }

    // Broadcast updated presence to tenant
    broadcastPresence(connectedClient.tenantId);

    ws.on("message", (raw: unknown) => {
      let msg: WsInboundMessage;
      try {
        msg = JSON.parse(String(raw)) as WsInboundMessage;
      } catch {
        return; // ignore malformed messages
      }

      if (msg.type === "ping") {
        // Heartbeat acknowledged - presence is tracked by connection state
        return;
      }

      if (msg.type === "change") {
        const event: WsChangeEvent = {
          type: "change",
          entity: msg.entity || "unknown",
          action: msg.action || "update",
          data: msg.data || {},
          user: connectedClient.displayName || "Unknown",
          ts: new Date().toISOString(),
        };

        // Store in activity log
        addToActivityLog(connectedClient.tenantId, event);

        // Broadcast to all OTHER clients in the same tenant
        broadcastToTenant(connectedClient.tenantId, event, ws);
      }
    });

    ws.on("close", () => {
      const removed = clients.get(ws);
      clients.delete(ws);
      if (removed) {
        broadcastPresence(removed.tenantId);
      }
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  // Authenticate on upgrade using the session cookie
  wss.on("headers", () => { /* no-op, auth is done via verifyClient-like pattern below */ });

  // Override the default upgrade handling to add authentication
  const originalHandleUpgrade = wss.handleUpgrade.bind(wss);
  httpServer.removeAllListeners("upgrade");
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    // Only handle our /ws path
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // Authenticate via session cookie
    void authenticateUpgrade(request, db).then((client) => {
      if (!client) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      originalHandleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, client);
      });
    }).catch(() => {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    });
  });

  // Start presence broadcast interval (every 30s). unref() so this heartbeat
  // never keeps the Node process alive on its own (important for clean test
  // teardown and graceful shutdown).
  presenceInterval = setInterval(() => {
    const tenants = new Set<string>();
    for (const client of clients.values()) {
      tenants.add(client.tenantId);
    }
    for (const tenantId of tenants) {
      broadcastPresence(tenantId);
    }
  }, 30_000);
  if (typeof presenceInterval.unref === "function") presenceInterval.unref();

  // Clean up the interval when this server instance closes.
  wss.on("close", () => stopPresenceInterval());

  return wss;
}

/**
 * Stop the presence interval. Call on server shutdown.
 */
export function stopPresenceInterval(): void {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}

/**
 * Get the number of connected clients (useful for testing/monitoring).
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

/**
 * Test-only: reset all in-memory collaboration state (connected clients and
 * per-tenant activity logs). Production runs a single long-lived server and
 * never calls this; it exists so integration tests that spin up multiple
 * server instances in one process start from a clean slate.
 */
export function __resetStateForTest(): void {
  for (const ws of clients.keys()) {
    try { ws.close(); } catch { /* ignore */ }
  }
  clients.clear();
  activityLog.clear();
  stopPresenceInterval();
}

// ---- Internal helpers ----

async function authenticateUpgrade(
  request: IncomingMessage,
  db: AuthDbHelpers,
): Promise<ConnectedClient | null> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.findSessionByTokenHash(tokenHash);

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (new Date() > session.expiresAt) return null;

  return {
    ws: null as unknown as WebSocket, // placeholder, set in connection handler
    userId: session.user.id,
    tenantId: session.user.tenantId,
    displayName: session.user.displayName || session.user.email,
    connectedAt: new Date().toISOString(),
  };
}

function broadcastToTenant(tenantId: string, message: unknown, exclude?: WebSocket): void {
  const payload = JSON.stringify(message);
  for (const [ws, client] of clients.entries()) {
    if (client.tenantId === tenantId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastPresence(tenantId: string): void {
  const users: Array<{ name: string; connectedAt: string }> = [];
  for (const client of clients.values()) {
    if (client.tenantId === tenantId) {
      users.push({ name: client.displayName, connectedAt: client.connectedAt });
    }
  }
  const message: WsPresenceEvent = { type: "presence", users };
  broadcastToTenant(tenantId, message);
}

function addToActivityLog(tenantId: string, event: WsChangeEvent): void {
  let log = activityLog.get(tenantId);
  if (!log) {
    log = [];
    activityLog.set(tenantId, log);
  }
  log.push(event);
  if (log.length > ACTIVITY_LOG_MAX) {
    log.shift();
  }
}

function safeSend(ws: WebSocket, message: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
