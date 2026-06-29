'use client';

import { useState, useEffect } from 'react';
import {
  Activity, Loader2, AlertTriangle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { getWatchlist } from '@/lib/watchlist';
import { LearningTip } from '@/components/learning-tip';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface FlowResult {
  symbol: string;
  name: string;
  institutional_ownership_pct: number | null;
  institutional_holders_count: number | null;
  avg_volume_30d: number;
  recent_volume_ratio: number;
  volume_trend: string;
  obv_signal: string;
  obv_explanation: string;
  net_flow: string;
  flow_strength: number;
  warning: string | null;
  weekly_flow: { week: number; volume_ratio: number; direction: string }[];
}

export default function MoneyFlowPage() {
  const [results, setResults] = useState<FlowResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const watchlist = getWatchlist();
    if (watchlist.length === 0) { setLoading(false); return; }

    fetch(`${API_BASE}/api/money-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: watchlist.map(w => w.symbol) }),
      signal: AbortSignal.timeout(45000),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setResults(data.results || []); })
      .catch(() => setError('Could not load money flow data. Try again later.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-[var(--primary)]" />
          Institutional Money Flow
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Are the big players buying or selling your watchlist stocks?
        </p>
      </div>

      <LearningTip
        tipId="moneyflow_what_it_means"
        title="💡 What institutional money flow means for you"
        text="When large investors (hedge funds, pension funds, ETFs) are buying a stock, it often rises over the following weeks because their orders are so large they move the price. When they're selling — especially if the price hasn't dropped yet — it can be an early warning that bad news is coming. You can't beat them to the trade, but you can avoid being the last one holding when they leave."
      />

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Analyzing volume patterns...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-[var(--muted)]">
          Add stocks to your <a href="/watchlist" className="text-[var(--primary)] hover:underline">watchlist</a> to see their money flow.
        </div>
      )}

      {results.map(r => <FlowCard key={r.symbol} data={r} />)}
    </div>
  );
}

function FlowCard({ data: r }: { data: FlowResult }) {
  const flowConfig = {
    net_buying: { label: 'Net Buying', color: 'text-[var(--gain)]', icon: <TrendingUp className="h-4 w-4" /> },
    net_selling: { label: 'Net Selling', color: 'text-[var(--loss)]', icon: <TrendingDown className="h-4 w-4" /> },
    neutral: { label: 'Neutral', color: 'text-[var(--muted)]', icon: <Minus className="h-4 w-4" /> },
  };
  const fc = flowConfig[r.net_flow as keyof typeof flowConfig] || flowConfig.neutral;

  return (
    <div className={`rounded-xl border bg-[var(--card)] overflow-hidden ${r.warning ? 'border-[var(--loss)]/30' : 'border-[var(--card-border)]'}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{r.symbol}</p>
            <p className="text-xs text-[var(--muted)]">{r.name}</p>
          </div>
          {r.institutional_ownership_pct && (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              {r.institutional_ownership_pct}% institutional ownership
              {r.institutional_holders_count ? ` · ${r.institutional_holders_count} holders` : ''}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 ${fc.color}`}>
          {fc.icon}
          <span className="text-xs font-bold">{fc.label}</span>
          <span className="text-[10px] opacity-70">({r.flow_strength.toFixed(0)}%)</span>
        </div>
      </div>

      {/* Warning */}
      {r.warning && (
        <div className="px-5 py-3 bg-[var(--loss)]/5 border-b border-[var(--loss)]/20 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--loss)] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--loss)] leading-relaxed">{r.warning}</p>
        </div>
      )}

      {/* Weekly volume bars */}
      <div className="px-5 py-4">
        <p className="text-[10px] text-[var(--muted)] mb-2">Volume vs 30-day average (last 5 weeks):</p>
        <div className="flex items-end gap-1.5 h-16">
          {r.weekly_flow.map((w) => {
            const height = Math.min(100, w.volume_ratio * 50);
            const color = w.direction === 'up' ? 'bg-[var(--gain)]' : 'bg-[var(--loss)]';
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t" style={{ height: `${height}%` }}>
                  <div className={`w-full h-full rounded-t ${color}`} />
                </div>
                <span className="text-[8px] text-[var(--muted)] mt-1">W{w.week}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[8px] text-[var(--muted)]">
          <span>Green = price up that week · Red = price down</span>
          <span>Taller = more volume</span>
        </div>
      </div>

      {/* OBV explanation */}
      <div className="px-5 py-3 border-t border-[var(--card-border)]">
        <p className="text-[11px] text-[var(--foreground)]/70 leading-relaxed">
          <strong>Signal:</strong> {r.obv_explanation}
        </p>
      </div>
    </div>
  );
}
