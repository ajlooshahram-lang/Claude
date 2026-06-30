/**
 * Tax Calculator Unit Tests
 *
 * Tests the Danish aktieindkomst progressive tax calculation:
 *   - 27% on first 79,400 DKK
 *   - 42% above 79,400 DKK
 *   - Married doubles the threshold to 158,800 DKK
 *
 * These numbers directly affect how much money the user thinks they owe.
 * A wrong answer here could cause under-reporting to SKAT.
 */

import { describe, it, expect } from 'vitest';
import { calculateDanishTax, estimateSellTax } from '@/lib/danish-tax';

describe('calculateDanishTax — progressive brackets', () => {
  it('zero gain produces zero tax with no division-by-zero', () => {
    const r = calculateDanishTax(0, 0, 'regular', false);
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.effectiveRate).toBe(0);
    expect(r.netProfit).toBe(0);
    expect(r.lossCarryForward).toBe(0);
  });

  it('gain below threshold (50,000 DKK) — all at 27%', () => {
    // 50000 * 0.27 = 13500
    const r = calculateDanishTax(50000, 0, 'regular', false);
    expect(r.taxableGain).toBe(50000);
    expect(r.taxAtLowRate).toBe(13500);
    expect(r.taxAtHighRate).toBe(0);
    expect(r.totalTax).toBe(13500);
    expect(r.effectiveRate).toBe(27);
    expect(r.netProfit).toBe(36500);
  });

  it('gain exactly at threshold (79,400 DKK) — all at 27%, nothing at 42%', () => {
    // 79400 * 0.27 = 21438
    const r = calculateDanishTax(79400, 0, 'regular', false);
    expect(r.taxableGain).toBe(79400);
    expect(r.taxAtLowRate).toBe(21438);
    expect(r.taxAtHighRate).toBe(0);
    expect(r.totalTax).toBe(21438);
    expect(r.effectiveRate).toBe(27);
    expect(r.netProfit).toBe(57962);
  });

  it('gain just above threshold (80,000 DKK) — splits across both brackets', () => {
    // Low: 79400 * 0.27 = 21438
    // High: 600 * 0.42 = 252
    // Total: 21690
    const r = calculateDanishTax(80000, 0, 'regular', false);
    expect(r.taxableGain).toBe(80000);
    expect(r.taxAtLowRate).toBe(21438);
    expect(r.taxAtHighRate).toBe(252);
    expect(r.totalTax).toBe(21690);
    // effectiveRate = 21690/80000*100 = 27.1125 → rounds to 27.1
    expect(r.effectiveRate).toBe(27.1);
    expect(r.netProfit).toBe(58310);
  });

  it('very large gain (500,000 DKK) — mostly at 42%', () => {
    // Low: 79400 * 0.27 = 21438
    // High: (500000 - 79400) * 0.42 = 420600 * 0.42 = 176652
    // Total: 198090
    const r = calculateDanishTax(500000, 0, 'regular', false);
    expect(r.taxableGain).toBe(500000);
    expect(r.taxAtLowRate).toBe(21438);
    expect(r.taxAtHighRate).toBe(176652);
    expect(r.totalTax).toBe(198090);
    // effectiveRate = 198090/500000*100 = 39.618 → rounds to 39.6
    expect(r.effectiveRate).toBe(39.6);
    expect(r.netProfit).toBe(301910);
  });

  it('decimal amount (33,333.33 DKK) — rounds correctly', () => {
    // 33333.33 * 0.27 = 8999.9991 → round = 9000
    const r = calculateDanishTax(33333.33, 0, 'regular', false);
    expect(r.taxableGain).toBe(33333.33);
    expect(r.taxAtLowRate).toBe(9000);
    expect(r.totalTax).toBe(9000);
    expect(r.netProfit).toBe(24333); // round(33333.33 - 9000) = 24333
  });

  it('losses exceed gains — produces loss carry-forward, zero tax', () => {
    const r = calculateDanishTax(20000, 80000, 'regular', false);
    expect(r.netGain).toBe(-60000);
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.lossCarryForward).toBe(60000);
    expect(r.netProfit).toBe(-60000);
  });

  it('married doubles threshold — 200,000 DKK crosses at 158,800', () => {
    // Low: 158800 * 0.27 = 42876
    // High: (200000 - 158800) * 0.42 = 41200 * 0.42 = 17304
    // Total: 60180
    const r = calculateDanishTax(200000, 0, 'regular', true);
    expect(r.taxAtLowRate).toBe(42876);
    expect(r.taxAtHighRate).toBe(17304);
    expect(r.totalTax).toBe(60180);
  });

  it('ASK account — flat 17% regardless of amount', () => {
    const r = calculateDanishTax(200000, 0, 'ask', false);
    // 200000 * 0.17 = 34000
    expect(r.totalTax).toBe(34000);
    expect(r.taxAtHighRate).toBe(0);
    expect(r.effectiveRate).toBe(17);
  });
});

describe('estimateSellTax — sell preview with existing gains', () => {
  it('sell at a loss — zero tax', () => {
    const r = estimateSellTax(4000, 5000, 'regular', 0);
    expect(r.gain).toBe(-1000);
    expect(r.estimatedTax).toBe(0);
    expect(r.netAfterTax).toBe(4000);
  });

  it('sell gain that crosses threshold with existing gains', () => {
    // existing=70000, gain=20000, total=90000 > 79400
    // inLow = max(0, 79400-70000) = 9400
    // inHigh = 20000 - 9400 = 10600
    // tax = round(9400*0.27 + 10600*0.42) = round(2538 + 4452) = 6990
    const r = estimateSellTax(120000, 100000, 'regular', 70000);
    expect(r.gain).toBe(20000);
    expect(r.estimatedTax).toBe(6990);
    expect(r.netAfterTax).toBe(113010);
  });

  it('already past threshold — all gain at 42%', () => {
    // existing=80000 > 79400, inLow=max(0, 79400-80000)=0, all at 42%
    const r = estimateSellTax(50000, 40000, 'regular', 80000);
    expect(r.gain).toBe(10000);
    expect(r.estimatedTax).toBe(4200); // 10000 * 0.42
    expect(r.netAfterTax).toBe(45800);
  });
});
