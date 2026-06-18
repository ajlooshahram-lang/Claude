import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import {
  attachWebSocketServer,
  stopPresenceInterval,
  getConnectedClientCount,
  __resetStateForTest,
  isOriginAllowed,
} from "../../src/ws.js";
import { hashToken } from "../../src/auth/session.js";
import type { AuthDbHelpers, DbSession, DbUser } from "../../src/auth/db-helpers.js";

/**
 * Integration tests for the real-time collaboration WebSocket server.
 *
 * These exercise the actual upgrade/auth path, tenant-scoped broadcast, and
 * online-presence logic by spinning up a real HTTP server and connecting real
 * `ws` clients — no mocking of the socket layer.
 */

// ---- Test fixtures: tokens -> sessions for a stub auth DB ----

function makeUser(id: string, tenantId: string, displayName: string): DbUser {
  return {
    id,
    tenantId,
    email: `${id}@example.com`,
    passwordHash: "x",
    displayName,
    mfaSecret: null,
    mfaEnabled: false,
    mfaLastUsedStep: null,
    lastLoginAt: null,
    createdAt: new Date(),
  };
}

function makeSession(token: string, user: DbUser): DbSession {
  return {
    id: `sess-${user.id}`,
    userId: user.id,
    tokenHash: hashToken(token),
    userAgent: null,
    ip: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    user,
  };
}

// Three users: two in tenant A, one in tenant B.
const TOKEN_ALICE = "a".repeat(64);
const TOKEN_BOB = "b".repeat(64);
const TOKEN_CARLA = "c".repeat(64);

const alice = makeUser("alice", "tenant-A", "Alice");
const bob = makeUser("bob", "tenant-A", "Bob");
const carla = makeUser("carla", "tenant-B", "Carla");

const sessionsByHash = new Map<string, DbSession>([
  [hashToken(TOKEN_ALICE), makeSession(TOKEN_ALICE, alice)],
  [hashToken(TOKEN_BOB), makeSession(TOKEN_BOB, bob)],
  [hashToken(TOKEN_CARLA), makeSession(TOKEN_CARLA, carla)],
]);

const stubDb = {
  async findSessionByTokenHash(tokenHash: string): Promise<DbSession | null> {
    return sessionsByHash.get(tokenHash) ?? null;
  },
} as unknown as AuthDbHelpers;

// ---- Helpers ----

type TestClient = {
  ws: WebSocket;
  messages: any[];
  waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void; timer: NodeJS.Timeout }>;
};

function startServer(opts: { allowedOrigins?: string[] } = {}): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    __resetStateForTest();
    const server = createServer();
    attachWebSocketServer(server, stubDb, { allowedOrigins: opts.allowedOrigins ?? [] });
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port });
    });
  });
}

// Connect and immediately start buffering messages, so we never miss a message
// the server sends synchronously on connect (presence/activity) due to a race
// between the client 'open' event and listener attachment.
//
// By default sends a same-origin Origin header (http://127.0.0.1:<port>) so the
// anti-CSWSH origin check passes. Pass { origin: null } to omit it, or a string
// to send a specific (e.g. malicious) Origin.
function connect(
  port: number,
  token: string | null,
  opts: { origin?: string | null } = {},
): TestClient {
  const headers: Record<string, string> = {};
  if (token) headers.Cookie = `qi_session=${token}`;
  const origin = opts.origin === undefined ? `http://127.0.0.1:${port}` : opts.origin;
  if (origin !== null) headers.Origin = origin;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
  const client: TestClient = { ws, messages: [], waiters: [] };
  ws.on("message", (raw: unknown) => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    client.messages.push(m);
    for (const w of [...client.waiters]) {
      if (w.pred(m)) {
        clearTimeout(w.timer);
        client.waiters.splice(client.waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  return client;
}

// Resolve with the first buffered-or-future message matching the predicate.
function waitFor<T = any>(client: TestClient, pred: (m: any) => boolean, timeoutMs = 3000): Promise<T> {
  const existing = client.messages.find(pred);
  if (existing) return Promise.resolve(existing as T);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = client.waiters.findIndex((w) => w.timer === timer);
      if (idx >= 0) client.waiters.splice(idx, 1);
      reject(new Error("timed out waiting for matching message"));
    }, timeoutMs);
    client.waiters.push({ pred, resolve: resolve as (m: any) => void, timer });
  });
}

function gotAny(client: TestClient, pred: (m: any) => boolean): boolean {
  return client.messages.some(pred);
}

function waitOpen(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => {
    client.ws.once("open", () => resolve());
    client.ws.once("error", (e: Error) => reject(e));
  });
}

test("WS: rejects connection without a session cookie (401)", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const client = connect(port, null);
  const result = await new Promise<string>((resolve) => {
    client.ws.once("open", () => resolve("opened"));
    client.ws.once("error", () => resolve("error"));
    client.ws.once("unexpected-response", () => resolve("unexpected-response"));
  });
  assert.notEqual(result, "opened", "connection without cookie must not open");
  try { client.ws.close(); } catch { /* ignore */ }
});

test("WS: rejects connection with an unknown/invalid token", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const client = connect(port, "f".repeat(64));
  const result = await new Promise<string>((resolve) => {
    client.ws.once("open", () => resolve("opened"));
    client.ws.once("error", () => resolve("error"));
    client.ws.once("unexpected-response", () => resolve("unexpected-response"));
  });
  assert.notEqual(result, "opened", "connection with invalid token must not open");
  try { client.ws.close(); } catch { /* ignore */ }
});

test("WS: authenticated client receives presence including itself", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);
  await waitOpen(a);
  const presence = await waitFor<{ type: string; users: Array<{ name: string }> }>(
    a,
    (m) => m.type === "presence",
  );
  assert.equal(presence.type, "presence");
  assert.ok(presence.users.some((u) => u.name === "Alice"), "Alice should appear in presence");
  a.ws.close();
});

test("WS: presence updates when a second same-tenant user joins", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);
  await waitOpen(a);
  await waitFor(a, (m) => m.type === "presence");

  const b = connect(port, TOKEN_BOB);
  await waitOpen(b);

  // Alice should get a presence update listing both Alice and Bob.
  const presence = await waitFor<{ users: Array<{ name: string }> }>(
    a,
    (m) => m.type === "presence" && m.users.length === 2,
  );
  const names = presence.users.map((u) => u.name).sort();
  assert.deepEqual(names, ["Alice", "Bob"]);
  a.ws.close();
  b.ws.close();
});

test("WS: change events broadcast to same-tenant peers but not to self", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);
  const b = connect(port, TOKEN_BOB);
  await Promise.all([waitOpen(a), waitOpen(b)]);

  // Bob listens for a change broadcast.
  const bobGetsChange = waitFor<{ type: string; entity: string; action: string; user: string }>(
    b,
    (m) => m.type === "change",
  );

  a.ws.send(JSON.stringify({ type: "change", entity: "case", action: "add", data: { id: "x1" } }));

  const received = await bobGetsChange;
  assert.equal(received.entity, "case");
  assert.equal(received.action, "add");
  assert.equal(received.user, "Alice", "broadcast should attribute the change to Alice");
  // Give any (incorrect) self-echo time to arrive, then assert none did.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(gotAny(a, (m) => m.type === "change"), false, "sender should not receive its own change echo");
  a.ws.close();
  b.ws.close();
});

test("WS: change events are NOT delivered across tenants (isolation)", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);   // tenant-A
  const c = connect(port, TOKEN_CARLA);   // tenant-B
  await Promise.all([waitOpen(a), waitOpen(c)]);

  a.ws.send(JSON.stringify({ type: "change", entity: "risk", action: "update", data: { id: "r1" } }));

  // Give the broadcast time to (not) arrive.
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(gotAny(c, (m) => m.type === "change"), false, "cross-tenant client must not receive the change");
  a.ws.close();
  c.ws.close();
});

test("WS: new client receives the recent activity log on connect", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  // Alice connects and makes a change, populating the tenant activity log.
  const a = connect(port, TOKEN_ALICE);
  await waitOpen(a);
  a.ws.send(JSON.stringify({ type: "change", entity: "milestone", action: "add", data: { id: "m1" } }));
  await new Promise((r) => setTimeout(r, 200));

  // Bob connects afterwards and should receive the backlog as an "activity" event.
  const b = connect(port, TOKEN_BOB);
  await waitOpen(b);
  const activity = await waitFor<{ type: string; events: Array<{ entity: string }> }>(
    b,
    (m) => m.type === "activity",
  );
  assert.ok(activity.events.length >= 1, "activity backlog should contain at least one event");
  assert.ok(activity.events.some((e) => e.entity === "milestone"));
  a.ws.close();
  b.ws.close();
});

test("WS: getConnectedClientCount drops to zero after clients disconnect", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);
  const b = connect(port, TOKEN_BOB);
  await Promise.all([waitOpen(a), waitOpen(b)]);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(getConnectedClientCount(), 2);

  await new Promise<void>((resolve) => { a.ws.once("close", () => resolve()); a.ws.close(); });
  await new Promise<void>((resolve) => { b.ws.once("close", () => resolve()); b.ws.close(); });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(getConnectedClientCount(), 0);
});


// ---- Anti-CSWSH (Cross-Site WebSocket Hijacking) origin enforcement ----

test("isOriginAllowed: rejects a missing Origin header", () => {
  assert.equal(isOriginAllowed(undefined, "app.example.com", []), false);
  assert.equal(isOriginAllowed(undefined, "app.example.com", ["https://app.example.com"]), false);
});

test("isOriginAllowed: same-origin mode (no allowlist) accepts matching host, rejects others", () => {
  assert.equal(isOriginAllowed("https://app.example.com", "app.example.com", []), true);
  assert.equal(isOriginAllowed("https://evil.example.net", "app.example.com", []), false);
  // A cross-site page whose Origin host differs from the served Host is blocked.
  assert.equal(isOriginAllowed("http://127.0.0.1:9999", "127.0.0.1:8080", []), false);
  assert.equal(isOriginAllowed("not-a-url", "app.example.com", []), false);
});

test("isOriginAllowed: allowlist mode accepts only listed origins", () => {
  const allow = ["https://app.example.com", "https://stp.example.com"];
  assert.equal(isOriginAllowed("https://app.example.com", "ignored", allow), true);
  assert.equal(isOriginAllowed("https://stp.example.com", "ignored", allow), true);
  assert.equal(isOriginAllowed("https://evil.example.net", "ignored", allow), false);
});

test("WS: rejects an upgrade with NO Origin header (non-browser/CSWSH guard)", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  // Valid cookie but no Origin -> must be rejected by the origin gate.
  const client = connect(port, TOKEN_ALICE, { origin: null });
  const result = await new Promise<string>((resolve) => {
    client.ws.once("open", () => resolve("opened"));
    client.ws.once("error", () => resolve("error"));
    client.ws.once("unexpected-response", () => resolve("unexpected-response"));
  });
  assert.notEqual(result, "opened", "connection with no Origin must not open");
  try { client.ws.close(); } catch { /* ignore */ }
});

test("WS: rejects an upgrade with a cross-site Origin even with a valid cookie", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  // This is the core CSWSH scenario: the browser auto-sends the victim's
  // cookie, but the Origin is the attacker's site.
  const client = connect(port, TOKEN_ALICE, { origin: "https://attacker.example.com" });
  const result = await new Promise<string>((resolve) => {
    client.ws.once("open", () => resolve("opened"));
    client.ws.once("error", () => resolve("error"));
    client.ws.once("unexpected-response", () => resolve("unexpected-response"));
  });
  assert.notEqual(result, "opened", "cross-site Origin must not open even with a valid cookie");
  try { client.ws.close(); } catch { /* ignore */ }
});

test("WS: accepts an upgrade whose Origin is in the configured allowlist", async (t) => {
  const allowed = "https://stp.example.com";
  const { server, port } = await startServer({ allowedOrigins: [allowed] });
  t.after(() => { stopPresenceInterval(); server.close(); });

  const ok = connect(port, TOKEN_ALICE, { origin: allowed });
  await waitOpen(ok);
  const presence = await waitFor<{ type: string }>(ok, (m) => m.type === "presence");
  assert.equal(presence.type, "presence");
  ok.ws.close();

  // A different origin is rejected under the same allowlist.
  const bad = connect(port, TOKEN_BOB, { origin: "https://app.other.com" });
  const result = await new Promise<string>((resolve) => {
    bad.ws.once("open", () => resolve("opened"));
    bad.ws.once("error", () => resolve("error"));
    bad.ws.once("unexpected-response", () => resolve("unexpected-response"));
  });
  assert.notEqual(result, "opened", "origin outside the allowlist must not open");
  try { bad.ws.close(); } catch { /* ignore */ }
});

test("WS: oversized/garbage change fields are sanitized before broadcast", async (t) => {
  const { server, port } = await startServer();
  t.after(() => { stopPresenceInterval(); server.close(); });

  const a = connect(port, TOKEN_ALICE);
  const b = connect(port, TOKEN_BOB);
  await Promise.all([waitOpen(a), waitOpen(b)]);

  const bobGetsChange = waitFor<{ entity: string; action: string }>(b, (m) => m.type === "change");

  // entity far longer than the 80-char cap, action with control chars.
  a.ws.send(JSON.stringify({
    type: "change",
    entity: "X".repeat(5000),
    action: "up\u0000da\nte",
    data: { id: "z1" },
  }));

  const received = await bobGetsChange;
  assert.ok(received.entity.length <= 80, "entity must be capped to 80 chars");
  assert.equal(received.action.includes("\u0000"), false, "control chars stripped from action");
  assert.equal(received.action.includes("\n"), false, "newlines stripped from action");
  a.ws.close();
  b.ws.close();
});
