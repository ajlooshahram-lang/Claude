'use client';

import { useState } from 'react';
import {
  FlaskConical, Loader2, TrendingUp, TrendingDown, AlertCircle,
  Trophy, Target,
} from 'lucide-react';
import { getWatchlist } from '@/lib/watchlist';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface BacktestResult {
  symbol: string;
  name: string;
  currency: string;
  period_months: number;
  start_date: string;
  end_date: string;
  data_points: number;
  strategy: {
    name: string;
    final_value: number;
    return: number;
    return_pct: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    biggest_gain: number;
    biggest_loss: number;
    max_position_pct: number;
  };
  buy_and_hold: {
    name: string;
    final_value: number;
    return: number;
    return_pct: number;
    start_price: number;
    end_price: number;
  };
  comparison: {
    strategy_beats_bah: boolean;
    difference_pct: number;
  };
  trades: Array<{
    type: string;
    date: string;
    price: number;
    shares: number;
    gain_loss?: number;
    gain_loss_pct?: number;
    trend_pct: number;
  }>;
  error?: string;
}

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('');
  const [months, setMonths] = useState(12);
  const [budget, setBudget] = useState(10000);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchlist = getWatchlist();

  async function runBacktest() {
    if (!symbol.trim()) { setError('Please enter a stock symbol.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          budget,
          max_position_pct: 20,
          period_months: months,
          trend_window: 14,
          buy_threshold: 2.0,
          sell_threshold: -2.0,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setResult(data); }
    } catch {
      setError('Could not run the backtest. Make sure the backend is running and the stock symbol is valid.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-[var(--primary)]" />
          Backtest
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Test a trend-following strategy on real historical prices
        </p>
      </div>

      {/* Strategy explanation */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-xs text-[var(--foreground)]/70 leading-relaxed">
        <strong>Strategy:</strong> Buy when the 14-day price trend turns green ({'>'}+2%).
        Sell when it turns red ({'<'}-2%). Never invest more than 20% of your budget in one trade.
        This tests what would have happened if you followed your traffic light signals mechanically.
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-[10px] text-[var(--muted)] block mb-2">Stock Symbol</label>
          {watchlist.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {watchlist.slice(0, 6).map(w => (
                <button key={w.symbol} onClick={() => setSymbol(w.symbol)}
                  className={`rounded border px-1.5 py-0.5 text-[9px] ${symbol === w.symbol ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--card-border)] text-[var(--muted)]'}`}>
                  {w.symbol}
                </button>
              ))}
            </div>
          )}
          <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]" />
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-[10px] text-[var(--muted)] block mb-2">Period (months back)</label>
          <input type="range" min={3} max={24} value={months} onChange={e => setMonths(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          <div className="flex justify-between text-[9px] text-[var(--muted)] mt-1">
            <span>3mo</span><span className="font-medium text-[var(--foreground)]">{months} months</span><span>24mo</span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-[10px] text-[var(--muted)] block mb-2">Starting Budget</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-tabular outline-none focus:border-[var(--primary)]" min={1000} step={1000} />
        </div>
      </div>

      <button onClick={runBacktest} disabled={loading || !symbol.trim()}
        className="w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Running simulation...</> : <><FlaskConical className="h-4 w-4" /> Run Backtest</>}
      </button>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {result && <BacktestResults data={result} budget={budget} />}
    </div>
  );
}


function BacktestResults({ data, budget }: { data: BacktestResult; budget: number }) {
  const s = data.strategy;
  const b = data.buy_and_hold;
  const strategyWins = data.comparison.strategy_beats_bah;

  return (
    <div className="space-y-5">
      {/* Head-to-head */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border p-5 ${strategyWins ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>
          <div className="flex items-center gap-2 mb-2">
            {strategyWins && <Trophy className="h-4 w-4 text-[var(--gain)]" />}
            <p className="text-xs font-semibold">{s.name}</p>
          </div>
          <p className={`text-2xl font-bold font-tabular ${s.return >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {s.return >= 0 ? '+' : ''}{s.return_pct.toFixed(2)}%
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {data.currency} {s.final_value.toLocaleString('en-US', {minimumFractionDigits: 0})} final
          </p>
        </div>
        <div className={`rounded-xl border p-5 ${!strategyWins ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>
          <div className="flex items-center gap-2 mb-2">
            {!strategyWins && <Trophy className="h-4 w-4 text-[var(--gain)]" />}
            <p className="text-xs font-semibold">{b.name}</p>
          </div>
          <p className={`text-2xl font-bold font-tabular ${b.return >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {b.return >= 0 ? '+' : ''}{b.return_pct.toFixed(2)}%
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {data.currency} {b.final_value.toLocaleString('en-US', {minimumFractionDigits: 0})} final
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div className={`rounded-lg border px-4 py-3 text-xs ${strategyWins ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5 text-[var(--gain)]' : 'border-[var(--loss)]/20 bg-[var(--loss)]/5 text-[var(--loss)]'}`}>
        {strategyWins
          ? `The trend strategy beat buy-and-hold by ${data.comparison.difference_pct.toFixed(2)}% over ${data.period_months} months.`
          : `Buy-and-hold beat the trend strategy by ${Math.abs(data.comparison.difference_pct).toFixed(2)}%. Simpler was better this time.`
        }
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Trades" value={s.total_trades.toString()} />
        <StatBox label="Win Rate" value={`${s.win_rate}%`} />
        <StatBox label="Biggest Win" value={`+${s.biggest_gain.toLocaleString()}`} color="gain" />
        <StatBox label="Biggest Loss" value={s.biggest_loss.toLocaleString()} color="loss" />
      </div>

      {/* Trade log */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)]">
          <p className="text-sm font-semibold">Trade Log</p>
        </div>
        <div className="divide-y divide-[var(--card-border)] max-h-64 overflow-y-auto">
          {data.trades.map((t, i) => {
            const isBuy = t.type === 'buy';
            return (
              <div key={i} className="flex items-center justify-between px-5 py-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${isBuy ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'}`}>
                    {isBuy ? 'BUY' : 'SELL'}
                  </span>
                  <span className="text-[var(--muted)]">{t.date}</span>
                  <span className="font-tabular">@ {t.price}</span>
                </div>
                {t.gain_loss !== undefined && (
                  <span className={`font-tabular font-medium ${(t.gain_loss || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                    {(t.gain_loss || 0) >= 0 ? '+' : ''}{t.gain_loss_pct?.toFixed(1)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-[10px] text-[var(--muted)] leading-relaxed space-y-1">
        <p><strong>Period:</strong> {data.start_date} to {data.end_date} ({data.data_points} trading days)</p>
        <p><strong>Budget:</strong> {data.currency} {budget.toLocaleString()} · Max position: {s.max_position_pct}%</p>
        <p><strong>Note:</strong> Past performance does not predict future results. This backtest uses perfect hindsight — real trading involves delays, emotions, and costs not captured here.</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: 'gain' | 'loss' }) {
  const textColor = color === 'gain' ? 'text-[var(--gain)]' : color === 'loss' ? 'text-[var(--loss)]' : '';
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
      <p className="text-[9px] text-[var(--muted)] uppercase">{label}</p>
      <p className={`text-sm font-bold font-tabular mt-0.5 ${textColor}`}>{value}</p>
    </div>
  );
}
