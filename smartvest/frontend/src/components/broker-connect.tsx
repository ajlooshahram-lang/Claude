'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, Loader2, ExternalLink, AlertCircle, RefreshCw, Clock } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

interface BrokerStatus {
  configured: boolean;
  connected: boolean;
  environment: string;
  broker: string;
  hint: string | null;
}

/**
 * Broker Connect Button & Auto-Sync
 *
 * - Not configured: shows setup instructions
 * - Configured but not connected: shows "Connect" button
 * - Connected: auto-syncs every 15 min, shows timestamp, error handling
 */
export function BrokerConnect({ onPositionsLoaded }: {
  onPositionsLoaded?: (positions: any[]) => void;
}) {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/broker/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Backend might not be running — that's ok
    } finally {
      setLoading(false);
    }
  }, []);

  const syncPositions = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/broker/positions`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('smartvest_broker_connected');
          setStatus(s => s ? { ...s, connected: false } : s);
          setError('Session expired. Please reconnect your broker account.');
          return;
        }
        throw new Error('sync_failed');
      }
      const data = await res.json();
      if (onPositionsLoaded && data.positions) {
        onPositionsLoaded(data.positions);
      }
      setLastSynced(new Date().toLocaleTimeString('en-DK', {
        hour: '2-digit', minute: '2-digit',
      }));
      setError(null);
    } catch {
      setError('Could not sync your holdings right now. Your internet connection may be unstable, or the broker service is temporarily unavailable.');
    } finally {
      setSyncing(false);
    }
  }, [onPositionsLoaded]);

  // Check broker status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Initial sync + set up 15-minute interval when connected
  useEffect(() => {
    const connected = localStorage.getItem('smartvest_broker_connected');
    if (connected === 'true' && status?.connected) {
      // Sync immediately
      syncPositions();

      // Then sync every 15 minutes
      intervalRef.current = setInterval(syncPositions, SYNC_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, syncPositions]);

  async function handleConnect() {
    try {
      const res = await fetch(`${API_BASE}/api/broker/auth-url`);
      if (!res.ok) throw new Error('Not configured');
      const data = await res.json();
      window.location.href = data.auth_url;
    } catch {
      setError('Broker not configured. Add SAXO_CLIENT_ID to your environment variables.');
    }
  }

  async function handleDisconnect() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    await fetch(`${API_BASE}/api/broker/disconnect`, { method: 'POST' });
    localStorage.removeItem('smartvest_broker_connected');
    setStatus(s => s ? { ...s, connected: false } : s);
    setLastSynced(null);
    setError(null);
  }

  if (loading) return null;
  if (!status) return null;

  // ─── Not configured ───
  if (!status.configured) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="flex items-start gap-3">
          <Link2 className="h-5 w-5 text-[var(--muted)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Connect Your Broker</p>
            <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
              Link your Saxo Bank account to see real holdings automatically.
              To set up: create a free developer account at{' '}
              <a href="https://www.developer.saxo" target="_blank" rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline">
                developer.saxo
              </a>, register an app, and add your SAXO_CLIENT_ID to the backend environment variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Connected ───
  if (status.connected) {
    return (
      <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-4 space-y-2">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--gain)] animate-pulse" />
            <span className="text-xs font-medium text-[var(--gain)]">
              Saxo Bank Connected ({status.environment})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDisconnect}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--loss)]"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Sync status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
            {syncing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Syncing...</span>
              </>
            ) : lastSynced ? (
              <>
                <Clock className="h-3 w-3" />
                <span>Last synced: {lastSynced}</span>
                <span className="text-[var(--muted)]/60">· auto-refreshes every 15 min</span>
              </>
            ) : (
              <span>Waiting for first sync...</span>
            )}
          </div>
          <button
            onClick={syncPositions}
            disabled={syncing}
            className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--primary)] disabled:opacity-50 transition-colors"
            title="Sync now"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/5 p-2.5 mt-1">
            <AlertCircle className="h-3.5 w-3.5 text-[var(--warning)] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-[var(--warning)] leading-relaxed">{error}</p>
              <button
                onClick={syncPositions}
                className="text-[10px] font-medium text-[var(--primary)] hover:underline mt-1"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Configured but not connected ───
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="h-5 w-5 text-[var(--primary)]" />
          <div>
            <p className="text-sm font-medium">Connect Saxo Bank</p>
            <p className="text-[10px] text-[var(--muted)]">
              {status.environment} environment · See real holdings
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="h-3 w-3" />
          Connect
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2 mt-3 text-xs text-[var(--warning)]">
          <AlertCircle className="h-3 w-3" /> {error}
        </div>
      )}
    </div>
  );
}
