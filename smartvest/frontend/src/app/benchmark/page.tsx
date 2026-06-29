'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Info, RefreshCw, Trophy, Target, Shield,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface ChartPoint { date: string; value: number; }
interface Insight { type: string; message: string; }
interface LazyHolding { symbol: string; weight: number; name: string; }
interface BenchmarkData {
  period_months: number; risk_profile: string;
  user_return_pct: number; sp500_return_pct: number | null;
  lazy_return_pct: number; peer_return_pct: number;
  lazy_portfolio: { name: string; holdings: LazyHolding[] };
  chart: { user: ChartPoint[]; sp500: ChartPoint[]; lazy: ChartPoint[]; peer: ChartPoint[] };
  insights: Insight[];
  underperforming_lazy: boolean; underperforming_sp500: boolean;
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
      } else if (o.type === 'sell' && map[o.symbol]) {
        map[o.symbol].shares -= o.shares;
      }
    }
    return Object.entries(map).filter(([,v]) => v.shares > 0)
      .map(([symbol, v]) => ({ symbol, shares: v.shares, avg_cost: v.totalCost / v.shares }));
  } catch { return []; }
}

function getRiskProfile(): string {
  try { return JSON.parse(localStorage.getItem('smartvest_profile') || '{}').riskProfile || 'Moderate'; }
  catch { return 'Moderate'; }
}


export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(12);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const holdings = getPortfolio();
    const profile = getRiskProfile();

    const useHoldings = holdings.length > 0 ? holdings : [
      { symbol: 'AAPL', shares: 15, avg_cost: 155 },
      { symbol: 'MSFT', shares: 10, avg_cost: 330 },
      { symbol: 'NVDA', shares: 5, avg_cost: 500 },
      { symbol: 'VOO', shares: 10, avg_cost: 430 },
      { symbol: 'JNJ', shares: 8, avg_cost: 160 },
    ];

    try {
      const res = await fetch(`${API_BASE}/api/benchmark/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: useHoldings,
          risk_profile: profile,
          period_months: period,
        }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  // Find chart min/max for scaling
  const allPoints = data ? [...data.chart.user, ...data.chart.sp500, ...data.chart.lazy, ...data.chart.peer] : [];
  const minVal = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.value)) : 90;
  const maxVal = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.value)) : 120;
  const range = maxVal - minVal || 1;

  function getY(value: number): number {
    return 100 - ((value - minVal) / range * 80 + 10); // 10-90% height
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
            <LineChart className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Peer Benchmark</h1>
            <p className="text-xs text-[var(--muted)]">
              Compare your performance against market benchmarks
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {[6, 12, 24, 36].map(m => (
          <button
            key={m}
            onClick={() => { setPeriod(m); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
              period === m ? 'border-sky-500/50 bg-sky-500/10 text-sky-400' : 'border-[var(--card-border)] text-[var(--muted)]'
            }`}
          >
            {m < 12 ? `${m}M` : `${m/12}Y`}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Comparing benchmarks...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Return Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ReturnCard label="You" value={data.user_return_pct} color="text-sky-400" icon={<Target className="h-4 w-4 text-sky-400" />} />
            <ReturnCard label="S&P 500" value={data.sp500_return_pct} color="text-emerald-400" icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} />
            <ReturnCard label="Lazy Portfolio" value={data.lazy_return_pct} color="text-purple-400" icon={<Shield className="h-4 w-4 text-purple-400" />} />
            <ReturnCard label="Peer Avg" value={data.peer_return_pct} color="text-orange-400" icon={<Trophy className="h-4 w-4 text-orange-400" />} />
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Performance Chart (normalized to 100)</p>
            <div className="relative h-48 w-full">
              {/* Base line at 100 */}
              <div className="absolute left-0 right-0 border-t border-dashed border-[var(--card-border)]" style={{ top: `${getY(100)}%` }}>
                <span className="absolute -left-1 -top-2.5 text-[8px] text-[var(--muted)]">100</span>
              </div>

              {/* SVG Lines */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* S&P 500 */}
                {data.chart.sp500.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="rgb(52, 211, 153)"
                    strokeWidth="0.5"
                    strokeOpacity="0.7"
                    points={data.chart.sp500.map((p, i) => `${(i / (data.chart.sp500.length - 1)) * 100},${getY(p.value)}`).join(' ')}
                  />
                )}
                {/* Lazy */}
                {data.chart.lazy.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="rgb(168, 85, 247)"
                    strokeWidth="0.5"
                    strokeOpacity="0.7"
                    points={data.chart.lazy.map((p, i) => `${(i / (data.chart.lazy.length - 1)) * 100},${getY(p.value)}`).join(' ')}
                  />
                )}
                {/* Peer */}
                {data.chart.peer.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="rgb(251, 146, 60)"
                    strokeWidth="0.4"
                    strokeDasharray="2,2"
                    strokeOpacity="0.6"
                    points={data.chart.peer.map((p, i) => `${(i / (data.chart.peer.length - 1)) * 100},${getY(p.value)}`).join(' ')}
                  />
                )}
                {/* User (on top) */}
                {data.chart.user.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="rgb(56, 189, 248)"
                    strokeWidth="0.8"
                    points={data.chart.user.map((p, i) => `${(i / (data.chart.user.length - 1)) * 100},${getY(p.value)}`).join(' ')}
                  />
                )}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 justify-center">
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-sky-400 rounded" />You</span>
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-emerald-400 rounded" />S&P 500</span>
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-purple-400 rounded" />Lazy Portfolio</span>
              <span className="flex items-center gap-1.5 text-[10px]"><span className="h-0.5 w-4 bg-orange-400 rounded border-dashed" />Peer Avg</span>
            </div>
          </div>

          {/* Lazy Portfolio Breakdown */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">{data.lazy_portfolio.name}</p>
            <p className="text-[10px] text-[var(--muted)]">The benchmark portfolio for your {data.risk_profile} profile:</p>
            <div className="space-y-2">
              {data.lazy_portfolio.holdings.map(h => (
                <div key={h.symbol} className="flex items-center justify-between rounded-lg bg-[var(--background)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-400">{(h.weight * 100).toFixed(0)}%</span>
                    <div>
                      <p className="text-xs font-medium">{h.symbol}</p>
                      <p className="text-[9px] text-[var(--muted)]">{h.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          {data.insights.map((insight, i) => (
            <div key={i} className={`rounded-xl border p-5 ${
              insight.type === 'underperform_lazy'
                ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
                : insight.type === 'outperform'
                  ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
                  : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'
            }`}>
              <div className="flex items-start gap-3">
                {insight.type === 'underperform_lazy' ? (
                  <Info className="h-5 w-5 text-[var(--warning)] shrink-0 mt-0.5" />
                ) : insight.type === 'outperform' ? (
                  <Trophy className="h-5 w-5 text-[var(--gain)] shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-5 w-5 text-[var(--primary)] shrink-0 mt-0.5" />
                )}
                <p className="text-xs leading-relaxed">{insight.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Past performance does not predict future results. Peer data is simulated. Not financial advice.
      </p>
    </div>
  );
}

function ReturnCard({ label, value, color, icon }: { label: string; value: number | null; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center space-y-1">
      <div className="flex items-center justify-center gap-1.5">
        {icon}
        <p className="text-[10px] text-[var(--muted)]">{label}</p>
      </div>
      <p className={`text-base font-bold font-tabular ${
        value !== null && value >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'
      }`}>
        {value !== null ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : 'N/A'}
      </p>
    </div>
  );
}
