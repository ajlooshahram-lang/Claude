import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";
import type { DataDbHelpers, DbSnapshot, DbProjectWithData, DbRegisterRow } from "../../src/data/db-helpers.js";

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
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
  };
}

function createMockSnapshot(overrides: Partial<DbSnapshot> = {}): DbSnapshot {
  return {
    id: "snap-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    label: "Test Snapshot",
    data: { spec: { usl: 11, lsl: 9 }, roster: [], stakeholders: [], sigma: [], gage: null, cashflow: null, xbarR: null, cases: [], registers: {} },
    createdBy: "user-1",
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockProjectWithData(overrides: Partial<DbProjectWithData> = {}): DbProjectWithData {
  return {
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
    spec: { usl: 11, lsl: 9, target: 10 },
    roster: [],
    stakeholders: [],
    sigma: [],
    gage: null,
    cashflow: null,
    xbarR: null,
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
    createRegisterRow: async () => ({} as never),
    updateRegisterRow: async () => null,
    deleteRegisterRow: async () => null,
    bulkDeleteRegisterRows: async () => 0,
    togglePinRegisterRow: async () => null,
    listSnapshots: async () => [],
    createSnapshot: async (_t, _p, label, data, createdBy) =>
      createMockSnapshot({ label, data, createdBy }),
    getSnapshot: async () => createMockSnapshot(),
    updateSnapshotLabel: async (_t, _p, _id, label) => createMockSnapshot({ label }),
    deleteSnapshot: async () => createMockSnapshot(),
    getProjectWithData: async () => createMockProjectWithData(),
    updateProjectData: async (_t, _p, data) => createMockProjectWithData(data as Partial<DbProjectWithData>),
    restoreSnapshotData: async () => {},
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

// ─── Snapshot CRUD Tests ────────────────────────────────────────────────────

test("snapshot: POST /api/projects/:projectId/snapshots creates snapshot with audit", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    createSnapshot: async (_t, _p, label, data, createdBy) =>
      createMockSnapshot({ label, data, createdBy }),
    getProjectWithData: async () => createMockProjectWithData(),
    listCases: async () => [],
    listRegisterRows: async () => [],
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/snapshots",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { label: "My Snapshot" },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.snapshot);
  assert.equal(body.snapshot.label, "My Snapshot");
  assert.equal(auditAction, "snapshot.create");
});

test("snapshot: POST creates snapshot with default label when none provided", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    createSnapshot: async (_t, _p, label, data, createdBy) =>
      createMockSnapshot({ label, data, createdBy }),
    getProjectWithData: async () => createMockProjectWithData(),
    listCases: async () => [],
    listRegisterRows: async () => [],
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/snapshots",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: {},
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.snapshot.label.startsWith("Snapshot "));
});

test("snapshot: GET /api/projects/:projectId/snapshots lists snapshots (newest first, max 25)", async (t) => {
  const mockSnapshots = [
    createMockSnapshot({ id: "snap-1", createdAt: new Date("2026-06-01") }),
    createMockSnapshot({ id: "snap-2", createdAt: new Date("2026-05-01") }),
  ];
  const { app, token } = await buildAuthenticatedApp({
    listSnapshots: async () => mockSnapshots,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/snapshots",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.snapshots.length, 2);
});

test("snapshot: GET /api/projects/:projectId/snapshots/:id returns full snapshot", async (t) => {
  const mockSnap = createMockSnapshot({ id: "snap-1", data: { spec: { usl: 11 }, cases: [{ id: "c1" }] } });
  const { app, token } = await buildAuthenticatedApp({
    getSnapshot: async () => mockSnap,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/snapshots/snap-1",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.snapshot.id, "snap-1");
  assert.ok(body.snapshot.data);
});

test("snapshot: PUT /api/projects/:projectId/snapshots/:id renames snapshot", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateSnapshotLabel: async (_t, _p, _id, label) => createMockSnapshot({ label }),
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1/snapshots/snap-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { label: "Renamed Snapshot" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.snapshot.label, "Renamed Snapshot");
});

test("snapshot: PUT returns 400 for empty label", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1/snapshots/snap-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { label: "" },
  });
  assert.equal(res.statusCode, 400);
});

test("snapshot: DELETE /api/projects/:projectId/snapshots/:id hard-deletes with audit", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    deleteSnapshot: async () => createMockSnapshot(),
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1/snapshots/snap-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(auditAction, "snapshot.delete");
});

test("snapshot: DELETE returns 404 for non-existent snapshot", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    deleteSnapshot: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1/snapshots/nonexistent",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 404);
});

test("snapshot: POST /api/projects/:projectId/snapshots/:id/restore restores snapshot data with audit", async (t) => {
  let auditAction = "";
  let restoredData: unknown = null;
  const snapshotData = { spec: { usl: 15 }, roster: ["PM"], stakeholders: [], sigma: [], gage: null, cashflow: null, xbarR: null, cases: [], registers: {} };
  const { app, token } = await buildAuthenticatedApp({
    getSnapshot: async () => createMockSnapshot({ data: snapshotData }),
    restoreSnapshotData: async (_t, _p, data) => { restoredData = data; },
    createAuditLog: async (d) => { auditAction = d.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/snapshots/snap-1/restore",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(auditAction, "snapshot.restore");
  assert.deepEqual(restoredData, snapshotData);
});

test("snapshot: restore returns 404 for non-existent snapshot", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getSnapshot: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/snapshots/nonexistent/restore",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 404);
});

// ─── Tenant Isolation ───────────────────────────────────────────────────────

test("snapshot: tenant isolation - returns 404 for other tenant's project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/other-proj/snapshots",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

// ─── Auth Required ──────────────────────────────────────────────────────────

test("snapshot: auth required - 401 without session cookie", async (t) => {
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
    url: "/api/projects/proj-1/snapshots",
  });
  assert.equal(res.statusCode, 401);
});

// ─── CSRF Enforcement ───────────────────────────────────────────────────────

test("snapshot: CSRF required - POST without CSRF token returns 403", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/snapshots",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { label: "No CSRF" },
  });
  assert.equal(res.statusCode, 403);
});
