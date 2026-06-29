/**
 * User Data Service — Per-User Data Isolation
 *
 * This module ensures that ALL user data is namespaced by user ID.
 * No user can ever read, write, or accidentally access another user's data.
 *
 * Architecture:
 *   localStorage key format: `smartvest_user_{userId}_{dataKey}`
 *
 * This replaces all direct localStorage calls throughout the app.
 * Components call `getUserData('portfolio')` instead of
 * `localStorage.getItem('smartvest_portfolio')`.
 *
 * The getCurrentUserId() function from auth.ts determines whose data
 * to read/write. If no user is logged in, all operations return defaults.
 *
 * Data categories isolated per user:
 * - portfolio (holdings, positions)
 * - watchlist (saved tickers)
 * - orders (buy/sell history)
 * - alerts (price alerts, notifications)
 * - profile (risk profile, onboarding)
 * - tax (tax records, calculations)
 * - ask (aktiesparekonto account)
 * - reports (generated reports)
 * - settings (app preferences)
 * - behavior (behavioral metrics)
 * - dca (dollar-cost-averaging plans)
 */

import { getCurrentUserId } from './auth';

// ─── Data Key Registry ───────────────────────────────────────────────────────

/** All valid data keys for user-scoped storage. */
export type UserDataKey =
  | 'portfolio'
  | 'watchlist'
  | 'orders'
  | 'alerts'
  | 'profile'
  | 'onboarding'
  | 'tax'
  | 'ask_account'
  | 'reports'
  | 'settings'
  | 'behavior'
  | 'dca_plans'
  | 'report_card'
  | 'patterns'
  | 'money_flow'
  | 'crash_sim'
  | 'backtest'
  | 'planner'
  | 'compare_history'
  | 'chat_history'
  | 'notifications'
  | 'theme_preference';

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Get the storage key for a user's data.
 * Format: smartvest_user_{userId}_{dataKey}
 */
function getStorageKey(userId: string, dataKey: UserDataKey): string {
  return `smartvest_user_${userId}_${dataKey}`;
}

/**
 * Read data for the currently authenticated user.
 * Returns null if no user is logged in or data doesn't exist.
 *
 * @example
 * const portfolio = getUserData<Portfolio>('portfolio');
 */
export function getUserData<T>(dataKey: UserDataKey): T | null {
  if (typeof window === 'undefined') return null;

  const userId = getCurrentUserId();
  if (!userId) return null;

  try {
    const key = getStorageKey(userId, dataKey);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write data for the currently authenticated user.
 * Does nothing if no user is logged in.
 *
 * @example
 * setUserData('portfolio', { holdings: [...] });
 */
export function setUserData<T>(dataKey: UserDataKey, data: T): void {
  if (typeof window === 'undefined') return;

  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const key = getStorageKey(userId, dataKey);
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or other error — fail silently
  }
}

/**
 * Delete a specific data key for the current user.
 */
export function deleteUserData(dataKey: UserDataKey): void {
  if (typeof window === 'undefined') return;

  const userId = getCurrentUserId();
  if (!userId) return;

  const key = getStorageKey(userId, dataKey);
  localStorage.removeItem(key);
}

/**
 * Read data for a SPECIFIC user ID (admin use only).
 * This bypasses the current session check — use with extreme caution.
 */
export function getDataForUser<T>(userId: string, dataKey: UserDataKey): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getStorageKey(userId, dataKey);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write data for a SPECIFIC user ID (admin/migration use only).
 */
export function setDataForUser<T>(userId: string, dataKey: UserDataKey, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getStorageKey(userId, dataKey);
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // fail silently
  }
}

/**
 * Get all data keys stored for a specific user.
 * Used by admin dashboard and account deletion.
 */
export function getAllUserDataKeys(userId: string): UserDataKey[] {
  if (typeof window === 'undefined') return [];

  const prefix = `smartvest_user_${userId}_`;
  const keys: UserDataKey[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const dataKey = key.replace(prefix, '') as UserDataKey;
      keys.push(dataKey);
    }
  }

  return keys;
}

/**
 * Calculate total storage used by a user (bytes).
 */
export function getUserStorageSize(userId: string): number {
  if (typeof window === 'undefined') return 0;

  const prefix = `smartvest_user_${userId}_`;
  let totalBytes = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const value = localStorage.getItem(key) || '';
      totalBytes += key.length + value.length;
    }
  }

  return totalBytes * 2; // UTF-16 = 2 bytes per char
}

/**
 * Delete ALL data for a specific user.
 * Used when a user deletes their account.
 */
export function purgeAllUserData(userId: string): void {
  if (typeof window === 'undefined') return;

  const prefix = `smartvest_user_${userId}_`;
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// ─── Migration Helper ────────────────────────────────────────────────────────

/**
 * Migrate legacy (non-user-scoped) data to the current user's namespace.
 * Called once after a user first logs in if legacy data exists.
 *
 * This handles the transition from single-user to multi-user:
 * existing data in the old format gets moved to the logged-in user.
 */
export function migrateLegacyData(userId: string): void {
  if (typeof window === 'undefined') return;

  const legacyMappings: { oldKey: string; newKey: UserDataKey }[] = [
    { oldKey: 'smartvest_portfolio', newKey: 'portfolio' },
    { oldKey: 'smartvest_watchlist', newKey: 'watchlist' },
    { oldKey: 'smartvest_orders', newKey: 'orders' },
    { oldKey: 'smartvest_alerts', newKey: 'alerts' },
    { oldKey: 'smartvest_profile', newKey: 'profile' },
    { oldKey: 'smartvest_onboarding', newKey: 'onboarding' },
    { oldKey: 'smartvest_ask_account', newKey: 'ask_account' },
    { oldKey: 'smartvest_reports_history', newKey: 'reports' },
    { oldKey: 'smartvest_theme', newKey: 'theme_preference' },
    { oldKey: 'smartvest_dca_plans', newKey: 'dca_plans' },
    { oldKey: 'smartvest_behavior', newKey: 'behavior' },
  ];

  let migrated = false;

  for (const { oldKey, newKey } of legacyMappings) {
    const oldData = localStorage.getItem(oldKey);
    if (oldData) {
      const newStorageKey = getStorageKey(userId, newKey);
      // Only migrate if new key doesn't already exist
      if (!localStorage.getItem(newStorageKey)) {
        localStorage.setItem(newStorageKey, oldData);
        migrated = true;
      }
      // Remove legacy key
      localStorage.removeItem(oldKey);
    }
  }

  if (migrated) {
    console.info(`[SmartVest] Migrated legacy data to user ${userId.slice(0, 8)}...`);
  }
}
