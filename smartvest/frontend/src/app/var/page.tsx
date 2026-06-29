'use client';

import { useState, useEffect } from 'react';
import {
  ShieldAlert, Loader2, AlertTriangle, Info, RefreshCw, BarChart3,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface VaRMethod { var_95_dkk: number; var_99_dkk: number; var_999_dkk: number; var_95_pct: number; var_99_pct: number; var_999_pct: number; }
interface VaRData {
  portfolio_value_dkk: number; portfolio_value_usd: number; holdings_count: number; data_days: number;
  daily_volatility_pct: number; annual_volatility_pct: number;
  historical: VaRMethod; parametric: VaRMethod;
  worst_actual_day: { return_pct: number; loss_dkk: number; };
  explanation_difference: string; summary: string;
}

function getPortfolio() {
  try {
    const orders = JSON.parse(localStorage.getItem('smartvest_orders') || '[]');
    const map: Record<string, { shares: number; totalCost: number }> = {};
    for (const o of orders) {
      if (o.type === 'buy') { if (!map[o.symbol]) map[o.symbol] = { shares: 0, totalCost: 0 }; map[o.symbol].shares += o.shares; map[o.symbol].totalCost += o.shares * o.price; }
      else if (o.type === 'sell' && map[o.symbol]) map[o.symbol].shares -= o.shares;
    }
    return Object.entries(map).filter(([,v]) => v.shares > 0).map(([symbol, v]) => ({ symbol, shares: v.shares, current_value: 0 }));
  } catch { return []; }
}


export default function VaRPage() {
  const [data, setData] = useState<VaRData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { calculate(); }, []);

  async function calculate() {
    setLoading(true);
    const holdings = getPortfolio();
    const use = holdings.length > 0 ? holdings : [
      { symbol: 'AAPL', shares: 15, current_value: 0 },
      { symbol: 'MSFT', shares: 10, current_value: 0 },
      { symbol: 'NVDA', shares: 5, current_value: 0 },
      { symbol: 'VOO', shares: 20, current_value: 0 },
      { symbol: 'JNJ', shares: 12, current_value: 0 },
    ];
    try {
      const res = await fetch(`${API_BASE}/api/var/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: use, dkk_rate: 6.85 }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  function fmtDKK(n: number) { return n.toLocaleString('da-DK', { maximumFractionDigits: 0 }); }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/10">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Value at Risk (VaR)</h1>
            <p className="text-xs text-[var(--muted)]">How much could you lose in a single day?</p>
          </div>
        </div>
        <button onClick={calculate} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Value at Risk tells you the maximum expected loss over a single day at a given confidence level.
          A 95% VaR of 5,000 DKK means: on 95% of days, you will NOT lose more than 5,000 DKK.
          But on the remaining 5% of days (about 1 day per month), you could lose more.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-red-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Calculating risk...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Portfolio Info */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div>
              <p className="text-[10px] text-[var(--muted)]">Portfolio</p>
              <p className="text-sm font-bold font-tabular">{fmtDKK(data.portfolio_value_dkk)} DKK</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[var(--muted)]">Daily Vol</p>
              <p className="text-sm font-bold font-tabular">{data.daily_volatility_pct}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[var(--muted)]">Annual Vol</p>
              <p className="text-sm font-bold font-tabular">{data.annual_volatility_pct}%</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[var(--muted)]">Data</p>
              <p className="text-sm font-bold font-tabular">{data.data_days} days</p>
            </div>
          </div>

          {/* Main VaR Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <VaRCard level="95%" dkk={data.historical.var_95_dkk} pct={data.historical.var_95_pct}
              meaning="On 95% of days, you will NOT lose more than this." color="border-[var(--warning)]/30 bg-[var(--warning)]/5" />
            <VaRCard level="99%" dkk={data.historical.var_99_dkk} pct={data.historical.var_99_pct}
              meaning="On 99% of days, losses stay below this. Only ~2 days/year could be worse." color="border-[var(--loss)]/30 bg-[var(--loss)]/5" />
            <VaRCard level="99.9%" dkk={data.historical.var_999_dkk} pct={data.historical.var_999_pct}
              meaning="Extreme tail risk. This level of loss happens roughly once every 4 years." color="border-red-600/30 bg-red-600/10" />
          </div>

          {/* Method Comparison Table */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-400" />
              <p className="text-sm font-semibold">Two Methods Compared</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="text-left py-2">Confidence</th>
                  <th className="text-right py-2">Historical (DKK)</th>
                  <th className="text-right py-2">Parametric (DKK)</th>
                  <th className="text-right py-2">Difference</th>
                </tr></thead>
                <tbody>
                  {[
                    { level: '95%', h: data.historical.var_95_dkk, p: data.parametric.var_95_dkk },
                    { level: '99%', h: data.historical.var_99_dkk, p: data.parametric.var_99_dkk },
                    { level: '99.9%', h: data.historical.var_999_dkk, p: data.parametric.var_999_dkk },
                  ].map(row => (
                    <tr key={row.level} className="border-b border-[var(--card-border)]/30">
                      <td className="py-2 font-medium">{row.level}</td>
                      <td className="py-2 text-right font-tabular">{fmtDKK(row.h)} kr</td>
                      <td className="py-2 text-right font-tabular">{fmtDKK(row.p)} kr</td>
                      <td className={`py-2 text-right font-tabular ${Math.abs(row.h - row.p) > row.h * 0.2 ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
                        {row.h > row.p ? '+' : ''}{fmtDKK(row.h - row.p)} kr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed italic">
              {data.explanation_difference}
            </p>
          </div>

          {/* Worst Day */}
          <div className="rounded-xl border border-red-600/20 bg-red-600/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <p className="text-xs font-semibold">Worst Actual Day (Past 2 Years)</p>
            </div>
            <p className="text-xs leading-relaxed">
              Your portfolio experienced a {Math.abs(data.worst_actual_day.return_pct).toFixed(1)}% single-day drop.
              At your current portfolio size, that equals <strong>{fmtDKK(data.worst_actual_day.loss_dkk)} DKK</strong> lost in one day.
              This is a real event that happened — not a theoretical number.
            </p>
          </div>

          {/* Plain English Summary */}
          <div className="rounded-xl border-2 border-red-500/20 bg-[var(--card)] p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-red-400" />
              <p className="text-sm font-semibold">In Plain DKK Terms</p>
            </div>
            <p className="text-xs leading-relaxed">{data.summary}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        VaR is a risk measure, not a prediction. Losses can exceed VaR. Based on 2 years of historical data.
      </p>
    </div>
  );
}

function VaRCard({ level, dkk, pct, meaning, color }: { level: string; dkk: number; pct: number; meaning: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${color}`}>
      <p className="text-xs font-bold text-center">{level} Confidence</p>
      <p className="text-xl font-bold font-tabular text-center">
        {dkk.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr
      </p>
      <p className="text-[10px] font-tabular text-center text-[var(--muted)]">({pct}% of portfolio)</p>
      <p className="text-[9px] text-[var(--muted)] text-center leading-relaxed">{meaning}</p>
    </div>
  );
}
