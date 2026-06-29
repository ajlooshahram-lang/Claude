'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, DollarSign, Shield } from 'lucide-react';
import { getProfile, RiskProfile } from '@/lib/profile';
import { LearningTip } from '@/components/learning-tip';

// ─── Allocation Models ───────────────────────────────────────────────────────

interface Allocation {
  label: string;
  pct: number;
  color: string;
  description: string;
}

const ALLOCATIONS: Record<RiskProfile, { slices: Allocation[]; explanation: string }> = {
  Conservative: {
    slices: [
      { label: 'Stable Sectors', pct: 40, color: 'bg-[var(--gain)]', description: 'Healthcare, Consumer Staples, Utilities — companies people need regardless of the economy' },
      { label: 'Blue-Chip Stocks', pct: 35, color: 'bg-[var(--primary)]', description: 'Large, well-established companies with decades of proven performance (JNJ, KO, PG)' },
      { label: 'Cash Reserve', pct: 20, color: 'bg-[var(--muted)]', description: 'Keep in your bank account — available if an emergency happens or a great opportunity appears' },
      { label: 'Growth Exposure', pct: 5, color: 'bg-[var(--accent)]', description: 'A tiny slice in quality tech companies for long-term growth potential' },
    ],
    explanation: "As a Conservative investor, your plan prioritizes protecting your money above all else. The majority goes to stable, recession-resistant companies that pay reliable dividends. A 20% cash reserve acts as your safety net — you'll never be forced to sell stocks at a bad time if you need money suddenly. The small 5% growth slice keeps you connected to long-term trends without taking real risk.",
  },
  Moderate: {
    slices: [
      { label: 'Stable Sectors', pct: 30, color: 'bg-[var(--gain)]', description: 'Healthcare, Consumer Staples — your defensive foundation that holds up in downturns' },
      { label: 'Blue-Chip Growth', pct: 35, color: 'bg-[var(--primary)]', description: 'High-quality large companies with growth potential (MSFT, V, UNH)' },
      { label: 'Opportunistic', pct: 20, color: 'bg-[var(--accent)]', description: 'Sectors with positive momentum this month — rotate based on what the market rewards' },
      { label: 'Cash Reserve', pct: 10, color: 'bg-[var(--muted)]', description: 'A smaller buffer for emergencies and buying dips when good stocks go on sale' },
      { label: 'International', pct: 5, color: 'bg-[var(--warning)]', description: 'Global diversification — stocks from Europe or Asia to reduce single-country risk' },
    ],
    explanation: "Your Moderate plan balances safety with growth. You have a solid defensive base (30% in stable sectors) but also meaningful growth exposure (35% in blue-chip growers). The 20% opportunistic slice lets you take advantage of current market momentum — check the Sectors page to see what's working this week. A 10% cash reserve keeps you flexible without sacrificing too much growth.",
  },
  Growth: {
    slices: [
      { label: 'Growth Leaders', pct: 40, color: 'bg-[var(--primary)]', description: 'Companies growing revenue fast — Technology, innovative Healthcare, Fintech' },
      { label: 'Momentum Plays', pct: 25, color: 'bg-[var(--accent)]', description: 'Stocks with the strongest recent price trends — follow what the market is rewarding' },
      { label: 'Blue-Chip Anchor', pct: 20, color: 'bg-[var(--gain)]', description: 'Even aggressive portfolios need some stability — large proven companies as your foundation' },
      { label: 'International', pct: 10, color: 'bg-[var(--warning)]', description: 'High-growth companies from Europe, Asia, emerging markets' },
      { label: 'Cash Reserve', pct: 5, color: 'bg-[var(--muted)]', description: 'Minimal cash — enough for one good dip-buying opportunity' },
    ],
    explanation: "Your Growth plan maximizes upside potential. You're putting 40% into the fastest-growing companies and 25% into stocks with strong recent momentum. This means bigger swings — your portfolio might drop 15-20% in a bad month, but it also has the best chance of outperforming over 2-3 years. The 20% blue-chip anchor prevents complete disaster if growth stocks crash. Only 5% cash because you want your money working, not sitting idle.",
  },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [budget, setBudget] = useState(2000);
  const [profile, setProfile] = useState<RiskProfile>('Moderate');

  useEffect(() => {
    const p = getProfile();
    if (p) setProfile(p.riskProfile);
  }, []);

  const allocation = useMemo(() => ALLOCATIONS[profile], [profile]);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PieChart className="h-6 w-6 text-[var(--primary)]" />
          Monthly Planner
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          How to split your monthly investment based on your{' '}
          <span className="font-medium text-[var(--foreground)]">{profile}</span> profile
        </p>
      </div>

      {/* Learning tip */}
      <LearningTip
        tipId="planner_asset_allocation"
        title="💡 Why asset allocation matters more than picking stocks"
        text="Studies show that how you divide your money across categories (sectors, styles, cash) accounts for about 90% of your long-term returns — far more than which individual stocks you pick. Getting this split right is the most impactful decision you'll make as an investor."
      />

      {/* Budget input */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <label className="text-sm font-medium flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-[var(--primary)]" />
          Monthly Investment Budget (DKK)
        </label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(Math.max(100, Number(e.target.value)))}
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-2xl font-bold outline-none focus:border-[var(--primary)] font-tabular"
          min={100}
          step={100}
        />
        <div className="flex gap-2 mt-3">
          {[500, 1000, 2000, 5000, 10000].map((amt) => (
            <button
              key={amt}
              onClick={() => setBudget(amt)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                budget === amt
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)]'
              }`}
            >
              {amt.toLocaleString()}
            </button>
          ))}
        </div>
      </div>


      {/* Pie Chart (CSS-based) */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold mb-4">Your Allocation</h2>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Visual pie */}
          <div className="relative h-44 w-44 flex-shrink-0">
            <PieChartVisual slices={allocation.slices} />
          </div>
          {/* Legend */}
          <div className="flex-1 space-y-2">
            {allocation.slices.map((slice) => (
              <div key={slice.label} className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-sm flex-shrink-0 ${slice.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{slice.label}</span>
                    <span className="text-xs font-bold font-tabular">
                      {slice.pct}% · {Math.round(budget * slice.pct / 100).toLocaleString()} DKK
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed breakdown */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold mb-3">Breakdown</h2>
        {allocation.slices.map((slice) => (
          <div key={slice.label} className="rounded-lg border border-[var(--card-border)] bg-black/20 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-sm ${slice.color}`} />
                <span className="text-xs font-semibold">{slice.label}</span>
              </div>
              <span className="text-sm font-bold font-tabular">
                {Math.round(budget * slice.pct / 100).toLocaleString()} DKK
              </span>
            </div>
            <p className="text-[11px] text-[var(--foreground)]/60 leading-relaxed pl-[18px]">
              {slice.description}
            </p>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-5">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-[var(--primary)] mb-1.5">
              Why this split works for a {profile} investor
            </p>
            <p className="text-xs leading-relaxed text-[var(--foreground)]/70">
              {allocation.explanation}
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--muted)] text-center">
        This is a general guideline based on your risk profile, not personal financial advice.
        Adjust based on your specific situation, timeline, and financial goals.
      </p>
    </div>
  );
}


// ─── Pie Chart (pure CSS conic-gradient) ─────────────────────────────────────

function PieChartVisual({ slices }: { slices: Allocation[] }) {
  // Build conic-gradient from slices
  const colorMap: Record<string, string> = {
    'bg-[var(--gain)]': '#10b981',
    'bg-[var(--primary)]': '#3b82f6',
    'bg-[var(--muted)]': '#6b7280',
    'bg-[var(--accent)]': '#8b5cf6',
    'bg-[var(--warning)]': '#f59e0b',
  };

  let accumulated = 0;
  const stops: string[] = [];
  for (const slice of slices) {
    const color = colorMap[slice.color] || '#6b7280';
    const start = accumulated;
    accumulated += slice.pct;
    stops.push(`${color} ${start}% ${accumulated}%`);
  }

  const gradient = `conic-gradient(${stops.join(', ')})`;

  return (
    <div
      className="h-full w-full rounded-full"
      style={{ background: gradient }}
    >
      {/* Center hole for donut effect */}
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-24 w-24 rounded-full bg-[var(--card)] flex flex-col items-center justify-center">
          <p className="text-lg font-bold font-tabular">{slices.reduce((s, sl) => s + sl.pct, 0)}%</p>
          <p className="text-[9px] text-[var(--muted)]">allocated</p>
        </div>
      </div>
    </div>
  );
}
