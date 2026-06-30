'use client';

import { useEffect, useRef } from 'react';
import {
  areNotificationsEnabled,
  notifyPriceAlert,
  notifyPortfolioDrop,
  notifyWeeklySummary,
} from '@/lib/notifications';
import { getActiveAlerts, triggerAlert, checkAlertTriggered } from '@/lib/alerts';
import { getActiveStopLosses, triggerStopLoss } from '@/lib/stop-losses';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const WEEKLY_NOTIF_KEY = 'smartvest_weekly_notif_sent';

// Price checking requires a live backend. If API_BASE is localhost,
// disable all price-based checks to avoid silent failures.
const BACKEND_CONNECTED = !API_BASE.includes('localhost');

/**
 * NotificationManager — background process on every page.
 *
 * Every 5 minutes (while app is open):
 *   1. Checks price alerts against live prices → sends phone notification
 *   2. Checks stop-losses → sends phone notification
 *   3. On Monday mornings → sends weekly summary notification (once)
 *
 * NOTE: Price alert and stop-loss checks are currently NON-FUNCTIONAL.
 * They require a backend that is not connected (localhost:8000).
 * Alerts/stop-losses can be SET but will not FIRE until the backend
 * is replaced with getPrice() from Alpha Vantage.
 */
export function NotificationManager() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!areNotificationsEnabled()) return;
    if (!BACKEND_CONNECTED) return; // Backend not available — skip price checks

    // Run immediately
    runChecks();

    // Then every 5 minutes
    intervalRef.current = setInterval(runChecks, CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function runChecks() {
    if (!areNotificationsEnabled()) return;

    await checkPriceAlerts();
    await checkStopLosses();
    await checkPortfolioDrop();
    checkMondaySummary();
  }

  async function checkPriceAlerts() {
    const alerts = getActiveAlerts();
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      try {
        const res = await fetch(`${API_BASE}/api/quote/${alert.symbol}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = await res.json();

        if (checkAlertTriggered(alert, data.current_price)) {
          triggerAlert(alert.id);
          notifyPriceAlert(
            alert.symbol,
            alert.name,
            alert.direction,
            alert.targetPrice,
            alert.currency,
          );
        }
      } catch {
        // Silent — don't spam errors
      }
    }
  }

  async function checkStopLosses() {
    const stopLosses = getActiveStopLosses();
    if (stopLosses.length === 0) return;

    for (const sl of stopLosses) {
      try {
        const res = await fetch(`${API_BASE}/api/quote/${sl.symbol}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = await res.json();

        if (data.current_price <= sl.stopPrice) {
          triggerStopLoss(sl.id);
          notifyPriceAlert(
            sl.symbol,
            sl.name,
            'below',
            sl.stopPrice,
            sl.currency,
          );
        }
      } catch {}
    }
  }

  async function checkPortfolioDrop() {
    // Check if portfolio is down more than 5% today
    // Only notify once per day
    const today = new Date().toISOString().split('T')[0];
    const dropNotifKey = `smartvest_drop_notif_${today}`;
    if (localStorage.getItem(dropNotifKey)) return;

    // Use a few symbols as portfolio proxy (same as portfolio page)
    const symbols = ['NOVO-B.CO', 'AAPL', 'KO', 'JNJ'];
    let totalDayChange = 0;
    let count = 0;

    for (const symbol of symbols.slice(0, 3)) {
      try {
        const res = await fetch(`${API_BASE}/api/quote/${symbol}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        totalDayChange += data.day_change_pct || 0;
        count++;
      } catch {}
    }

    if (count === 0) return;
    const avgChange = totalDayChange / count;

    if (avgChange < -5) {
      notifyPortfolioDrop(avgChange);
      localStorage.setItem(dropNotifKey, 'true');
    }
  }

  function checkMondaySummary() {
    const now = new Date();
    if (now.getDay() !== 1) return; // Only on Mondays
    if (now.getHours() > 12) return; // Only in the morning

    // Check if already sent this week
    const lastSent = localStorage.getItem(WEEKLY_NOTIF_KEY);
    const thisMonday = new Date(now);
    thisMonday.setHours(0, 0, 0, 0);
    const thisMondayStr = thisMonday.toISOString().split('T')[0];

    if (lastSent === thisMondayStr) return; // Already sent

    notifyWeeklySummary();
    localStorage.setItem(WEEKLY_NOTIF_KEY, thisMondayStr);
  }

  return null; // No UI — runs silently
}
