'use client';

import { useState, useEffect } from 'react';
import {
  GitCompare, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  RefreshCw, ArrowRight, Info, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Opportunity {
  stock_a: string; stock_b: string; correlation: number; current_zscore: number;
  divergence_pct: number; mean_ratio: number; current_ratio: number;
  days_diverged: number; avg_reversion_days: number;
  overvalued_stock: string; undervalued_stock: string; action: string;
  signal_strength: string; price_a: number; price_b: number;
}
interface PairsData { pairs_scanned: number; opportunities_found: number; opportunities: Opportunity[]; explanation: string; }

function getWatchlist(): string[] {
  try {
    const stored = localStorage.getItem('smartvest_watchlist');
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : parsed.map((s: any) => s.symbol || s);
  } catch { return []; }
}

export default function PairsPage() {
  const [data, setData] = useState<PairsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { scan(); }, []);

  async function scan() {
    setLoading(true);
    const symbols = getWatchlist();
    try {
      const res = await fetch(`${API_BASE}/api/pairs/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, include_known_pairs: true, zscore_threshold: 1.8 }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <GitCompare className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pairs Trading Detector</h1>
            <p className="text-xs text-[var(--muted)]">Find correlated stocks that have diverged from their normal relationship</p>
          </div>
        </div>
        <button onClick={scan} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Concept Explanation */}
      {data && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-violet-400" />
            <p className="text-xs font-semibold text-violet-400">What is Pairs Trading?</p>
          </div>
          <p className="text-xs text-[var(--muted)] leading-relaxed">{data.explanation}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Scanning pairs...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>{data.pairs_scanned} pairs scanned</span>
            <span>{data.opportunities_found} opportunities found</span>
          </div>

          {data.opportunities.length === 0 && (
            <div className="text-center py-12">
              <GitCompare className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
              <p className="text-sm text-[var(--muted)]">No significant divergences found right now. Check back later.</p>
            </div>
          )}

          {data.opportunities.map((opp, i) => (
            <div key={i} className={`rounded-xl border bg-[var(--card)] p-5 space-y-4 ${
              opp.signal_strength === 'strong' ? 'border-violet-500/30' : 'border-[var(--card-border)]'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">{opp.stock_a}</span>
                    <GitCompare className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-sm font-bold">{opp.stock_b}</span>
                  </div>
                  {opp.signal_strength === 'strong' && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-bold text-violet-400">STRONG</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--muted)]">Correlation</p>
                  <p className="text-sm font-bold font-tabular">{opp.correlation.toFixed(2)}</p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Z-Score</p>
                  <p className={`text-sm font-bold font-tabular ${Math.abs(opp.current_zscore) > 2.5 ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`}>
                    {opp.current_zscore > 0 ? '+' : ''}{opp.current_zscore.toFixed(2)}σ
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Divergence</p>
                  <p className="text-sm font-bold font-tabular">{opp.divergence_pct > 0 ? '+' : ''}{opp.divergence_pct.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Days Diverged</p>
                  <p className="text-sm font-bold font-tabular">{opp.days_diverged}</p>
                </div>
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Avg Reversion</p>
                  <p className="text-sm font-bold font-tabular">{opp.avg_reversion_days} days</p>
                </div>
              </div>

              {/* Action */}
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" />
                  <p className="text-xs font-semibold text-violet-400">Signal</p>
                </div>
                <p className="text-xs leading-relaxed">{opp.action}</p>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--muted)]">
                  <span className="text-[var(--loss)]">Overvalued: {opp.overvalued_stock} (${opp.overvalued_stock === opp.stock_a ? opp.price_a : opp.price_b})</span>
                  <span className="text-[var(--gain)]">Undervalued: {opp.undervalued_stock} (${opp.undervalued_stock === opp.stock_a ? opp.price_a : opp.price_b})</span>
                </div>
              </div>

              {/* Explanation */}
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                These stocks normally maintain a price ratio of {opp.mean_ratio.toFixed(3)} (current: {opp.current_ratio.toFixed(3)}).
                The {opp.divergence_pct > 0 ? 'higher' : 'lower'} ratio today ({opp.days_diverged} days) exceeds {Math.abs(opp.current_zscore).toFixed(1)} standard deviations from normal.
                Historically, similar divergences have reverted within ~{opp.avg_reversion_days} days.
                The risk: the relationship may have permanently changed (structural break).
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Pairs trading involves significant risk. Historical correlation does not guarantee future correlation. Not financial advice.
      </p>
    </div>
  );
}
