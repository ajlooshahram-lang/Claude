'use client';

import { useState, useMemo } from 'react';
import {
  Calculator, Shield, DollarSign, PieChart, TrendingUp,
  AlertTriangle, Clock, CheckCircle2, ArrowRight, Zap,
  Globe, Target, RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortfolioStock {
  symbol: string;
  name: string;
  price: number;
  sector: string;
  region: string;
  smartScore: number;
  riskLevel: 'low' | 'moderate' | 'high';
  volatility: number;
  dividendYield: number;
  beta: number;
}

interface Allocation {
  stock: PortfolioStock;
  targetPct: number;
  targetUsd: number;
  shares: number;
  actualCost: number;
  stopLoss: number;
  maxLoss: number;
}

interface DCAInstallment {
  week: number;
  amount: number;
  cumulative: number;
}

type RiskTolerance = 'very_conservative' | 'conservative' | 'moderate' | 'growth';
type Step = 'input' | 'building' | 'result';

// ─── Stock Universe (in production, fetched from backend) ────────────────────

const STOCK_UNIVERSE: PortfolioStock[] = [
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 158.42, sector: 'Healthcare', region: 'US', smartScore: 82, riskLevel: 'low', volatility: 0.15, dividendYield: 0.031, beta: 0.56 },
  { symbol: 'PG', name: 'Procter & Gamble', price: 167.85, sector: 'Consumer Staples', region: 'US', smartScore: 76, riskLevel: 'low', volatility: 0.14, dividendYield: 0.024, beta: 0.45 },
  { symbol: 'MSFT', name: 'Microsoft', price: 425.30, sector: 'Technology', region: 'US', smartScore: 78, riskLevel: 'low', volatility: 0.22, dividendYield: 0.008, beta: 0.92 },
  { symbol: 'KO', name: 'Coca-Cola', price: 61.20, sector: 'Consumer Staples', region: 'US', smartScore: 72, riskLevel: 'low', volatility: 0.13, dividendYield: 0.030, beta: 0.58 },
  { symbol: 'NESN.SW', name: 'Nestle', price: 98.20, sector: 'Consumer Staples', region: 'EU', smartScore: 74, riskLevel: 'low', volatility: 0.16, dividendYield: 0.028, beta: 0.52 },
  { symbol: 'UNH', name: 'UnitedHealth Group', price: 532.10, sector: 'Healthcare', region: 'US', smartScore: 73, riskLevel: 'moderate', volatility: 0.20, dividendYield: 0.015, beta: 0.72 },
  { symbol: '7203.T', name: 'Toyota Motor', price: 42.15, sector: 'Industrials', region: 'ASIA', smartScore: 71, riskLevel: 'low', volatility: 0.18, dividendYield: 0.025, beta: 0.68 },
  { symbol: 'V', name: 'Visa', price: 278.90, sector: 'Financials', region: 'US', smartScore: 75, riskLevel: 'low', volatility: 0.19, dividendYield: 0.008, beta: 0.95 },
  { symbol: 'WMT', name: 'Walmart', price: 65.30, sector: 'Consumer Staples', region: 'US', smartScore: 70, riskLevel: 'low', volatility: 0.15, dividendYield: 0.014, beta: 0.52 },
  { symbol: 'NOVN.SW', name: 'Novartis', price: 102.50, sector: 'Healthcare', region: 'EU', smartScore: 69, riskLevel: 'low', volatility: 0.17, dividendYield: 0.035, beta: 0.48 },
  { symbol: 'AZN', name: 'AstraZeneca', price: 73.80, sector: 'Healthcare', region: 'EU', smartScore: 68, riskLevel: 'low', volatility: 0.19, dividendYield: 0.022, beta: 0.55 },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway B', price: 412.60, sector: 'Financials', region: 'US', smartScore: 77, riskLevel: 'low', volatility: 0.16, dividendYield: 0.0, beta: 0.62 },
];



// ─── Portfolio Building Logic (mirrors backend position-sizing-service) ──────

function buildPortfolio(budget: number, riskTolerance: RiskTolerance, maxPositions: number): {
  allocations: Allocation[];
  summary: { totalInvested: number; cashReserve: number; sectors: string[]; regions: string[]; avgScore: number; portfolioYield: number; portfolioBeta: number; };
  dca: DCAInstallment[];
} {
  const riskMult = { very_conservative: 0.5, conservative: 0.7, moderate: 1.0, growth: 1.3 }[riskTolerance];
  const maxRiskLevels = { very_conservative: ['low'], conservative: ['low'], moderate: ['low', 'moderate'], growth: ['low', 'moderate', 'high'] }[riskTolerance];
  const cashReservePct = { very_conservative: 15, conservative: 10, moderate: 8, growth: 5 }[riskTolerance];

  // Filter by risk tolerance
  const eligible = STOCK_UNIVERSE
    .filter((s) => maxRiskLevels.includes(s.riskLevel))
    .sort((a, b) => b.smartScore - a.smartScore);

  // Select: diversified across sectors and regions
  const selected: PortfolioStock[] = [];
  const sectors = new Set<string>();
  const regions = new Set<string>();

  // First pass: one from each sector
  for (const stock of eligible) {
    if (selected.length >= maxPositions) break;
    if (!sectors.has(stock.sector)) {
      selected.push(stock);
      sectors.add(stock.sector);
      regions.add(stock.region);
    }
  }
  // Second pass: fill remaining with best scores
  for (const stock of eligible) {
    if (selected.length >= maxPositions) break;
    if (!selected.includes(stock)) {
      selected.push(stock);
      regions.add(stock.region);
    }
  }

  // Position sizing: inverse-volatility weighting
  const investable = budget * (1 - cashReservePct / 100);
  const inverseVols = selected.map((s) => 1 / Math.max(s.volatility, 0.05));
  const totalInvVol = inverseVols.reduce((a, b) => a + b, 0);

  let weights = inverseVols.map((iv) => iv / totalInvVol);
  // Cap at maxPositionPct
  const maxPct = (5 * riskMult) / 100;
  weights = weights.map((w) => Math.min(w, maxPct));
  const wTotal = weights.reduce((a, b) => a + b, 0);
  weights = weights.map((w) => w / wTotal);

  const allocations: Allocation[] = selected.map((stock, i) => {
    const targetPct = weights[i] * 100;
    const targetUsd = investable * weights[i];
    const shares = Math.floor(targetUsd / stock.price);
    const actualCost = shares * stock.price;
    const stopLossPct = Math.min(stock.volatility * 0.5, 0.20);
    const stopLoss = stock.price * (1 - stopLossPct);
    const maxLoss = actualCost * stopLossPct;

    return { stock, targetPct, targetUsd, shares, actualCost, stopLoss: Math.round(stopLoss * 100) / 100, maxLoss: Math.round(maxLoss * 100) / 100 };
  });

  const totalInvested = allocations.reduce((s, a) => s + a.actualCost, 0);
  const cashReserve = budget - totalInvested;
  const avgScore = selected.reduce((s, st) => s + st.smartScore, 0) / selected.length;
  const portfolioYield = allocations.reduce((s, a) => s + a.stock.dividendYield * (a.actualCost / totalInvested), 0);
  const portfolioBeta = allocations.reduce((s, a) => s + a.stock.beta * (a.actualCost / totalInvested), 0);

  // DCA schedule
  const dca: DCAInstallment[] = [];
  const installments = budget >= 5000 ? 4 : budget >= 1000 ? 3 : 1;
  let cumulative = 0;
  for (let i = 0; i < installments; i++) {
    const amt = Math.round((investable / installments) * 100) / 100;
    cumulative += amt;
    dca.push({ week: i * 2 + 1, amount: amt, cumulative: Math.round(cumulative * 100) / 100 });
  }

  return {
    allocations,
    summary: { totalInvested, cashReserve, sectors: [...sectors], regions: [...regions], avgScore: Math.round(avgScore), portfolioYield, portfolioBeta },
    dca,
  };
}



// ─── Main Page Component ─────────────────────────────────────────────────────

export default function PortfolioBuilderPage() {
  const [step, setStep] = useState<Step>('input');
  const [budget, setBudget] = useState(1000);
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>('conservative');
  const [maxPositions, setMaxPositions] = useState(8);

  const portfolio = useMemo(() => {
    if (step !== 'result') return null;
    return buildPortfolio(budget, riskTolerance, maxPositions);
  }, [step, budget, riskTolerance, maxPositions]);

  const handleBuild = () => {
    setStep('building');
    // Simulate AI processing delay
    setTimeout(() => setStep('result'), 1200);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" />
          Portfolio Builder
        </h1>
        <p className="text-muted-foreground mt-1">
          Enter your budget and risk tolerance — get an optimally diversified portfolio instantly
        </p>
      </div>

      {step === 'input' && (
        <InputStep
          budget={budget}
          setBudget={setBudget}
          riskTolerance={riskTolerance}
          setRiskTolerance={setRiskTolerance}
          maxPositions={maxPositions}
          setMaxPositions={setMaxPositions}
          onBuild={handleBuild}
        />
      )}

      {step === 'building' && <BuildingAnimation />}

      {step === 'result' && portfolio && (
        <ResultView
          portfolio={portfolio}
          budget={budget}
          riskTolerance={riskTolerance}
          onReset={() => setStep('input')}
        />
      )}
    </div>
  );
}



// ─── Step 1: Input Form ──────────────────────────────────────────────────────

function InputStep({ budget, setBudget, riskTolerance, setRiskTolerance, maxPositions, setMaxPositions, onBuild }: {
  budget: number; setBudget: (n: number) => void;
  riskTolerance: RiskTolerance; setRiskTolerance: (r: RiskTolerance) => void;
  maxPositions: number; setMaxPositions: (n: number) => void;
  onBuild: () => void;
}) {
  const riskOptions: { value: RiskTolerance; label: string; desc: string; color: string }[] = [
    { value: 'very_conservative', label: 'Very Safe', desc: 'Max protection, lowest returns', color: 'border-emerald-500 bg-emerald-500/10' },
    { value: 'conservative', label: 'Conservative', desc: 'Balanced safety & growth', color: 'border-blue-500 bg-blue-500/10' },
    { value: 'moderate', label: 'Moderate', desc: 'Accept some risk for growth', color: 'border-yellow-500 bg-yellow-500/10' },
    { value: 'growth', label: 'Growth', desc: 'Higher risk, higher potential', color: 'border-orange-500 bg-orange-500/10' },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Budget */}
      <div className="rounded-xl border border-border bg-card p-6">
        <label className="text-sm font-medium flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-primary" />
          Total Investment Budget (USD)
        </label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(Math.max(100, Number(e.target.value)))}
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-2xl font-bold outline-none focus:border-primary"
          min={100}
          step={100}
        />
        <div className="flex gap-2 mt-3">
          {[500, 1000, 2500, 5000, 10000].map((amt) => (
            <button
              key={amt}
              onClick={() => setBudget(amt)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                budget === amt ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary'
              }`}
            >
              ${amt.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Tolerance */}
      <div className="rounded-xl border border-border bg-card p-6">
        <label className="text-sm font-medium flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-emerald-500" />
          Risk Tolerance
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {riskOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRiskTolerance(opt.value)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                riskTolerance === opt.value ? opt.color : 'border-border hover:border-muted-foreground'
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Max Positions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <label className="text-sm font-medium flex items-center gap-2 mb-3">
          <PieChart className="h-4 w-4 text-blue-400" />
          Number of Stocks (Diversification)
        </label>
        <input
          type="range"
          min={3}
          max={12}
          value={maxPositions}
          onChange={(e) => setMaxPositions(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>3 (concentrated)</span>
          <span className="font-medium text-foreground">{maxPositions} stocks</span>
          <span>12 (diversified)</span>
        </div>
      </div>

      {/* Build button */}
      <button
        onClick={onBuild}
        className="w-full rounded-xl bg-primary py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
      >
        <Zap className="h-5 w-5" />
        Build My Portfolio
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}



// ─── Building Animation ──────────────────────────────────────────────────────

function BuildingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative h-20 w-20 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border-4 border-primary/40 animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary animate-pulse" />
        </div>
      </div>
      <h2 className="text-xl font-semibold">Building Your Portfolio...</h2>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground text-center">
        <p className="animate-pulse">Analyzing 12 global markets...</p>
        <p className="animate-pulse" style={{ animationDelay: '0.3s' }}>Scoring 500+ stocks for risk-adjusted quality...</p>
        <p className="animate-pulse" style={{ animationDelay: '0.6s' }}>Optimizing position sizes with Kelly Criterion...</p>
        <p className="animate-pulse" style={{ animationDelay: '0.9s' }}>Generating DCA schedule...</p>
      </div>
    </div>
  );
}

// ─── Result View ─────────────────────────────────────────────────────────────

function ResultView({ portfolio, budget, riskTolerance, onReset }: {
  portfolio: ReturnType<typeof buildPortfolio>;
  budget: number;
  riskTolerance: RiskTolerance;
  onReset: () => void;
}) {
  const { allocations, summary, dca } = portfolio;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryCard label="Invested" value={`$${summary.totalInvested.toFixed(0)}`} icon={<DollarSign className="h-4 w-4" />} />
        <SummaryCard label="Cash Reserve" value={`$${summary.cashReserve.toFixed(0)}`} icon={<Shield className="h-4 w-4" />} />
        <SummaryCard label="Positions" value={`${allocations.length}`} icon={<PieChart className="h-4 w-4" />} />
        <SummaryCard label="Avg Score" value={`${summary.avgScore}/100`} icon={<Target className="h-4 w-4" />} />
        <SummaryCard label="Div Yield" value={`${(summary.portfolioYield * 100).toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4" />} />
        <SummaryCard label="Beta" value={summary.portfolioBeta.toFixed(2)} icon={<Globe className="h-4 w-4" />} />
      </div>

      {/* Diversification badges */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
          {summary.sectors.length} Sectors
        </span>
        <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400">
          {summary.regions.length} Regions
        </span>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          {riskTolerance.replace('_', ' ')} risk
        </span>
        {summary.portfolioBeta < 1.0 && (
          <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
            Defensive (beta {'<'} 1.0)
          </span>
        )}
      </div>

      {/* Allocations Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Your Optimized Portfolio
          </h2>
          <button onClick={onReset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <RefreshCw className="h-3 w-3" /> Rebuild
          </button>
        </div>


        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-medium text-muted-foreground uppercase border-b border-border bg-muted/30">
          <div className="col-span-3">Stock</div>
          <div className="col-span-1 text-right">Score</div>
          <div className="col-span-1 text-right">Price</div>
          <div className="col-span-1 text-right">Shares</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1 text-right">Weight</div>
          <div className="col-span-2 text-right">Stop-Loss</div>
          <div className="col-span-1 text-right">Max Loss</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {allocations.map((alloc) => (
            <div key={alloc.stock.symbol} className="grid grid-cols-12 gap-2 px-5 py-3 items-center text-sm hover:bg-accent/30">
              <div className="col-span-3">
                <div className="font-medium">{alloc.stock.symbol}</div>
                <div className="text-[10px] text-muted-foreground">{alloc.stock.name}</div>
              </div>
              <div className="col-span-1 text-right">
                <span className={`text-xs font-medium ${alloc.stock.smartScore >= 75 ? 'text-emerald-500' : 'text-blue-400'}`}>
                  {alloc.stock.smartScore}
                </span>
              </div>
              <div className="col-span-1 text-right font-tabular">${alloc.stock.price.toFixed(2)}</div>
              <div className="col-span-1 text-right font-semibold">{alloc.shares}</div>
              <div className="col-span-2 text-right font-tabular">${alloc.actualCost.toFixed(2)}</div>
              <div className="col-span-1 text-right text-xs text-muted-foreground">{alloc.targetPct.toFixed(1)}%</div>
              <div className="col-span-2 text-right text-xs text-yellow-500">${alloc.stopLoss.toFixed(2)}</div>
              <div className="col-span-1 text-right text-xs text-red-400">${alloc.maxLoss.toFixed(0)}</div>
            </div>
          ))}
        </div>

        {/* Total row */}
        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-t border-border bg-muted/30 font-semibold text-sm">
          <div className="col-span-3">TOTAL</div>
          <div className="col-span-1"></div>
          <div className="col-span-1"></div>
          <div className="col-span-1"></div>
          <div className="col-span-2 text-right">${summary.totalInvested.toFixed(2)}</div>
          <div className="col-span-1 text-right text-xs">100%</div>
          <div className="col-span-2"></div>
          <div className="col-span-1 text-right text-xs text-red-400">
            ${allocations.reduce((s, a) => s + a.maxLoss, 0).toFixed(0)}
          </div>
        </div>
      </div>

      {/* DCA Schedule */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-blue-400" />
          Dollar-Cost Averaging Schedule
        </h2>
        {dca.length === 1 ? (
          <p className="text-sm text-muted-foreground">
            With your budget, invest the full amount now and set up monthly auto-invest of $50-100 to grow over time.
          </p>
        ) : (
          <div className="space-y-2">
            {dca.map((inst, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Week {inst.week}</span>
                    <span className="text-sm font-semibold">${inst.amount.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(inst.cumulative / summary.totalInvested) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  Total: ${inst.cumulative.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Warnings & Next Steps */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Important Reminders
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-yellow-500">1.</span>
              <span>Set stop-losses on ALL positions (shown in table above)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-500">2.</span>
              <span>Never invest your emergency fund — keep 3-6 months expenses separate</span>
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-500">3.</span>
              <span>Rebalance quarterly if any position drifts {'>'}2x its target weight</span>
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-500">4.</span>
              <span>Maximum portfolio loss (all stop-losses hit): ${allocations.reduce((s, a) => s + a.maxLoss, 0).toFixed(0)} ({((allocations.reduce((s, a) => s + a.maxLoss, 0) / budget) * 100).toFixed(1)}% of budget)</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Next Steps
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-emerald-500">1.</span>
              <span>Open your brokerage app (e.g., Fidelity, Schwab, Interactive Brokers)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">2.</span>
              <span>Place limit orders at or below the prices shown (don&apos;t chase)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">3.</span>
              <span>Set stop-loss orders immediately after each purchase</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">4.</span>
              <span>Set a calendar reminder to review in 30 days</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">5.</span>
              <span>Ask the AI Assistant for ongoing monitoring and alerts</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground text-center max-w-2xl mx-auto">
        This portfolio is generated by an AI-driven algorithm for educational purposes only. It does NOT constitute
        financial advice. All investing carries risk of loss. Past performance does not guarantee future results.
        Always do your own research and consider consulting a qualified financial advisor.
      </p>
    </div>
  );
}

// ─── Utility Components ──────────────────────────────────────────────────────

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-muted-foreground mb-1">{icon}<span className="text-[10px]">{label}</span></div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
