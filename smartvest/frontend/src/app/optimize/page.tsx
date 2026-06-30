'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Target, TrendingUp, ArrowRight, AlertTriangle,
  Settings, RefreshCw, Check, X,
} from 'lucide-react';
import {
  optimizePortfolio, getDefaultConstraints, getAssetUniverse,
  OptimizationResult, Constraint, PortfolioPoint, RebalanceTrade,
} from '@/lib/portfolio-optimizer';

export default function OptimizePage() {
  const [constraints, setConstraints] = useState<Constraint[]>(getDefaultConstraints());
  const [result, setResult] = useState<OptimizationResult | null>(null);

  useEffect(() => { setResult(optimizePortfolio(constraints)); }, [constraints]);

  function toggleConstraint(id: string) {
    setConstraints(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
  }

  if (!result) return null;


  const { efficientFrontier: ef, currentPortfolio: cp, optimalPortfolio: op } = result;
  const maxRet = Math.max(...ef.map(p => p.expectedReturn), cp.expectedReturn) + 2;
  const minRet = Math.min(...ef.map(p => p.expectedReturn), cp.expectedReturn) - 2;
  const maxVol = Math.max(...ef.map(p => p.volatility), cp.volatility) + 2;
  const minVol = Math.min(...ef.map(p => p.volatility), cp.volatility) - 2;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-[var(--primary)]" />
          Portfolio Optimizer
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Mean-Variance Optimization (Modern Portfolio Theory) — find your efficient frontier
        </p>
      </div>

      {/* Improvement Summary */}
      <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-5 flex items-center gap-6">
        <TrendingUp className="h-8 w-8 text-[var(--gain)] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-[var(--gain)]">Potential improvement found</p>
          <p className="text-xs text-[var(--foreground)]/70 mt-0.5">
            Moving to the optimal portfolio would increase expected return by <strong>+{result.improvementReturn}%</strong> while reducing risk by <strong>{result.improvementRisk}%</strong> (volatility).
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-[var(--muted)]">Transaction cost</p>
          <p className="text-xs font-tabular">{result.totalTransactionCost.toLocaleString()} DKK</p>
          <p className="text-[9px] text-[var(--muted)] mt-1">Tax impact</p>
          <p className="text-xs font-tabular">{result.totalTaxImplication.toLocaleString()} DKK</p>
        </div>
      </div>

      {/* Efficient Frontier Chart */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold mb-4">Efficient Frontier</h2>
        <div className="relative h-64 w-full">
          <svg viewBox="0 0 800 260" className="w-full h-full" preserveAspectRatio="none">
            {/* Frontier dots */}
            {ef.map((p, i) => {
              const x = ((p.volatility - minVol) / (maxVol - minVol)) * 760 + 20;
              const y = 240 - ((p.expectedReturn - minRet) / (maxRet - minRet)) * 220;
              return <circle key={i} cx={x} cy={y} r={2} fill="var(--primary)" opacity={0.4} />;
            })}
            {/* Current portfolio (red) */}
            {(() => {
              const x = ((cp.volatility - minVol) / (maxVol - minVol)) * 760 + 20;
              const y = 240 - ((cp.expectedReturn - minRet) / (maxRet - minRet)) * 220;
              return <><circle cx={x} cy={y} r={8} fill="var(--loss)" opacity={0.8} /><text x={x + 12} y={y + 4} fontSize="10" fill="var(--loss)">You</text></>;
            })()}
            {/* Optimal portfolio (green) */}
            {(() => {
              const x = ((op.volatility - minVol) / (maxVol - minVol)) * 760 + 20;
              const y = 240 - ((op.expectedReturn - minRet) / (maxRet - minRet)) * 220;
              return <><circle cx={x} cy={y} r={8} fill="var(--gain)" opacity={0.8} /><text x={x + 12} y={y + 4} fontSize="10" fill="var(--gain)">Optimal</text></>;
            })()}
            {/* Axis labels */}
            <text x="400" y="255" textAnchor="middle" fontSize="9" fill="var(--muted)">Risk (Volatility %)</text>
            <text x="10" y="130" textAnchor="middle" fontSize="9" fill="var(--muted)" transform="rotate(-90, 10, 130)">Expected Return %</text>
          </svg>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--loss)]" />Your Current Portfolio</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--gain)]" />Optimal (Max Sharpe)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)] opacity-50" />Efficient Frontier</span>
        </div>
      </div>


      {/* Constraint Panel */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="h-4 w-4 text-[var(--muted)]" />
          <h2 className="text-sm font-semibold">Constraints</h2>
        </div>
        <div className="space-y-2">
          {constraints.map(c => (
            <div key={c.id} className="flex items-center gap-3 text-[11px]">
              <button onClick={() => toggleConstraint(c.id)}
                className={`h-5 w-5 rounded flex items-center justify-center border ${c.active ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'border-[var(--card-border)]'}`}>
                {c.active && <Check className="h-3 w-3" />}
              </button>
              <span className={c.active ? '' : 'text-[var(--muted)] line-through'}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rebalancing Trades */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-semibold">Rebalancing Trades Required</h2>
          <p className="text-[9px] text-[var(--muted)]">Specific trades to move from current to optimal allocation</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
              <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Stock</th>
              <th className="text-center px-3 py-2 font-medium text-[var(--muted)]">Action</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--muted)]">Current</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--muted)]">Target</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--muted)]">Change</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--muted)]">Cost</th>
              <th className="text-right px-4 py-2 font-medium text-[var(--muted)]">Tax</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {result.rebalanceTrades.map(t => (
                <tr key={t.symbol}>
                  <td className="px-4 py-2.5 font-medium">{t.symbol}</td>
                  <td className="text-center px-3 py-2.5">
                    <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${t.action === 'buy' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'}`}>{t.action} {t.shares} shares</span>
                  </td>
                  <td className="text-right px-3 py-2.5 font-tabular">{t.currentWeight}%</td>
                  <td className="text-right px-3 py-2.5 font-tabular font-medium">{t.targetWeight}%</td>
                  <td className={`text-right px-3 py-2.5 font-tabular font-medium ${t.weightChange > 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>{t.weightChange > 0 ? '+' : ''}{t.weightChange}%</td>
                  <td className="text-right px-3 py-2.5 font-tabular">{t.estimatedCost.toLocaleString()}</td>
                  <td className="text-right px-4 py-2.5 font-tabular text-[var(--warning)]">{t.taxImplication > 0 ? `${t.taxImplication.toLocaleString()} DKK` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
        <p className="text-[9px] text-[var(--muted)] leading-relaxed">
          <strong>Limitations:</strong> This optimizer uses historical returns and correlations, which do not predict the future. The &quot;optimal&quot; portfolio is mathematically optimal only for the assumed return/risk inputs. Real-world factors (liquidity, market impact, behavioral biases) are not fully captured. Use as one input for decision-making, not as an automatic execution instruction.
        </p>
      </div>
    </div>
  );
}
