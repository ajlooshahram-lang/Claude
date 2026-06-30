/**
 * ASK Manager Unit Tests
 *
 * Tests the Aktiesparekonto deposit limit enforcement:
 *   - Limit: 174,200 DKK (2026)
 *   - 17% flat tax on gains
 *   - Lagerbeskatning (mark-to-market)
 *
 * Wrong deposit tracking could lead the user to over-deposit,
 * which has legal consequences with SKAT.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ASK_DEPOSIT_LIMIT_2026,
  calculateTaxSavings,
  calculateLagerbeskatning,
  compareASKvsRegular,
  getASKAccount,
  saveASKAccount,
  addDeposit,
  getASKSummary,
} from '@/lib/ask';

describe('ASK deposit limit enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ASK_DEPOSIT_LIMIT_2026 is exactly 174,200 DKK', () => {
    expect(ASK_DEPOSIT_LIMIT_2026).toBe(174200);
  });

  it('deposit within limit — accepted, remaining room decreases', () => {
    addDeposit(50000);
    const summary = getASKSummary();
    expect(summary.totalDeposited).toBe(50000);
    expect(summary.remainingDepositRoom).toBe(124200); // 174200 - 50000
    expect(summary.depositUtilization).toBeCloseTo(28.7, 0); // 50000/174200*100
  });

  it('deposit exactly at limit — accepted, remaining room = 0', () => {
    addDeposit(174200);
    const summary = getASKSummary();
    expect(summary.totalDeposited).toBe(174200);
    expect(summary.remainingDepositRoom).toBe(0);
    expect(summary.depositUtilization).toBe(100);
  });

  it('deposits exceeding limit — remaining room floors at 0', () => {
    // Note: The current implementation does NOT block over-deposits at the
    // function level (addDeposit is just a recorder). The UI should enforce.
    // But the summary correctly shows remaining = 0 (not negative).
    addDeposit(100000);
    addDeposit(100000); // total 200,000 > 174,200
    const summary = getASKSummary();
    expect(summary.totalDeposited).toBe(200000);
    expect(summary.remainingDepositRoom).toBe(0); // Math.max(0, ...) prevents negative
    expect(summary.depositUtilization).toBe(100); // capped at 100 via Math.min
  });

  it('multiple small deposits accumulate correctly', () => {
    addDeposit(10000);
    addDeposit(20000);
    addDeposit(30000);
    const summary = getASKSummary();
    expect(summary.totalDeposited).toBe(60000);
    expect(summary.remainingDepositRoom).toBe(114200); // 174200 - 60000
  });
});

describe('ASK tax savings calculation', () => {
  it('zero gain — zero savings', () => {
    expect(calculateTaxSavings(0)).toBe(0);
  });

  it('negative gain — zero savings (no tax on losses)', () => {
    expect(calculateTaxSavings(-10000)).toBe(0);
  });

  it('gain below threshold — savings = gain * (27% - 17%) = 10%', () => {
    // 50000: ASK=8500, Regular=13500, savings=5000
    expect(calculateTaxSavings(50000)).toBe(5000);
  });

  it('gain above threshold — savings include 42% bracket benefit', () => {
    // 150000:
    // ASK = 150000 * 0.17 = 25500
    // Regular = 79400*0.27 + 70600*0.42 = 21438 + 29652 = 51090
    // Savings = 51090 - 25500 = 25590
    expect(calculateTaxSavings(150000)).toBe(25590);
  });
});

describe('ASK lagerbeskatning (mark-to-market)', () => {
  it('positive gain year — 17% tax on gain', () => {
    const r = calculateLagerbeskatning(100000, 120000, 0, 0);
    expect(r.taxableGain).toBe(20000);
    expect(r.taxAmount).toBe(3400); // 20000 * 0.17
    expect(r.effectiveReturn).toBe(20);
  });

  it('negative gain year — zero tax', () => {
    const r = calculateLagerbeskatning(100000, 85000, 0, 0);
    expect(r.taxableGain).toBe(-15000);
    expect(r.taxAmount).toBe(0);
    expect(r.effectiveReturn).toBe(-15);
  });

  it('deposits offset gain correctly', () => {
    // endValue=150k, startValue=100k, deposits=40k, withdrawals=0
    // taxableGain = 150000 - 100000 - 40000 + 0 = 10000
    const r = calculateLagerbeskatning(100000, 150000, 40000, 0);
    expect(r.taxableGain).toBe(10000);
    expect(r.taxAmount).toBe(1700); // 10000 * 0.17
  });

  it('withdrawals add to taxable gain', () => {
    // endValue=110k, startValue=100k, deposits=0, withdrawals=20k
    // taxableGain = 110000 - 100000 - 0 + 20000 = 30000
    const r = calculateLagerbeskatning(100000, 110000, 0, 20000);
    expect(r.taxableGain).toBe(30000);
    expect(r.taxAmount).toBe(5100); // 30000 * 0.17
  });
});
