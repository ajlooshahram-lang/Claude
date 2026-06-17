import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";
import type { DataDbHelpers, DbRegisterRow } from "../../src/data/db-helpers.js";

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
    email: "test@example.com",
    passwordHash: "",
    displayName: "Test User",
    mfaSecret: null,
    mfaEnabled: false,
    mfaLastUsedStep: null,
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

function createMockAuthDb(user: DbUser, tokenHash: string): AuthDbHelpers {
  const session = createMockSession(user, tokenHash);
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createUserWithTenant: async (data) => ({
      user: createMockUser({ email: data.email }),
      tenantId: "tenant-1",
      membershipId: "m-1",
    }),
    createSession: async () => ({ id: "s-1" }),
    findSessionByTokenHash: async (hash: string) => (hash === tokenHash ? session : null),
    revokeSession: async () => {},
    revokeAllUserSessions: async () => {},
    findMembershipByUserId: async () => ({
      id: "m-1",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "OWNER" as const,
    }),
    updateUserMfa: async () => {},
    updateUserMfaLastStep: async () => {},
    replaceRecoveryCodes: async () => {},
    listRecoveryCodes: async () => [],
    markRecoveryCodeUsed: async () => {},
    countUnusedRecoveryCodes: async () => 0,
    deleteExpiredSessions: async () => 0,
    deleteAuditLogsOlderThan: async () => 0,
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
  };
}

function createMockRegisterRow(overrides: Partial<DbRegisterRow> = {}): DbRegisterRow {
  return {
    id: "row-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    registerType: "hazop",
    data: {},
    pinned: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function createMockDataDb(overrides: Partial<DataDbHelpers> = {}): DataDbHelpers {
  return {
    createProject: async () => ({} as never),
    listProjects: async () => [],
    getProject: async () => ({
      id: "proj-1",
      tenantId: "tenant-1",
      name: "Test Project",
      sponsor: null,
      manager: null,
      org: null,
      startDate: null,
      endDate: null,
      status: "IN_PROGRESS",
      version: null,
      currency: "$",
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }),
    updateProject: async () => null,
    deleteProject: async () => null,
    createCase: async () => ({} as never),
    listCases: async () => [],
    getCase: async () => null,
    updateCase: async () => null,
    deleteCase: async () => null,
    bulkUpdateCases: async () => 0,
    bulkDeleteCases: async () => 0,
    listRegisterRows: async () => [],
    createRegisterRow: async (_t, _p, _rt, data, pinned) =>
      createMockRegisterRow({ data: data as Record<string, unknown>, pinned: pinned ?? false }),
    updateRegisterRow: async (_t, _p, _id, data, pinned) =>
      createMockRegisterRow({
        data: data ?? {},
        pinned: pinned ?? false,
      }),
    deleteRegisterRow: async () => createMockRegisterRow({ deletedAt: new Date() }),
    bulkDeleteRegisterRows: async (_t, _p, _rt, ids) => ids.length,
    togglePinRegisterRow: async () => createMockRegisterRow({ pinned: true }),
    createAuditLog: async () => {},
    ...overrides,
  };
}

async function buildAuthenticatedApp(dataDbOverrides: Partial<DataDbHelpers> = {}) {
  const user = createMockUser();
  const { token, tokenHash } = generateSessionToken();
  const authDb = createMockAuthDb(user, tokenHash);
  const dataDb = createMockDataDb(dataDbOverrides);
  const app = await buildApp({
    config: testConfig,
    dbHelpers: authDb,
    dataDbHelpers: dataDb,
  });
  return { app, token, user, dataDb };
}

// ─── Register CRUD Tests ────────────────────────────────────────────────────

test("register: GET /api/projects/:projectId/registers/hazop returns empty list", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.rows, []);
});

test("register: GET /api/projects/:projectId/registers/hazop returns rows", async (t) => {
  const mockRows = [
    createMockRegisterRow({ id: "row-1", data: { title: "Row 1" } }),
    createMockRegisterRow({ id: "row-2", data: { title: "Row 2" } }),
  ];
  const { app, token } = await buildAuthenticatedApp({
    listRegisterRows: async () => mockRows,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.rows.length, 2);
});

test("register: POST /api/projects/:projectId/registers/hazop creates row with audit", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    createRegisterRow: async (_t, _p, _rt, data, pinned) =>
      createMockRegisterRow({ data: data as Record<string, unknown>, pinned: pinned ?? false }),
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { data: { title: "Test hazop entry", severity: 3 } },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.row);
  assert.equal(auditAction, "register.create");
});

test("register: POST rejects invalid register type with 400", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/registers/invalid",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { data: { foo: "bar" } },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, "Invalid register type");
});

test("register: POST rejects oversized data with 400", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  // Create a data payload that exceeds 5000 chars when serialized
  const bigData: Record<string, string> = {};
  for (let i = 0; i < 200; i++) {
    bigData[`key_${i}`] = "x".repeat(30);
  }

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { data: bigData },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, "Validation failed");
});

test("register: PUT /api/projects/:projectId/registers/hazop/:id updates row", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    updateRegisterRow: async (_t, _p, _id, data, pinned) =>
      createMockRegisterRow({ data: data ?? {}, pinned: pinned ?? false }),
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1/registers/hazop/row-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { data: { title: "Updated" }, pinned: true },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.row);
  assert.equal(auditAction, "register.update");
});

test("register: PUT returns 404 for non-existent row", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateRegisterRow: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1/registers/hazop/nonexistent",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { data: { title: "Nope" } },
  });
  assert.equal(res.statusCode, 404);
});

test("register: DELETE /api/projects/:projectId/registers/hazop/:id soft-deletes with audit", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    deleteRegisterRow: async () => createMockRegisterRow({ deletedAt: new Date() }),
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1/registers/hazop/row-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(auditAction, "register.delete");
});

test("register: POST bulk-delete removes multiple rows", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    bulkDeleteRegisterRows: async (_t, _p, _rt, ids) => ids.length,
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/registers/hazop/bulk-delete",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: ["row-1", "row-2", "row-3"] },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.deleted, 3);
  assert.equal(auditAction, "register.bulk-delete");
});

test("register: PATCH toggle pin flips pinned state", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    togglePinRegisterRow: async () => createMockRegisterRow({ pinned: true }),
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/registers/hazop/row-1/pin",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.row.pinned, true);
  assert.equal(auditAction, "register.toggle-pin");
});

// ─── Tenant Isolation ───────────────────────────────────────────────────────

test("register: tenant isolation - returns 404 for other tenant's project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => null, // tenant-scoped query returns null
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/other-proj/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

// ─── Auth Required ──────────────────────────────────────────────────────────

test("register: auth required - 401 without session cookie", async (t) => {
  const user = createMockUser();
  const { tokenHash } = generateSessionToken();
  const authDb = createMockAuthDb(user, tokenHash);
  const dataDb = createMockDataDb();
  const app = await buildApp({
    config: testConfig,
    dbHelpers: authDb,
    dataDbHelpers: dataDb,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/registers/hazop",
  });
  assert.equal(res.statusCode, 401);
});

// ─── CSRF Enforcement ───────────────────────────────────────────────────────

test("register: CSRF required - POST without CSRF token returns 403", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/registers/hazop",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { data: { title: "No CSRF" } },
  });
  assert.equal(res.statusCode, 403);
});
