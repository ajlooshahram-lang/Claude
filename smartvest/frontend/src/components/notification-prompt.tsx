'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { getWatchlist, getAlerts } from '@/lib/supabase';

const DISMISSED_KEY = 'smartvest_notif_prompt_dismissed';

/**
 * Shows a one-time prompt asking the user to enable notifications.
 * Appears after they've used the app a bit (has a watchlist or alerts).
 * Dismissed permanently if they click X.
 */
export function NotificationPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if: not supported, already granted, already dismissed
    if (!isNotificationSupported()) return;
    if (areNotificationsEnabled()) return;
    if (getNotificationPermission() === 'denied') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Only show if user has some activity (watchlist or alerts from Supabase)
    async function checkActivity() {
      try {
        const [watchlist, alerts] = await Promise.all([getWatchlist(), getAlerts()]);
        if (watchlist.length > 0 || alerts.length > 0) {
          setShow(true);
        }
      } catch {}
    }
    checkActivity();
  }, []);

  async function handleEnable() {
    const granted = await requestNotificationPermission();
    if (granted) {
      setShow(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 rounded-xl border border-[var(--primary)]/30 bg-[var(--card)] shadow-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 flex-shrink-0">
          <Bell className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Enable Notifications?</p>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
            Get notified when your price alerts trigger, your portfolio drops significantly, or your weekly summary is ready.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90"
            >
              Enable
            </button>
            <button
              onClick={handleDismiss}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Not now
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-[var(--muted)] hover:text-[var(--foreground)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
