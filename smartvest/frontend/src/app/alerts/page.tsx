'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Trash2, Loader2, TrendingUp, TrendingDown,
  CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  getAlerts, removeAlert, triggerAlert, checkAlertTriggered,
  PriceAlert, AlertStatus,
} from '@/lib/alerts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState('');
  const [triggered, setTriggered] = useState<string[]>([]);

  useEffect(() => {
    setAlerts(getAlerts());
  }, []);

  // Check all active alerts against live prices
  const checkPrices = useCallback(async () => {
    const currentAlerts = getAlerts();
    const active = currentAlerts.filter(a => a.status === 'active');
    if (active.length === 0) return;

    setChecking(true);
    const newlyTriggered: string[] = [];

    for (const alert of active) {
      try {
        const res = await fetch(`${API_BASE}/api/quote/${alert.symbol}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const currentPrice = data.current_price;

        if (checkAlertTriggered(alert, currentPrice)) {
          triggerAlert(alert.id);
          newlyTriggered.push(alert.id);
        }
      } catch {
        // Skip failed fetches
      }
    }

    setAlerts(getAlerts());
    setTriggered(newlyTriggered);
    setLastChecked(new Date().toLocaleTimeString('en-DK', { hour: '2-digit', minute: '2-digit' }));
    setChecking(false);
  }, []);

  useEffect(() => {
    checkPrices();
  }, [checkPrices]);

  function handleRemove(id: string) {
    removeAlert(id);
    setAlerts(getAlerts());
  }

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const triggeredAlerts = alerts.filter(a => a.status === 'triggered');

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-[var(--primary)]" />
          Price Alerts
        </h1>
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Bell className="h-8 w-8 text-[var(--muted)]" />
          </div>
          <h2 className="text-lg font-semibold">No alerts set</h2>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-sm">
            Go to your <a href="/watchlist" className="text-[var(--primary)] hover:underline">Watchlist</a> and click &quot;Set alert&quot; on any stock to get notified when it hits your target price.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-[var(--primary)]" />
            Price Alerts
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {activeAlerts.length} active · {triggeredAlerts.length} triggered
          </p>
        </div>
        <button
          onClick={checkPrices}
          disabled={checking}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking...' : 'Check now'}
        </button>
      </div>

      {lastChecked && (
        <p className="text-[10px] text-[var(--muted)]">Last checked: {lastChecked}</p>
      )}

      {/* Newly triggered notification */}
      {triggered.length > 0 && (
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-[var(--gain)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--gain)]">
              {triggered.length} alert{triggered.length > 1 ? 's' : ''} triggered!
            </p>
            <p className="text-xs text-[var(--foreground)]/70 mt-0.5">
              The price has reached your target. Check the details below.
            </p>
          </div>
        </div>
      )}


      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)]">
            <h2 className="text-sm font-semibold">Active Alerts</h2>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {activeAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onRemove={handleRemove} />
            ))}
          </div>
        </div>
      )}

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)]">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--gain)]" />
              Triggered
            </h2>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {triggeredAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onRemove={handleRemove} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Alert Row Component ─────────────────────────────────────────────────────

function AlertRow({ alert, onRemove }: { alert: PriceAlert; onRemove: (id: string) => void }) {
  const isTriggered = alert.status === 'triggered';
  const isAbove = alert.direction === 'above';

  return (
    <div className={`flex items-center gap-4 px-5 py-4 ${isTriggered ? 'bg-[var(--gain)]/5' : ''}`}>
      {/* Icon */}
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
        isTriggered
          ? 'bg-[var(--gain)]/10'
          : isAbove ? 'bg-[var(--primary)]/10' : 'bg-[var(--warning)]/10'
      }`}>
        {isTriggered
          ? <CheckCircle2 className="h-5 w-5 text-[var(--gain)]" />
          : isAbove ? <TrendingUp className="h-5 w-5 text-[var(--primary)]" /> : <TrendingDown className="h-5 w-5 text-[var(--warning)]" />
        }
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{alert.symbol}</p>
          <p className="text-xs text-[var(--muted)] truncate">{alert.name}</p>
          {isTriggered && (
            <span className="rounded-full bg-[var(--gain)]/10 px-2 py-0.5 text-[9px] font-medium text-[var(--gain)]">
              TRIGGERED
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Notify when price goes <span className="font-medium text-[var(--foreground)]">{alert.direction}</span>{' '}
          <span className="font-bold text-[var(--foreground)] font-tabular">{alert.currency} {alert.targetPrice.toFixed(2)}</span>
        </p>
        <p className="text-[9px] text-[var(--muted)] mt-0.5">
          Set when price was {alert.currency} {alert.priceWhenSet.toFixed(2)} · {new Date(alert.createdAt).toLocaleDateString()}
          {alert.triggeredAt && ` · Triggered ${new Date(alert.triggeredAt).toLocaleDateString()}`}
        </p>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(alert.id)}
        className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/5 transition-colors flex-shrink-0"
        title="Delete alert"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
