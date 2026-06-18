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

// Liveness tracking for the ping/pong heartbeat. A socket that misses a pong
// between two sweeps is considered dead and is terminated, so a client that
// vanished without a clean close frame (mobile/flaky field networks) does not
// linger as a phantom "online" user or leak memory.
const aliveState = new WeakMap<WebSocket, boolean>();

// Hard limits on inbound frames. Defence in depth against a malicious (but
// authenticated) client trying to exhaust memory or flood peers.
const MAX_PAYLOAD_BYTES = 64 * 1024; // ws-level frame cap
const MAX_ENTITY_LEN = 80;
const MAX_ACTION_LEN = 40;
const MAX_DATA_BYTES = 16 * 1024; // serialized change payload cap
// Simple per-connection token bucket: cap change frames per window.
const CHANGE_RATE_MAX = 60; // max change frames
const CHANGE_RATE_WINDOW_MS = 10_000; // per 10s
const changeRate = new WeakMap<WebSocket, { count: number; windowStart: number }>();

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
 * Options controlling WebSocket security.
 */
export type WsOptions = {
  /**
   * Explicit allowlist of acceptable browser `Origin` values. When provided
   * (e.g. the configured CORS origins for a split-origin dev setup), an
   * upgrade is only accepted if its Origin is in this list. When empty (the
   * production same-origin topology where the app is served from the same host
   * as the API), the Origin host must equal the request Host header instead.
   */
  allowedOrigins?: string[];
};

/**
 * Decide whether a WebSocket upgrade request comes from an acceptable origin.
 *
 * WebSockets are NOT subject to the same-origin policy and the browser attaches
 * the session cookie automatically on the handshake, so without this check any
 * malicious website a logged-in owner visits could open a socket with their
 * cookie and silently receive every project broadcast (Cross-Site WebSocket
 * Hijacking). Browsers always send an `Origin` header on WS handshakes, so a
 * missing Origin is treated as a non-browser/cookie-less client and rejected.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return false; // browsers always send Origin on WS upgrades
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin);
  }
  // No explicit allowlist => enforce strict same-origin: the Origin's host must
  // match the Host the server was reached on (preserved by Caddy/nginx).
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Authenticates connections via the session cookie used by the REST API.
 */
export function attachWebSocketServer(
  httpServer: HttpServer,
  db: AuthDbHelpers,
  options: WsOptions = {},
): WebSocketServer {
  const allowedOrigins = options.allowedOrigins ?? [];
  // maxPayload caps inbound frame size at the protocol level so a single huge
  // message cannot exhaust memory before our application-level checks run.
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: MAX_PAYLOAD_BYTES });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, client: ConnectedClient) => {
    const connectedClient = client;
    clients.set(ws, connectedClient);

    // Mark alive and refresh liveness on every pong.
    aliveState.set(ws, true);
    ws.on("pong", () => { aliveState.set(ws, true); });

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

      if (!msg || typeof msg !== "object") return;

      if (msg.type === "ping") {
        // Heartbeat acknowledged - presence is tracked by connection state
        return;
      }

      if (msg.type === "change") {
        // Per-connection flood control.
        if (!allowChange(ws)) return;

        // Sanitize untrusted, client-controlled fields before storing/echoing.
        const entity = sanitizeString((msg as { entity?: unknown }).entity, MAX_ENTITY_LEN) || "unknown";
        const action = sanitizeString((msg as { action?: unknown }).action, MAX_ACTION_LEN) || "update";
        let data: Record<string, unknown> = {};
        const rawData = (msg as { data?: unknown }).data;
        if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
          // Cap the serialized size; drop oversized payloads rather than relay them.
          try {
            if (JSON.stringify(rawData).length <= MAX_DATA_BYTES) {
              data = rawData as Record<string, unknown>;
            }
          } catch {
            data = {};
          }
        }

        const event: WsChangeEvent = {
          type: "change",
          entity,
          action,
          data,
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

  // Override the default upgrade handling to add origin + session authentication.
  const originalHandleUpgrade = wss.handleUpgrade.bind(wss);
  httpServer.removeAllListeners("upgrade");
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    // Only handle our /ws path
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // 1) Origin check FIRST (cheap, blocks CSWSH before any DB work).
    if (!isOriginAllowed(request.headers.origin, request.headers.host, allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    // 2) Authenticate via session cookie.
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

  // Heartbeat + presence sweep (every 30s). unref() so this never keeps the
  // Node process alive on its own (clean test teardown and graceful shutdown).
  presenceInterval = setInterval(() => {
    // Liveness sweep: terminate any socket that missed the previous ping's pong.
    for (const ws of [...clients.keys()]) {
      if (aliveState.get(ws) === false) {
        try { ws.terminate(); } catch { /* ignore */ }
        clients.delete(ws); // close handler will also fire and refresh presence
        continue;
      }
      aliveState.set(ws, false);
      try { ws.ping(); } catch { /* ignore */ }
    }
    // Refresh presence for every tenant that still has connections.
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

/** Coerce an untrusted value to a bounded, control-char-free string. */
function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  // Strip control characters (incl. newlines) that have no place in a label.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLen).trim();
}

/**
 * Per-connection token bucket for change frames. Returns false when the client
 * has exceeded CHANGE_RATE_MAX frames in the current window (frame dropped).
 */
function allowChange(ws: WebSocket): boolean {
  const now = Date.now();
  const state = changeRate.get(ws);
  if (!state || now - state.windowStart > CHANGE_RATE_WINDOW_MS) {
    changeRate.set(ws, { count: 1, windowStart: now });
    return true;
  }
  if (state.count >= CHANGE_RATE_MAX) return false;
  state.count += 1;
  return true;
}
