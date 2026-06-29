'use client';

import { useState, useEffect } from 'react';
import { Brain, AlertTriangle, TrendingDown, Flame, Repeat, Target } from 'lucide-react';
import { getOrders, Order } from '@/lib/orders';
import { getProfile } from '@/lib/profile';

// ─── Behavioral Pattern Detection ───────────────────────────────────────────

interface Pattern {
  type: 'panic_sell' | 'fomo_buy' | 'overtrading' | 'concentration_creep';
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
  evidence: string;
  lesson: string;
}

function analyzeOrders(orders: Order[]): Pattern[] {
  const patterns: Pattern[] = [];
  if (orders.length === 0) return patterns;

  // Sort by date
  const sorted = [...orders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ─── 1. Panic Selling ─────────────────────────────────────────────────
  // Detected: sold a stock within 24 hours of it being bought at a lower price
  // (or sold at a significant loss quickly)
  const sells = sorted.filter(o => o.type === 'sell');
  const buys = sorted.filter(o => o.type === 'buy');

  for (const sell of sells) {
    // Check if there's a buy of the same stock at a higher price
    const matchingBuys = buys.filter(b =>
      b.symbol === sell.symbol && b.pricePerShare > sell.pricePerShare
    );
    if (matchingBuys.length > 0) {
      const buy = matchingBuys[matchingBuys.length - 1]; // Most recent buy
      const lossPct = ((sell.pricePerShare - buy.pricePerShare) / buy.pricePerShare) * 100;
      const daysBetween = (new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000 * 60 * 60 * 24);

      if (daysBetween <= 7 && lossPct < -5) {
        const severity = lossPct < -15 ? 'severe' : lossPct < -10 ? 'moderate' : 'mild';
        patterns.push({
          type: 'panic_sell',
          severity,
          description: `You sold ${sell.symbol} at a ${Math.abs(lossPct).toFixed(1)}% loss within ${Math.ceil(daysBetween)} day${daysBetween > 1 ? 's' : ''} of buying it.`,
          evidence: `Bought ${sell.symbol} at ${sell.currency} ${buy.pricePerShare.toFixed(2)}, sold at ${sell.currency} ${sell.pricePerShare.toFixed(2)}. Loss: ${lossPct.toFixed(1)}%.`,
          lesson: 'Selling quickly after a drop usually locks in losses that would have recovered. Stocks regularly dip 5-10% and bounce back within weeks. Set a stop-loss BEFORE buying so you have a plan, not a panic reaction.',
        });
      }
    }
  }

  // ─── 2. FOMO Buying ───────────────────────────────────────────────────
  // Detected: buying a stock at a significantly higher price than its recent range
  // (suggests chasing a run-up)
  for (const buy of buys) {
    // Check if there's a later sell of same stock at a loss (bought the top)
    const laterSells = sells.filter(s =>
      s.symbol === buy.symbol &&
      new Date(s.date).getTime() > new Date(buy.date).getTime() &&
      s.pricePerShare < buy.pricePerShare
    );
    if (laterSells.length > 0) {
      const sell = laterSells[0];
      const lossPct = ((sell.pricePerShare - buy.pricePerShare) / buy.pricePerShare) * 100;
      patterns.push({
        type: 'fomo_buy',
        severity: lossPct < -20 ? 'severe' : 'moderate',
        description: `You bought ${buy.symbol} and it dropped ${Math.abs(lossPct).toFixed(1)}% afterward — possible FOMO purchase at the top.`,
        evidence: `Bought at ${buy.currency} ${buy.pricePerShare.toFixed(2)}, later sold at ${buy.currency} ${sell.pricePerShare.toFixed(2)}.`,
        lesson: 'Buying because a stock is "hot" or in the news often means you\'re buying after the move already happened. The best time to buy is when the stock is boring and undervalued, not when everyone is excited about it.',
      });
    }
  }

  // ─── 3. Overtrading ───────────────────────────────────────────────────
  // Detected: more than 3 orders in a single 7-day window
  for (let i = 0; i < sorted.length; i++) {
    const windowStart = new Date(sorted[i].date).getTime();
    const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000;
    const inWindow = sorted.filter(o => {
      const t = new Date(o.date).getTime();
      return t >= windowStart && t <= windowEnd;
    });

    if (inWindow.length > 3) {
      // Only add once per window
      const alreadyReported = patterns.some(p =>
        p.type === 'overtrading' && p.evidence.includes(new Date(sorted[i].date).toLocaleDateString())
      );
      if (!alreadyReported) {
        patterns.push({
          type: 'overtrading',
          severity: inWindow.length > 5 ? 'severe' : 'moderate',
          description: `You made ${inWindow.length} trades in one week (week of ${new Date(sorted[i].date).toLocaleDateString()}).`,
          evidence: `Stocks traded: ${[...new Set(inWindow.map(o => o.symbol))].join(', ')}. ${inWindow.filter(o => o.type === 'buy').length} buys, ${inWindow.filter(o => o.type === 'sell').length} sells.`,
          lesson: 'Frequent trading almost always underperforms buy-and-hold for beginners. Each trade has potential tax consequences and emotional bias. The urge to "do something" is usually the market manipulating your emotions. Set a rule: maximum 2 trades per week.',
        });
      }
      break; // Only report the first instance
    }
  }

  // ─── 4. Concentration Creep ───────────────────────────────────────────
  // Detected: multiple buy orders for the same stock (building too large a position)
  const symbolBuyCounts: Record<string, { count: number; totalCost: number; currency: string }> = {};
  for (const buy of buys) {
    if (!symbolBuyCounts[buy.symbol]) symbolBuyCounts[buy.symbol] = { count: 0, totalCost: 0, currency: buy.currency };
    symbolBuyCounts[buy.symbol].count += 1;
    symbolBuyCounts[buy.symbol].totalCost += buy.totalCost;
  }

  const totalInvested = Object.values(symbolBuyCounts).reduce((s, v) => s + v.totalCost, 0);

  for (const [symbol, data] of Object.entries(symbolBuyCounts)) {
    const pctOfPortfolio = totalInvested > 0 ? (data.totalCost / totalInvested) * 100 : 0;
    if (data.count >= 3 || pctOfPortfolio > 30) {
      const severity = pctOfPortfolio > 50 ? 'severe' : pctOfPortfolio > 30 ? 'moderate' : 'mild';
      patterns.push({
        type: 'concentration_creep',
        severity,
        description: `You've bought ${symbol} ${data.count} times, accumulating ${pctOfPortfolio.toFixed(0)}% of your total invested capital in one stock.`,
        evidence: `${data.count} separate buy orders for ${symbol}, totaling ${data.currency} ${data.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0 })}.`,
        lesson: `Even if you love a company, putting more than 15-20% in any single stock means one piece of bad news could devastate your portfolio. Spread that conviction across the sector instead — buy 3 healthcare stocks instead of tripling down on one.`,
      });
    }
  }

  return patterns;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BehaviorPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    const orders = getOrders();
    setOrderCount(orders.length);
    setPatterns(analyzeOrders(orders));
  }, []);

  const severityCount = {
    severe: patterns.filter(p => p.severity === 'severe').length,
    moderate: patterns.filter(p => p.severity === 'moderate').length,
    mild: patterns.filter(p => p.severity === 'mild').length,
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-[var(--accent)]" />
          Behavior Report
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Honest analysis of your trading patterns — based on your actual order history
        </p>
      </div>

      {/* No orders */}
      {orderCount === 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <Brain className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
          <p className="text-sm font-medium">No orders to analyze yet</p>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-sm mx-auto">
            Once you log some trades in the <a href="/orders" className="text-[var(--primary)] hover:underline">Order History</a>, this page will detect emotional patterns like panic selling, FOMO buying, and overtrading.
          </p>
        </div>
      )}

      {/* Summary */}
      {orderCount > 0 && (
        <>
          <div className={`rounded-xl border p-5 ${
            patterns.length === 0
              ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
              : severityCount.severe > 0
              ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5'
              : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
          }`}>
            <div className="flex items-start gap-3">
              {patterns.length === 0 ? (
                <Target className="h-5 w-5 text-[var(--gain)] flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
              )}
              <div>
                {patterns.length === 0 ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--gain)]">No emotional patterns detected</p>
                    <p className="text-xs text-[var(--foreground)]/70 mt-1">
                      Based on {orderCount} orders, your trading behavior looks disciplined. Keep it up.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">
                      {patterns.length} behavioral pattern{patterns.length > 1 ? 's' : ''} detected
                    </p>
                    <p className="text-xs text-[var(--foreground)]/70 mt-1">
                      Analyzed {orderCount} orders. Found {severityCount.severe > 0 ? `${severityCount.severe} severe, ` : ''}{severityCount.moderate > 0 ? `${severityCount.moderate} moderate` : ''}{severityCount.mild > 0 ? `, ${severityCount.mild} mild` : ''} issue{patterns.length > 1 ? 's' : ''}.
                      These are common beginner mistakes — recognizing them is the first step to fixing them.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Individual patterns */}
          {patterns.map((pattern, i) => (
            <PatternCard key={i} pattern={pattern} />
          ))}

          {/* Overall note */}
          {patterns.length > 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                <strong>Note:</strong> This analysis looks at patterns in your logged orders.
                It cannot read your mind — maybe you had good reasons for each trade.
                But statistically, these patterns cost beginner investors 2-4% per year in unnecessary losses.
                Awareness is the cure.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ─── Pattern Card ────────────────────────────────────────────────────────────

function PatternCard({ pattern }: { pattern: Pattern }) {
  const config = {
    panic_sell: { icon: <TrendingDown className="h-5 w-5" />, label: 'Panic Selling', color: 'text-[var(--loss)]', border: 'border-[var(--loss)]/20' },
    fomo_buy: { icon: <Flame className="h-5 w-5" />, label: 'FOMO Buying', color: 'text-[var(--warning)]', border: 'border-[var(--warning)]/20' },
    overtrading: { icon: <Repeat className="h-5 w-5" />, label: 'Overtrading', color: 'text-[var(--accent)]', border: 'border-[var(--accent)]/20' },
    concentration_creep: { icon: <Target className="h-5 w-5" />, label: 'Concentration Creep', color: 'text-[var(--primary)]', border: 'border-[var(--primary)]/20' },
  };

  const c = config[pattern.type];
  const severityLabel = { mild: 'Low concern', moderate: 'Moderate concern', severe: 'Serious concern' }[pattern.severity];
  const severityColor = { mild: 'text-[var(--muted)]', moderate: 'text-[var(--warning)]', severe: 'text-[var(--loss)]' }[pattern.severity];

  return (
    <div className={`rounded-xl border ${c.border} bg-[var(--card)] p-5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={c.color}>{c.icon}</span>
          <span className={`text-sm font-bold ${c.color}`}>{c.label}</span>
        </div>
        <span className={`text-[10px] font-medium ${severityColor}`}>{severityLabel}</span>
      </div>

      {/* What happened */}
      <p className="text-xs font-medium text-[var(--foreground)]">
        {pattern.description}
      </p>

      {/* Evidence */}
      <div className="mt-2 rounded-lg bg-black/20 px-3 py-2">
        <p className="text-[10px] text-[var(--muted)]">{pattern.evidence}</p>
      </div>

      {/* Lesson */}
      <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
        <p className="text-[10px] font-medium text-[var(--foreground)]/50 uppercase tracking-wider mb-1">What to do differently:</p>
        <p className="text-xs text-[var(--foreground)]/70 leading-relaxed">{pattern.lesson}</p>
      </div>
    </div>
  );
}
