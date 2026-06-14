/**
 * Centralized strict Zod validation schemas for all API endpoint request bodies.
 * Using .strict() ensures unknown fields are rejected at the API boundary.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// ID Validation
// ---------------------------------------------------------------------------

/**
 * Validates a cuid or standard UUID format string.
 * Prisma uses cuid() which generates strings like "clx1234..." (20-30 alphanumeric chars).
 * Also accepts standard UUID format (36 chars with dashes).
 */
const CUID_REGEX = /^[a-z][a-z0-9]{19,29}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(value: string): boolean {
  return CUID_REGEX.test(value) || UUID_REGEX.test(value);
}

export const idSchema = z.string().min(1).max(50).refine(isValidId, {
  message: "Invalid ID format (expected cuid or UUID)",
});

// ---------------------------------------------------------------------------
// Auth Schemas
// ---------------------------------------------------------------------------

export const RegisterBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
  tenantName: z.string().min(1).max(200),
}).strict();

export const LoginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
  tenantId: z.string().min(1),
  mfaToken: z.string().length(6).optional(),
}).strict();

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
}).strict();

export const MfaVerifyBody = z.object({
  token: z.string().length(6),
}).strict();

// ---------------------------------------------------------------------------
// Project Schemas
// ---------------------------------------------------------------------------

export const CreateProjectBody = z.object({
  name: z.string().min(1).max(500),
  sponsor: z.string().max(200).optional(),
  manager: z.string().max(200).optional(),
  org: z.string().max(200).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  version: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  sortOrder: z.number().int().optional(),
  spec: z.unknown().optional(),
  roster: z.unknown().optional(),
  stakeholders: z.unknown().optional(),
  sigma: z.unknown().optional(),
  gage: z.unknown().optional(),
  cashflow: z.unknown().optional(),
  xbarR: z.unknown().optional(),
}).strict();

export const UpdateProjectBody = CreateProjectBody.partial().strict();

// ---------------------------------------------------------------------------
// Case Schemas
// ---------------------------------------------------------------------------

export const CreateCaseBody = z.object({
  projectId: z.string().min(1),
  problem: z.string().min(1).max(500),
  category: z.string().max(200).optional(),
  // NOTE: status/priority kept as free-text strings (with length limits) for
  // backward compatibility. Existing data uses arbitrary values like "High"/"Low".
  priority: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  owner: z.string().max(200).optional(),
  sev: z.number().int().min(1).max(10).optional(),
  occ: z.number().int().min(1).max(10).optional(),
  det: z.number().int().min(1).max(10).optional(),
  rootCause: z.string().max(1000).optional(),
  leanMethod: z.string().max(200).optional(),
  target: z.string().max(500).optional(),
  whys: z.array(z.string()).optional(),
  dateLogged: z.string().optional(),
  startDate: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  costCat: z.string().max(200).optional(),
  estCost: z.number().min(0).max(999999999).optional(),
  actCost: z.number().min(0).max(999999999).optional(),
  reach: z.number().optional(),
  impact: z.number().optional(),
  confidence: z.number().optional(),
  effort: z.number().optional(),
  userValue: z.number().optional(),
  timeCrit: z.number().optional(),
  riskRed: z.number().optional(),
  jobSize: z.number().optional(),
  pinned: z.boolean().optional(),
}).strict();

export const UpdateCaseBody = CreateCaseBody.omit({ projectId: true }).partial().strict();

export const ListCasesQuery = z.object({
  projectId: z.string().min(1),
}).strict();

// ---------------------------------------------------------------------------
// Register Schemas
// ---------------------------------------------------------------------------

export const CreateRegisterBody = z.object({
  projectId: z.string().min(1),
  data: z.unknown().default({}),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strict();

export const UpdateRegisterBody = z.object({
  data: z.unknown().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strict();

export const ListRegistersQuery = z.object({
  projectId: z.string().min(1),
}).strict();

// ---------------------------------------------------------------------------
// Snapshot Schemas
// ---------------------------------------------------------------------------

export const CreateSnapshotBody = z.object({
  projectId: z.string().min(1),
  label: z.string().max(500).optional(),
}).strict();

export const UpdateSnapshotBody = z.object({
  label: z.string().max(500),
}).strict();

export const ListSnapshotsQuery = z.object({
  projectId: z.string().min(1),
}).strict();

// ---------------------------------------------------------------------------
// Share Schemas
// ---------------------------------------------------------------------------

export const CreateShareBody = z.object({
  projectId: z.string().min(1),
  scope: z.enum(["VIEWER", "MANAGER"]),
  expiresInHours: z.number().min(1).max(8760),
}).strict();

// ---------------------------------------------------------------------------
// Common Query Schemas
// ---------------------------------------------------------------------------

export const ListQuery = z.object({
  projectId: z.string().min(1),
}).strict();
