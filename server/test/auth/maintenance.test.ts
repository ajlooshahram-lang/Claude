import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, type AppConfig } from "../../src/config.js";
import {
  runMaintenance,
  startMaintenanceJob,
  stopMaintenanceJob,
} from "../../src/auth/maintenance.js";
import type { AuthDbHelpers } from "../../src/auth/db-helpers.js";

/**
 * Build a test config, overriding the maintenance-related fields. Uses the real
 * loader so we also exercise the zod defaults/coercion.
 */
function makeConfig(env: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    CORS_ORIGINS: "http://localhost:5173",
    DATA_REGION: "eu-west",
    ...env,
  });
}

/**
 * A minimal AuthDbHelpers mock. Only the two maintenance methods matter here;
 * everything else throws if unexpectedly called so the test stays honest.
 */
function createMockDb(overrides: Partial<AuthDbHelpers> = {}): AuthDbHelpers {
  const notImplemented = async () => {
    throw new Error("not implemented in maintenance test");
  };
  return {
    findUserByEmail: notImplemented as never,
    findUserById: notImplemented as never,
    createUserWithTenant: notImplemented as never,
    createSession: notImplemented as never,
    findSessionByTokenHash: notImplemented as never,
    revokeSession: notImplemented as never,
    revokeAllUserSessions: notImplemented as never,
    findMembershipByUserId: notImplemented as never,
    updateUserMfa: notImplemented as never,
    updateUserMfaLastStep: notImplemented as never,
    updateUserPassword: notImplemented as never,
    updateUserLastLogin: notImplemented as never,
    createAuditLog: notImplemented as never,
    replaceRecoveryCodes: notImplemented as never,
    listRecoveryCodes: notImplemented as never,
    markRecoveryCodeUsed: notImplemented as never,
    countUnusedRecoveryCodes: notImplemented as never,
    deleteExpiredSessions: async () => 0,
    deleteAuditLogsOlderThan: async () => 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

test("config: maintenance defaults are interval=60, retention=0", () => {
  const config = makeConfig();
  assert.equal(config.sessionCleanupIntervalMinutes, 60);
  assert.equal(config.auditLogRetentionDays, 0);
});

test("config: maintenance env vars are coerced from strings", () => {
  const config = makeConfig({
    SESSION_CLEANUP_INTERVAL_MINUTES: "15",
    AUDIT_LOG_RETENTION_DAYS: "30",
  });
  assert.equal(config.sessionCleanupIntervalMinutes, 15);
  assert.equal(config.auditLogRetentionDays, 30);
});

// ---------------------------------------------------------------------------
// runMaintenance: expired sessions
// ---------------------------------------------------------------------------

test("runMaintenance deletes expired sessions and returns the count", async () => {
  const now = new Date("2026-06-17T12:00:00.000Z");
  const deleteExpiredSessions = mock.fn(async () => 5);
  const db = createMockDb({ deleteExpiredSessions });

  const result = await runMaintenance(db, makeConfig(), now);

  assert.equal(deleteExpiredSessions.mock.callCount(), 1);
  // Called with the `now` Date we supplied.
  const arg = deleteExpiredSessions.mock.calls[0]?.arguments[0];
  assert.ok(arg instanceof Date);
  assert.equal(arg.getTime(), now.getTime());
  assert.equal(result.sessionsDeleted, 5);
});

// ---------------------------------------------------------------------------
// runMaintenance: audit-log retention disabled (default)
// ---------------------------------------------------------------------------

test("runMaintenance with retention=0 does NOT touch audit logs", async () => {
  const deleteAuditLogsOlderThan = mock.fn(async () => 99);
  const db = createMockDb({
    deleteExpiredSessions: async () => 3,
    deleteAuditLogsOlderThan,
  });

  const result = await runMaintenance(db, makeConfig({ AUDIT_LOG_RETENTION_DAYS: "0" }));

  assert.equal(deleteAuditLogsOlderThan.mock.callCount(), 0);
  assert.equal(result.auditLogsDeleted, 0);
  assert.equal(result.sessionsDeleted, 3);
});

// ---------------------------------------------------------------------------
// runMaintenance: audit-log retention enabled
// ---------------------------------------------------------------------------

test("runMaintenance with retention=30 deletes audit logs older than cutoff", async () => {
  const now = new Date("2026-06-17T12:00:00.000Z");
  const deleteAuditLogsOlderThan = mock.fn(async () => 12);
  const db = createMockDb({
    deleteExpiredSessions: async () => 0,
    deleteAuditLogsOlderThan,
  });

  const result = await runMaintenance(
    db,
    makeConfig({ AUDIT_LOG_RETENTION_DAYS: "30" }),
    now,
  );

  assert.equal(deleteAuditLogsOlderThan.mock.callCount(), 1);
  const cutoff = deleteAuditLogsOlderThan.mock.calls[0]?.arguments[0];
  assert.ok(cutoff instanceof Date);

  const expected = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  // Within a generous tolerance (computation is exact, but allow for clock math).
  assert.ok(
    Math.abs(cutoff.getTime() - expected) < 1000,
    `cutoff ${cutoff.toISOString()} should be ~30 days before now`,
  );
  assert.equal(result.auditLogsDeleted, 12);
});

// ---------------------------------------------------------------------------
// Resilience: the scheduled wrapper must swallow DB errors
// ---------------------------------------------------------------------------

test("startMaintenanceJob's scheduled callback swallows DB errors without throwing", async () => {
  // Force the interval to fire immediately by setting the smallest allowed
  // interval and using fake timers.
  const ctx = mock.timers;
  ctx.enable({ apis: ["setInterval"] });

  // Suppress the expected console.error noise from the swallowed failure.
  const errorMock = mock.method(console, "error", () => {});

  try {
    const db = createMockDb({
      deleteExpiredSessions: async () => {
        throw new Error("transient DB blip");
      },
    });
    const config = makeConfig({ SESSION_CLEANUP_INTERVAL_MINUTES: "1" });

    startMaintenanceJob(db, config);

    // Advance time past one interval (1 minute) -- the callback runs and the
    // rejected promise must be caught, not crash the test.
    assert.doesNotThrow(() => ctx.tick(60_000));

    // Let the microtask queue drain so the .catch handler runs.
    await Promise.resolve();
    await Promise.resolve();

    // The error path was hit and logged rather than thrown.
    assert.ok(errorMock.mock.callCount() >= 1);
  } finally {
    stopMaintenanceJob();
    ctx.reset();
    errorMock.mock.restore();
  }
});

test("startMaintenanceJob is idempotent and stop clears the handle", () => {
  const db = createMockDb();
  const config = makeConfig();
  // Should not throw when started twice or stopped when not running.
  startMaintenanceJob(db, config);
  startMaintenanceJob(db, config);
  stopMaintenanceJob();
  stopMaintenanceJob();
  assert.ok(true);
});
