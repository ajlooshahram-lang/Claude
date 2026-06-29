'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Info, RefreshCw, Target, Shield,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface FanPoint { week: number; p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number; }
interface MCResult {
  portfolio_value: number; months: number; simulations: number; holdings_analyzed: number;
  portfolio_volatility_annual: number; portfolio_mean_return_annual: number; avg_correlation: number;
  probabilities: { gain_10_pct: number; gain_20_pct: number; loss_10_pct: number; loss_20_pct: number; loss_30_pct: number; };
  percentiles: { p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number; };
  returns: { median_pct: number; worst_5_pct: number; best_5_pct: number; };
  fan_chart: FanPoint[];
  summary: string;
}

function getPortfolio() {
  try {
    const orders = JSON.parse(localStorage.getItem('smartvest_orders') || '[]');
    const map: Record<string, { shares: number; totalCost: number }> = {};
    for (const o of orders) {
      if (o.type === 'buy') {
        if (!map[o.symbol]) map[o.symbol] = { shares: 0, totalCost: 0 };
        map[o.symbol].shares += o.shares;
        map[o.symbol].totalCost += o.shares * o.price;
      } else if (o.type === 'sell' && map[o.symbol]) map[o.symbol].shares -= o.shares;
    }
    return Object.entries(map).filter(([,v]) => v.shares > 0)
      .map(([symbol, v]) => ({ symbol, shares: v.shares, current_value: 0 }));
  } catch { return []; }
}


export default function MonteCarloPage() {
  const [result, setResult] = useState<MCResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSimulation() {
    setLoading(true);
    setResult(null);
    const holdings = getPortfolio();
    const useHoldings = holdings.length > 0 ? holdings : [
      { symbol: 'AAPL', shares: 15, current_value: 0 },
      { symbol: 'MSFT', shares: 10, current_value: 0 },
      { symbol: 'NVDA', shares: 5, current_value: 0 },
      { symbol: 'VOO', shares: 20, current_value: 0 },
      { symbol: 'JNJ', shares: 12, current_value: 0 },
    ];
    try {
      const res = await fetch(`${API_BASE}/api/montecarlo/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: useHoldings, months: 12 }),
      });
      if (res.ok) setResult(await res.json());
    } catch {}
    setLoading(false);
  }

  const chartMin = result ? Math.min(...result.fan_chart.map(p => p.p5)) * 0.95 : 0;
  const chartMax = result ? Math.max(...result.fan_chart.map(p => p.p95)) * 1.05 : 0;
  const chartRange = chartMax - chartMin || 1;
  function getY(val: number) { return 100 - ((val - chartMin) / chartRange * 85 + 7.5); }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/10">
          <Sparkles className="h-5 w-5 text-fuchsia-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Monte Carlo Simulation</h1>
          <p className="text-xs text-[var(--muted)]">10,000 simulated futures for your portfolio</p>
        </div>
      </div>

      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          This runs 10,000 random simulations of your portfolio over the next 12 months, using each
          stock's real historical volatility. It shows the <strong>range of possible outcomes</strong> —
          not a prediction, but a map of what could happen based on how your stocks have behaved in the past.
        </p>
      </div>

      {!result && !loading && (
        <div className="text-center py-12">
          <button onClick={runSimulation} className="rounded-xl bg-fuchsia-500 px-8 py-3.5 text-sm font-semibold text-white hover:bg-fuchsia-600">
            <Sparkles className="inline h-4 w-4 mr-2" />Run 10,000 Simulations
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Running 10,000 simulations...</span>
        </div>
      )}


      {result && (
        <div className="space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Median Outcome</p>
              <p className={`text-sm font-bold font-tabular ${result.returns.median_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {result.returns.median_pct >= 0 ? '+' : ''}{result.returns.median_pct}%
              </p>
              <p className="text-[9px] text-[var(--muted)]">${result.percentiles.p50.toLocaleString('en-US', {maximumFractionDigits:0})}</p>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Worst 5%</p>
              <p className="text-sm font-bold font-tabular text-[var(--loss)]">{result.returns.worst_5_pct}%</p>
              <p className="text-[9px] text-[var(--muted)]">${result.percentiles.p5.toLocaleString('en-US', {maximumFractionDigits:0})}</p>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Best 5%</p>
              <p className="text-sm font-bold font-tabular text-[var(--gain)]">+{result.returns.best_5_pct}%</p>
              <p className="text-[9px] text-[var(--muted)]">${result.percentiles.p95.toLocaleString('en-US', {maximumFractionDigits:0})}</p>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Volatility</p>
              <p className="text-sm font-bold font-tabular">{result.portfolio_volatility_annual}%</p>
              <p className="text-[9px] text-[var(--muted)]">annual</p>
            </div>
          </div>

          {/* Fan Chart */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-fuchsia-400" />
              <p className="text-sm font-semibold">Range of Possible Futures (12 months)</p>
            </div>
            <div className="relative h-52 w-full">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* P5-P95 band (lightest) */}
                <polygon fill="rgb(232, 121, 249)" fillOpacity="0.08"
                  points={[
                    ...result.fan_chart.map((p, i) => `${(i / (result.fan_chart.length - 1)) * 100},${getY(p.p95)}`),
                    ...result.fan_chart.slice().reverse().map((p, i) => `${((result.fan_chart.length - 1 - i) / (result.fan_chart.length - 1)) * 100},${getY(p.p5)}`),
                  ].join(' ')} />
                {/* P10-P90 band */}
                <polygon fill="rgb(232, 121, 249)" fillOpacity="0.12"
                  points={[
                    ...result.fan_chart.map((p, i) => `${(i / (result.fan_chart.length - 1)) * 100},${getY(p.p90)}`),
                    ...result.fan_chart.slice().reverse().map((p, i) => `${((result.fan_chart.length - 1 - i) / (result.fan_chart.length - 1)) * 100},${getY(p.p10)}`),
                  ].join(' ')} />
                {/* P25-P75 band */}
                <polygon fill="rgb(232, 121, 249)" fillOpacity="0.2"
                  points={[
                    ...result.fan_chart.map((p, i) => `${(i / (result.fan_chart.length - 1)) * 100},${getY(p.p75)}`),
                    ...result.fan_chart.slice().reverse().map((p, i) => `${((result.fan_chart.length - 1 - i) / (result.fan_chart.length - 1)) * 100},${getY(p.p25)}`),
                  ].join(' ')} />
                {/* Median line */}
                <polyline fill="none" stroke="rgb(232, 121, 249)" strokeWidth="0.7"
                  points={result.fan_chart.map((p, i) => `${(i / (result.fan_chart.length - 1)) * 100},${getY(p.p50)}`).join(' ')} />
                {/* Start line */}
                <line x1="0" y1={getY(result.portfolio_value)} x2="100" y2={getY(result.portfolio_value)}
                  stroke="white" strokeWidth="0.3" strokeDasharray="1,2" strokeOpacity="0.3" />
              </svg>
              <div className="absolute right-1 text-[8px] text-[var(--muted)]" style={{top: `${getY(result.percentiles.p95)}%`}}>P95</div>
              <div className="absolute right-1 text-[8px] text-fuchsia-400 font-bold" style={{top: `${getY(result.percentiles.p50)}%`}}>Median</div>
              <div className="absolute right-1 text-[8px] text-[var(--muted)]" style={{top: `${getY(result.percentiles.p5)}%`}}>P5</div>
            </div>
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>Now</span><span>3 months</span><span>6 months</span><span>9 months</span><span>12 months</span>
            </div>
            <div className="flex justify-center gap-4 text-[9px]">
              <span className="flex items-center gap-1"><span className="h-2 w-4 bg-fuchsia-400/40 rounded" />50% likely range</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 bg-fuchsia-400/20 rounded" />80% likely range</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 bg-fuchsia-400/10 rounded" />90% likely range</span>
            </div>
          </div>

          {/* Probability Table */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Probability of Outcomes</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/10 p-3">
                <p className="text-[10px] text-[var(--muted)]">Probability of gaining &gt;10%</p>
                <p className="text-lg font-bold text-[var(--gain)]">{result.probabilities.gain_10_pct}%</p>
              </div>
              <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/10 p-3">
                <p className="text-[10px] text-[var(--muted)]">Probability of gaining &gt;20%</p>
                <p className="text-lg font-bold text-[var(--gain)]">{result.probabilities.gain_20_pct}%</p>
              </div>
              <div className="rounded-lg bg-[var(--loss)]/5 border border-[var(--loss)]/10 p-3">
                <p className="text-[10px] text-[var(--muted)]">Probability of losing &gt;10%</p>
                <p className="text-lg font-bold text-[var(--loss)]">{result.probabilities.loss_10_pct}%</p>
              </div>
              <div className="rounded-lg bg-[var(--loss)]/5 border border-[var(--loss)]/10 p-3">
                <p className="text-[10px] text-[var(--muted)]">Probability of losing &gt;20%</p>
                <p className="text-lg font-bold text-[var(--loss)]">{result.probabilities.loss_20_pct}%</p>
              </div>
            </div>
          </div>

          {/* Plain English Summary */}
          <div className="rounded-xl border-2 border-fuchsia-500/30 bg-fuchsia-500/5 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-fuchsia-400" />
              <p className="text-sm font-semibold text-fuchsia-400">In Plain English</p>
            </div>
            <p className="text-xs leading-relaxed">{result.summary}</p>
          </div>

          {/* Meta info */}
          <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
            <span>{result.simulations.toLocaleString()} simulations · {result.holdings_analyzed} assets · Correlation: {result.avg_correlation.toFixed(2)}</span>
            <button onClick={runSimulation} className="flex items-center gap-1 hover:text-[var(--foreground)]">
              <RefreshCw className="h-3 w-3" />Re-run
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Monte Carlo simulations show possible outcomes, not predictions. Past volatility may not predict future volatility.
      </p>
    </div>
  );
}
