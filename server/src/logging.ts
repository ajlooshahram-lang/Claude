/**
 * Structured logging via pino. Provides helper functions that always include
 * requestId and tenantId context. NEVER logs passwords, session tokens, or MFA secrets.
 */
import pino from "pino";
import type { FastifyRequest } from "fastify";

const isTest = process.env["NODE_ENV"] === "test";

export const logger = pino({
  level: isTest ? "silent" : (process.env["LOG_LEVEL"] ?? "info"),
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    // Ensure we never accidentally log sensitive fields
    req: (req: Record<string, unknown>) => ({
      method: req["method"],
      url: req["url"],
      requestId: req["requestId"],
    }),
  },
});

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  ip?: string;
}

function extractContext(req: FastifyRequest): RequestContext {
  return {
    requestId: req.requestId,
    tenantId: req.tenantId,
    ip: req.ip,
  };
}

/**
 * Log an authentication-related event (login, logout, register, MFA).
 * NEVER include passwords, tokens, or secrets in the detail object.
 */
export function logAuthEvent(
  req: FastifyRequest,
  action: string,
  detail: Record<string, unknown> = {},
): void {
  const ctx = extractContext(req);
  logger.info({
    ...ctx,
    event: "auth",
    action,
    detail,
  });
}

/**
 * Log a data mutation (create, update, delete).
 * NEVER include passwords, tokens, or secrets in the detail object.
 */
export function logMutation(
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId: string | undefined,
  detail: Record<string, unknown> = {},
): void {
  const ctx = extractContext(req);
  logger.info({
    ...ctx,
    event: "mutation",
    action,
    entity,
    entityId,
    detail,
  });
}

/**
 * Log an error with request context.
 */
export function logError(
  req: FastifyRequest,
  error: unknown,
): void {
  const ctx = extractContext(req);
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error({
    ...ctx,
    event: "error",
    message,
    stack,
  });
}
