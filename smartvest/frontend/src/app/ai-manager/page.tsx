'use client';

import { useState, useEffect } from 'react';
import {
  Brain, Loader2, AlertTriangle, CheckCircle2, Zap,
  TrendingUp, TrendingDown, Shield, ArrowRight, RefreshCw,
  Lightbulb, XCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Suggestion { symbol: string; name: string; why: string; }
interface Recommendation {
  action: string; title: string; reasoning: string;
  risk_if_follow: string; risk_if_ignore: string;
  type: string; symbol: string | null; suggestions?: Suggestion[];
}
interface ManagerData {
  has_recommendation: boolean;
  recommendation?: Recommendation;
  other_issues_count?: number;
  portfolio_health?: string;
  risk_profile?: string;
  message?: string;
  checked_at?: string;
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
      .map(([symbol, v]) => ({ symbol, shares: v.shares, avg_cost: v.totalCost / v.shares, asset_type: 'stock' }));
  } catch { return []; }
}

function getRiskProfile(): string {
  try { return JSON.parse(localStorage.getItem('smartvest_profile') || '{}').riskProfile || 'Moderate'; }
  catch { return 'Moderate'; }
}

const ACTIVE_KEY = 'smartvest_ai_manager_active';


export default function AIManagerPage() {
  const [active, setActive] = useState(false);
  const [data, setData] = useState<ManagerData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored === 'true') {
      setActive(true);
      fetchRecommendation();
    }
  }, []);

  function toggleActive() {
    const newState = !active;
    setActive(newState);
    localStorage.setItem(ACTIVE_KEY, String(newState));
    if (newState) fetchRecommendation();
    else setData(null);
  }

  async function fetchRecommendation() {
    setLoading(true);
    const holdings = getPortfolio();
    const profile = getRiskProfile();

    // Demo holdings if user has none
    const useHoldings = holdings.length > 0 ? holdings : [
      { symbol: 'AAPL', shares: 25, avg_cost: 145, asset_type: 'stock' },
      { symbol: 'MSFT', shares: 15, avg_cost: 320, asset_type: 'stock' },
      { symbol: 'TSLA', shares: 12, avg_cost: 200, asset_type: 'stock' },
      { symbol: 'NVDA', shares: 8, avg_cost: 450, asset_type: 'stock' },
      { symbol: 'VOO', shares: 20, avg_cost: 420, asset_type: 'etf' },
    ];

    try {
      const res = await fetch(`${API_BASE}/api/ai-manager/recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: useHoldings,
          cash_balance: 5000,
          risk_profile: profile,
          portfolio_age_days: 60,
          last_trade_days_ago: 14,
        }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  const rec = data?.recommendation;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
            <Brain className="h-5 w-5 text-pink-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Portfolio Manager</h1>
            <p className="text-xs text-[var(--muted)]">
              Daily actionable recommendations based on your portfolio
            </p>
          </div>
        </div>
        {/* Toggle */}
        <button onClick={toggleActive} className="flex items-center gap-2">
          {active ? (
            <ToggleRight className="h-8 w-8 text-pink-400" />
          ) : (
            <ToggleLeft className="h-8 w-8 text-[var(--muted)]" />
          )}
          <span className={`text-xs font-medium ${active ? 'text-pink-400' : 'text-[var(--muted)]'}`}>
            {active ? 'Active' : 'Off'}
          </span>
        </button>
      </div>

      {/* Inactive State */}
      {!active && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center space-y-4">
          <Brain className="h-12 w-12 text-[var(--muted)]/30 mx-auto" />
          <div>
            <p className="text-sm font-semibold">AI Manager is Off</p>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-md mx-auto">
              When activated, the AI monitors your portfolio and generates one specific
              recommendation each day. Not generic advice — actionable steps with exact numbers,
              reasoning, and risk analysis.
            </p>
          </div>
          <button
            onClick={toggleActive}
            className="rounded-xl bg-pink-500 px-6 py-3 text-sm font-semibold text-white hover:bg-pink-600"
          >
            Activate AI Manager
          </button>
        </div>
      )}

      {/* Loading */}
      {active && loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-pink-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Analyzing your portfolio...</span>
        </div>
      )}

      {/* All Good */}
      {active && !loading && data && !data.has_recommendation && (
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-[var(--gain)] mx-auto" />
          <p className="text-sm font-semibold text-[var(--gain)]">Portfolio Looks Good</p>
          <p className="text-xs text-[var(--muted)]">{data.message}</p>
          <button onClick={fetchRecommendation} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
            <RefreshCw className="inline h-3 w-3 mr-1" />Re-check
          </button>
        </div>
      )}

      {/* Recommendation */}
      {active && !loading && rec && (
        <div className="space-y-5">
          {/* Health badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${
                data?.portfolio_health === 'needs_attention' ? 'bg-[var(--loss)]' : 'bg-[var(--warning)]'
              }`} />
              <span className="text-xs text-[var(--muted)]">
                {data?.portfolio_health === 'needs_attention' ? 'Needs attention' : 'Minor issues'}
                {(data?.other_issues_count || 0) > 0 && ` · ${data?.other_issues_count} other issue${data?.other_issues_count !== 1 ? 's' : ''} found`}
              </span>
            </div>
            <button onClick={fetchRecommendation} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              <RefreshCw className="inline h-3 w-3 mr-1" />Refresh
            </button>
          </div>

          {/* Main Recommendation Card */}
          <div className="rounded-xl border-2 border-pink-500/30 bg-[var(--card)] p-6 space-y-5">
            {/* Title + Action */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-pink-400" />
                <p className="text-sm font-bold text-pink-400">Today&apos;s Recommendation</p>
              </div>
              <p className="text-base font-bold">{rec.title}</p>
              <div className="mt-3 rounded-lg bg-pink-500/5 border border-pink-500/20 p-3">
                <p className="text-sm font-medium">{rec.action}</p>
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-[var(--primary)]" />
                <p className="text-xs font-semibold">Why</p>
              </div>
              <p className="text-xs leading-relaxed text-[var(--foreground)]">{rec.reasoning}</p>
            </div>

            {/* Risk Analysis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--gain)]" />
                  <p className="text-[10px] font-semibold text-[var(--gain)] uppercase">Risk if you follow</p>
                </div>
                <p className="text-xs leading-relaxed">{rec.risk_if_follow}</p>
              </div>
              <div className="rounded-lg border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-[var(--loss)]" />
                  <p className="text-[10px] font-semibold text-[var(--loss)] uppercase">Risk if you ignore</p>
                </div>
                <p className="text-xs leading-relaxed">{rec.risk_if_ignore}</p>
              </div>
            </div>

            {/* ETF Suggestions (for deploy cash type) */}
            {rec.suggestions && rec.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold">Suggested Investments</p>
                {rec.suggestions.map(s => (
                  <div key={s.symbol} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] p-3">
                    <div>
                      <p className="text-xs font-semibold">{s.symbol}</p>
                      <p className="text-[10px] text-[var(--muted)]">{s.name}</p>
                    </div>
                    <span className="text-[10px] text-[var(--primary)]">{s.why}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
            <p className="text-[10px] text-[var(--muted)] text-center">
              AI recommendations are based on portfolio math, not predictions. They are suggestions, not orders.
              Always think for yourself before making any trade.
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        AI Manager analyzes concentration, sector balance, idle cash, and position limits. Not financial advice.
      </p>
    </div>
  );
}
