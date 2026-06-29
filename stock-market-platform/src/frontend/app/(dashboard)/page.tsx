'use client';

import { useState } from 'react';
import {
  Shield, TrendingUp, TrendingDown, DollarSign, Target,
  Globe, AlertTriangle, Sparkles, ArrowRight, Zap,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SmartPick {
  symbol: string;
  name: string;
  price: number;
  smartScore: number;
  verdict: string;
  riskLevel: string;
  safetyScore: number;
  valueScore: number;
  sector: string;
  region: string;
  reasons: string[];
  idealPositionPct: number;
}

interface RiskMetric {
  label: string;
  value: number;
  status: 'safe' | 'caution' | 'danger';
  description: string;
}

// ─── Mock Data (connected to backend in production) ──────────────────────────

const SMART_PICKS: SmartPick[] = [
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 158.42, smartScore: 82, verdict: 'Strong Buy', riskLevel: 'low', safetyScore: 88, valueScore: 72, sector: 'Healthcare', region: 'US', reasons: ['Fortress balance sheet', '62yr dividend growth', 'Beta 0.6'], idealPositionPct: 6 },
  { symbol: 'MSFT', name: 'Microsoft', price: 425.30, smartScore: 78, verdict: 'Buy', riskLevel: 'low', safetyScore: 82, valueScore: 58, sector: 'Technology', region: 'US', reasons: ['Dominant cloud position', 'Strong FCF yield', 'A+ credit rating'], idealPositionPct: 5 },
  { symbol: 'PG', name: 'Procter & Gamble', price: 167.85, smartScore: 76, verdict: 'Buy', riskLevel: 'low', safetyScore: 90, valueScore: 62, sector: 'Consumer Staples', region: 'US', reasons: ['Recession-proof business', '68yr dividend streak', 'Low volatility'], idealPositionPct: 6 },
  { symbol: 'NESN.SW', name: 'Nestle', price: 98.20, smartScore: 74, verdict: 'Buy', riskLevel: 'low', safetyScore: 85, valueScore: 68, sector: 'Consumer Staples', region: 'EU', reasons: ['Global brand moat', '28yr dividend growth', 'Geographic diversification'], idealPositionPct: 4 },
  { symbol: 'UNH', name: 'UnitedHealth Group', price: 532.10, smartScore: 73, verdict: 'Buy', riskLevel: 'moderate', safetyScore: 72, valueScore: 65, sector: 'Healthcare', region: 'US', reasons: ['Earnings consistency', 'Aging population tailwind', 'Pricing power'], idealPositionPct: 4 },
  { symbol: '7203.T', name: 'Toyota Motor', price: 42.15, smartScore: 71, verdict: 'Buy', riskLevel: 'low', safetyScore: 80, valueScore: 70, sector: 'Industrials', region: 'ASIA', reasons: ['Undervalued vs peers', 'EV transition leader', 'Strong cash position'], idealPositionPct: 4 },
];


const RISK_METRICS: RiskMetric[] = [
  { label: 'Portfolio Safety', value: 82, status: 'safe', description: 'Strong capital protection' },
  { label: 'Diversification', value: 75, status: 'safe', description: '5 sectors, 3 regions' },
  { label: 'Max Drawdown Risk', value: 14, status: 'caution', description: '14% worst-case loss' },
  { label: 'Concentration', value: 18, status: 'safe', description: 'No single stock > 6%' },
];

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [budget, setBudget] = useState(1000);

  return (
    <div className="space-y-6 pb-8">
      {/* Welcome + Budget */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-500" />
            Smart Investor Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered stock picks optimized for capital preservation
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm text-muted-foreground">Budget:</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-24 bg-transparent text-right font-semibold outline-none"
            min={100}
            step={100}
          />
        </div>
      </div>

      {/* Risk Guardian Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RISK_METRICS.map((metric) => (
          <RiskCard key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Smart Picks */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Top Smart Picks for Your Budget</h2>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
            Risk-First Scoring
          </span>
        </div>
        <div className="divide-y divide-border">
          {SMART_PICKS.map((pick, i) => (
            <SmartPickRow key={pick.symbol} pick={pick} rank={i + 1} budget={budget} />
          ))}
        </div>
      </div>


      {/* Bottom Grid: Global Opportunities + Guardian Tips */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Global Opportunities */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Global Opportunities</h2>
          </div>
          <div className="space-y-3">
            <RegionBar region="United States" count={3} avgScore={78} color="bg-blue-500" />
            <RegionBar region="Europe" count={1} avgScore={74} color="bg-purple-500" />
            <RegionBar region="Asia Pacific" count={1} avgScore={71} color="bg-orange-500" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Scanning 11 exchanges across 3 regions for the safest opportunities
          </p>
        </div>

        {/* Guardian Tips */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">Guardian Tips</h2>
          </div>
          <div className="space-y-3">
            <GuardianTip
              icon={<Target className="h-4 w-4" />}
              title="Position Sizing"
              tip={`With $${budget}, keep each stock under $${Math.round(budget * 0.05)} (5% max)`}
              type="info"
            />
            <GuardianTip
              icon={<Zap className="h-4 w-4" />}
              title="DCA Recommended"
              tip={budget >= 2000 ? "Split into 4 weekly purchases to reduce timing risk" : "Invest the full amount now; set up monthly $50-100 auto-invest"}
              type="tip"
            />
            <GuardianTip
              icon={<AlertTriangle className="h-4 w-4" />}
              title="Emergency Fund First"
              tip="Ensure you have 3-6 months expenses saved before investing"
              type="warning"
            />
            <GuardianTip
              icon={<Shield className="h-4 w-4" />}
              title="Stop-Loss Protection"
              tip="Set stop-losses at 15-20% below purchase price on all positions"
              type="info"
            />
          </div>
        </div>
      </div>
    </div>
  );
}



// ─── Components ──────────────────────────────────────────────────────────────

function RiskCard({ metric }: { metric: RiskMetric }) {
  const colors = {
    safe: 'border-emerald-500/30 bg-emerald-500/5',
    caution: 'border-yellow-500/30 bg-yellow-500/5',
    danger: 'border-red-500/30 bg-red-500/5',
  };
  const textColors = {
    safe: 'text-emerald-500',
    caution: 'text-yellow-500',
    danger: 'text-red-500',
  };

  return (
    <div className={`rounded-xl border p-3 ${colors[metric.status]}`}>
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className={`text-xl font-bold mt-1 ${textColors[metric.status]}`}>
        {metric.label === 'Max Drawdown Risk' ? `${metric.value}%` : `${metric.value}/100`}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{metric.description}</p>
    </div>
  );
}

function SmartPickRow({ pick, rank, budget }: { pick: SmartPick; rank: number; budget: number }) {
  const shares = Math.floor((budget * pick.idealPositionPct / 100) / pick.price);
  const cost = shares * pick.price;

  const riskColors: Record<string, string> = {
    low: 'bg-emerald-500/10 text-emerald-500',
    moderate: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-red-500/10 text-red-500',
  };

  const verdictColors: Record<string, string> = {
    'Strong Buy': 'text-emerald-500',
    'Buy': 'text-blue-400',
    'Hold': 'text-yellow-500',
  };

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/50 transition-colors">
      {/* Rank */}
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {rank}
      </div>

      {/* Stock info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{pick.symbol}</span>
          <span className="text-xs text-muted-foreground truncate">{pick.name}</span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{pick.region}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{pick.sector}</span>
          <span className="text-[10px] text-muted-foreground">•</span>
          <span className="text-[10px] text-muted-foreground">{pick.reasons[0]}</span>
        </div>
      </div>

      {/* Smart Score */}
      <div className="hidden sm:flex flex-col items-center">
        <ScoreRing score={pick.smartScore} size={36} />
        <span className="text-[9px] text-muted-foreground mt-0.5">Score</span>
      </div>

      {/* Risk badge */}
      <span className={`hidden md:inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[pick.riskLevel]}`}>
        {pick.riskLevel}
      </span>

      {/* Price & position */}
      <div className="text-right">
        <p className="text-sm font-semibold">${pick.price.toFixed(2)}</p>
        <p className="text-[10px] text-muted-foreground">
          {shares > 0 ? `${shares} shares = $${cost.toFixed(0)}` : 'Fractional'}
        </p>
      </div>

      {/* Verdict */}
      <span className={`hidden lg:inline text-xs font-medium ${verdictColors[pick.verdict] || 'text-muted-foreground'}`}>
        {pick.verdict}
      </span>
    </div>
  );
}



function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" strokeWidth={3} className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={3} strokeDasharray={circumference}
          strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
        {score}
      </span>
    </div>
  );
}

function RegionBar({ region, count, avgScore, color }: {
  region: string; count: number; avgScore: number; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm">{region}</span>
          <span className="text-xs text-muted-foreground">{count} picks, avg {avgScore}/100</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${avgScore}%` }} />
        </div>
      </div>
    </div>
  );
}

function GuardianTip({ icon, title, tip, type }: {
  icon: React.ReactNode; title: string; tip: string; type: 'info' | 'tip' | 'warning';
}) {
  const colors = {
    info: 'border-l-blue-500 bg-blue-500/5',
    tip: 'border-l-emerald-500 bg-emerald-500/5',
    warning: 'border-l-yellow-500 bg-yellow-500/5',
  };

  return (
    <div className={`border-l-4 rounded-r-lg p-3 ${colors[type]}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground pl-6">{tip}</p>
    </div>
  );
}
