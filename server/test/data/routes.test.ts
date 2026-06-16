import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { generateSessionToken, SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/auth/csrf.js";
import type { AuthDbHelpers, DbUser, DbSession } from "../../src/auth/db-helpers.js";
import type { DataDbHelpers, DbProject, DbCase } from "../../src/data/db-helpers.js";

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
    updateUserLastLogin: async () => {},
    createAuditLog: async () => {},
  };
}

function createMockProject(overrides: Partial<DbProject> = {}): DbProject {
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
    ...overrides,
  };
}

function createMockCase(overrides: Partial<DbCase> = {}): DbCase {
  return {
    id: "case-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    problem: "Test problem",
    category: null,
    priority: null,
    status: null,
    owner: null,
    sev: null,
    occ: null,
    det: null,
    rootCause: null,
    leanMethod: null,
    target: null,
    whys: [],
    dateLogged: null,
    startDate: null,
    percent: 0,
    costCat: null,
    estCost: 0,
    actCost: 0,
    reach: null,
    impact: null,
    confidence: null,
    effort: null,
    userValue: null,
    timeCrit: null,
    riskRed: null,
    jobSize: null,
    pinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function createMockDataDb(overrides: Partial<DataDbHelpers> = {}): DataDbHelpers {
  return {
    createProject: async (_tenantId, data) => createMockProject({ name: data.name }),
    listProjects: async () => [],
    getProject: async () => createMockProject(),
    updateProject: async (_tenantId, _id, data) => createMockProject({ ...data, name: data.name ?? "Test Project" }),
    deleteProject: async () => createMockProject(),
    createCase: async (_tenantId, projectId, data) =>
      createMockCase({ projectId, problem: data.problem }),
    listCases: async () => [],
    getCase: async () => createMockCase(),
    updateCase: async () => createMockCase(),
    deleteCase: async () => createMockCase(),
    bulkUpdateCases: async (_tenantId, _projectId, ids) => ids.length,
    bulkDeleteCases: async (_tenantId, _projectId, ids) => ids.length,
    createAuditLog: async () => {},
    ...overrides,
  };
}

// Helper to build an authenticated app
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

// ─── Project CRUD Tests ─────────────────────────────────────────────────────

test("data: GET /api/projects returns empty list", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.projects, []);
});

test("data: GET /api/projects returns projects after creation", async (t) => {
  const mockProjects = [createMockProject({ name: "P1" }), createMockProject({ id: "proj-2", name: "P2" })];
  const { app, token } = await buildAuthenticatedApp({
    listProjects: async () => mockProjects,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.projects.length, 2);
});

test("data: POST /api/projects validates name required", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { sponsor: "John" },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, "Validation failed");
});

test("data: POST /api/projects creates successfully", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { name: "New Project" },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.project.name, "New Project");
  assert.equal(auditAction, "project.create");
});

test("data: GET /api/projects/:id returns own tenant project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => createMockProject({ name: "My Project" }),
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.project.name, "My Project");
});

test("data: GET /api/projects/:id returns 404 for other tenant", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => null, // simulates tenant scoping filtering it out
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/other-proj",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

test("data: PUT /api/projects/:id partial update works", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    updateProject: async (_t, _id, data) => createMockProject({ name: data.name ?? "Test Project", sponsor: data.sponsor ?? null }),
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { sponsor: "New Sponsor" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.project.sponsor, "New Sponsor");
  assert.equal(auditAction, "project.update");
});

test("data: PUT /api/projects/:id returns 404 for missing project", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    updateProject: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/nonexistent",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { name: "Updated" },
  });
  assert.equal(res.statusCode, 404);
});

test("data: DELETE /api/projects/:id soft-deletes", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    deleteProject: async () => createMockProject({ deletedAt: new Date() }),
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(auditAction, "project.delete");
});

test("data: DELETE /api/projects/:id cascades soft-delete to child cases (verified via deleteProject call)", async (t) => {
  // This tests that the route calls deleteProject which is responsible for cascade.
  // The Prisma implementation cascades; here we verify the route returns success.
  let deleteProjectCalled = false;
  const { app, token } = await buildAuthenticatedApp({
    deleteProject: async () => {
      deleteProjectCalled = true;
      return createMockProject({ deletedAt: new Date() });
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(deleteProjectCalled, true);
});

// ─── Case CRUD Tests ────────────────────────────────────────────────────────

test("data: POST /api/projects/:projectId/cases creates case", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    createCase: async (_t, projectId, data) => createMockCase({ projectId, problem: data.problem }),
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { problem: "Fiber optic degradation" },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.case.problem, "Fiber optic degradation");
  assert.equal(auditAction, "case.create");
});

test("data: POST /api/projects/:projectId/cases validates problem required", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { category: "Risk" },
  });
  assert.equal(res.statusCode, 400);
});

test("data: GET /api/projects/:projectId/cases lists cases", async (t) => {
  const mockCases = [createMockCase({ problem: "Issue 1" }), createMockCase({ id: "case-2", problem: "Issue 2" })];
  const { app, token } = await buildAuthenticatedApp({
    listCases: async () => mockCases,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/cases",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.cases.length, 2);
});

test("data: GET /api/projects/:projectId/cases/:id gets single case", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getCase: async () => createMockCase({ problem: "Specific issue" }),
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/cases/case-1",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.case.problem, "Specific issue");
});

test("data: PUT /api/projects/:projectId/cases/:id updates case", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    updateCase: async () => createMockCase({ status: "CLOSED" }),
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "PUT",
    url: "/api/projects/proj-1/cases/case-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { status: "CLOSED" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.case.status, "CLOSED");
  assert.equal(auditAction, "case.update");
});

test("data: DELETE /api/projects/:projectId/cases/:id soft-deletes case", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    deleteCase: async () => createMockCase({ deletedAt: new Date() }),
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1/cases/case-1",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(auditAction, "case.delete");
});

// ─── Bulk Operations ────────────────────────────────────────────────────────

test("data: POST bulk-update changes multiple cases", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    bulkUpdateCases: async (_t, _p, ids) => ids.length,
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases/bulk-update",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: ["case-1", "case-2"], updates: { status: "CLOSED" } },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.updated, 2);
  assert.equal(auditAction, "case.bulk-update");
});

test("data: POST bulk-delete soft-deletes multiple cases", async (t) => {
  let auditAction = "";
  const { app, token } = await buildAuthenticatedApp({
    bulkDeleteCases: async (_t, _p, ids) => ids.length,
    createAuditLog: async (data) => { auditAction = data.action; },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases/bulk-delete",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: ["case-1", "case-2", "case-3"] },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.deleted, 3);
  assert.equal(auditAction, "case.bulk-delete");
});

test("data: POST bulk-update validates ids required", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases/bulk-update",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: [], updates: { status: "CLOSED" } },
  });
  assert.equal(res.statusCode, 400);
});

test("data: POST bulk-update passes projectId to db helper (scopes to project)", async (t) => {
  let receivedProjectId = "";
  const { app, token } = await buildAuthenticatedApp({
    bulkUpdateCases: async (_tenantId, projectId, ids) => {
      receivedProjectId = projectId;
      return ids.length;
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases/bulk-update",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: ["case-1", "case-2"], updates: { status: "OPEN" } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(receivedProjectId, "proj-1");
});

test("data: POST bulk-delete passes projectId to db helper (scopes to project)", async (t) => {
  let receivedProjectId = "";
  const { app, token } = await buildAuthenticatedApp({
    bulkDeleteCases: async (_tenantId, projectId, ids) => {
      receivedProjectId = projectId;
      return ids.length;
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects/proj-1/cases/bulk-delete",
    cookies: { [SESSION_COOKIE_NAME]: token, [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { ids: ["case-1"] },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(receivedProjectId, "proj-1");
});

// ─── Tenant Isolation ───────────────────────────────────────────────────────

test("data: tenant isolation - cannot access other tenant project (404)", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => null, // tenant-scoped query returns null
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/other-tenant-proj",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

test("data: tenant isolation - cannot access other tenant case (404)", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => createMockProject(), // project exists
    getCase: async () => null, // but case does not belong to tenant
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/proj-1/cases/other-case",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});

// ─── Auth Required ──────────────────────────────────────────────────────────

test("data: auth required - 401 without session cookie on GET projects", async (t) => {
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
    url: "/api/projects",
  });
  assert.equal(res.statusCode, 401);
});

test("data: auth required - 401 without session cookie on POST projects", async (t) => {
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
    method: "POST",
    url: "/api/projects",
    cookies: { [CSRF_COOKIE_NAME]: TEST_CSRF_TOKEN },
    headers: { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN },
    payload: { name: "Unauthorized Project" },
  });
  assert.equal(res.statusCode, 401);
});

// ─── CSRF Enforcement ───────────────────────────────────────────────────────

test("data: CSRF required - POST without CSRF token returns 403", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { name: "No CSRF" },
  });
  assert.equal(res.statusCode, 403);
});

test("data: CSRF required - DELETE without CSRF token returns 403", async (t) => {
  const { app, token } = await buildAuthenticatedApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "DELETE",
    url: "/api/projects/proj-1",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 403);
});

// ─── Cases under non-existent project ───────────────────────────────────────

test("data: cases under non-existent project returns 404", async (t) => {
  const { app, token } = await buildAuthenticatedApp({
    getProject: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/api/projects/nonexistent/cases",
    cookies: { [SESSION_COOKIE_NAME]: token },
  });
  assert.equal(res.statusCode, 404);
});
