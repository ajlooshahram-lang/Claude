'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { getActiveAlerts, triggerAlert, checkAlertTriggered, PriceAlert } from '@/lib/alerts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Price checking requires a live backend. If API_BASE is localhost (not connected),
// disable all checks to avoid silent failures.
const BACKEND_CONNECTED = !API_BASE.includes('localhost');

/**
 * AlertNotifier — runs in the background on every page.
 * Checks active alerts against live prices every 60 seconds.
 * Shows a visible toast notification when an alert triggers.
 *
 * NOTE: Currently non-functional — price checks require a backend
 * that is not yet connected. Alerts can be SET but will not FIRE
 * until the backend is replaced with getPrice() from Alpha Vantage.
 */
export function AlertNotifier() {
  const [notification, setNotification] = useState<{ symbol: string; name: string; direction: string; target: number; currency: string } | null>(null);

  useEffect(() => {
    if (!BACKEND_CONNECTED) return; // Skip all checks — backend not available

    async function check() {
      const active = getActiveAlerts();
      if (active.length === 0) return;

      for (const alert of active) {
        try {
          const res = await fetch(`${API_BASE}/api/quote/${alert.symbol}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) continue;
          const data = await res.json();

          if (checkAlertTriggered(alert, data.current_price)) {
            triggerAlert(alert.id);
            setNotification({
              symbol: alert.symbol,
              name: alert.name,
              direction: alert.direction,
              target: alert.targetPrice,
              currency: alert.currency,
            });
          }
        } catch {
          // Silent fail — don't bother user with network errors
        }
      }
    }

    // Check immediately on mount
    check();

    // Then check every 60 seconds
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!notification) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] max-w-sm animate-in fade-in slide-in-from-top-2">
      <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--card)] shadow-xl p-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--gain)]/10 flex-shrink-0">
          <Bell className="h-4 w-4 text-[var(--gain)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--gain)]">Price Alert Triggered!</p>
          <p className="text-xs text-[var(--foreground)]/80 mt-0.5">
            {notification.symbol} ({notification.name}) has gone {notification.direction}{' '}
            {notification.currency} {notification.target.toFixed(2)}
          </p>
        </div>
        <button
          onClick={() => setNotification(null)}
          className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
