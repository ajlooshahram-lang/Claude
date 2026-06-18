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

function startServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    __resetStateForTest();
    const server = createServer();
    attachWebSocketServer(server, stubDb);
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port });
    });
  });
}

// Connect and immediately start buffering messages, so we never miss a message
// the server sends synchronously on connect (presence/activity) due to a race
// between the client 'open' event and listener attachment.
function connect(port: number, token: string | null): TestClient {
  const headers: Record<string, string> = {};
  if (token) headers.Cookie = `qi_session=${token}`;
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
