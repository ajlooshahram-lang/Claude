/**
 * Data Integrity Check — Detects database rollbacks/restores
 *
 * After every successful write to Supabase, we store the timestamp
 * in localStorage. On next app load, we compare this against the
 * most recent row in the database. If our local timestamp is NEWER
 * than the newest DB row, the database was likely restored from a
 * backup and recent data is missing.
 *
 * This catches:
 * - Supabase point-in-time recovery (PITR) restores
 * - Accidental table truncation
 * - Any scenario where committed rows disappear
 *
 * It does NOT catch:
 * - Individual row deletions (those are intentional)
 * - Schema changes that preserve data
 */

const LAST_WRITE_KEY = 'smartvest_last_write_ts';
const ROLLBACK_DISMISSED_KEY = 'smartvest_rollback_dismissed';

/**
 * Record that a successful write just happened.
 * Call this after every addOrder, addHolding, addDeposit, etc.
 */
export function recordWrite(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_WRITE_KEY, new Date().toISOString());
}

/**
 * Get the last recorded write timestamp.
 */
export function getLastWriteTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_WRITE_KEY);
}

/**
 * Check if the database appears to have been rolled back.
 *
 * @param newestDbTimestamp - The most recent created_at from any table
 * @returns null if OK, or a warning message if rollback detected
 */
export function checkForRollback(newestDbTimestamp: string | null): {
  detected: boolean;
  message: string | null;
  lastWrite: string | null;
  newestInDb: string | null;
  hoursLost: number;
} {
  const lastWrite = getLastWriteTimestamp();

  // No local record → first time using app, or localStorage cleared
  if (!lastWrite) {
    return { detected: false, message: null, lastWrite: null, newestInDb: newestDbTimestamp, hoursLost: 0 };
  }

  // No data in DB → could be a fresh account or a complete wipe
  if (!newestDbTimestamp) {
    // If we have a local write record but DB is empty, that's suspicious
    return {
      detected: true,
      message: 'Your database appears empty, but you previously had data. It may have been reset or restored from an older backup.',
      lastWrite,
      newestInDb: null,
      hoursLost: 0,
    };
  }

  const lastWriteTime = new Date(lastWrite).getTime();
  const newestDbTime = new Date(newestDbTimestamp).getTime();

  // If the newest DB row is OLDER than our last write by more than 5 minutes
  // (5 min buffer for clock differences), something was lost
  const GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const gap = lastWriteTime - newestDbTime;

  if (gap > GAP_THRESHOLD_MS) {
    const hoursLost = Math.round(gap / (60 * 60 * 1000));
    return {
      detected: true,
      message: `Data may have been lost. Your last recorded action was ${new Date(lastWrite).toLocaleString()}, but the newest data in the database is from ${new Date(newestDbTimestamp).toLocaleString()} — approximately ${hoursLost} hour${hoursLost !== 1 ? 's' : ''} of data may be missing. Check your recent orders against your broker statement.`,
      lastWrite,
      newestInDb: newestDbTimestamp,
      hoursLost,
    };
  }

  return { detected: false, message: null, lastWrite, newestInDb: newestDbTimestamp, hoursLost: 0 };
}

/**
 * Dismiss the rollback warning (user acknowledged it).
 * Resets the local timestamp to match current DB state.
 */
export function dismissRollbackWarning(currentDbTimestamp: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROLLBACK_DISMISSED_KEY, new Date().toISOString());
  // Reset our write record to the current DB state
  if (currentDbTimestamp) {
    localStorage.setItem(LAST_WRITE_KEY, currentDbTimestamp);
  }
}

/**
 * Check if the warning was recently dismissed (within this session).
 */
export function isRollbackDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissed = localStorage.getItem(ROLLBACK_DISMISSED_KEY);
  if (!dismissed) return false;
  // Only persists for 24 hours — show again if problem continues
  const dismissedAt = new Date(dismissed).getTime();
  return (Date.now() - dismissedAt) < 24 * 60 * 60 * 1000;
}
