import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import { createHash, randomBytes } from "node:crypto";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";
import type { InviteDbHelpers, DbInvite, DbTeamMember } from "../../src/invite/db-helpers.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ORIGINS: "http://localhost:5173",
  DATA_REGION: "eu-west",
});

const TEST_CSRF_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

function createMockUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: "user-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    passwordHash: "",
    displayName: "Owner User",
    mfaSecret: null,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockSession(user: DbUser, tokenHash: string): DbSession {
  return {
    id: "session-1",
    userId: user.id,
    tokenHash,
    userAgent: "test",
    ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    user,
  };
}

function createMockAuthDb(user: DbUser, tokenHash: string, role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER" = "OWNER"): AuthDbHelpers {
  const session = createMockSession(user, tokenHash);
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createUserWithTenant: async (data) => ({
      user: createMockUser({ email: data.email }),
      tenantId: "tenant-1",
      membershipId: "m-1",
    }),
    createSession: async () => ({ id: "s-new" }),
    findSessionByTokenHash: async (hash: string) => (hash === tokenHash ? session : null),
    revokeSession: async () => {},
    revokeAllUserSessions: async () => {},
    findMembershipByUserId: async () => ({
      id: "m-1",
      tenantId: "tenant-1",
      userId: user.id,
      role,
    }),
    updateUserMfa: async () => {},
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
  };
}

function createMockInviteDb(overrides: Partial<InviteDbHelpers> = {}): InviteDbHelpers {
  return {
    createInvite: async (data) => ({
      id: "invite-1",
      tenantId: data.tenantId,
      email: data.email,
      role: data.role,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      acceptedAt: null,
      createdBy: data.createdBy,
      createdAt: new Date(),
    }),
    findPendingInvitesByTenant: async () => [],
    findInviteById: async () => null,
    findInviteByTokenHash: async () => null,
    markInviteAccepted: async () => {},
    revokeInvite: async () => {},
    findUserByEmailInTenant: async () => null,
    createUserInTenant: async () => ({ userId: "new-user-1" }),
    listTeamMembers: async () => [],
    ...overrides,
  };
}

function authHeaders(sessionToken: string) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${TEST_CSRF_TOKEN}`,
    [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN,
  };
}

// ─── POST /api/invites ───────────────────────────────────────────────────

test("invite: POST /api/invites creates invite and returns token (201)", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");

  let createdInvite: unknown = null;
  const inviteDb = createMockInviteDb({
    createInvite: async (data) => {
      createdInvite = data;
      return {
        id: "invite-1",
        tenantId: data.tenantId,
        email: data.email,
        role: data.role,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        acceptedAt: null,
        createdBy: data.createdBy,
        createdAt: new Date(),
      };
    },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "invitee@example.com", role: "MANAGER" },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.invite.email, "invitee@example.com");
  assert.equal(body.invite.role, "MANAGER");
  assert.ok(body.token, "token should be returned");
  assert.equal(body.token.length, 64, "token should be 64 hex chars (32 bytes)");
  assert.ok(createdInvite, "createInvite should have been called");
});

test("invite: POST /api/invites without auth returns 401", async (t) => {
  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb();
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN, cookie: `${CSRF_COOKIE_NAME}=${TEST_CSRF_TOKEN}` },
    payload: { email: "invitee@example.com", role: "MANAGER" },
  });

  assert.equal(res.statusCode, 401);
});

test("invite: POST /api/invites without ADMIN/OWNER role returns 403", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "MANAGER");
  const inviteDb = createMockInviteDb();
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "invitee@example.com", role: "VIEWER" },
  });

  assert.equal(res.statusCode, 403);
});

test("invite: POST /api/invites for existing user returns 409", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");
  const inviteDb = createMockInviteDb({
    findUserByEmailInTenant: async () => ({ id: "existing-user-1" }),
  });
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "existing@example.com", role: "MANAGER" },
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.json().error, /already exists/i);
});

test("invite: ADMIN cannot invite with OWNER or ADMIN role", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "ADMIN");
  const inviteDb = createMockInviteDb();
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  // Try OWNER role
  const res1 = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "invitee@example.com", role: "ADMIN" },
  });
  assert.equal(res1.statusCode, 403);
  assert.match(res1.json().error, /cannot invite/i);

  // Schema rejects OWNER role value (not in enum)
  const res2 = await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "invitee@example.com", role: "OWNER" },
  });
  assert.equal(res2.statusCode, 400);
});

// ─── POST /auth/accept-invite ────────────────────────────────────────────

test("invite: POST /auth/accept-invite success (creates user + session)", async (t) => {
  // Generate a known invite token
  const inviteTokenBuffer = randomBytes(32);
  const inviteToken = inviteTokenBuffer.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenBuffer).digest("hex");

  const mockInvite: DbInvite = {
    id: "invite-1",
    tenantId: "tenant-1",
    email: "newuser@example.com",
    role: "MANAGER",
    tokenHash: inviteTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
  };

  let acceptedId: string | null = null;
  let createdUserData: unknown = null;
  const authDb = createMockAuthDb(createMockUser(), "no-match-needed");
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async (hash: string) => (hash === inviteTokenHash ? mockInvite : null),
    markInviteAccepted: async (id: string) => { acceptedId = id; },
    createUserInTenant: async (data) => { createdUserData = data; return { userId: "new-user-1" }; },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: {
      token: inviteToken,
      password: "SecureP@ss2024!",
      displayName: "New User",
    },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.user.email, "newuser@example.com");
  assert.equal(body.user.tenantId, "tenant-1");
  assert.equal(body.user.role, "MANAGER");
  assert.equal(acceptedId, "invite-1");
  assert.ok(createdUserData, "createUserInTenant should have been called");

  // Check session cookie is set
  const cookies = res.cookies;
  const sessionCookie = cookies.find((c: { name: string }) => c.name === SESSION_COOKIE_NAME);
  assert.ok(sessionCookie, "Session cookie should be set");
});

test("invite: POST /auth/accept-invite with expired invite returns 401", async (t) => {
  const inviteTokenBuffer = randomBytes(32);
  const inviteToken = inviteTokenBuffer.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenBuffer).digest("hex");

  const mockInvite: DbInvite = {
    id: "invite-2",
    tenantId: "tenant-1",
    email: "expired@example.com",
    role: "VIEWER",
    tokenHash: inviteTokenHash,
    expiresAt: new Date(Date.now() - 1000), // expired
    acceptedAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
  };

  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async (hash: string) => (hash === inviteTokenHash ? mockInvite : null),
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: { token: inviteToken, password: "SecureP@ss2024!", displayName: "User" },
  });

  assert.equal(res.statusCode, 401);
  assert.match(res.json().error, /expired/i);
});

test("invite: POST /auth/accept-invite with already-used invite returns 401", async (t) => {
  const inviteTokenBuffer = randomBytes(32);
  const inviteToken = inviteTokenBuffer.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenBuffer).digest("hex");

  const mockInvite: DbInvite = {
    id: "invite-3",
    tenantId: "tenant-1",
    email: "used@example.com",
    role: "MANAGER",
    tokenHash: inviteTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: new Date(), // already accepted
    createdBy: "user-1",
    createdAt: new Date(),
  };

  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async (hash: string) => (hash === inviteTokenHash ? mockInvite : null),
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: { token: inviteToken, password: "SecureP@ss2024!", displayName: "User" },
  });

  assert.equal(res.statusCode, 401);
  assert.match(res.json().error, /already been used/i);
});

test("invite: POST /auth/accept-invite with invalid token returns 401", async (t) => {
  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async () => null,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const fakeToken = randomBytes(32).toString("hex");
  const res = await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: { token: fakeToken, password: "SecureP@ss2024!", displayName: "User" },
  });

  assert.equal(res.statusCode, 401);
  assert.match(res.json().error, /invalid/i);
});

test("invite: POST /auth/accept-invite with weak password returns 400", async (t) => {
  const inviteTokenBuffer = randomBytes(32);
  const inviteToken = inviteTokenBuffer.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenBuffer).digest("hex");

  const mockInvite: DbInvite = {
    id: "invite-4",
    tenantId: "tenant-1",
    email: "weak@example.com",
    role: "MANAGER",
    tokenHash: inviteTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
  };

  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async (hash: string) => (hash === inviteTokenHash ? mockInvite : null),
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: { token: inviteToken, password: "short", displayName: "User" },
  });

  assert.equal(res.statusCode, 400);
});

// ─── GET /api/invites ────────────────────────────────────────────────────

test("invite: GET /api/invites lists pending invites", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");
  const mockInvites: DbInvite[] = [
    {
      id: "inv-1",
      tenantId: "tenant-1",
      email: "a@example.com",
      role: "MANAGER",
      tokenHash: "hash1",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      createdBy: "user-1",
      createdAt: new Date(),
    },
  ];
  const inviteDb = createMockInviteDb({
    findPendingInvitesByTenant: async () => mockInvites,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.invites.length, 1);
  assert.equal(body.invites[0].email, "a@example.com");
});

// ─── DELETE /api/invites/:id ─────────────────────────────────────────────

test("invite: DELETE /api/invites/:id revokes invite", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");

  let revokedId: string | null = null;
  const inviteDb = createMockInviteDb({
    findInviteById: async (_tenantId: string, id: string) => ({
      id,
      tenantId: "tenant-1",
      email: "revoke@example.com",
      role: "MANAGER" as const,
      tokenHash: "hash-x",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      createdBy: "user-1",
      createdAt: new Date(),
    }),
    revokeInvite: async (_tenantId: string, id: string) => { revokedId = id; },
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/invites/inv-to-revoke",
    headers: authHeaders(sessionToken),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().success, true);
  assert.equal(revokedId, "inv-to-revoke");
});

test("invite: DELETE /api/invites/:id for non-existent invite returns 404", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");
  const inviteDb = createMockInviteDb({ findInviteById: async () => null });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/invites/non-existent",
    headers: authHeaders(sessionToken),
  });

  assert.equal(res.statusCode, 404);
});

// ─── GET /api/team ───────────────────────────────────────────────────────

test("invite: GET /api/team lists team members", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();
  const authDb = createMockAuthDb(user, tokenHash, "OWNER");
  const mockMembers: DbTeamMember[] = [
    { id: "user-1", email: "owner@example.com", displayName: "Owner", role: "OWNER", createdAt: new Date() },
    { id: "user-2", email: "dev@example.com", displayName: "Dev", role: "MANAGER", createdAt: new Date() },
  ];
  const inviteDb = createMockInviteDb({
    listTeamMembers: async () => mockMembers,
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/team",
    headers: authHeaders(sessionToken),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.members.length, 2);
  assert.equal(body.members[0].email, "owner@example.com");
  assert.equal(body.members[1].role, "MANAGER");
});

test("invite: GET /api/team without auth returns 401", async (t) => {
  const authDb = createMockAuthDb(createMockUser(), "no-match");
  const inviteDb = createMockInviteDb();
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/team",
  });

  assert.equal(res.statusCode, 401);
});

// ─── Audit log verification ─────────────────────────────────────────────

test("invite: POST /api/invites creates audit log entry", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();

  const auditLogs: Array<{ action: string }> = [];
  const authDb: AuthDbHelpers = {
    ...createMockAuthDb(user, tokenHash, "OWNER"),
    createAuditLog: async (data) => { auditLogs.push({ action: data.action }); },
  };

  const inviteDb = createMockInviteDb();
  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  await app.inject({
    method: "POST",
    url: "/api/invites",
    headers: authHeaders(sessionToken),
    payload: { email: "audit@example.com", role: "VIEWER" },
  });

  assert.ok(auditLogs.some((l) => l.action === "invite.create"));
});

test("invite: POST /auth/accept-invite creates audit log entry", async (t) => {
  const inviteTokenBuffer = randomBytes(32);
  const inviteToken = inviteTokenBuffer.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenBuffer).digest("hex");

  const mockInvite: DbInvite = {
    id: "invite-audit",
    tenantId: "tenant-1",
    email: "accept-audit@example.com",
    role: "MANAGER",
    tokenHash: inviteTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
  };

  const auditLogs: Array<{ action: string }> = [];
  const authDb: AuthDbHelpers = {
    ...createMockAuthDb(createMockUser(), "no-match"),
    createAuditLog: async (data) => { auditLogs.push({ action: data.action }); },
    createSession: async () => ({ id: "s-new" }),
  };
  const inviteDb = createMockInviteDb({
    findInviteByTokenHash: async (hash: string) => (hash === inviteTokenHash ? mockInvite : null),
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  await app.inject({
    method: "POST",
    url: "/auth/accept-invite",
    payload: { token: inviteToken, password: "SecureP@ss2024!", displayName: "Audit User" },
  });

  assert.ok(auditLogs.some((l) => l.action === "invite.accept"));
});

test("invite: DELETE /api/invites/:id creates audit log entry", async (t) => {
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const user = createMockUser();

  const auditLogs: Array<{ action: string }> = [];
  const authDb: AuthDbHelpers = {
    ...createMockAuthDb(user, tokenHash, "OWNER"),
    createAuditLog: async (data) => { auditLogs.push({ action: data.action }); },
  };

  const inviteDb = createMockInviteDb({
    findInviteById: async () => ({
      id: "inv-del",
      tenantId: "tenant-1",
      email: "del@example.com",
      role: "MANAGER" as const,
      tokenHash: "hash-del",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      createdBy: "user-1",
      createdAt: new Date(),
    }),
  });

  const app = await buildApp({ config: testConfig, dbHelpers: authDb, inviteDbHelpers: inviteDb });
  t.after(() => app.close());

  await app.inject({
    method: "DELETE",
    url: "/api/invites/inv-del",
    headers: authHeaders(sessionToken),
  });

  assert.ok(auditLogs.some((l) => l.action === "invite.revoke"));
});
