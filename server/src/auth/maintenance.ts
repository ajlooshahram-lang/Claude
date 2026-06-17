/**
 * Maintenance background job ("maintenance GC").
 *
 * Closes two operational hygiene gaps for the Submarine Telecom Project (STP)
 * deployment:
 *   1. Expired session rows are hard-deleted so the session store does not grow
 *      without bound (the rows are already invalid -- validation rejects them).
 *   2. Audit-log rotation: when an operator opts in (AUDIT_LOG_RETENTION_DAYS >
 *      0), audit-log rows older than the retention window are deleted. The
 *      default of 0 keeps audit data forever so a compliance record is never
 *      silently destroyed.
 *
 * Mirrors the MFA token GC pattern in routes.ts: a pure, directly-testable
 * worker (`runMaintenance`) plus an idempotent start/stop pair backed by an
 * unref'd setInterval so the timer never keeps the process alive.
 */

import type { AppConfig } from "../config.js";
import type { AuthDbHelpers } from "./db-helpers.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export type MaintenanceResult = {
  sessionsDeleted: number;
  auditLogsDeleted: number;
};

/**
 * Run one maintenance pass. Always cleans up expired sessions. Only deletes
 * audit logs when retention is enabled (`auditLogRetentionDays > 0`); with the
 * default of 0 it leaves audit data untouched and reports `auditLogsDeleted: 0`.
 *
 * Pure and side-effect-explicit so it can be unit-tested with mocked helpers
 * and no real database or timers.
 */
export async function runMaintenance(
  db: AuthDbHelpers,
  config: AppConfig,
  now: Date = new Date(),
): Promise<MaintenanceResult> {
  const sessionsDeleted = await db.deleteExpiredSessions(now);

  let auditLogsDeleted = 0;
  if (config.auditLogRetentionDays > 0) {
    const cutoff = new Date(now.getTime() - config.auditLogRetentionDays * MS_PER_DAY);
    auditLogsDeleted = await db.deleteAuditLogsOlderThan(cutoff);
  }

  return { sessionsDeleted, auditLogsDeleted };
}

/** Interval handle (module-scoped for idempotent start + clean shutdown). */
let maintenanceInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic maintenance job at the configured interval. Idempotent:
 * calling it while already running is a no-op. The interval callback swallows
 * (and logs) errors so a transient DB blip can never crash the process.
 */
export function startMaintenanceJob(db: AuthDbHelpers, config: AppConfig): void {
  if (maintenanceInterval) return; // already running

  const intervalMs = config.sessionCleanupIntervalMinutes * MS_PER_MINUTE;
  maintenanceInterval = setInterval(() => {
    void runMaintenance(db, config).catch((err: unknown) => {
      // Never let a maintenance failure take down the process; log and move on.
      // eslint-disable-next-line no-console
      console.error("[maintenance] run failed:", err);
    });
  }, intervalMs);

  // Do not keep the event loop alive solely for this timer.
  maintenanceInterval.unref();
}

/** Stop the periodic maintenance job (for graceful shutdown / tests). */
export function stopMaintenanceJob(): void {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
  }
}
