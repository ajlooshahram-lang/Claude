/**
 * Database abstraction layer for project/case data operations.
 *
 * All Prisma calls are wrapped here so tests can mock/stub this layer without
 * needing a live database. The interface is injected into route handlers.
 *
 * Every method takes tenantId as its first parameter for hard tenant isolation.
 */

export type DbProject = {
  id: string;
  tenantId: string;
  name: string;
  sponsor: string | null;
  manager: string | null;
  org: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  version: string | null;
  currency: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DbCase = {
  id: string;
  tenantId: string;
  projectId: string;
  problem: string;
  category: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  sev: number | null;
  occ: number | null;
  det: number | null;
  rootCause: string | null;
  leanMethod: string | null;
  target: string | null;
  whys: string[];
  dateLogged: string | null;
  startDate: string | null;
  percent: number;
  costCat: string | null;
  estCost: number;
  actCost: number;
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  userValue: number | null;
  timeCrit: number | null;
  riskRed: number | null;
  jobSize: number | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateAuditLogInput = {
  tenantId: string;
  actorId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
};

/** Input type for creating a project. All fields except name are optional. */
export type CreateProjectInput = {
  name: string;
  sponsor?: string | undefined;
  manager?: string | undefined;
  org?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  status?: string | undefined;
  version?: string | undefined;
  currency?: string | undefined;
  sortOrder?: number | undefined;
};

/** Input type for updating a project. All fields are optional. */
export type UpdateProjectInput = {
  name?: string | undefined;
  sponsor?: string | null | undefined;
  manager?: string | null | undefined;
  org?: string | null | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  status?: string | undefined;
  version?: string | null | undefined;
  currency?: string | undefined;
  sortOrder?: number | undefined;
};

/** Input type for creating a case. Only problem is required. */
export type CreateCaseInput = {
  problem: string;
  category?: string | undefined;
  priority?: string | undefined;
  status?: string | undefined;
  owner?: string | undefined;
  sev?: number | undefined;
  occ?: number | undefined;
  det?: number | undefined;
  rootCause?: string | undefined;
  leanMethod?: string | undefined;
  target?: string | undefined;
  whys?: string[] | undefined;
  dateLogged?: string | undefined;
  startDate?: string | undefined;
  percent?: number | undefined;
  costCat?: string | undefined;
  estCost?: number | undefined;
  actCost?: number | undefined;
  reach?: number | undefined;
  impact?: number | undefined;
  confidence?: number | undefined;
  effort?: number | undefined;
  userValue?: number | undefined;
  timeCrit?: number | undefined;
  riskRed?: number | undefined;
  jobSize?: number | undefined;
  pinned?: boolean | undefined;
};

/** Input type for updating a case. All fields are optional. */
export type UpdateCaseInput = {
  problem?: string | undefined;
  category?: string | null | undefined;
  priority?: string | null | undefined;
  status?: string | null | undefined;
  owner?: string | null | undefined;
  sev?: number | null | undefined;
  occ?: number | null | undefined;
  det?: number | null | undefined;
  rootCause?: string | null | undefined;
  leanMethod?: string | null | undefined;
  target?: string | null | undefined;
  whys?: string[] | undefined;
  dateLogged?: string | null | undefined;
  startDate?: string | null | undefined;
  percent?: number | undefined;
  costCat?: string | null | undefined;
  estCost?: number | undefined;
  actCost?: number | undefined;
  reach?: number | null | undefined;
  impact?: number | null | undefined;
  confidence?: number | null | undefined;
  effort?: number | null | undefined;
  userValue?: number | null | undefined;
  timeCrit?: number | null | undefined;
  riskRed?: number | null | undefined;
  jobSize?: number | null | undefined;
  pinned?: boolean | undefined;
};

export type DataDbHelpers = {
  createProject(tenantId: string, data: CreateProjectInput): Promise<DbProject>;
  listProjects(tenantId: string): Promise<DbProject[]>;
  getProject(tenantId: string, projectId: string): Promise<DbProject | null>;
  updateProject(tenantId: string, projectId: string, data: UpdateProjectInput): Promise<DbProject | null>;
  deleteProject(tenantId: string, projectId: string): Promise<DbProject | null>;

  createCase(tenantId: string, projectId: string, data: CreateCaseInput): Promise<DbCase>;
  listCases(tenantId: string, projectId: string): Promise<DbCase[]>;
  getCase(tenantId: string, caseId: string): Promise<DbCase | null>;
  updateCase(tenantId: string, caseId: string, data: UpdateCaseInput): Promise<DbCase | null>;
  deleteCase(tenantId: string, caseId: string): Promise<DbCase | null>;
  bulkUpdateCases(tenantId: string, projectId: string, ids: string[], data: UpdateCaseInput): Promise<number>;
  bulkDeleteCases(tenantId: string, projectId: string, ids: string[]): Promise<number>;

  createAuditLog(data: CreateAuditLogInput): Promise<void>;
};

/**
 * Create the real Prisma-backed data database helpers.
 * Dynamically imports @prisma/client to keep it lazy.
 */
export async function createPrismaDataDbHelpers(): Promise<DataDbHelpers> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  return {
    async createProject(tenantId, data) {
      const project = await prisma.project.create({
        data: {
          tenantId,
          name: data.name,
          sponsor: data.sponsor ?? null,
          manager: data.manager ?? null,
          org: data.org ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          status: (data.status as "PLANNING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED") ?? "IN_PROGRESS",
          version: data.version ?? null,
          currency: data.currency ?? "$",
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return project as unknown as DbProject;
    },

    async listProjects(tenantId) {
      const projects = await prisma.project.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });
      return projects as unknown as DbProject[];
    },

    async getProject(tenantId, projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId, deletedAt: null },
      });
      return project as unknown as DbProject | null;
    },

    async updateProject(tenantId, projectId, data) {
      const existing = await prisma.project.findFirst({
        where: { id: projectId, tenantId, deletedAt: null },
      });
      if (!existing) return null;

      // Filter out undefined values for Prisma
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });
      return updated as unknown as DbProject;
    },

    async deleteProject(tenantId, projectId) {
      const existing = await prisma.project.findFirst({
        where: { id: projectId, tenantId, deletedAt: null },
      });
      if (!existing) return null;

      const now = new Date();

      // Cascade soft-delete to all child cases
      await prisma.case.updateMany({
        where: { projectId, tenantId, deletedAt: null },
        data: { deletedAt: now },
      });

      const deleted = await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: now },
      });
      return deleted as unknown as DbProject;
    },

    async createCase(tenantId, projectId, data) {
      const c = await prisma.case.create({
        data: {
          tenantId,
          projectId,
          problem: data.problem,
          category: data.category ?? null,
          priority: data.priority ?? null,
          status: data.status ?? null,
          owner: data.owner ?? null,
          sev: data.sev ?? null,
          occ: data.occ ?? null,
          det: data.det ?? null,
          rootCause: data.rootCause ?? null,
          leanMethod: data.leanMethod ?? null,
          target: data.target ?? null,
          whys: data.whys ?? [],
          dateLogged: data.dateLogged ?? null,
          startDate: data.startDate ?? null,
          percent: data.percent ?? 0,
          costCat: data.costCat ?? null,
          estCost: data.estCost ?? 0,
          actCost: data.actCost ?? 0,
          reach: data.reach ?? null,
          impact: data.impact ?? null,
          confidence: data.confidence ?? null,
          effort: data.effort ?? null,
          userValue: data.userValue ?? null,
          timeCrit: data.timeCrit ?? null,
          riskRed: data.riskRed ?? null,
          jobSize: data.jobSize ?? null,
          pinned: data.pinned ?? false,
        },
      });
      return c as unknown as DbCase;
    },

    async listCases(tenantId, projectId) {
      const cases = await prisma.case.findMany({
        where: { tenantId, projectId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return cases as unknown as DbCase[];
    },

    async getCase(tenantId, caseId) {
      const c = await prisma.case.findFirst({
        where: { id: caseId, tenantId, deletedAt: null },
      });
      return c as unknown as DbCase | null;
    },

    async updateCase(tenantId, caseId, data) {
      const existing = await prisma.case.findFirst({
        where: { id: caseId, tenantId, deletedAt: null },
      });
      if (!existing) return null;

      // Filter out undefined values for Prisma
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      const updated = await prisma.case.update({
        where: { id: caseId },
        data: updateData,
      });
      return updated as unknown as DbCase;
    },

    async deleteCase(tenantId, caseId) {
      const existing = await prisma.case.findFirst({
        where: { id: caseId, tenantId, deletedAt: null },
      });
      if (!existing) return null;

      const deleted = await prisma.case.update({
        where: { id: caseId },
        data: { deletedAt: new Date() },
      });
      return deleted as unknown as DbCase;
    },

    async bulkUpdateCases(tenantId, projectId, ids, data) {
      // Filter out undefined values for Prisma
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      const result = await prisma.case.updateMany({
        where: { id: { in: ids }, tenantId, projectId, deletedAt: null },
        data: updateData,
      });
      return result.count;
    },

    async bulkDeleteCases(tenantId, projectId, ids) {
      const result = await prisma.case.updateMany({
        where: { id: { in: ids }, tenantId, projectId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return result.count;
    },

    async createAuditLog(data) {
      await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          actorId: data.actorId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          detail: data.detail as object,
          ip: data.ip,
        },
      });
    },
  };
}
