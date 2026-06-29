/**
 * Weekly Summary persistence.
 *
 * Tracks whether the user has dismissed this week's summary.
 * Resets every Monday (new week = new summary appears).
 */

const STORAGE_KEY = 'smartvest_weekly_summary_dismissed';

function getCurrentWeekId(): string {
  // Week ID = the Monday date of the current week (ISO format)
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Days since last Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().split('T')[0]; // e.g. "2026-06-29"
}

export function isWeeklySummaryDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    return dismissed === getCurrentWeekId();
  } catch {
    return false;
  }
}

export function dismissWeeklySummary(): void {
  localStorage.setItem(STORAGE_KEY, getCurrentWeekId());
}

export function shouldShowWeeklySummary(): boolean {
  // Show if it's not been dismissed this week
  return !isWeeklySummaryDismissed();
}
