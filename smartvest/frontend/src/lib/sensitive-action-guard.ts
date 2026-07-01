/**
 * Sensitive Action Guard
 *
 * Requires re-confirmation before performing destructive or
 * financially-impactful actions. If app lock is enabled, the user
 * must re-enter their PIN. If not, shows a confirmation dialog.
 *
 * Sensitive actions:
 * - Delete account
 * - Record stock split (changes cost basis permanently)
 * - Change ticker (changes all historical data)
 * - Delete a holding
 *
 * Non-sensitive actions (no re-auth needed):
 * - View data (already visible on screen)
 * - Log an order (can be deleted later)
 * - Add to watchlist
 * - Change display settings
 */

import { isPINSet, verifyPIN, isLockEnabled } from './app-lock';

const LAST_CONFIRMED_KEY = 'smartvest_last_confirmed';
const CONFIRM_VALIDITY_MS = 2 * 60 * 1000; // 2 minutes — re-confirm after this

/**
 * Check if the user has recently confirmed their identity.
 * If confirmed within the last 2 minutes, skip re-asking.
 */
export function wasRecentlyConfirmed(): boolean {
  if (typeof window === 'undefined') return false;
  const last = localStorage.getItem(LAST_CONFIRMED_KEY);
  if (!last) return false;
  return (Date.now() - parseInt(last, 10)) < CONFIRM_VALIDITY_MS;
}

/**
 * Record that the user just confirmed their identity.
 */
export function recordConfirmation(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_CONFIRMED_KEY, Date.now().toString());
}

/**
 * Gate a sensitive action. Returns true if allowed to proceed.
 *
 * If PIN is set: prompts for PIN.
 * If PIN is not set: shows a confirmation dialog.
 * If recently confirmed (< 2 min): skips prompt.
 */
export function confirmSensitiveAction(actionDescription: string): boolean {
  // If confirmed recently, allow immediately
  if (wasRecentlyConfirmed()) return true;

  if (isPINSet() && isLockEnabled()) {
    // Prompt for PIN
    const entered = prompt(`Re-enter your PIN to: ${actionDescription}`);
    if (!entered) return false;
    if (!verifyPIN(entered)) {
      alert('Incorrect PIN. Action cancelled.');
      return false;
    }
    recordConfirmation();
    return true;
  }

  // No PIN set — fall back to confirmation dialog
  const confirmed = confirm(
    `⚠️ ${actionDescription}\n\nThis action changes your financial data permanently. Continue?`
  );
  if (confirmed) recordConfirmation();
  return confirmed;
}
