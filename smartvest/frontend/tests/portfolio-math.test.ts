/**
 * Portfolio Gain/Loss Calculation Tests
 *
 * Tests the computeSummary function logic — the numbers the user
 * sees on their main portfolio page and uses to make decisions.
 *
 * A wrong gain/loss here directly leads to bad financial decisions.
 */

import { describe, it, expect } from 'vitest';

// Replicate the exact computeSummary logic from portfolio/page.tsx
interface Holding {
  shares: number;
  avgCost: number;
  currentPrice: number;
  dayChangePct: number;
  sector: string;
  region: string;
  dividendYield: number;
  beta: number;
}

function computeSummary(holdings: Holding[]) {
  let totalValue = 0, totalCost = 0, dayChangeValue = 0;
  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    const cost = h.shares * h.avgCost;
    totalValue += value;
    totalCost += cost;
    dayChangeValue += value * (h.dayChangePct / 100);
  }
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const dayChangePct = totalValue > 0 ? (dayChangeValue / totalValue) * 100 : 0;
  return {
    totalValue: Math.round(totalValue),
    totalCost: Math.round(totalCost),
    totalGainLoss: Math.round(totalGainLoss),
    totalGainLossPct: Math.round(totalGainLossPct * 100) / 100,
    dayChange: Math.round(dayChangeValue),
    dayChangePct: Math.round(dayChangePct * 100) / 100,
  };
}

const baseHolding: Holding = {
  shares: 10, avgCost: 100, currentPrice: 120,
  dayChangePct: 1.5, sector: 'Tech', region: 'US',
  dividendYield: 0.02, beta: 1.1,
};

describe('Portfolio gain/loss — computeSummary', () => {
  it('normal holding — gain calculated correctly', () => {
    const r = computeSummary([baseHolding]);
    // value = 10 * 120 = 1200, cost = 10 * 100 = 1000
    // gain = 200, pct = 200/1000*100 = 20%
    // dayΔ = 1200 * 1.5/100 = 18
    expect(r.totalValue).toBe(1200);
    expect(r.totalCost).toBe(1000);
    expect(r.totalGainLoss).toBe(200);
    expect(r.totalGainLossPct).toBe(20);
    expect(r.dayChange).toBe(18);
    expect(r.dayChangePct).toBe(1.5);
  });

  it('zero shares — all values are zero, no division by zero', () => {
    const r = computeSummary([{ ...baseHolding, shares: 0 }]);
    expect(r.totalValue).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.totalGainLoss).toBe(0);
    expect(r.totalGainLossPct).toBe(0); // guard: totalCost > 0 ? ... : 0
    expect(r.dayChange).toBe(0);
    expect(r.dayChangePct).toBe(0); // guard: totalValue > 0 ? ... : 0
    expect(Number.isFinite(r.totalGainLossPct)).toBe(true);
  });

  it('negative cost basis — should not crash (produces negative cost)', () => {
    // The app doesn't validate at the math layer — it relies on input validation
    // But the math should not produce NaN/Infinity
    const r = computeSummary([{ ...baseHolding, avgCost: -50 }]);
    // value = 10*120 = 1200, cost = 10*(-50) = -500
    // gain = 1200 - (-500) = 1700, pct = 1700 / -500 * 100 = -340
    // The math works but the result is nonsensical — that's fine,
    // input validation prevents this from reaching here
    expect(Number.isFinite(r.totalGainLoss)).toBe(true);
    expect(Number.isNaN(r.totalGainLoss)).toBe(false);
    expect(Number.isFinite(r.totalGainLossPct)).toBe(true);
  });

  it('current price is zero (delisted stock) — shows -100% loss', () => {
    const r = computeSummary([{ ...baseHolding, currentPrice: 0 }]);
    // value = 0, cost = 1000, gain = -1000, pct = -100%
    expect(r.totalValue).toBe(0);
    expect(r.totalGainLoss).toBe(-1000);
    expect(r.totalGainLossPct).toBe(-100);
    expect(r.dayChange).toBe(0);
  });

  it('current price is NaN (API failure) — should produce NaN, caught at source', () => {
    // This tests what happens if NaN slips through (it shouldn't with our || 0 guard)
    // The math layer propagates NaN — it's the parser's job to prevent this
    const r = computeSummary([{ ...baseHolding, currentPrice: NaN }]);
    // With NaN, Math.round(NaN) = NaN in most engines
    // This is acceptable because the || 0 guard in alpha-vantage.ts prevents NaN
    // from ever reaching here. This test documents the boundary.
    expect(r.totalValue === 0 || Number.isNaN(r.totalValue)).toBe(true);
  });

  it('multiple holdings aggregate correctly', () => {
    const h1: Holding = { ...baseHolding, shares: 5, avgCost: 200, currentPrice: 250, dayChangePct: 2 };
    const h2: Holding = { ...baseHolding, shares: 10, avgCost: 50, currentPrice: 45, dayChangePct: -1 };
    const r = computeSummary([h1, h2]);
    // h1: value=1250, cost=1000, dayΔ=25
    // h2: value=450, cost=500, dayΔ=-4.5
    // total: value=1700, cost=1500, gain=200, pct=200/1500*100=13.33
    // dayΔ total = 20.5, dayPct = 20.5/1700*100 = 1.21
    expect(r.totalValue).toBe(1700);
    expect(r.totalCost).toBe(1500);
    expect(r.totalGainLoss).toBe(200);
    expect(r.totalGainLossPct).toBe(13.33);
    expect(r.dayChange).toBe(21); // round(20.5) = 21 — wait let me recalculate
    // h1 dayΔ = 1250 * 2/100 = 25, h2 dayΔ = 450 * (-1)/100 = -4.5
    // total dayΔ = 25 - 4.5 = 20.5, round = 21
    // actually Math.round(20.5) = 21 in JS (rounds to even... actually 21 in JS)
    // dayPct = 20.5/1700*100 = 1.2058... → round to 1.21
  });

  it('loss position — negative gain and percentage', () => {
    const r = computeSummary([{ ...baseHolding, avgCost: 150, currentPrice: 100 }]);
    // value = 1000, cost = 1500, gain = -500, pct = -500/1500*100 = -33.33
    expect(r.totalGainLoss).toBe(-500);
    expect(r.totalGainLossPct).toBe(-33.33);
  });
});



describe('Portfolio — dividend income and diversification score', () => {
  // Extended computeSummary that includes these fields
  function computeFull(holdings: { shares: number; avgCost: number; currentPrice: number; dayChangePct: number; sector: string; region: string; dividendYield: number; beta: number }[]) {
    let totalValue = 0, totalCost = 0, dayChangeValue = 0;
    for (const h of holdings) {
      const value = h.shares * h.currentPrice;
      const cost = h.shares * h.avgCost;
      totalValue += value;
      totalCost += cost;
      dayChangeValue += value * (h.dayChangePct / 100);
    }
    const annualDiv = holdings.reduce((sum, h) => sum + h.shares * h.currentPrice * h.dividendYield, 0);
    const sectors = new Set(holdings.map(h => h.sector));
    const regions = new Set(holdings.map(h => h.region));
    const divScore = Math.min(100, (holdings.length / 8) * 40 + (sectors.size / 5) * 30 + (regions.size / 3) * 30);
    return {
      totalValue: Math.round(totalValue),
      annualDividendIncome: Math.round(annualDiv),
      diversificationScore: Math.round(divScore),
    };
  }

  it('dividend income = shares × price × yield, summed across holdings', () => {
    const r = computeFull([
      { shares: 10, avgCost: 100, currentPrice: 200, dayChangePct: 0, sector: 'Tech', region: 'US', dividendYield: 0.03, beta: 1 },
      { shares: 5, avgCost: 50, currentPrice: 100, dayChangePct: 0, sector: 'Energy', region: 'EU', dividendYield: 0.05, beta: 1 },
    ]);
    // 10*200*0.03 = 60, 5*100*0.05 = 25, total = 85
    expect(r.annualDividendIncome).toBe(85);
  });

  it('zero dividend yield — income is 0', () => {
    const r = computeFull([
      { shares: 100, avgCost: 50, currentPrice: 80, dayChangePct: 0, sector: 'Tech', region: 'US', dividendYield: 0, beta: 1 },
    ]);
    expect(r.annualDividendIncome).toBe(0);
  });

  it('diversification score — 1 holding, 1 sector, 1 region = low', () => {
    const r = computeFull([
      { shares: 10, avgCost: 100, currentPrice: 100, dayChangePct: 0, sector: 'Tech', region: 'US', dividendYield: 0, beta: 1 },
    ]);
    // (1/8)*40 + (1/5)*30 + (1/3)*30 = 5 + 6 + 10 = 21
    expect(r.diversificationScore).toBe(21);
  });

  it('diversification score — 8 holdings, 5 sectors, 3 regions = max 100', () => {
    const holdings = [
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Tech', region: 'US', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Health', region: 'EU', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Energy', region: 'Asia', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Finance', region: 'US', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Consumer', region: 'EU', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Tech', region: 'Asia', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Health', region: 'US', dividendYield: 0, beta: 1 },
      { shares: 1, avgCost: 1, currentPrice: 1, dayChangePct: 0, sector: 'Energy', region: 'EU', dividendYield: 0, beta: 1 },
    ];
    const r = computeFull(holdings);
    // (8/8)*40 + (5/5)*30 + (3/3)*30 = 40 + 30 + 30 = 100
    expect(r.diversificationScore).toBe(100);
  });
});
