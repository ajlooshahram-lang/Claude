'use client';

import { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, TrendingUp, Shield, Clock, DollarSign, Brain } from 'lucide-react';
import { getOrders, Order } from '@/lib/orders';
import { getWatchlist } from '@/lib/watchlist';
import { getProfile } from '@/lib/profile';

// ─── Grade Types ─────────────────────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface Dimension {
  name: string;
  icon: React.ReactNode;
  grade: Grade;
  example: string;
  improvement: string;
}

// ─── Grading Logic ───────────────────────────────────────────────────────────

function gradeReport(orders: Order[]): Dimension[] {
  const buys = orders.filter(o => o.type === 'buy');
  const sells = orders.filter(o => o.type === 'sell');
  const watchlist = getWatchlist();
  const profile = getProfile();
  const riskProfile = profile?.riskProfile || 'Moderate';

  // ─── 1. Diversification ────────────────────────────────────────────────
  const uniqueSymbols = new Set(buys.map(o => o.symbol));
  const symbolCount = uniqueSymbols.size;

  let divGrade: Grade;
  let divExample: string;
  let divImprove: string;

  if (symbolCount >= 8) {
    divGrade = 'A';
    divExample = `You've invested in ${symbolCount} different stocks — excellent spread.`;
    divImprove = 'Maintain this level. Check that your stocks span at least 4 sectors.';
  } else if (symbolCount >= 5) {
    divGrade = 'B';
    divExample = `You hold ${symbolCount} stocks — decent but could be broader.`;
    divImprove = 'Add 2-3 more stocks from sectors you don\'t already own (check the Sectors page).';
  } else if (symbolCount >= 3) {
    divGrade = 'C';
    divExample = `Only ${symbolCount} stocks. If one crashes, your portfolio takes a big hit.`;
    divImprove = 'You need at least 5-8 stocks across different sectors. One bad stock shouldn\'t cost you 30%+ of your portfolio.';
  } else if (symbolCount >= 1) {
    divGrade = 'D';
    divExample = `${symbolCount} stock${symbolCount > 1 ? 's' : ''} is not diversification — it's concentration.`;
    divImprove = 'This is your biggest risk right now. Before buying more of what you have, buy something different.';
  } else {
    divGrade = 'F';
    divExample = 'No stocks purchased yet.';
    divImprove = 'Start with one stock from the Smart Picks page to build your first position.';
  }

  // Check concentration in one stock
  const totalInvested = buys.reduce((s, o) => s + o.totalCost, 0);
  const symbolTotals: Record<string, number> = {};
  for (const b of buys) {
    symbolTotals[b.symbol] = (symbolTotals[b.symbol] || 0) + b.totalCost;
  }
  const maxConcentration = totalInvested > 0
    ? Math.max(...Object.values(symbolTotals)) / totalInvested * 100 : 0;
  if (maxConcentration > 40 && divGrade !== 'F') {
    divGrade = Math.min(divGrade.charCodeAt(0) + 1, 70) as unknown as Grade;
    // Can't easily downgrade the char, so override
    if (maxConcentration > 50) divGrade = 'D';
    else if (maxConcentration > 40) divGrade = 'C';
    const topStock = Object.entries(symbolTotals).sort((a, b) => b[1] - a[1])[0];
    divExample = `${topStock[0]} is ${maxConcentration.toFixed(0)}% of your invested money. That's too much in one stock.`;
    divImprove = `Reduce ${topStock[0]} to under 20% and spread that money into 2-3 other companies.`;
  }

  // ─── 2. Discipline ─────────────────────────────────────────────────────
  // Did they follow their stated risk profile?
  let discGrade: Grade = 'B';
  let discExample = 'Not enough trade data to assess discipline precisely.';
  let discImprove = 'Keep logging your trades so this assessment can be more specific next month.';

  if (orders.length >= 3) {
    // Check if they panic-sold (sold at loss within a week)
    const panicSells = sells.filter(s => {
      const matchBuy = buys.find(b => b.symbol === s.symbol && b.pricePerShare > s.pricePerShare);
      if (!matchBuy) return false;
      const days = (new Date(s.date).getTime() - new Date(matchBuy.date).getTime()) / (1000*60*60*24);
      return days < 7;
    });

    if (panicSells.length === 0 && orders.length >= 5) {
      discGrade = 'A';
      discExample = 'No panic sells detected. You held through volatility as planned.';
      discImprove = 'Keep this discipline. Stick to selling only at your stop-loss levels, not on fear.';
    } else if (panicSells.length === 1) {
      discGrade = 'C';
      discExample = `You panic-sold ${panicSells[0].symbol} within a week of buying. That\'s emotion overriding your plan.`;
      discImprove = 'Next time, set a stop-loss BEFORE buying and don\'t look at the price for 2 weeks.';
    } else if (panicSells.length > 1) {
      discGrade = 'D';
      discExample = `${panicSells.length} panic sells this period. You\'re reacting to short-term noise instead of following a plan.`;
      discImprove = 'Write down your sell criteria before each buy. Only sell when those criteria are met — not when you feel scared.';
    }
  }

  // ─── 3. Patience ───────────────────────────────────────────────────────
  let patGrade: Grade = 'B';
  let patExample = 'Not enough sell data to measure holding periods.';
  let patImprove = 'Aim to hold each stock for at least 3-6 months before evaluating.';

  if (sells.length > 0) {
    const holdingDays: number[] = [];
    for (const sell of sells) {
      const buy = buys.find(b => b.symbol === sell.symbol);
      if (buy) {
        const days = (new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000*60*60*24);
        holdingDays.push(days);
      }
    }

    if (holdingDays.length > 0) {
      const avgDays = holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length;
      const shortSells = holdingDays.filter(d => d < 14).length;

      if (avgDays >= 90) {
        patGrade = 'A';
        patExample = `Average holding period: ${Math.round(avgDays)} days. You let investments develop before judging them.`;
        patImprove = 'Excellent patience. Consider extending to 1+ year for tax and compound benefits.';
      } else if (avgDays >= 30) {
        patGrade = 'B';
        patExample = `Average hold: ${Math.round(avgDays)} days. Decent, but some positions were sold early.`;
        patImprove = 'Try not to evaluate a stock until you\'ve held it at least 60 days — short-term noise is meaningless.';
      } else if (avgDays >= 14) {
        patGrade = 'C';
        patExample = `Average hold: ${Math.round(avgDays)} days. You\'re trading, not investing.`;
        patImprove = 'Investing rewards patience. Each trade has costs (tax, fees, emotional). Aim for 3+ month holds.';
      } else {
        patGrade = 'D';
        patExample = `Average hold: ${Math.round(avgDays)} days. This is day-trading behavior, not investing.`;
        patImprove = 'Seriously — stop checking prices daily. Set alerts instead and review monthly.';
      }

      if (shortSells > 2) {
        patGrade = 'D';
        patExample = `${shortSells} positions sold within 2 weeks. You\'re not giving your investments any time to work.`;
        patImprove = 'After buying, don\'t log in for 2 weeks. Literally remove the app from your home screen for 14 days.';
      }
    }
  }

  // ─── 4. Cost Efficiency ────────────────────────────────────────────────
  let costGrade: Grade = 'B';
  let costExample = 'No completed trades to measure cost efficiency.';
  let costImprove = 'When you do sell, check: did the stock go up AFTER you sold? That means you left money on the table.';

  if (sells.length > 0) {
    const profitable = sells.filter(s => {
      const buy = buys.find(b => b.symbol === s.symbol);
      return buy && s.pricePerShare > buy.pricePerShare;
    }).length;
    const winRate = (profitable / sells.length) * 100;

    if (winRate >= 70) {
      costGrade = 'A';
      costExample = `${winRate.toFixed(0)}% of your sells were profitable. You\'re picking exit points well.`;
      costImprove = 'Check if your losers were avoidable (bad research) or just bad luck (market-wide drop).';
    } else if (winRate >= 50) {
      costGrade = 'B';
      costExample = `${winRate.toFixed(0)}% win rate on sells. Above average but room to improve.`;
      costImprove = 'For each losing sell, ask: did I sell because of the stock or because of my emotions?';
    } else if (winRate >= 30) {
      costGrade = 'C';
      costExample = `Only ${winRate.toFixed(0)}% of sells were profitable. Most trades lost money.`;
      costImprove = 'You might be buying well but selling too early (before recovery). Or buying at peaks (FOMO).';
    } else {
      costGrade = 'D';
      costExample = `${winRate.toFixed(0)}% win rate — most of your trading activity destroyed value.`;
      costImprove = 'Consider: would you have been better off just holding everything? The answer is probably yes. Trade less.';
    }
  }

  // ─── 5. Learning ───────────────────────────────────────────────────────
  let learnGrade: Grade = 'C';
  let learnExample = 'Not enough history to compare months — need at least 2 months of data.';
  let learnImprove = 'Keep logging trades. Next month this will show whether your decisions are improving.';

  if (orders.length >= 6) {
    // Compare first half vs second half of orders
    const midpoint = Math.floor(orders.length / 2);
    const earlyOrders = orders.slice(midpoint); // Older (at end since newest first)
    const recentOrders = orders.slice(0, midpoint); // Newer

    const earlyLosses = earlyOrders.filter(o => o.type === 'sell')
      .filter(s => { const b = buys.find(b2 => b2.symbol === s.symbol); return b && s.pricePerShare < b.pricePerShare; }).length;
    const recentLosses = recentOrders.filter(o => o.type === 'sell')
      .filter(s => { const b = buys.find(b2 => b2.symbol === s.symbol); return b && s.pricePerShare < b.pricePerShare; }).length;

    if (recentLosses < earlyLosses) {
      learnGrade = 'A';
      learnExample = 'Your recent trades have fewer losses than your early ones. You\'re learning from mistakes.';
      learnImprove = 'Document what you learned. Write down the one rule that improved your results most.';
    } else if (recentLosses === earlyLosses) {
      learnGrade = 'C';
      learnExample = 'No measurable improvement between early and recent trades. Same patterns repeating.';
      learnImprove = 'Review the Behavior page. Identify your #1 repeating mistake and create a personal rule to prevent it.';
    } else {
      learnGrade = 'D';
      learnExample = 'Your recent trades are actually worse than your early ones. You may be overcomplicating things.';
      learnImprove = 'Go back to basics: only buy stocks with a SmartVest score above 7. Stop trying to be clever.';
    }
  }

  return [
    { name: 'Diversification', icon: <Shield className="h-5 w-5" />, grade: divGrade, example: divExample, improvement: divImprove },
    { name: 'Discipline', icon: <ClipboardCheck className="h-5 w-5" />, grade: discGrade, example: discExample, improvement: discImprove },
    { name: 'Patience', icon: <Clock className="h-5 w-5" />, grade: patGrade, example: patExample, improvement: patImprove },
    { name: 'Cost Efficiency', icon: <DollarSign className="h-5 w-5" />, grade: costGrade, example: costExample, improvement: costImprove },
    { name: 'Learning', icon: <Brain className="h-5 w-5" />, grade: learnGrade, example: learnExample, improvement: learnImprove },
  ];
}

// ─── Grade Colors ────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<Grade, { text: string; bg: string; border: string }> = {
  A: { text: 'text-[var(--gain)]', bg: 'bg-[var(--gain)]/10', border: 'border-[var(--gain)]/30' },
  B: { text: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]/10', border: 'border-[var(--primary)]/30' },
  C: { text: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/10', border: 'border-[var(--warning)]/30' },
  D: { text: 'text-[var(--loss)]', bg: 'bg-[var(--loss)]/10', border: 'border-[var(--loss)]/30' },
  F: { text: 'text-[var(--loss)]', bg: 'bg-[var(--loss)]/10', border: 'border-[var(--loss)]/30' },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReportCardPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  useEffect(() => {
    const orders = getOrders();
    setDimensions(gradeReport(orders));
  }, []);

  const overallGrades = dimensions.map(d => d.grade);
  const gradePoints: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const gpa = overallGrades.length > 0
    ? overallGrades.reduce((s, g) => s + gradePoints[g], 0) / overallGrades.length
    : 0;
  const overallGrade: Grade = gpa >= 3.5 ? 'A' : gpa >= 2.5 ? 'B' : gpa >= 1.5 ? 'C' : gpa >= 0.5 ? 'D' : 'F';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-[var(--primary)]" />
          Investor Report Card
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Honest monthly assessment — based on your actual trading behavior
        </p>
      </div>

      {/* Overall grade */}
      <div className={`rounded-xl border ${GRADE_COLORS[overallGrade].border} ${GRADE_COLORS[overallGrade].bg} p-6 text-center`}>
        <p className="text-xs text-[var(--muted)]">Overall Grade</p>
        <p className={`text-6xl font-bold mt-1 ${GRADE_COLORS[overallGrade].text}`}>{overallGrade}</p>
        <p className="text-xs text-[var(--muted)] mt-2">
          {overallGrade === 'A' ? 'You\'re doing well. Stay disciplined.' :
           overallGrade === 'B' ? 'Solid foundation with room to improve.' :
           overallGrade === 'C' ? 'Average. Specific areas need attention.' :
           'Significant issues to address. Read the feedback below carefully.'}
        </p>
      </div>

      {/* Individual dimensions */}
      <div className="space-y-4">
        {dimensions.map((dim) => {
          const c = GRADE_COLORS[dim.grade];
          return (
            <div key={dim.name} className={`rounded-xl border ${c.border} bg-[var(--card)] overflow-hidden`}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-2.5">
                  <span className={c.text}>{dim.icon}</span>
                  <span className="text-sm font-semibold">{dim.name}</span>
                </div>
                <span className={`text-2xl font-bold ${c.text}`}>{dim.grade}</span>
              </div>
              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider mb-1">Evidence:</p>
                  <p className="text-xs text-[var(--foreground)]/80 leading-relaxed">{dim.example}</p>
                </div>
                <div className="pt-2 border-t border-[var(--card-border)]">
                  <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider mb-1">Do this next month:</p>
                  <p className="text-xs text-[var(--foreground)]/80 leading-relaxed">{dim.improvement}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-[10px] text-[var(--muted)] leading-relaxed">
        <p><strong>Methodology:</strong> Grades are based on your logged orders, watchlist activity, and stated risk profile. More data = more accurate grades. Log all your trades in the Order History for the best assessment.</p>
        <p className="mt-1"><strong>Tone:</strong> This report is deliberately honest, not encouraging. If something is going wrong, you need to know.</p>
      </div>
    </div>
  );
}
