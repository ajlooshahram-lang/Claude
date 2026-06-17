/**
 * Project and Case CRUD API routes.
 *
 * All routes require authentication. Tenant isolation is enforced by scoping
 * every query with the authenticated user's tenantId.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createRequireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import type { AuthDbHelpers } from "../auth/db-helpers.js";
import type { DataDbHelpers } from "./db-helpers.js";
import type { AppConfig } from "../config.js";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateCaseSchema,
  UpdateCaseSchema,
  BulkUpdateSchema,
  BulkDeleteSchema,
  RegisterTypeSchema,
  CreateRegisterRowSchema,
  UpdateRegisterRowSchema,
  BulkDeleteRegisterRowSchema,
  CreateSnapshotSchema,
  UpdateSnapshotLabelSchema,
  UpdateProjectDataSchema,
  VALID_REGISTER_TYPES,
} from "./schemas.js";

export type DataRouteDeps = {
  authDb: AuthDbHelpers;
  dataDb: DataDbHelpers;
};

export function registerDataRoutes(
  app: FastifyInstance,
  deps: DataRouteDeps,
  _config: AppConfig,
): void {
  const requireAuth = createRequireAuth(deps.authDb);
  const db = deps.dataDb;

  // ─── Projects ───────────────────────────────────────────────────────

  app.get(
    "/api/projects",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = (request as AuthenticatedRequest).user;
      const projects = await db.listProjects(tenantId);
      return reply.code(200).send({ projects });
    },
  );

  app.post(
    "/api/projects",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = CreateProjectSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const project = await db.createProject(authed.user.tenantId, parseResult.data);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "project.create",
        entity: "Project",
        entityId: project.id,
        detail: { name: project.name },
        ip: request.ip,
      });

      return reply.code(201).send({ project });
    },
  );

  app.get(
    "/api/projects/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      const project = await db.getProject(authed.user.tenantId, id);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }
      return reply.code(200).send({ project });
    },
  );

  app.put(
    "/api/projects/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const parseResult = UpdateProjectSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const project = await db.updateProject(authed.user.tenantId, id, parseResult.data);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "project.update",
        entity: "Project",
        entityId: project.id,
        detail: { updates: Object.keys(parseResult.data) },
        ip: request.ip,
      });

      return reply.code(200).send({ project });
    },
  );

  app.delete(
    "/api/projects/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const project = await db.deleteProject(authed.user.tenantId, id);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "project.delete",
        entity: "Project",
        entityId: project.id,
        detail: {},
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  // ─── Cases ──────────────────────────────────────────────────────────

  app.get(
    "/api/projects/:projectId/cases",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const cases = await db.listCases(authed.user.tenantId, projectId);
      return reply.code(200).send({ cases });
    },
  );

  app.post(
    "/api/projects/:projectId/cases",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = CreateCaseSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const newCase = await db.createCase(authed.user.tenantId, projectId, parseResult.data);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "case.create",
        entity: "Case",
        entityId: newCase.id,
        detail: { projectId, problem: newCase.problem },
        ip: request.ip,
      });

      return reply.code(201).send({ case: newCase });
    },
  );

  app.get(
    "/api/projects/:projectId/cases/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const c = await db.getCase(authed.user.tenantId, id);
      if (!c || c.projectId !== projectId) {
        return reply.code(404).send({ error: "Case not found" });
      }

      return reply.code(200).send({ case: c });
    },
  );

  app.put(
    "/api/projects/:projectId/cases/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = UpdateCaseSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const updated = await db.updateCase(authed.user.tenantId, id, parseResult.data);
      if (!updated || updated.projectId !== projectId) {
        return reply.code(404).send({ error: "Case not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "case.update",
        entity: "Case",
        entityId: id,
        detail: { projectId, updates: Object.keys(parseResult.data) },
        ip: request.ip,
      });

      return reply.code(200).send({ case: updated });
    },
  );

  app.delete(
    "/api/projects/:projectId/cases/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const deleted = await db.deleteCase(authed.user.tenantId, id);
      if (!deleted || deleted.projectId !== projectId) {
        return reply.code(404).send({ error: "Case not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "case.delete",
        entity: "Case",
        entityId: id,
        detail: { projectId },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  // ─── Bulk operations ────────────────────────────────────────────────

  app.post(
    "/api/projects/:projectId/cases/bulk-update",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = BulkUpdateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { ids, updates } = parseResult.data;
      const count = await db.bulkUpdateCases(authed.user.tenantId, projectId, ids, updates);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "case.bulk-update",
        entity: "Case",
        entityId: null,
        detail: { projectId, ids, updates: Object.keys(updates) },
        ip: request.ip,
      });

      return reply.code(200).send({ updated: count });
    },
  );

  app.post(
    "/api/projects/:projectId/cases/bulk-delete",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      // Verify project belongs to tenant
      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = BulkDeleteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { ids } = parseResult.data;
      const count = await db.bulkDeleteCases(authed.user.tenantId, projectId, ids);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "case.bulk-delete",
        entity: "Case",
        entityId: null,
        detail: { projectId, ids },
        ip: request.ip,
      });

      return reply.code(200).send({ deleted: count });
    },
  );

  // ─── Register Rows ──────────────────────────────────────────────────

  app.get(
    "/api/projects/:projectId/registers/:type",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type } = request.params as { projectId: string; type: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const rows = await db.listRegisterRows(authed.user.tenantId, projectId, typeResult.data);
      return reply.code(200).send({ rows });
    },
  );

  app.post(
    "/api/projects/:projectId/registers/:type",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type } = request.params as { projectId: string; type: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = CreateRegisterRowSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const row = await db.createRegisterRow(
        authed.user.tenantId,
        projectId,
        typeResult.data,
        parseResult.data.data,
        parseResult.data.pinned,
      );

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "register.create",
        entity: "RegisterRow",
        entityId: row.id,
        detail: { projectId, registerType: typeResult.data },
        ip: request.ip,
      });

      return reply.code(201).send({ row });
    },
  );

  app.put(
    "/api/projects/:projectId/registers/:type/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type, id } = request.params as { projectId: string; type: string; id: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = UpdateRegisterRowSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const updated = await db.updateRegisterRow(
        authed.user.tenantId,
        projectId,
        id,
        parseResult.data.data,
        parseResult.data.pinned,
      );
      if (!updated) {
        return reply.code(404).send({ error: "Register row not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "register.update",
        entity: "RegisterRow",
        entityId: id,
        detail: { projectId, registerType: typeResult.data },
        ip: request.ip,
      });

      return reply.code(200).send({ row: updated });
    },
  );

  app.delete(
    "/api/projects/:projectId/registers/:type/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type, id } = request.params as { projectId: string; type: string; id: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const deleted = await db.deleteRegisterRow(authed.user.tenantId, projectId, id);
      if (!deleted) {
        return reply.code(404).send({ error: "Register row not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "register.delete",
        entity: "RegisterRow",
        entityId: id,
        detail: { projectId, registerType: typeResult.data },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  app.post(
    "/api/projects/:projectId/registers/:type/bulk-delete",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type } = request.params as { projectId: string; type: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = BulkDeleteRegisterRowSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { ids } = parseResult.data;
      const count = await db.bulkDeleteRegisterRows(authed.user.tenantId, projectId, typeResult.data, ids);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "register.bulk-delete",
        entity: "RegisterRow",
        entityId: null,
        detail: { projectId, registerType: typeResult.data, ids },
        ip: request.ip,
      });

      return reply.code(200).send({ deleted: count });
    },
  );

  app.patch(
    "/api/projects/:projectId/registers/:type/:id/pin",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, type, id } = request.params as { projectId: string; type: string; id: string };

      const typeResult = RegisterTypeSchema.safeParse(type);
      if (!typeResult.success) {
        return reply.code(400).send({ error: "Invalid register type" });
      }

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const toggled = await db.togglePinRegisterRow(authed.user.tenantId, projectId, id);
      if (!toggled) {
        return reply.code(404).send({ error: "Register row not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "register.toggle-pin",
        entity: "RegisterRow",
        entityId: id,
        detail: { projectId, registerType: typeResult.data, pinned: toggled.pinned },
        ip: request.ip,
      });

      return reply.code(200).send({ row: toggled });
    },
  );

  // ─── Project Analytical Data ────────────────────────────────────────────

  app.get(
    "/api/projects/:id/data",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const projectWithData = await db.getProjectWithData(authed.user.tenantId, id);
      if (!projectWithData) {
        return reply.code(404).send({ error: "Project not found" });
      }

      return reply.code(200).send({
        project: {
          id: projectWithData.id,
          spec: projectWithData.spec,
          roster: projectWithData.roster,
          stakeholders: projectWithData.stakeholders,
          sigma: projectWithData.sigma,
          gage: projectWithData.gage,
          cashflow: projectWithData.cashflow,
          xbarR: projectWithData.xbarR,
          routeProgress: projectWithData.routeProgress,
        },
      });
    },
  );

  app.patch(
    "/api/projects/:id/data",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      const parseResult = UpdateProjectDataSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const updated = await db.updateProjectData(authed.user.tenantId, id, parseResult.data);
      if (!updated) {
        return reply.code(404).send({ error: "Project not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "project.data.update",
        entity: "Project",
        entityId: id,
        detail: { fields: Object.keys(parseResult.data).filter(k => (parseResult.data as Record<string, unknown>)[k] !== undefined) },
        ip: request.ip,
      });

      return reply.code(200).send({ project: updated });
    },
  );

  // ─── Snapshots ──────────────────────────────────────────────────────────

  app.get(
    "/api/projects/:projectId/snapshots",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const snapshots = await db.listSnapshots(authed.user.tenantId, projectId);
      return reply.code(200).send({ snapshots });
    },
  );

  app.post(
    "/api/projects/:projectId/snapshots",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId } = request.params as { projectId: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = CreateSnapshotSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      // Capture current project state: analytical fields + cases + all register types
      // Parallelize register queries for better performance.
      const [projectWithData, cases, ...registerResults] = await Promise.all([
        db.getProjectWithData(authed.user.tenantId, projectId),
        db.listCases(authed.user.tenantId, projectId),
        ...VALID_REGISTER_TYPES.map((regType) =>
          db.listRegisterRows(authed.user.tenantId, projectId, regType),
        ),
      ]);

      const registers: Record<string, unknown> = {};
      VALID_REGISTER_TYPES.forEach((regType, i) => {
        registers[regType] = registerResults[i];
      });

      const snapshotData = {
        cases,
        registers,
        sigma: projectWithData?.sigma ?? null,
        gage: projectWithData?.gage ?? null,
        cashflow: projectWithData?.cashflow ?? null,
        xbarR: projectWithData?.xbarR ?? null,
        roster: projectWithData?.roster ?? null,
        stakeholders: projectWithData?.stakeholders ?? null,
        spec: projectWithData?.spec ?? null,
        routeProgress: projectWithData?.routeProgress ?? null,
      };

      const label = parseResult.data.label || `Snapshot ${new Date().toISOString()}`;
      const snapshot = await db.createSnapshot(
        authed.user.tenantId,
        projectId,
        label,
        snapshotData,
        authed.user.id,
      );

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "snapshot.create",
        entity: "Snapshot",
        entityId: snapshot.id,
        detail: { projectId, label },
        ip: request.ip,
      });

      return reply.code(201).send({ snapshot });
    },
  );

  app.get(
    "/api/projects/:projectId/snapshots/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const snapshot = await db.getSnapshot(authed.user.tenantId, projectId, id);
      if (!snapshot) {
        return reply.code(404).send({ error: "Snapshot not found" });
      }

      return reply.code(200).send({ snapshot });
    },
  );

  app.put(
    "/api/projects/:projectId/snapshots/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const parseResult = UpdateSnapshotLabelSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const updated = await db.updateSnapshotLabel(authed.user.tenantId, projectId, id, parseResult.data.label);
      if (!updated) {
        return reply.code(404).send({ error: "Snapshot not found" });
      }

      return reply.code(200).send({ snapshot: updated });
    },
  );

  app.delete(
    "/api/projects/:projectId/snapshots/:id",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const deleted = await db.deleteSnapshot(authed.user.tenantId, projectId, id);
      if (!deleted) {
        return reply.code(404).send({ error: "Snapshot not found" });
      }

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "snapshot.delete",
        entity: "Snapshot",
        entityId: id,
        detail: { projectId },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  app.post(
    "/api/projects/:projectId/snapshots/:id/restore",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { projectId, id } = request.params as { projectId: string; id: string };

      const project = await db.getProject(authed.user.tenantId, projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const snapshot = await db.getSnapshot(authed.user.tenantId, projectId, id);
      if (!snapshot) {
        return reply.code(404).send({ error: "Snapshot not found" });
      }

      await db.restoreSnapshotData(authed.user.tenantId, projectId, snapshot.data);

      await db.createAuditLog({
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "snapshot.restore",
        entity: "Snapshot",
        entityId: id,
        detail: { projectId, label: snapshot.label },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );
}
