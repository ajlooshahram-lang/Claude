'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Lightbulb, Zap, Target, Clock, PiggyBank,
  CheckCircle2, ArrowRight, ShieldCheck,
} from 'lucide-react';
import {
  getOptimizationTips, ASKOptimizationTip, isASKEligible,
  projectASKGrowth, getASKSummary, ASK_DEPOSIT_LIMIT_2026,
} from '@/lib/ask';

export function ASKOptimizer() {
  const [tips, setTips] = useState<ASKOptimizationTip[]>([]);
  const [eligibilityCheck, setEligibilityCheck] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<{ eligible: boolean; reason: string } | null>(null);
  const [projectionReturn, setProjectionReturn] = useState(8);

  useEffect(() => {
    setTips(getOptimizationTips());
  }, []);

  const summary = useMemo(() => getASKSummary(), []);

  // Growth projection
  const projection = useMemo(
    () => projectASKGrowth(
      summary.currentPortfolioValue || 100000,
      projectionReturn / 100,
      20
    ),
    [summary.currentPortfolioValue, projectionReturn]
  );

  function handleEligibilityCheck(type: string) {
    setEligibilityCheck(type);
    setEligibilityResult(isASKEligible(type));
  }

  const categoryIcon = {
    deposit: PiggyBank,
    allocation: Target,
    tax: Zap,
    timing: Clock,
  };

  const impactColor = {
    high: 'border-[var(--gain)]/30 bg-[var(--gain)]/5',
    medium: 'border-[var(--primary)]/30 bg-[var(--primary)]/5',
    low: 'border-[var(--card-border)] bg-[var(--card)]',
  };

  const impactLabel = {
    high: { text: 'High Impact', color: 'text-[var(--gain)]' },
    medium: { text: 'Medium Impact', color: 'text-[var(--primary)]' },
    low: { text: 'Low Impact', color: 'text-[var(--muted)]' },
  };

  return (
    <div className="space-y-4">


      {/* Header */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Lightbulb className="h-4 w-4 text-[var(--warning)]" />
          ASK Optimization Advisor
        </h2>
        <p className="text-[10px] text-[var(--muted)]">
          Personalized tips to maximize your Aktiesparekonto tax advantage.
        </p>
      </div>

      {/* Optimization Tips */}
      <div className="space-y-3">
        {tips.length === 0 ? (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--gain)] mx-auto mb-3" />
            <p className="text-sm font-medium">Your ASK is well optimized!</p>
            <p className="text-xs text-[var(--muted)] mt-1">No immediate improvements found.</p>
          </div>
        ) : (
          tips.map(tip => {
            const Icon = categoryIcon[tip.category];
            return (
              <div key={tip.id} className={`rounded-xl border p-4 ${impactColor[tip.impact]}`}>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[var(--background)]/50 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-[var(--primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold">{tip.title}</p>
                      <span className={`text-[9px] font-medium uppercase tracking-wider ${impactLabel[tip.impact].color}`}>
                        {impactLabel[tip.impact].text}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      {tip.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>


      {/* Growth Projection */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">20-Year Growth Projection</h3>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--muted)]">Return:</label>
            <select
              value={projectionReturn}
              onChange={e => setProjectionReturn(Number(e.target.value))}
              className="rounded border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-[10px]"
            >
              <option value="5">5% (conservative)</option>
              <option value="8">8% (historical avg)</option>
              <option value="10">10% (optimistic)</option>
              <option value="12">12% (aggressive)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map(yr => {
            const data = projection[yr - 1];
            if (!data) return null;
            return (
              <div key={yr} className="rounded-lg border border-[var(--card-border)] p-2.5 text-center">
                <p className="text-[9px] text-[var(--muted)]">Year {yr}</p>
                <p className="text-xs font-bold font-tabular mt-0.5 text-[var(--gain)]">
                  {(data.netValue / 1000).toFixed(0)}k
                </p>
                <p className="text-[8px] text-[var(--muted)]">
                  Tax: {(data.totalTaxPaid / 1000).toFixed(0)}k
                </p>
              </div>
            );
          })}
        </div>

        {/* Mini bar chart for projection */}
        <div className="space-y-1">
          {projection.filter((_, i) => i % 4 === 3 || i === 0).map(d => (
            <div key={d.year} className="flex items-center gap-2 text-[10px]">
              <span className="w-10 text-right text-[var(--muted)] font-tabular">Y{d.year}</span>
              <div className="flex-1 h-4 bg-[var(--card-border)]/30 rounded overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--gain)] rounded"
                  style={{ width: `${(d.netValue / projection[projection.length - 1].netValue) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right font-tabular text-[var(--foreground)]">
                {d.netValue.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[9px] text-[var(--muted)]">
          Starting value: {(summary.currentPortfolioValue || 100000).toLocaleString()} DKK. 
          Tax is deducted annually (lagerbeskatning). Assumes no additional deposits.
        </p>
      </div>


      {/* Eligibility Checker */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h3 className="text-xs font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
          ASK Eligibility Checker
        </h3>
        <p className="text-[10px] text-[var(--muted)]">
          Check if a security type is allowed in your Aktiesparekonto.
        </p>

        <div className="flex flex-wrap gap-2">
          {['Stock', 'ETF', 'Investment Fund', 'Bond', 'Crypto', 'Derivative', 'Unlisted'].map(type => (
            <button
              key={type}
              onClick={() => handleEligibilityCheck(type)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
                eligibilityCheck === type
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {eligibilityResult && (
          <div className={`rounded-lg border p-3 flex items-start gap-2 ${
            eligibilityResult.eligible
              ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
              : 'border-[var(--loss)]/30 bg-[var(--loss)]/5'
          }`}>
            <span className="text-sm mt-0.5">
              {eligibilityResult.eligible ? '✅' : '❌'}
            </span>
            <div>
              <p className={`text-xs font-medium ${
                eligibilityResult.eligible ? 'text-[var(--gain)]' : 'text-[var(--loss)]'
              }`}>
                {eligibilityResult.eligible ? 'Eligible' : 'Not Eligible'}
              </p>
              <p className="text-[10px] text-[var(--muted)] mt-0.5">
                {eligibilityResult.reason}
              </p>
            </div>
          </div>
        )}
      </div>


      {/* ASK Strategy Guide */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h3 className="text-xs font-semibold">ASK Strategy Checklist</h3>
        <div className="space-y-2">
          {[
            { text: 'Max out deposit limit before investing in regular depot', done: summary.depositUtilization >= 100 },
            { text: 'Hold highest-growth assets in ASK (maximize 17% advantage)', done: summary.unrealizedGainPct > 10 },
            { text: 'Use broad-market ETFs for core diversification', done: summary.holdingsCount >= 3 },
            { text: 'Keep cash reserve for annual tax bill (lagerbeskatning)', done: false },
            { text: 'Review holdings before Dec 31 (tax year-end)', done: false },
            { text: 'Avoid frequent trading (ASK has no tax benefit for trading)', done: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[11px]">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.done
                  ? 'bg-[var(--gain)]/10 text-[var(--gain)]'
                  : 'bg-[var(--card-border)]'
              }`}>
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="h-3 w-3 text-[var(--muted)]" />
                )}
              </div>
              <span className={item.done ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Broker Comparison Quick Info */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h3 className="text-xs font-semibold">Popular ASK Brokers in Denmark</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { name: 'Saxo Bank', fee: 'Low', etfs: 'Wide selection', note: 'Most ETFs available' },
            { name: 'Nordnet', fee: 'Low', etfs: 'Good selection', note: 'Popular in Nordics' },
            { name: 'Lunar Invest', fee: 'Free trades', etfs: 'Limited', note: 'Mobile-first, beginner-friendly' },
            { name: 'Danske Bank', fee: 'Medium', etfs: 'Moderate', note: 'Full-service bank' },
          ].map(broker => (
            <div key={broker.name} className="rounded-lg border border-[var(--card-border)] p-3">
              <p className="text-[11px] font-semibold">{broker.name}</p>
              <div className="mt-1 space-y-0.5 text-[9px] text-[var(--muted)]">
                <p>Fees: {broker.fee}</p>
                <p>ETFs: {broker.etfs}</p>
                <p className="italic">{broker.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-[var(--muted)]">
          Compare fees at your broker. You can only have ONE ASK — choose wisely. Transferring between brokers is possible but takes time.
        </p>
      </div>
    </div>
  );
}
