/**
 * Zod validation schemas for Project and Case CRUD request bodies.
 *
 * All string fields have max length limits to prevent oversized inputs.
 */
import { z } from "zod";

/** Maximum length for short text fields (names, labels, categories). */
const SHORT_TEXT_MAX = 255;
/** Maximum length for long text fields (descriptions, root causes). */
const LONG_TEXT_MAX = 5000;
/** Maximum number of IDs in a bulk operation. */
const BULK_IDS_MAX = 100;
/** Maximum number of "whys" entries. */
const WHYS_MAX = 10;

const ProjectStatusEnum = z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(SHORT_TEXT_MAX),
  sponsor: z.string().max(SHORT_TEXT_MAX).optional(),
  manager: z.string().max(SHORT_TEXT_MAX).optional(),
  org: z.string().max(SHORT_TEXT_MAX).optional(),
  startDate: z.string().max(SHORT_TEXT_MAX).optional(),
  endDate: z.string().max(SHORT_TEXT_MAX).optional(),
  status: ProjectStatusEnum.optional(),
  version: z.string().max(SHORT_TEXT_MAX).optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(SHORT_TEXT_MAX).optional(),
  sponsor: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  manager: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  org: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  startDate: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  endDate: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  status: ProjectStatusEnum.optional(),
  version: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
});

export const CreateCaseSchema = z.object({
  problem: z.string().min(1, "Problem description is required").max(LONG_TEXT_MAX),
  category: z.string().max(SHORT_TEXT_MAX).optional(),
  priority: z.string().max(SHORT_TEXT_MAX).optional(),
  status: z.string().max(SHORT_TEXT_MAX).optional(),
  owner: z.string().max(SHORT_TEXT_MAX).optional(),
  sev: z.number().int().optional(),
  occ: z.number().int().optional(),
  det: z.number().int().optional(),
  rootCause: z.string().max(LONG_TEXT_MAX).optional(),
  leanMethod: z.string().max(SHORT_TEXT_MAX).optional(),
  target: z.string().max(LONG_TEXT_MAX).optional(),
  whys: z.array(z.string().max(LONG_TEXT_MAX)).max(WHYS_MAX).optional(),
  dateLogged: z.string().max(SHORT_TEXT_MAX).optional(),
  startDate: z.string().max(SHORT_TEXT_MAX).optional(),
  percent: z.number().optional(),
  costCat: z.string().max(SHORT_TEXT_MAX).optional(),
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
  problem: z.string().min(1).max(LONG_TEXT_MAX).optional(),
  category: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  priority: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  status: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  owner: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  sev: z.number().int().nullable().optional(),
  occ: z.number().int().nullable().optional(),
  det: z.number().int().nullable().optional(),
  rootCause: z.string().max(LONG_TEXT_MAX).nullable().optional(),
  leanMethod: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  target: z.string().max(LONG_TEXT_MAX).nullable().optional(),
  whys: z.array(z.string().max(LONG_TEXT_MAX)).max(WHYS_MAX).optional(),
  dateLogged: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  startDate: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
  percent: z.number().optional(),
  costCat: z.string().max(SHORT_TEXT_MAX).nullable().optional(),
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
  ids: z.array(z.string().max(SHORT_TEXT_MAX)).min(1, "At least one ID is required").max(BULK_IDS_MAX),
  updates: UpdateCaseSchema,
});

export const BulkDeleteSchema = z.object({
  ids: z.array(z.string().max(SHORT_TEXT_MAX)).min(1, "At least one ID is required").max(BULK_IDS_MAX),
});

// ─── Register Row Schemas ─────────────────────────────────────────────────────

export const VALID_REGISTER_TYPES = [
  "hazop",
  "calibration",
  "punch",
  "sil",
  "rtm",
  "docs",
  "ncr",
  "moc",
  "milestones",
  "decisions",
  "procurement",
  "resources",
  "okr",
] as const;

export const RegisterTypeSchema = z.enum(VALID_REGISTER_TYPES);

/** Register row data must be a flat key-value record (no nested objects/arrays). */
const FlatDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const CreateRegisterRowSchema = z.object({
  data: FlatDataSchema.refine(
    (val) => JSON.stringify(val).length <= 5000,
    "Data too large",
  ),
  pinned: z.boolean().optional(),
});

export const UpdateRegisterRowSchema = z.object({
  data: FlatDataSchema.refine(
    (val) => JSON.stringify(val).length <= 5000,
    "Data too large",
  ).optional(),
  pinned: z.boolean().optional(),
});

export const BulkDeleteRegisterRowSchema = z.object({
  ids: z.array(z.string().max(SHORT_TEXT_MAX)).min(1, "At least one ID is required").max(BULK_IDS_MAX),
});

// ─── Snapshot Schemas ─────────────────────────────────────────────────────

/** Maximum body size for analytical data updates (500KB). */
const MAX_PROJECT_DATA_SIZE = 500 * 1024;

export const CreateSnapshotSchema = z.object({
  label: z.string().max(SHORT_TEXT_MAX).optional(),
});

export const UpdateSnapshotLabelSchema = z.object({
  label: z.string().min(1, "Label is required").max(SHORT_TEXT_MAX),
});

export const UpdateProjectDataSchema = z.object({
  // Intentionally accepts arbitrary JSON for each analytical field. This is a private
  // deployment with 11 users and a 500KB total payload cap. Structural validation is
  // deliberately omitted to allow flexible, schema-free analytical data storage.
  spec: z.unknown().optional(),
  roster: z.unknown().optional(),
  stakeholders: z.unknown().optional(),
  sigma: z.unknown().optional(),
  gage: z.unknown().optional(),
  cashflow: z.unknown().optional(),
  xbarR: z.unknown().optional(),
}).refine(
  (val) => JSON.stringify(val).length <= MAX_PROJECT_DATA_SIZE,
  "Project data payload exceeds 500KB limit",
);
