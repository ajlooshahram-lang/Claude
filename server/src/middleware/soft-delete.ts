import type { Prisma } from "@prisma/client";

/**
 * Models that have a `deletedAt` field for soft-delete support.
 * The middleware will automatically add `deletedAt: null` to findMany/findFirst
 * queries for these models when no explicit deletedAt filter is present.
 */
const SOFT_DELETE_MODELS = new Set([
  "Project",
  "Case",
  "RegisterRow",
  "User",
  "Tenant",
]);

/**
 * Prisma middleware that enforces soft-delete filtering.
 * Only applies to findMany and findFirst actions on models with a deletedAt field.
 * Does NOT apply to findUnique (which uses unique fields).
 * Skips if the query already includes an explicit deletedAt condition.
 */
export function softDeleteMiddleware(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) {
    return next(params);
  }

  if (params.action !== "findMany" && params.action !== "findFirst") {
    return next(params);
  }

  // Check if deletedAt is already specified in the where clause
  const where = (params.args as Record<string, unknown> | undefined)?.["where"] as
    | Record<string, unknown>
    | undefined;

  if (where && "deletedAt" in where) {
    // Already filtering by deletedAt, do not override
    return next(params);
  }

  // Add deletedAt: null filter
  if (!params.args) {
    params.args = {};
  }

  const args = params.args as Record<string, unknown>;

  if (!args["where"]) {
    args["where"] = { deletedAt: null };
  } else {
    (args["where"] as Record<string, unknown>)["deletedAt"] = null;
  }

  return next(params);
}
