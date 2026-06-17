import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";
import type { DataDbHelpers, DbProjectWithData } from "../../src/data/db-helpers.js";

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
    routeProgress: {},
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
    createSnapshot: async () => ({} as never),
    getSnapshot: async () => null,
    updateSnapshotLabel: async () => null,
    deleteSnapshot: async () => null,
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

// ─── GET /api/projects/:id/data Tests ────────────────────────────────────

test("project-data: GET /api/projects/:id/data returns analytical data", async (t) => {
  const mockData = createMockProjectWithData({
    spec: { usl: 15, lsl: 5, target: 10 },
    gage: { parts: 3, operators: 2, trials: 2, data: {} },
    cashflow: [{ month: "M1", planned: 1000, actual: 900 }],
  });
  const { app, token } = await buildAuthenticatedApp({
    getProjectWithData: async () => mockData,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.project);
  assert.deepEqual(body.project.spec, { usl: 15, lsl: 5, target: 10 });
  assert.deepEqual(body.project.gage, { parts: 3, operators: 2, trials: 2, data: {} });
  assert.deepEqual(body.project.cashflow, [{ month: "M1", planned: 1000, actual: 900 }]);
  assert.equal(body.project.id, "proj-1");
});

test("project-data: GET /api/projects/:id/data returns routeProgress", async (t) => {
  const mockData = createMockProjectWithData({
    routeProgress: { "cable-a": { phase: "laying", laidKm: 42.5 } },
  });
  const { app, token } = await buildAuthenticatedApp({
    getProjectWithData: async () => mockData,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.project.routeProgress, { "cable-a": { phase: "laying", laidKm: 42.5 } });
});

test("project-data: PATCH /api/projects/:id/data persists routeProgress and GET returns it", async (t) => {
  let stored: unknown = null;
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async (_t, _p, data) => {
      stored = (data as Record<string, unknown>).routeProgress;
      return createMockProjectWithData(data as Partial<DbProjectWithData>);
    },
    getProjectWithData: async () => createMockProjectWithData({ routeProgress: stored }),
  });
  t.after(() => app.close());

  const payload = { routeProgress: { "cable-1": { phase: "complete", laidKm: 120 } } };
  const patchRes = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload,
  });
  assert.equal(patchRes.statusCode, 200);
  assert.deepEqual(stored, { "cable-1": { phase: "complete", laidKm: 120 } });

  const getRes = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(getRes.json().project.routeProgress, { "cable-1": { phase: "complete", laidKm: 120 } });
});

test("project-data: tenant isolation - routeProgress PATCH on other tenant's project returns 404", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/other-proj/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { routeProgress: { "cable-x": { phase: "survey", laidKm: 0 } } },
  });
  assert.equal(res.statusCode, 404);
});

test("project-data: GET /api/projects/:id/data returns 404 for non-existent project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProjectWithData: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/nonexistent/data",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

// ─── PATCH /api/projects/:id/data Tests ─────────────────────────────────────

test("project-data: PATCH /api/projects/:id/data updates partial analytical data", async (t) => {
  let updatedFields: Record<string, unknown> = {};
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async (_t, _p, data) => {
      updatedFields = data as Record<string, unknown>;
      return createMockProjectWithData(data as Partial<DbProjectWithData>);
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { spec: { usl: 15, lsl: 5, target: 10 }, gage: { parts: 3, operators: 2, trials: 2, data: {} } },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.project);
  assert.deepEqual(updatedFields.spec, { usl: 15, lsl: 5, target: 10 });
  assert.deepEqual(updatedFields.gage, { parts: 3, operators: 2, trials: 2, data: {} });
});

test("project-data: PATCH /api/projects/:id/data validates max 500KB total", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  // Create payload exceeding 500KB
  const bigData = "x".repeat(600 * 1024);

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { sigma: bigData },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, "Validation failed");
});

test("project-data: PATCH /api/projects/:id/data fires audit logging", async (t) => {
  let auditAction = "";
  let auditDetail: Record<string, unknown> = {};
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async (_t, _p, data) => createMockProjectWithData(data as Partial<DbProjectWithData>),
    createAuditLog: async (d) => { auditAction = d.action; auditDetail = d.detail; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { cashflow: [{ month: "M1", planned: 1000 }] },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(auditAction, "project.data.update");
  assert.ok(Array.isArray(auditDetail.fields));
});

test("project-data: PATCH /api/projects/:id/data returns 404 for non-existent project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/nonexistent/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { spec: { usl: 11 } },
  });
  assert.equal(res.statusCode, 404);
});

// ─── Auth Required ──────────────────────────────────────────────────────────

test("project-data: auth required - 401 without session cookie", async (t) => {
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

  // Include CSRF tokens but omit session cookie to test auth rejection
  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { spec: {} },
  });
  assert.equal(res.statusCode, 401);
});

// ─── Tenant Isolation ───────────────────────────────────────────────────────

test("project-data: tenant isolation - returns 404 for other tenant's project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateProjectData: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/other-proj/data",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { spec: { usl: 11 } },
  });
  assert.equal(res.statusCode, 404);
});

// ─── CSRF Enforcement ───────────────────────────────────────────────────────

test("project-data: CSRF required - PATCH without CSRF token returns 403", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: "/api/projects/proj-1/data",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { spec: { usl: 11 } },
  });
  assert.equal(res.statusCode, 403);
});
