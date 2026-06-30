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
  projectASKGrowth,
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



describe('compareASKvsRegular — compound growth comparison', () => {
  it('1 year, 8% return, 100,000 investment', () => {
    const r = compareASKvsRegular(100000, 0.08, 1);
    // ASK: gain = 100000*0.08 = 8000, tax = 8000*0.17 = 1360, value = 100000+8000-1360 = 106640
    // Regular: value = 108000, gain = 8000, tax = 8000*0.27 = 2160, after-tax = 108000-2160 = 105840
    // Advantage = 106640 - 105840 = 800
    expect(r.askFinalValue).toBe(106640);
    expect(r.regularFinalValue).toBe(105840);
    expect(r.askTotalTax).toBe(1360);
    expect(r.regularTotalTax).toBe(2160);
    expect(r.advantage).toBe(800);
  });

  it('0% return — both accounts same, no tax', () => {
    const r = compareASKvsRegular(50000, 0, 5);
    expect(r.askFinalValue).toBe(50000);
    expect(r.regularFinalValue).toBe(50000);
    expect(r.askTotalTax).toBe(0);
    expect(r.regularTotalTax).toBe(0);
    expect(r.advantage).toBe(0);
  });

  it('negative return — no tax in either account', () => {
    const r = compareASKvsRegular(100000, -0.10, 1);
    // ASK: gain = -10000, no tax. Value = 90000.
    // Regular: value = 90000, gain = -10000, no tax. After-tax = 90000.
    expect(r.askFinalValue).toBe(90000);
    expect(r.regularFinalValue).toBe(90000);
    expect(r.askTotalTax).toBe(0);
    expect(r.regularTotalTax).toBe(0);
  });

  it('large gain crosses 42% bracket in regular', () => {
    // 174,200 invested, 50% return in 1 year
    const r = compareASKvsRegular(174200, 0.50, 1);
    // ASK: gain = 87100, tax = 87100*0.17 = 14807, value = 174200+87100-14807 = 246493
    // Regular: value = 261300, gain = 87100
    //   regularTax = 79400*0.27 + 7700*0.42 = 21438 + 3234 = 24672
    //   after-tax = 261300 - 24672 = 236628
    expect(r.askTotalTax).toBe(14807);
    expect(r.regularTotalTax).toBe(24672);
    expect(r.askFinalValue).toBe(246493);
    expect(r.regularFinalValue).toBe(236628);
  });
});

describe('projectASKGrowth — multi-year projection with tax drag', () => {
  it('1 year, 10% return, no additional deposits', () => {
    const r = projectASKGrowth(100000, 0.10, 1, 0);
    // Year 1: gain = 100000*0.10 = 10000, tax = 10000*0.17 = 1700
    // value = 100000 + 10000 - 1700 = 108300
    expect(r.length).toBe(1);
    expect(r[0].value).toBe(108300);
    expect(r[0].totalTaxPaid).toBe(1700);
  });

  it('2 years compound correctly (tax drag reduces base)', () => {
    const r = projectASKGrowth(100000, 0.10, 2, 0);
    // Year 1: value = 108300, totalTax = 1700
    // Year 2: gain = 108300*0.10 = 10830, tax = 10830*0.17 = 1841.1 → 1841
    //   value = 108300 + 10830 - 1841.1 = 117288.9 → 117289
    expect(r[0].value).toBe(108300);
    expect(r[1].value).toBe(117289);
    expect(r[1].totalTaxPaid).toBe(3541); // 1700 + 1841
  });

  it('0% return — no growth, no tax', () => {
    const r = projectASKGrowth(50000, 0, 3, 0);
    expect(r[0].value).toBe(50000);
    expect(r[1].value).toBe(50000);
    expect(r[2].value).toBe(50000);
    expect(r[2].totalTaxPaid).toBe(0);
  });

  it('with additional yearly deposits', () => {
    const r = projectASKGrowth(100000, 0.10, 1, 20000);
    // Start: 100000, add 20000 = 120000. gain = 120000*0.10 = 12000
    // tax = 12000*0.17 = 2040. value = 120000 + 12000 - 2040 = 129960
    expect(r[0].value).toBe(129960);
    expect(r[0].totalTaxPaid).toBe(2040);
  });
});
