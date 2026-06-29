'use client';

import { useState, useEffect } from 'react';
import {
  Timer, TrendingUp, DollarSign, CalendarDays, AlertTriangle,
  CheckCircle2, Info, Shield,
} from 'lucide-react';


// ─── Constants ───────────────────────────────────────────────────────────────

const DKK_USD_RATE = 6.85;
const WITHDRAWAL_RATE = 0.04; // 4% rule
const DENMARK_BASIC_COST_DKK_MONTHLY = 18000; // Approximate basic cost of living in DK per month
const DENMARK_COMFORTABLE_DKK_MONTHLY = 28000;

const SCENARIOS = [
  { label: 'Conservative', rate: 0.04, color: 'text-[var(--gain)]', bg: 'bg-[var(--gain)]' },
  { label: 'Moderate', rate: 0.07, color: 'text-[var(--primary)]', bg: 'bg-[var(--primary)]' },
  { label: 'Optimistic', rate: 0.10, color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]' },
];

// ─── Calculation Functions ───────────────────────────────────────────────────

function calculateFutureValue(monthlyInvestment: number, annualReturn: number, years: number): number {
  const monthlyRate = annualReturn / 12;
  const months = years * 12;
  if (monthlyRate === 0) return monthlyInvestment * months;
  return monthlyInvestment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
}

function calculateMonthlyIncome(portfolioValue: number, withdrawalRate: number): number {
  return (portfolioValue * withdrawalRate) / 12;
}

function calculateYearsLasting(portfolio: number, monthlyWithdrawal: number, annualReturn: number): number {
  if (monthlyWithdrawal <= 0) return 999;
  if (annualReturn <= 0) return portfolio / (monthlyWithdrawal * 12);
  const monthlyRate = annualReturn / 12;
  let balance = portfolio;
  let months = 0;
  while (balance > 0 && months < 1200) { // Max 100 years
    balance = balance * (1 + monthlyRate) - monthlyWithdrawal;
    months++;
  }
  return months / 12;
}

function formatDKK(amount: number): string {
  return amount.toLocaleString('da-DK', { maximumFractionDigits: 0 });
}

function formatUSD(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}


export default function RetirementPage() {
  const [currentAge, setCurrentAge] = useState(30);
  const [retireAge, setRetireAge] = useState(65);
  const [monthlyDKK, setMonthlyDKK] = useState(5000);
  const [currentPortfolioDKK, setCurrentPortfolioDKK] = useState(0);

  const yearsToRetire = Math.max(retireAge - currentAge, 1);
  const monthlyUSD = monthlyDKK / DKK_USD_RATE;
  const currentPortfolioUSD = currentPortfolioDKK / DKK_USD_RATE;

  // Calculate all three scenarios
  const results = SCENARIOS.map(scenario => {
    const futureValue = currentPortfolioUSD * Math.pow(1 + scenario.rate, yearsToRetire) +
      calculateFutureValue(monthlyUSD, scenario.rate, yearsToRetire);
    const monthlyIncome = calculateMonthlyIncome(futureValue, WITHDRAWAL_RATE);
    const monthlyIncomeDKK = monthlyIncome * DKK_USD_RATE;
    const coversBasic = monthlyIncomeDKK >= DENMARK_BASIC_COST_DKK_MONTHLY;
    const coversComfortable = monthlyIncomeDKK >= DENMARK_COMFORTABLE_DKK_MONTHLY;

    // How long money lasts with 4% withdrawal but actual returns at 2% in retirement
    const yearsLasting = calculateYearsLasting(futureValue, monthlyIncome, 0.02);

    const totalInvested = (monthlyUSD * yearsToRetire * 12) + currentPortfolioUSD;
    const growthMultiple = futureValue / totalInvested;

    return {
      ...scenario,
      futureValue,
      futureValueDKK: futureValue * DKK_USD_RATE,
      monthlyIncome,
      monthlyIncomeDKK,
      coversBasic,
      coversComfortable,
      yearsLasting: Math.min(yearsLasting, 100),
      totalInvested,
      totalInvestedDKK: totalInvested * DKK_USD_RATE,
      growthMultiple,
    };
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
          <Timer className="h-5 w-5 text-rose-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Retirement Calculator</h1>
          <p className="text-xs text-[var(--muted)]">
            See how your monthly savings grow over time · 3 scenarios · Real-time updates
          </p>
        </div>
      </div>

      {/* Explainer */}
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          This calculator shows what your portfolio could look like at retirement based on compound growth.
          It uses the <strong>4% withdrawal rule</strong> — a widely-used guideline that says you can withdraw 4% of your
          portfolio per year without running out of money. All numbers update instantly as you adjust inputs.
        </p>
      </div>


      {/* Input Controls */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-5">
        <p className="text-sm font-semibold">Your Inputs</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Current Age */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Current Age</label>
              <span className="text-sm font-bold font-tabular text-rose-400">{currentAge}</span>
            </div>
            <input
              type="range"
              min={18} max={70} value={currentAge}
              onChange={e => setCurrentAge(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>18</span><span>70</span>
            </div>
          </div>

          {/* Retirement Age */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Retirement Age</label>
              <span className="text-sm font-bold font-tabular text-rose-400">{retireAge}</span>
            </div>
            <input
              type="range"
              min={Math.max(currentAge + 1, 40)} max={80} value={retireAge}
              onChange={e => setRetireAge(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>{Math.max(currentAge + 1, 40)}</span><span>80</span>
            </div>
          </div>

          {/* Monthly Investment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Monthly Investment (DKK)</label>
              <span className="text-sm font-bold font-tabular text-rose-400">{formatDKK(monthlyDKK)} kr</span>
            </div>
            <input
              type="range"
              min={500} max={50000} step={500} value={monthlyDKK}
              onChange={e => setMonthlyDKK(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>500 kr</span><span>50,000 kr</span>
            </div>
          </div>

          {/* Current Portfolio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Current Savings (DKK)</label>
              <span className="text-sm font-bold font-tabular text-rose-400">{formatDKK(currentPortfolioDKK)} kr</span>
            </div>
            <input
              type="range"
              min={0} max={5000000} step={50000} value={currentPortfolioDKK}
              onChange={e => setCurrentPortfolioDKK(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex justify-between text-[9px] text-[var(--muted)]">
              <span>0</span><span>5M kr</span>
            </div>
          </div>
        </div>

        {/* Summary line */}
        <div className="rounded-lg bg-[var(--background)] p-3 text-center">
          <p className="text-xs text-[var(--muted)]">
            Investing <strong className="text-[var(--foreground)]">{formatDKK(monthlyDKK)} kr/month</strong> for
            <strong className="text-[var(--foreground)]"> {yearsToRetire} years</strong> =
            <strong className="text-[var(--foreground)]"> {formatDKK(monthlyDKK * 12 * yearsToRetire)} kr</strong> total invested
          </p>
        </div>
      </div>


      {/* Three Scenarios */}
      <div className="space-y-4">
        <p className="text-sm font-semibold">Three Scenarios</p>

        {results.map((r, idx) => (
          <div key={r.label} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            {/* Scenario Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${r.bg}`} />
                <p className="text-sm font-semibold">{r.label} ({r.rate * 100}% annual return)</p>
              </div>
              <p className={`text-lg font-bold font-tabular ${r.color}`}>
                {formatDKK(r.futureValueDKK)} kr
              </p>
            </div>

            {/* Key Numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <p className="text-[9px] text-[var(--muted)]">Portfolio at {retireAge}</p>
                <p className="text-xs font-bold font-tabular">${formatUSD(r.futureValue)}</p>
                <p className="text-[9px] text-[var(--muted)]">{formatDKK(r.futureValueDKK)} kr</p>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <p className="text-[9px] text-[var(--muted)]">Monthly Income</p>
                <p className="text-xs font-bold font-tabular">{formatDKK(r.monthlyIncomeDKK)} kr</p>
                <p className="text-[9px] text-[var(--muted)]">(4% rule)</p>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <p className="text-[9px] text-[var(--muted)]">Money Lasts</p>
                <p className="text-xs font-bold font-tabular">{r.yearsLasting >= 99 ? '99+ years' : `${Math.round(r.yearsLasting)} years`}</p>
                <p className="text-[9px] text-[var(--muted)]">after retirement</p>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <p className="text-[9px] text-[var(--muted)]">Growth</p>
                <p className="text-xs font-bold font-tabular">{r.growthMultiple.toFixed(1)}×</p>
                <p className="text-[9px] text-[var(--muted)]">your invested amount</p>
              </div>
            </div>

            {/* Denmark Cost of Living Check */}
            <div className={`rounded-lg border p-3 ${
              r.coversComfortable
                ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5'
                : r.coversBasic
                  ? 'border-[var(--warning)]/20 bg-[var(--warning)]/5'
                  : 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
            }`}>
              <div className="flex items-start gap-2">
                {r.coversComfortable ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--gain)] shrink-0 mt-0.5" />
                ) : r.coversBasic ? (
                  <Info className="h-4 w-4 text-[var(--warning)] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[var(--loss)] shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-xs font-semibold ${
                    r.coversComfortable ? 'text-[var(--gain)]' : r.coversBasic ? 'text-[var(--warning)]' : 'text-[var(--loss)]'
                  }`}>
                    {r.coversComfortable
                      ? 'Covers comfortable living in Denmark'
                      : r.coversBasic
                        ? 'Covers basic living, but tight'
                        : 'Does NOT cover basic cost of living in Denmark'}
                  </p>
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    Your monthly income: {formatDKK(r.monthlyIncomeDKK)} kr.
                    Basic cost of living in Denmark: ~{formatDKK(DENMARK_BASIC_COST_DKK_MONTHLY)} kr/month.
                    Comfortable: ~{formatDKK(DENMARK_COMFORTABLE_DKK_MONTHLY)} kr/month.
                    {!r.coversBasic && ` You would need to invest more, retire later, or supplement with Danish pension (folkepension).`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-rose-400" />
          <p className="text-sm font-semibold">Important Notes</p>
        </div>
        <ul className="space-y-2 text-[11px] text-[var(--muted)] leading-relaxed">
          <li>• The 4% rule is a guideline, not a guarantee. It was based on US market history.</li>
          <li>• Danish folkepension (state pension) is NOT included in these numbers. It adds ~7,000-12,000 kr/month depending on your situation.</li>
          <li>• Inflation reduces purchasing power. In 30 years, {formatDKK(DENMARK_BASIC_COST_DKK_MONTHLY)} kr may not buy what it does today.</li>
          <li>• These projections assume consistent returns. Real markets go up AND down. The longer you invest, the more likely positive outcomes become.</li>
          <li>• Past performance does not guarantee future results. Use these numbers for planning, not as promises.</li>
        </ul>
      </div>

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        This is an educational projection tool, not financial advice. Consult a financial advisor for personal retirement planning.
      </p>
    </div>
  );
}
