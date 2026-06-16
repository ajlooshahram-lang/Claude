/**
 * Zod validation schemas for Project and Case CRUD request bodies.
 */
import { z } from "zod";

const ProjectStatusEnum = z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  sponsor: z.string().optional(),
  manager: z.string().optional(),
  org: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: ProjectStatusEnum.optional(),
  version: z.string().optional(),
  currency: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  sponsor: z.string().nullable().optional(),
  manager: z.string().nullable().optional(),
  org: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: ProjectStatusEnum.optional(),
  version: z.string().nullable().optional(),
  currency: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const CreateCaseSchema = z.object({
  problem: z.string().min(1, "Problem description is required"),
  category: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  sev: z.number().int().optional(),
  occ: z.number().int().optional(),
  det: z.number().int().optional(),
  rootCause: z.string().optional(),
  leanMethod: z.string().optional(),
  target: z.string().optional(),
  whys: z.array(z.string()).optional(),
  dateLogged: z.string().optional(),
  startDate: z.string().optional(),
  percent: z.number().optional(),
  costCat: z.string().optional(),
  estCost: z.number().optional(),
  actCost: z.number().optional(),
  reach: z.number().optional(),
  impact: z.number().optional(),
  confidence: z.number().optional(),
  effort: z.number().optional(),
  userValue: z.number().optional(),
  timeCrit: z.number().optional(),
  riskRed: z.number().optional(),
  jobSize: z.number().optional(),
  pinned: z.boolean().optional(),
});

export const UpdateCaseSchema = z.object({
  problem: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  sev: z.number().int().nullable().optional(),
  occ: z.number().int().nullable().optional(),
  det: z.number().int().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  leanMethod: z.string().nullable().optional(),
  target: z.string().nullable().optional(),
  whys: z.array(z.string()).optional(),
  dateLogged: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  percent: z.number().optional(),
  costCat: z.string().nullable().optional(),
  estCost: z.number().optional(),
  actCost: z.number().optional(),
  reach: z.number().nullable().optional(),
  impact: z.number().nullable().optional(),
  confidence: z.number().nullable().optional(),
  effort: z.number().nullable().optional(),
  userValue: z.number().nullable().optional(),
  timeCrit: z.number().nullable().optional(),
  riskRed: z.number().nullable().optional(),
  jobSize: z.number().nullable().optional(),
  pinned: z.boolean().optional(),
});

export const BulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  updates: UpdateCaseSchema,
});

export const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
});
