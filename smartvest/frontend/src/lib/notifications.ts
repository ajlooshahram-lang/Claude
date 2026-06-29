/**
 * Browser Notifications for SmartVest.
 *
 * Uses the Web Notification API to show real system notifications.
 * On Android PWA these appear as phone notifications (sound, vibrate, banner).
 * Works when the app tab is in the background (browser must be running).
 *
 * Three notification types:
 *   1. Price alert triggered
 *   2. Portfolio dropped more than 5% today
 *   3. Monday morning weekly summary reminder
 */

const PERMISSION_KEY = 'smartvest_notifications_enabled';

export type NotificationType = 'price_alert' | 'portfolio_drop' | 'weekly_summary';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;

  const result = await Notification.requestPermission();
  if (result === 'granted') {
    localStorage.setItem(PERMISSION_KEY, 'true');
    return true;
  }
  return false;
}

export function areNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PERMISSION_KEY) === 'true' && Notification.permission === 'granted';
}

export function sendNotification(
  title: string,
  body: string,
  type: NotificationType,
): void {
  if (!areNotificationsEnabled()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: type, // Prevents duplicate notifications of same type
      requireInteraction: type === 'price_alert', // Price alerts stay until dismissed
    });

    // Click notification → open the app
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Fallback: some environments don't support Notification constructor
    // (service worker would use self.registration.showNotification instead)
  }
}

// ─── Specific notification helpers ───────────────────────────────────────────

export function notifyPriceAlert(symbol: string, name: string, direction: string, targetPrice: number, currency: string): void {
  sendNotification(
    `Price Alert: ${symbol}`,
    `${name} has gone ${direction} ${currency} ${targetPrice.toFixed(2)}. Open SmartVest to review.`,
    'price_alert',
  );
}

export function notifyPortfolioDrop(dropPct: number): void {
  sendNotification(
    'Portfolio Alert',
    `Your portfolio is down ${Math.abs(dropPct).toFixed(1)}% today. This may be temporary — check SmartVest for details.`,
    'portfolio_drop',
  );
}

export function notifyWeeklySummary(): void {
  sendNotification(
    'Weekly Summary Ready',
    'Your portfolio performance report for last week is ready. Open SmartVest to see how you did.',
    'weekly_summary',
  );
}
