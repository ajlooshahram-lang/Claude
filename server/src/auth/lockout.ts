/**
 * Account lockout protection.
 *
 * In-memory store that tracks failed login attempts per email address.
 * After MAX_ATTEMPTS failures within WINDOW_MS, the account is locked for
 * LOCKOUT_MS.
 *
 * Configuration:
 *  - Max attempts: 5
 *  - Window: 15 minutes
 *  - Lockout duration: 15 minutes
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

type AttemptRecord = {
  attempts: number[];
  lockedUntil: number | null;
};

const store = new Map<string, AttemptRecord>();

export type LockoutResult = {
  locked: boolean;
  attemptsRemaining: number;
};

/**
 * Check if an account is currently locked.
 */
export function isLocked(email: string): boolean {
  const record = store.get(email.toLowerCase());
  if (!record) return false;
  if (record.lockedUntil === null) return false;
  if (Date.now() >= record.lockedUntil) {
    // Lockout expired - clean up
    store.delete(email.toLowerCase());
    return false;
  }
  return true;
}

/**
 * Record a failed login attempt for an email address.
 * Returns whether the account is now locked and how many attempts remain.
 */
export function recordFailedAttempt(email: string): LockoutResult {
  const key = email.toLowerCase();
  const now = Date.now();

  let record = store.get(key);
  if (!record) {
    record = { attempts: [], lockedUntil: null };
    store.set(key, record);
  }

  // If already locked and lockout has not expired, return locked state
  if (record.lockedUntil !== null && now < record.lockedUntil) {
    return { locked: true, attemptsRemaining: 0 };
  }

  // Clear expired lockout
  if (record.lockedUntil !== null && now >= record.lockedUntil) {
    record.attempts = [];
    record.lockedUntil = null;
  }

  // Add this attempt, filtering out attempts outside the window
  record.attempts = record.attempts.filter((t) => now - t < WINDOW_MS);
  record.attempts.push(now);

  // Check if max attempts reached
  if (record.attempts.length >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    return { locked: true, attemptsRemaining: 0 };
  }

  return {
    locked: false,
    attemptsRemaining: MAX_ATTEMPTS - record.attempts.length,
  };
}

/**
 * Reset all failed attempts for an account (called on successful login).
 */
export function resetAttempts(email: string): void {
  store.delete(email.toLowerCase());
}

/**
 * Clear the entire lockout store (useful for testing).
 */
export function clearLockoutStore(): void {
  store.clear();
}
