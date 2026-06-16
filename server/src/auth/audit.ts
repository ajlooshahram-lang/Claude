import type { AuthDbHelpers } from "./db-helpers.js";

/**
 * Audit logging for all authentication events.
 *
 * Standard actions:
 *  - auth.register
 *  - auth.login
 *  - auth.login.failed
 *  - auth.logout
 *  - auth.mfa.enroll
 *  - auth.mfa.verify
 *  - auth.mfa.disable
 *  - auth.session.revoke
 */

export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.mfa.enroll"
  | "auth.mfa.verify"
  | "auth.mfa.disable"
  | "auth.session.revoke";

export type AuditEventParams = {
  tenantId: string;
  actorId?: string | undefined;
  action: AuditAction;
  entity?: string | undefined;
  entityId?: string | undefined;
  detail?: Record<string, unknown> | undefined;
  ip?: string | undefined;
};

/**
 * Log an audit event to the database.
 */
export async function logAuditEvent(
  db: AuthDbHelpers,
  params: AuditEventParams,
): Promise<void> {
  await db.createAuditLog({
    tenantId: params.tenantId,
    actorId: params.actorId ?? null,
    action: params.action,
    entity: params.entity ?? null,
    entityId: params.entityId ?? null,
    detail: params.detail ?? {},
    ip: params.ip ?? null,
  });
}
