'use client';

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { isOnline } from '@/lib/offline-cache';

/**
 * Offline Banner — shows at the top of every page when:
 *   1. Device has no internet (navigator.onLine === false)
 *   2. Data is from cache (passed via prop)
 *
 * Provides clear plain English explanation of what's happening.
 */
export function OfflineBanner({ fromCache, cacheAge }: {
  fromCache?: boolean;
  cacheAge?: string | null;
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!isOnline());

    function handleOnline() { setOffline(false); }
    function handleOffline() { setOffline(true); }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Show if offline or data is from cache
  if (!offline && !fromCache) return null;

  return (
    <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 flex items-start gap-2.5">
      <WifiOff className="h-4 w-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xs font-medium text-[var(--warning)]">
          {offline ? 'You are offline' : 'Showing cached data'}
        </p>
        <p className="text-[10px] text-[var(--foreground)]/60 mt-0.5">
          {offline
            ? 'No internet connection. Showing the last data we saved on your device. Prices and scores may be outdated.'
            : `Data was last updated ${cacheAge || 'some time ago'}. Connect to the internet for live prices.`
          }
        </p>
      </div>
      {!offline && (
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1 text-[10px] text-[var(--warning)] hover:underline flex-shrink-0"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      )}
    </div>
  );
}

/**
 * Offline Action Guard — wraps buttons that need internet.
 * Shows them as disabled with an explanation when offline.
 */
export function OfflineGuard({ children, action }: {
  children: React.ReactNode;
  action: string; // e.g., "place orders", "sync broker"
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!isOnline());
    function handleOnline() { setOffline(false); }
    function handleOffline() { setOffline(true); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline) return <>{children}</>;

  return (
    <div className="opacity-50 pointer-events-none relative">
      {children}
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/60 rounded-lg">
        <p className="text-[10px] text-[var(--warning)] font-medium text-center px-2">
          Cannot {action} while offline
        </p>
      </div>
    </div>
  );
}
