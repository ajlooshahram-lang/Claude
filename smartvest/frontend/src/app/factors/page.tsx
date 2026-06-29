'use client';

import { useState, useEffect } from 'react';
import {
  Radar, Loader2, RefreshCw, Info, AlertTriangle,
  ArrowUp, ArrowDown, CheckCircle2,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Comparison { current: number; target: number; diff: number; status: string; }
interface Insight { factor: string; status: string; implication: string; action: string; }
interface FactorExp { name: string; description: string; high_means: string; low_means: string; }
interface FactorData {
  factors: Record<string, number>; target: Record<string, number>;
  comparisons: Record<string, Comparison>; risk_profile: string;
  holdings_analyzed: number; portfolio_beta: number; insights: Insight[];
  factor_explanations: Record<string, FactorExp>;
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
function getRiskProfile(): string { try { return JSON.parse(localStorage.getItem('smartvest_profile') || '{}').riskProfile || 'Moderate'; } catch { return 'Moderate'; } }

export default function FactorsPage() {
  const [data, setData] = useState<FactorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedFactor, setExpandedFactor] = useState<string | null>(null);

  useEffect(() => { analyze(); }, []);

  async function analyze() {
    setLoading(true);
    const holdings = getPortfolio();
    const use = holdings.length > 0 ? holdings : [
      { symbol: 'AAPL', shares: 15, current_value: 0 }, { symbol: 'MSFT', shares: 10, current_value: 0 },
      { symbol: 'NVDA', shares: 5, current_value: 0 }, { symbol: 'JNJ', shares: 12, current_value: 0 },
      { symbol: 'VOO', shares: 20, current_value: 0 }, { symbol: 'KO', shares: 15, current_value: 0 },
    ];
    try {
      const res = await fetch(`${API_BASE}/api/factors/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: use, risk_profile: getRiskProfile() }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  const FACTOR_KEYS = ['beta', 'size', 'value', 'momentum', 'quality'];
  const FACTOR_COLORS: Record<string, string> = { beta: 'text-blue-400', size: 'text-purple-400', value: 'text-amber-400', momentum: 'text-emerald-400', quality: 'text-rose-400' };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Radar className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Factor Exposure Analysis</h1>
            <p className="text-xs text-[var(--muted)]">Fama-French 5-factor model · Radar chart · Profile comparison</p>
          </div>
        </div>
        <button onClick={analyze} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          The <strong>Fama-French model</strong> explains portfolio returns through 5 factors. Understanding
          your exposures tells you WHY your portfolio performs the way it does — and whether that matches your goals.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Analyzing factor exposures...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Radar Chart (CSS-based pentagon) */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <p className="text-sm font-semibold text-center">Your Factor Profile vs Target ({data.risk_profile})</p>
            <div className="grid grid-cols-5 gap-2">
              {FACTOR_KEYS.map(key => {
                const current = data.factors[key];
                const target = data.target[key];
                const comp = data.comparisons[key];
                const maxVal = Math.max(current, target, 1);
                return (
                  <div key={key} className="text-center space-y-1.5">
                    <p className={`text-[10px] font-semibold capitalize ${FACTOR_COLORS[key]}`}>{key}</p>
                    <div className="relative h-24 flex items-end justify-center gap-1">
                      {/* Target bar */}
                      <div className="w-4 bg-[var(--muted)]/20 rounded-t" style={{ height: `${(target / maxVal) * 100}%` }}>
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[7px] text-[var(--muted)]">{target.toFixed(1)}</div>
                      </div>
                      {/* Current bar */}
                      <div className={`w-4 rounded-t ${
                        comp.status === 'aligned' ? 'bg-[var(--gain)]' :
                        comp.status === 'overweight' ? 'bg-[var(--warning)]' :
                        'bg-[var(--loss)]'
                      }`} style={{ height: `${(current / maxVal) * 100}%` }} />
                    </div>
                    <p className="text-[9px] font-tabular">{current.toFixed(2)}</p>
                    <p className={`text-[8px] font-medium ${
                      comp.status === 'aligned' ? 'text-[var(--gain)]' :
                      comp.status === 'overweight' ? 'text-[var(--warning)]' :
                      'text-[var(--loss)]'
                    }`}>
                      {comp.status === 'aligned' ? '✓' : comp.diff > 0 ? `+${comp.diff.toFixed(2)}` : comp.diff.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 text-[9px]">
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-[var(--muted)]/20 rounded" />Target</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-[var(--gain)] rounded" />Aligned</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-[var(--warning)] rounded" />Over</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-[var(--loss)] rounded" />Under</span>
            </div>
          </div>

          {/* Factor Details */}
          <div className="space-y-2">
            {FACTOR_KEYS.map(key => {
              const comp = data.comparisons[key];
              const exp = data.factor_explanations[key];
              const isExpanded = expandedFactor === key;
              return (
                <div key={key} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
                  <button onClick={() => setExpandedFactor(isExpanded ? null : key)} className="w-full p-4 text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {comp.status === 'aligned' ? <CheckCircle2 className="h-4 w-4 text-[var(--gain)]" /> :
                         comp.diff > 0 ? <ArrowUp className="h-4 w-4 text-[var(--warning)]" /> :
                         <ArrowDown className="h-4 w-4 text-[var(--loss)]" />}
                        <div>
                          <p className={`text-sm font-semibold ${FACTOR_COLORS[key]}`}>{exp.name}</p>
                          <p className="text-[10px] text-[var(--muted)]">Current: {comp.current.toFixed(2)} · Target: {comp.target.toFixed(2)}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        comp.status === 'aligned' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' :
                        comp.status === 'overweight' ? 'bg-[var(--warning)]/10 text-[var(--warning)]' :
                        'bg-[var(--loss)]/10 text-[var(--loss)]'
                      }`}>{comp.status}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[var(--card-border)] p-4 space-y-2">
                      <p className="text-xs leading-relaxed">{exp.description}</p>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/10 p-2.5">
                          <p className="text-[9px] font-semibold text-[var(--gain)]">High exposure means:</p>
                          <p className="text-[10px] text-[var(--muted)]">{exp.high_means}</p>
                        </div>
                        <div className="rounded-lg bg-[var(--loss)]/5 border border-[var(--loss)]/10 p-2.5">
                          <p className="text-[9px] font-semibold text-[var(--loss)]">Low exposure means:</p>
                          <p className="text-[10px] text-[var(--muted)]">{exp.low_means}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Insights */}
          {data.insights.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2"><Info className="h-4 w-4 text-blue-400" /><p className="text-sm font-semibold text-blue-400">Actionable Insights</p></div>
              {data.insights.map((ins, i) => (
                <div key={i} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 space-y-1">
                  <p className="text-xs font-medium">{ins.status}</p>
                  <p className="text-[10px] text-[var(--muted)]">{ins.implication}</p>
                  <p className="text-[10px] text-blue-400 italic">{ins.action}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-[var(--muted)]">Portfolio Beta: {data.portfolio_beta} · {data.holdings_analyzed} holdings analyzed</p>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">Factor analysis uses fundamental data from Yahoo Finance. Historical factor premia do not guarantee future returns.</p>
    </div>
  );
}
