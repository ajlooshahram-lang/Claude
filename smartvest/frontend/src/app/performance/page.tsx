'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Loader2, AlertCircle, Trophy,
  ArrowDown, Sparkles, LineChart, RefreshCw, Download, ToggleLeft, ToggleRight,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// User's positions (same as portfolio page — in production from DB)
const MY_POSITIONS = [
  { symbol: 'NOVO-B.CO', shares: 8, avg_cost: 290.00 },
  { symbol: 'AAPL', shares: 3, avg_cost: 260.00 },
  { symbol: 'KO', shares: 12, avg_cost: 58.50 },
  { symbol: 'JNJ', shares: 4, avg_cost: 235.00 },
  { symbol: 'AZN.L', shares: 6, avg_cost: 13200.00 },
  { symbol: '7203.T', shares: 30, avg_cost: 2550.00 },
];

interface StockPerf {
  symbol: string;
  name: string;
  currency: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  cost: number;
  value: number;
  gain_loss: number;
  gain_loss_pct: number;
}

interface HistoryPoint {
  date: string;
  value: number;
}

interface PerfData {
  total_cost: number;
  total_value: number;
  total_gain_loss: number;
  total_gain_loss_pct: number;
  stocks: StockPerf[];
  best: StockPerf | null;
  worst: StockPerf | null;
  history: HistoryPoint[];
  summary: { text: string; suggestion: string };
}


export default function PerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReal, setShowReal] = useState(false);
  const [inflation, setInflation] = useState<number>(2.1); // Default 2.1%

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${API_BASE}/api/performance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: MY_POSITIONS,
          risk_profile: 'moderate',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(`Could not calculate your performance. Make sure the backend is running.`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPerformance(); fetchInflation(); }, [fetchPerformance]);

  async function fetchInflation() {
    try {
      const res = await fetch(`${API_BASE}/api/inflation`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const d = await res.json();
        if (d.rate) setInflation(d.rate);
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-4" />
        <p className="text-sm text-[var(--muted)]">Calculating your performance...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-8 w-8 text-[var(--warning)] mb-4" />
        <p className="text-sm">{error || 'Failed to load'}</p>
        <button onClick={fetchPerformance} className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const isGain = data.total_gain_loss >= 0;

  // Inflation adjustment
  const inflationDrag = data.total_cost * (inflation / 100) * 0.25;
  const realGainLoss = data.total_gain_loss - inflationDrag;
  const realGainLossPct = data.total_cost > 0 ? (realGainLoss / data.total_cost) * 100 : 0;
  const displayGainLoss = showReal ? realGainLoss : data.total_gain_loss;
  const displayGainLossPct = showReal ? realGainLossPct : data.total_gain_loss_pct;
  const displayIsGain = displayGainLoss >= 0;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChart className="h-6 w-6 text-[var(--primary)]" />
            Performance Review
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            How your portfolio has performed since you started
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
          data-print-hide
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      {/* Nominal vs Real toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
        <div>
          <p className="text-xs font-medium">
            {showReal ? 'Inflation-Adjusted (Real) Returns' : 'Nominal Returns'}
          </p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">
            {showReal
              ? `Adjusted for ${inflation}% annual inflation — shows what your gains actually buy`
              : 'Raw numbers before accounting for inflation (the rising cost of everything)'
            }
          </p>
        </div>
        <button
          onClick={() => setShowReal(!showReal)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors ${
            showReal
              ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
              : 'bg-white/5 text-[var(--muted)] border border-[var(--card-border)]'
          }`}
        >
          {showReal ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          {showReal ? 'Real' : 'Nominal'}
        </button>
      </div>

      {showReal && (
        <p className="text-[11px] text-[var(--accent)] bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-lg px-4 py-2">
          If your portfolio gained 6% but inflation was {inflation}%, your purchasing power only grew by {(6 - inflation).toFixed(1)}% — the rest was eaten by rising prices.
        </p>
      )}

      {/* Total gain/loss card */}
      <div className={`rounded-xl border p-6 ${isGain ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' : 'border-[var(--loss)]/30 bg-[var(--loss)]/5'}`}>
        <p className="text-sm text-[var(--muted)]">{showReal ? 'Real Gain / Loss (after inflation)' : 'Total Gain / Loss'}</p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className={`text-4xl font-bold font-tabular ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {isGain ? '+' : ''}{data.total_gain_loss.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </span>
          <span className={`text-lg font-semibold ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            ({isGain ? '+' : ''}{data.total_gain_loss_pct.toFixed(2)}%)
          </span>
        </div>
        <div className="flex gap-6 mt-3 text-xs text-[var(--muted)]">
          <span>Invested: {data.total_cost.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
          <span>Current: {data.total_value.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
          {showReal && <span className="text-[var(--accent)]">Inflation drag: -{Math.round(inflationDrag).toLocaleString()}</span>}
        </div>
      </div>


      {/* Line chart (visual) */}
      {data.history.length >= 2 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="text-sm font-semibold mb-4">Portfolio Value Over Time</h2>
          <div className="space-y-1">
            {data.history.map((point, i) => {
              const maxVal = Math.max(...data.history.map(p => p.value));
              const minVal = Math.min(...data.history.map(p => p.value));
              const range = maxVal - minVal || 1;
              const barPct = ((point.value - minVal) / range) * 100;
              const isLast = i === data.history.length - 1;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--muted)] w-16 text-right truncate">{point.date}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isLast ? 'bg-[var(--primary)]' : 'bg-[var(--primary)]/60'}`}
                      style={{ width: `${Math.max(barPct, 5)}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-tabular w-14 text-right ${isLast ? 'font-bold text-[var(--foreground)]' : 'text-[var(--muted)]'}`}>
                    {point.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Best & Worst */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.best && (
          <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-[var(--gain)]" />
              <span className="text-xs font-semibold text-[var(--gain)]">Best Performer</span>
            </div>
            <p className="font-semibold">{data.best.name}</p>
            <p className="text-xs text-[var(--muted)]">{data.best.symbol}</p>
            <p className="text-2xl font-bold text-[var(--gain)] mt-2 font-tabular">
              +{data.best.gain_loss_pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--muted)] mt-1">
              +{data.best.gain_loss.toLocaleString(undefined, { minimumFractionDigits: 0 })} {data.best.currency}
            </p>
          </div>
        )}
        {data.worst && (
          <div className="rounded-xl border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDown className="h-4 w-4 text-[var(--loss)]" />
              <span className="text-xs font-semibold text-[var(--loss)]">Weakest Performer</span>
            </div>
            <p className="font-semibold">{data.worst.name}</p>
            <p className="text-xs text-[var(--muted)]">{data.worst.symbol}</p>
            <p className={`text-2xl font-bold mt-2 font-tabular ${data.worst.gain_loss_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {data.worst.gain_loss_pct >= 0 ? '+' : ''}{data.worst.gain_loss_pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--muted)] mt-1">
              {data.worst.gain_loss >= 0 ? '+' : ''}{data.worst.gain_loss.toLocaleString(undefined, { minimumFractionDigits: 0 })} {data.worst.currency}
            </p>
          </div>
        )}
      </div>


      {/* AI Summary */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" />
          AI Summary
        </h2>
        <p className="text-sm leading-relaxed text-[var(--foreground)]/80">
          {data.summary.text}
        </p>
        <div className="mt-4 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--primary)] mb-1">💡 Suggestion</p>
          <p className="text-xs text-[var(--foreground)]/70 leading-relaxed">
            {data.summary.suggestion}
          </p>
        </div>
      </div>

      {/* Per-stock table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-semibold">All Holdings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-black/20 text-[10px] text-[var(--muted)] uppercase">
                <th className="px-4 py-2 text-left">Stock</th>
                <th className="px-4 py-2 text-right">Shares</th>
                <th className="px-4 py-2 text-right">Avg Cost</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Gain/Loss</th>
                <th className="px-4 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {data.stocks.map((s) => (
                <tr key={s.symbol} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <p className="font-medium">{s.symbol}</p>
                    <p className="text-[9px] text-[var(--muted)]">{s.name}</p>
                  </td>
                  <td className="px-4 py-2 text-right font-tabular">{s.shares}</td>
                  <td className="px-4 py-2 text-right font-tabular">{s.avg_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-tabular">{s.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-2 text-right font-tabular ${s.gain_loss >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                    {s.gain_loss >= 0 ? '+' : ''}{s.gain_loss.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </td>
                  <td className={`px-4 py-2 text-right font-tabular font-medium ${s.gain_loss_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                    {s.gain_loss_pct >= 0 ? '+' : ''}{s.gain_loss_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--muted)] text-center">
        Past performance does not guarantee future results. This is a tracking tool for educational purposes.
      </p>
    </div>
  );
}
