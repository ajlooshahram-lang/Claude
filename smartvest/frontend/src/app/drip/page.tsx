'use client';

import { useState } from 'react';
import {
  Repeat, Loader2, TrendingUp, DollarSign, Info,
  BarChart3, ArrowRight, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface YearData {
  year: number;
  reinvest_value: number;
  reinvest_shares: number;
  reinvest_dividends_earned: number;
  cash_value: number;
  cash_shares: number;
  cash_dividends_taken: number;
  gap_usd: number;
  gap_pct: number;
}

interface DripResult {
  symbol: string;
  name: string;
  current_price: number;
  dividend_yield: number;
  annual_dividend_per_share: number;
  initial_shares: number;
  monthly_contribution: number;
  yearly_data: YearData[];
  summary_5y: { reinvest: number; cash: number; gap: number; gap_pct: number };
  summary_10y: { reinvest: number; cash: number; gap: number; gap_pct: number };
  summary_20y: { reinvest: number; cash: number; gap: number; gap_pct: number };
  summary_30y: { reinvest: number; cash: number; gap: number; gap_pct: number };
  explanation: string;
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}


export default function DripPage() {
  const [symbol, setSymbol] = useState('SCHD');
  const [shares, setShares] = useState(50);
  const [monthly, setMonthly] = useState(500);
  const [priceGrowth, setPriceGrowth] = useState(7);
  const [result, setResult] = useState<DripResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function simulate() {
    if (!symbol.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/drip/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          initial_shares: shares,
          monthly_contribution: monthly,
          price_growth_pct: priceGrowth,
          years: 30,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch {}
    setLoading(false);
  }

  // Chart scaling
  const maxVal = result ? Math.max(...result.yearly_data.map(d => d.reinvest_value)) : 100;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-500/10">
          <Repeat className="h-5 w-5 text-lime-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Dividend Reinvestment Simulator</h1>
          <p className="text-xs text-[var(--muted)]">
            See how reinvesting dividends compounds your wealth over decades
          </p>
        </div>
      </div>

      {/* Explainer */}
      <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          When a stock pays a dividend, you have two choices: take the cash, or buy more shares.
          Reinvesting dividends means your dividends earn dividends, which earn more dividends.
          This is <strong>compound growth</strong> — and over long periods, the difference is enormous.
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-sm font-semibold">Settings</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--muted)]">Stock / ETF Symbol</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {['SCHD', 'VYM', 'VIG', 'KO', 'JNJ', 'PG', 'O', 'JEPI'].map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                  className={`rounded px-2 py-0.5 text-[10px] border ${symbol === s ? 'border-lime-500/50 bg-lime-500/10 text-lime-400' : 'border-[var(--card-border)] text-[var(--muted)]'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted)]">Starting Shares</label>
            <input type="number" value={shares} onChange={e => setShares(Math.max(1, Number(e.target.value)))}
              className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs text-[var(--muted)]">Monthly Contribution ($)</label>
            <input type="number" value={monthly} onChange={e => setMonthly(Math.max(0, Number(e.target.value)))}
              className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs text-[var(--muted)]">Expected Price Growth (%/year)</label>
            <input type="number" value={priceGrowth} onChange={e => setPriceGrowth(Number(e.target.value))}
              className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </div>
        </div>

        <button onClick={simulate} disabled={loading}
          className="w-full rounded-xl bg-lime-500 py-3 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
          Simulate 30 Years
        </button>
      </div>


      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Stock Info */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div>
              <p className="text-sm font-bold">{result.symbol}</p>
              <p className="text-[10px] text-[var(--muted)]">{result.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold font-tabular">${result.current_price.toFixed(2)}</p>
              <p className="text-[10px] text-lime-400">{result.dividend_yield.toFixed(2)}% yield · ${result.annual_dividend_per_share.toFixed(2)}/share/year</p>
            </div>
          </div>

          {/* Milestone Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: '5 Years', data: result.summary_5y },
              { label: '10 Years', data: result.summary_10y },
              { label: '20 Years', data: result.summary_20y },
              { label: '30 Years', data: result.summary_30y },
            ]).map(m => (
              <div key={m.label} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 space-y-2">
                <p className="text-[10px] text-[var(--muted)] text-center">{m.label}</p>
                <div className="text-center">
                  <p className="text-xs font-bold font-tabular text-lime-400">{formatUSD(m.data.reinvest)}</p>
                  <p className="text-[9px] text-[var(--muted)]">reinvested</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-tabular text-[var(--muted)]">{formatUSD(m.data.cash)}</p>
                  <p className="text-[9px] text-[var(--muted)]">cash out</p>
                </div>
                <div className="text-center border-t border-[var(--card-border)] pt-1.5">
                  <p className="text-[10px] font-bold text-[var(--gain)]">+{formatUSD(m.data.gap)}</p>
                  <p className="text-[8px] text-[var(--muted)]">DRIP advantage ({m.data.gap_pct.toFixed(0)}% more)</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-lime-400" />
              <p className="text-sm font-semibold">Reinvest vs Cash Out (30 Years)</p>
            </div>

            <div className="relative h-52 w-full">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Reinvest line */}
                <polyline
                  fill="none" stroke="rgb(132, 204, 22)" strokeWidth="0.8"
                  points={result.yearly_data.map((d, i) =>
                    `${(i / 30) * 100},${100 - (d.reinvest_value / maxVal * 85 + 5)}`
                  ).join(' ')}
                />
                {/* Cash line */}
                <polyline
                  fill="none" stroke="rgb(148, 163, 184)" strokeWidth="0.5" strokeDasharray="2,1"
                  points={result.yearly_data.map((d, i) =>
                    `${(i / 30) * 100},${100 - (d.cash_value / maxVal * 85 + 5)}`
                  ).join(' ')}
                />
                {/* Gap fill area */}
                <polygon
                  fill="rgb(132, 204, 22)" fillOpacity="0.08"
                  points={[
                    ...result.yearly_data.map((d, i) => `${(i / 30) * 100},${100 - (d.reinvest_value / maxVal * 85 + 5)}`),
                    ...result.yearly_data.map((d, i) => `${((30 - i) / 30) * 100},${100 - (result.yearly_data[30 - i]?.cash_value || d.cash_value) / maxVal * 85 - 5}`).reverse(),
                  ].join(' ')}
                />
              </svg>

              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 text-[8px] text-[var(--muted)]">{formatUSD(maxVal)}</div>
              <div className="absolute left-0 bottom-0 text-[8px] text-[var(--muted)]">$0</div>
            </div>

            {/* X-axis */}
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>Year 0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span>
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-6">
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-lime-500 rounded" />Dividends Reinvested</span>
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-slate-400 rounded border-dashed" />Dividends Taken as Cash</span>
            </div>
          </div>

          {/* Plain English Explanation */}
          <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-lime-400" />
              <p className="text-sm font-semibold text-lime-400">Why the Gap Grows So Fast</p>
            </div>
            <p className="text-xs leading-relaxed">{result.explanation}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Simulation assumes constant dividend yield and price growth. Real results will vary. Not financial advice.
      </p>
    </div>
  );
}
