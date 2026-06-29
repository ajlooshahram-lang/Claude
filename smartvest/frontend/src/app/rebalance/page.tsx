'use client';

import { useState, useEffect } from 'react';
import {
  Scale, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  RefreshCw, DollarSign, PieChart, ArrowRight, Shield,
  CheckCircle2, XCircle, Receipt, Minus, Plus,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Holding {
  symbol: string;
  name: string;
  sector: string;
  category: string;
  shares: number;
  current_price: number;
  current_price_dkk: number;
  current_value_dkk: number;
  cost_basis_dkk: number;
  unrealized_gain_dkk: number;
  gain_pct: number;
  weight_pct: number;
  currency: string;
}

interface SectorBreakdown {
  sector: string;
  category: string;
  value_dkk: number;
  weight_pct: number;
}

interface OverweightItem {
  symbol: string;
  name: string;
  current_weight: number;
  max_weight: number;
  excess_pct: number;
  excess_value_dkk: number;
}


interface PlanAction {
  action: string;
  symbol: string;
  name: string;
  shares?: number;
  value_dkk: number;
  reason: string;
  gain_on_sell_dkk?: number;
  tax_dkk?: number;
  tax_rate?: number;
  tax_explanation?: string;
  net_after_tax_dkk?: number;
  priority: string;
  sector?: string;
}

interface CashAction {
  action: string;
  amount_dkk: number;
  reason: string;
}

interface TaxSummary {
  total_tax_on_sells_dkk: number;
  existing_gains_ytd_dkk: number;
  threshold_dkk: number;
  low_rate: number;
  high_rate: number;
  warning: string;
}

interface RebalanceResult {
  risk_profile: string;
  target_allocation: {
    stable_pct: number;
    growth_pct: number;
    cash_pct: number;
    description: string;
    max_single_stock_pct: number;
    max_sector_pct: number;
  };
  current_allocation: {
    stable_pct: number;
    growth_pct: number;
    cash_pct: number;
  };
  allocation_diff: {
    stable_pct: number;
    growth_pct: number;
    cash_pct: number;
  };
  total_portfolio_dkk: number;
  total_invested_dkk: number;
  cash_balance_dkk: number;
  health_score: number;
  holdings: Holding[];
  sector_breakdown: SectorBreakdown[];
  overweight_positions: OverweightItem[];
  rebalancing_plan: PlanAction[];
  cash_action: CashAction | null;
  tax_summary: TaxSummary;
  summary: string;
}


// ─── Helper: Portfolio from localStorage ─────────────────────────────────────

interface StoredHolding {
  symbol: string;
  shares: number;
  avgCost: number;
}

function getPortfolioFromStorage(): StoredHolding[] {
  try {
    const stored = localStorage.getItem('smartvest_orders');
    if (!stored) return [];
    const orders = JSON.parse(stored);
    // Aggregate by symbol
    const map: Record<string, { shares: number; totalCost: number }> = {};
    for (const order of orders) {
      if (order.type === 'buy') {
        if (!map[order.symbol]) map[order.symbol] = { shares: 0, totalCost: 0 };
        map[order.symbol].shares += order.shares;
        map[order.symbol].totalCost += order.shares * order.price;
      } else if (order.type === 'sell') {
        if (map[order.symbol]) {
          map[order.symbol].shares -= order.shares;
        }
      }
    }
    return Object.entries(map)
      .filter(([, v]) => v.shares > 0)
      .map(([symbol, v]) => ({
        symbol,
        shares: v.shares,
        avgCost: v.totalCost / v.shares,
      }));
  } catch {
    return [];
  }
}

function getRiskProfile(): string {
  try {
    const stored = localStorage.getItem('smartvest_profile');
    if (!stored) return 'Moderate';
    const profile = JSON.parse(stored);
    return profile.riskProfile || 'Moderate';
  } catch {
    return 'Moderate';
  }
}


// ─── Main Component ──────────────────────────────────────────────────────────

export default function RebalancePage() {
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashBalance, setCashBalance] = useState(20000);
  const [realizedGains, setRealizedGains] = useState(0);
  const [showPlan, setShowPlan] = useState(false);

  // Demo holdings if user has none
  const demoHoldings: StoredHolding[] = [
    { symbol: 'AAPL', shares: 15, avgCost: 165 },
    { symbol: 'MSFT', shares: 10, avgCost: 340 },
    { symbol: 'TSLA', shares: 8, avgCost: 220 },
    { symbol: 'NVDA', shares: 5, avgCost: 480 },
    { symbol: 'JNJ', shares: 12, avgCost: 155 },
    { symbol: 'PG', shares: 10, avgCost: 150 },
  ];

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);

    const portfolio = getPortfolioFromStorage();
    const holdings = portfolio.length > 0 ? portfolio : demoHoldings;
    const riskProfile = getRiskProfile();

    try {
      const res = await fetch(`${API_BASE}/api/rebalance/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: holdings.map(h => ({
            symbol: h.symbol,
            shares: h.shares,
            avg_cost: h.avgCost,
          })),
          risk_profile: riskProfile,
          cash_balance: cashBalance,
          total_realized_gains_ytd: realizedGains,
          currency: 'DKK',
          dkk_usd_rate: 6.85,
        }),
      });
      if (!res.ok) throw new Error('Failed to analyze');
      const data = await res.json();
      setResult(data);
    } catch {
      setError('Could not analyze portfolio. Make sure the backend is running.');
    }
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
          <Scale className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Portfolio Rebalancing</h1>
          <p className="text-xs text-[var(--muted)]">
            Compare your current allocation to your target · Tax-aware recommendations
          </p>
        </div>
      </div>


      {/* Input Section */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-4">
        <p className="text-sm font-semibold">Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--muted)]">Cash Balance (DKK)</label>
            <input
              type="number"
              value={cashBalance}
              onChange={(e) => setCashBalance(Number(e.target.value))}
              className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Realized Gains This Year (DKK)</label>
            <input
              type="number"
              value={realizedGains}
              onChange={(e) => setRealizedGains(Number(e.target.value))}
              className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
          Analyze My Portfolio
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-3">
          <p className="text-xs text-[var(--loss)]">{error}</p>
        </div>
      )}


      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Health Score + Summary */}
          <div className={`rounded-xl border p-5 ${
            result.health_score >= 80 ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' :
            result.health_score >= 50 ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' :
            'border-[var(--loss)]/30 bg-[var(--loss)]/5'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {result.health_score >= 80 ? (
                  <CheckCircle2 className="h-6 w-6 text-[var(--gain)]" />
                ) : result.health_score >= 50 ? (
                  <AlertTriangle className="h-6 w-6 text-[var(--warning)]" />
                ) : (
                  <XCircle className="h-6 w-6 text-[var(--loss)]" />
                )}
                <div>
                  <p className="text-sm font-semibold">Portfolio Health</p>
                  <p className="text-[10px] text-[var(--muted)]">{result.risk_profile} profile</p>
                </div>
              </div>
              <div className={`text-2xl font-bold font-tabular ${
                result.health_score >= 80 ? 'text-[var(--gain)]' :
                result.health_score >= 50 ? 'text-[var(--warning)]' :
                'text-[var(--loss)]'
              }`}>
                {result.health_score}/100
              </div>
            </div>
            <p className="text-xs leading-relaxed">{result.summary}</p>
          </div>

          {/* Allocation Comparison */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <p className="text-sm font-semibold">Allocation: Current vs Target</p>
            <div className="space-y-3">
              {/* Stable */}
              <AllocationBar
                label="Stable Sectors"
                sublabel="Healthcare, Utilities, Consumer Staples, Real Estate"
                current={result.current_allocation.stable_pct}
                target={result.target_allocation.stable_pct}
                diff={result.allocation_diff.stable_pct}
              />
              {/* Growth */}
              <AllocationBar
                label="Growth Sectors"
                sublabel="Technology, Communication, Consumer Cyclical, Industrials"
                current={result.current_allocation.growth_pct}
                target={result.target_allocation.growth_pct}
                diff={result.allocation_diff.growth_pct}
              />
              {/* Cash */}
              <AllocationBar
                label="Cash Reserve"
                sublabel="Uninvested safety buffer"
                current={result.current_allocation.cash_pct}
                target={result.target_allocation.cash_pct}
                diff={result.allocation_diff.cash_pct}
              />
            </div>
          </div>


          {/* Overweight Positions */}
          {result.overweight_positions.length > 0 && (
            <div className="rounded-xl border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--loss)]" />
                <p className="text-sm font-semibold text-[var(--loss)]">Overweight Positions</p>
              </div>
              <p className="text-xs text-[var(--muted)]">
                These positions exceed your maximum allocation limits:
              </p>
              {result.overweight_positions.map((item) => (
                <div key={item.symbol} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
                  <div>
                    <p className="text-sm font-semibold">{item.symbol.replace('SECTOR:', '')}</p>
                    <p className="text-[10px] text-[var(--muted)]">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[var(--loss)] font-tabular">
                      {item.current_weight}% <span className="text-[10px] font-normal text-[var(--muted)]">(max {item.max_weight}%)</span>
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      Excess: {item.excess_value_dkk.toLocaleString('da-DK')} DKK
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sector Breakdown */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-indigo-400" />
              <p className="text-sm font-semibold">Sector Breakdown</p>
            </div>
            <div className="space-y-2">
              {result.sector_breakdown.map((s) => (
                <div key={s.sector} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs">{s.sector}</span>
                      <span className="text-xs font-tabular text-[var(--muted)]">{s.weight_pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.category === 'stable' ? 'bg-[var(--gain)]' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(s.weight_pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    s.category === 'stable' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-indigo-500/10 text-indigo-400'
                  }`}>
                    {s.category}
                  </span>
                </div>
              ))}
            </div>
          </div>


          {/* Rebalancing Plan */}
          {(result.rebalancing_plan.length > 0 || result.cash_action) && (
            <div className="rounded-xl border border-indigo-500/20 bg-[var(--card)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-indigo-400" />
                  <p className="text-sm font-semibold">Rebalancing Plan</p>
                </div>
                <button
                  onClick={() => setShowPlan(!showPlan)}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  {showPlan ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              <p className="text-xs text-[var(--muted)]">
                These are specific recommendations to bring your portfolio back to your {result.risk_profile} target allocation.
                Tax implications are calculated before each sell.
              </p>

              {showPlan && (
                <div className="space-y-3">
                  {/* Sells */}
                  {result.rebalancing_plan
                    .filter(a => a.action === 'SELL')
                    .map((action, i) => (
                      <div key={`sell-${i}`} className="rounded-lg border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Minus className="h-4 w-4 text-[var(--loss)]" />
                            <p className="text-sm font-semibold">SELL {action.symbol}</p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              action.priority === 'high' ? 'bg-[var(--loss)]/20 text-[var(--loss)]' : 'bg-[var(--warning)]/20 text-[var(--warning)]'
                            }`}>
                              {action.priority}
                            </span>
                          </div>
                          <p className="text-sm font-bold font-tabular text-[var(--loss)]">
                            {action.shares?.toFixed(1)} shares
                          </p>
                        </div>
                        <p className="text-xs text-[var(--muted)]">{action.reason}</p>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div className="rounded bg-[var(--background)] p-2 text-center">
                            <p className="text-[9px] text-[var(--muted)]">Sale Value</p>
                            <p className="text-xs font-bold font-tabular">{action.value_dkk.toLocaleString('da-DK')} kr</p>
                          </div>
                          <div className="rounded bg-[var(--background)] p-2 text-center">
                            <p className="text-[9px] text-[var(--muted)]">Gain</p>
                            <p className={`text-xs font-bold font-tabular ${(action.gain_on_sell_dkk || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                              {(action.gain_on_sell_dkk || 0).toLocaleString('da-DK')} kr
                            </p>
                          </div>
                          <div className="rounded bg-[var(--background)] p-2 text-center">
                            <p className="text-[9px] text-[var(--muted)]">Tax</p>
                            <p className="text-xs font-bold font-tabular text-[var(--warning)]">
                              {(action.tax_dkk || 0).toLocaleString('da-DK')} kr
                            </p>
                          </div>
                        </div>
                        {action.tax_explanation && (
                          <p className="text-[10px] text-[var(--muted)] italic">
                            Tax: {action.tax_explanation}
                          </p>
                        )}
                      </div>
                    ))}

                  {/* Buys */}
                  {result.rebalancing_plan
                    .filter(a => a.action === 'BUY')
                    .map((action, i) => (
                      <div key={`buy-${i}`} className="rounded-lg border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4 text-[var(--gain)]" />
                            <p className="text-sm font-semibold">BUY {action.symbol}</p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              action.priority === 'high' ? 'bg-[var(--gain)]/20 text-[var(--gain)]' : 'bg-[var(--primary)]/20 text-[var(--primary)]'
                            }`}>
                              {action.priority}
                            </span>
                          </div>
                          <p className="text-sm font-bold font-tabular text-[var(--gain)]">
                            {action.value_dkk.toLocaleString('da-DK')} kr
                          </p>
                        </div>
                        <p className="text-xs">{action.name}</p>
                        <p className="text-xs text-[var(--muted)]">{action.reason}</p>
                      </div>
                    ))}

                  {/* Cash Action */}
                  {result.cash_action && (
                    <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-[var(--primary)]" />
                        <p className="text-sm font-semibold">
                          {result.cash_action.action === 'HOLD_CASH' ? 'Keep Cash' : 'Deploy Cash'}
                        </p>
                      </div>
                      <p className="text-xs">{result.cash_action.reason}</p>
                      <p className="text-xs font-bold font-tabular">
                        Amount: {result.cash_action.amount_dkk.toLocaleString('da-DK')} DKK
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {/* Tax Impact Summary */}
          {result.tax_summary.total_tax_on_sells_dkk > 0 && (
            <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[var(--warning)]" />
                <p className="text-sm font-semibold text-[var(--warning)]">Tax Impact</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[var(--muted)]">Total Estimated Tax</p>
                  <p className="text-sm font-bold font-tabular">
                    {result.tax_summary.total_tax_on_sells_dkk.toLocaleString('da-DK')} DKK
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--muted)]">YTD Realized Gains</p>
                  <p className="text-sm font-bold font-tabular">
                    {result.tax_summary.existing_gains_ytd_dkk.toLocaleString('da-DK')} DKK
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                Danish aktieindkomst: 27% on gains up to {result.tax_summary.threshold_dkk.toLocaleString('da-DK')} DKK,
                42% above that. {result.tax_summary.warning}
              </p>
            </div>
          )}

          {/* Holdings Table */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Your Holdings</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="text-left py-2 pr-3">Stock</th>
                    <th className="text-right py-2 px-2">Value</th>
                    <th className="text-right py-2 px-2">Weight</th>
                    <th className="text-right py-2 px-2">Gain</th>
                    <th className="text-right py-2 pl-2">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdings.map((h) => (
                    <tr key={h.symbol} className="border-b border-[var(--card-border)]/50">
                      <td className="py-2 pr-3">
                        <p className="font-semibold">{h.symbol}</p>
                        <p className="text-[10px] text-[var(--muted)]">{h.name}</p>
                      </td>
                      <td className="text-right py-2 px-2 font-tabular">
                        {h.current_value_dkk.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr
                      </td>
                      <td className="text-right py-2 px-2 font-tabular">
                        {h.weight_pct}%
                      </td>
                      <td className={`text-right py-2 px-2 font-tabular ${h.gain_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                        {h.gain_pct >= 0 ? '+' : ''}{h.gain_pct}%
                      </td>
                      <td className="text-right py-2 pl-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          h.category === 'stable' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {h.sector}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Rebalancing suggestions are educational. Tax estimates are approximations. Consult a financial advisor before making changes.
      </p>
    </div>
  );
}

// ─── Allocation Bar Component ────────────────────────────────────────────────

function AllocationBar({
  label, sublabel, current, target, diff,
}: {
  label: string; sublabel: string; current: number; target: number; diff: number;
}) {
  const isOver = diff > 2;
  const isUnder = diff < -2;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">{label}</p>
          <p className="text-[9px] text-[var(--muted)]">{sublabel}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <span className="text-xs font-tabular font-bold">{current.toFixed(1)}%</span>
            <span className="text-[10px] text-[var(--muted)]">/ {target}%</span>
          </div>
          <span className={`text-[10px] font-medium ${
            isOver ? 'text-[var(--loss)]' : isUnder ? 'text-[var(--warning)]' : 'text-[var(--gain)]'
          }`}>
            {isOver ? `+${diff.toFixed(1)}% over` : isUnder ? `${diff.toFixed(1)}% under` : 'On target'}
          </span>
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-[var(--background)] overflow-hidden">
        {/* Target indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--foreground)]/40 z-10"
          style={{ left: `${Math.min(target, 100)}%` }}
        />
        {/* Current bar */}
        <div
          className={`h-full rounded-full transition-all ${
            isOver ? 'bg-[var(--loss)]' : isUnder ? 'bg-[var(--warning)]' : 'bg-[var(--gain)]'
          }`}
          style={{ width: `${Math.min(current, 100)}%` }}
        />
      </div>
    </div>
  );
}
