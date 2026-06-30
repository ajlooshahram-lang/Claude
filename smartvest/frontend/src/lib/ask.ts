/**
 * Aktiesparekonto (ASK) Management Module
 *
 * The Aktiesparekonto is a Danish tax-advantaged investment account:
 * - Flat 17% tax on gains (vs 27%/42% in regular depot)
 * - Lagerbeskatning (mark-to-market): taxed on unrealized gains annually
 * - Deposit limit: 174,200 DKK (2026) — cumulative lifetime deposits
 * - Only stocks, ETFs, and investment funds listed on regulated markets
 * - One ASK per person (CPR-number linked)
 * - Cannot hold Danish government bonds or unlisted securities
 *
 * DISCLAIMER: Educational estimates only. Consult SKAT.dk for your situation.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const ASK_DEPOSIT_LIMIT_2026 = 174200; // DKK - cumulative lifetime limit (2026)
export const ASK_TAX_RATE = 0.17;             // 17% flat
export const REGULAR_LOW_RATE = 0.27;         // Regular depot: first 79,400
export const REGULAR_HIGH_RATE = 0.42;        // Regular depot: above 79,400
export const REGULAR_THRESHOLD = 79400;       // DKK threshold for 27% bracket (2026)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ASKHolding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avgCostPerShare: number;    // DKK
  currentPricePerShare: number; // DKK
  addedDate: string;          // ISO date
}

export interface ASKDeposit {
  id: string;
  amount: number;             // DKK
  date: string;               // ISO date
  note?: string;
}

export interface ASKWithdrawal {
  id: string;
  amount: number;             // DKK
  date: string;               // ISO date
  note?: string;
}

export interface ASKTaxEvent {
  id: string;
  year: number;
  startValue: number;         // Portfolio value at Jan 1
  endValue: number;           // Portfolio value at Dec 31
  deposits: number;           // Total deposits during year
  withdrawals: number;        // Total withdrawals during year
  taxableGain: number;        // Calculated gain for the year
  taxAmount: number;          // 17% of taxable gain
  paid: boolean;
}

export interface ASKAccount {
  holdings: ASKHolding[];
  deposits: ASKDeposit[];
  withdrawals: ASKWithdrawal[];
  taxHistory: ASKTaxEvent[];
  createdDate: string;        // When account was opened
  broker: string;             // e.g. "Saxo Bank", "Nordnet", "Lunar"
}

export interface ASKSummary {
  totalDeposited: number;           // Lifetime deposits
  totalWithdrawn: number;           // Lifetime withdrawals
  remainingDepositRoom: number;     // How much more can be deposited
  depositUtilization: number;       // % of limit used
  currentPortfolioValue: number;    // Sum of holdings at market price
  totalCostBasis: number;           // What was paid for holdings
  unrealizedGain: number;           // Current value - cost basis
  unrealizedGainPct: number;        // Gain as percentage
  estimatedAnnualTax: number;       // 17% of unrealized gain (lagerbeskatning)
  taxSavedVsRegular: number;        // How much tax saved vs regular depot
  holdingsCount: number;
}

export interface ASKOptimizationTip {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  category: 'deposit' | 'allocation' | 'tax' | 'timing';
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'smartvest_ask_account';

function getDefaultAccount(): ASKAccount {
  return {
    holdings: [],
    deposits: [],
    withdrawals: [],
    taxHistory: [],
    createdDate: new Date().toISOString().split('T')[0],
    broker: '',
  };
}

export function getASKAccount(): ASKAccount {
  if (typeof window === 'undefined') return getDefaultAccount();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultAccount();
    return JSON.parse(raw);
  } catch {
    return getDefaultAccount();
  }
}

export function saveASKAccount(account: ASKAccount): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

// ─── Account Operations ──────────────────────────────────────────────────────

export function addDeposit(amount: number, note?: string): ASKAccount {
  const account = getASKAccount();
  const deposit: ASKDeposit = {
    id: crypto.randomUUID(),
    amount,
    date: new Date().toISOString().split('T')[0],
    note,
  };
  account.deposits.push(deposit);
  saveASKAccount(account);
  return account;
}

export function addWithdrawal(amount: number, note?: string): ASKAccount {
  const account = getASKAccount();
  const withdrawal: ASKWithdrawal = {
    id: crypto.randomUUID(),
    amount,
    date: new Date().toISOString().split('T')[0],
    note,
  };
  account.withdrawals.push(withdrawal);
  saveASKAccount(account);
  return account;
}

export function addHolding(holding: Omit<ASKHolding, 'id'>): ASKAccount {
  const account = getASKAccount();
  const newHolding: ASKHolding = {
    ...holding,
    id: crypto.randomUUID(),
  };
  account.holdings.push(newHolding);
  saveASKAccount(account);
  return account;
}

export function updateHoldingPrice(holdingId: string, newPrice: number): ASKAccount {
  const account = getASKAccount();
  const holding = account.holdings.find(h => h.id === holdingId);
  if (holding) {
    holding.currentPricePerShare = newPrice;
    saveASKAccount(account);
  }
  return account;
}

export function removeHolding(holdingId: string): ASKAccount {
  const account = getASKAccount();
  account.holdings = account.holdings.filter(h => h.id !== holdingId);
  saveASKAccount(account);
  return account;
}

export function setBroker(broker: string): ASKAccount {
  const account = getASKAccount();
  account.broker = broker;
  saveASKAccount(account);
  return account;
}

// ─── Calculations ────────────────────────────────────────────────────────────

export function getASKSummary(): ASKSummary {
  const account = getASKAccount();

  const totalDeposited = account.deposits.reduce((sum, d) => sum + d.amount, 0);
  const totalWithdrawn = account.withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const remainingDepositRoom = Math.max(0, ASK_DEPOSIT_LIMIT_2026 - totalDeposited);
  const depositUtilization = totalDeposited > 0
    ? Math.min(100, (totalDeposited / ASK_DEPOSIT_LIMIT_2026) * 100)
    : 0;

  const currentPortfolioValue = account.holdings.reduce(
    (sum, h) => sum + h.shares * h.currentPricePerShare, 0
  );
  const totalCostBasis = account.holdings.reduce(
    (sum, h) => sum + h.shares * h.avgCostPerShare, 0
  );
  const unrealizedGain = currentPortfolioValue - totalCostBasis;
  const unrealizedGainPct = totalCostBasis > 0
    ? (unrealizedGain / totalCostBasis) * 100
    : 0;

  // Lagerbeskatning: 17% on unrealized gains each year
  const estimatedAnnualTax = unrealizedGain > 0
    ? Math.round(unrealizedGain * ASK_TAX_RATE)
    : 0;

  // Tax saved vs regular depot (progressive 27%/42%)
  const taxSavedVsRegular = calculateTaxSavings(unrealizedGain);

  return {
    totalDeposited: Math.round(totalDeposited),
    totalWithdrawn: Math.round(totalWithdrawn),
    remainingDepositRoom: Math.round(remainingDepositRoom),
    depositUtilization: Math.round(depositUtilization * 10) / 10,
    currentPortfolioValue: Math.round(currentPortfolioValue),
    totalCostBasis: Math.round(totalCostBasis),
    unrealizedGain: Math.round(unrealizedGain),
    unrealizedGainPct: Math.round(unrealizedGainPct * 10) / 10,
    estimatedAnnualTax,
    taxSavedVsRegular,
    holdingsCount: account.holdings.length,
  };
}

/**
 * Calculate how much tax is saved by using ASK vs regular depot
 * for a given gain amount.
 */
export function calculateTaxSavings(gain: number): number {
  if (gain <= 0) return 0;

  // ASK tax: flat 17%
  const askTax = gain * ASK_TAX_RATE;

  // Regular depot tax: 27% on first 79,400, 42% on rest
  let regularTax: number;
  if (gain <= REGULAR_THRESHOLD) {
    regularTax = gain * REGULAR_LOW_RATE;
  } else {
    regularTax = REGULAR_THRESHOLD * REGULAR_LOW_RATE + (gain - REGULAR_THRESHOLD) * REGULAR_HIGH_RATE;
  }

  return Math.round(regularTax - askTax);
}

/**
 * Calculate lagerbeskatning (mark-to-market tax) for a year.
 * Formula: (End value - Start value - Deposits + Withdrawals) * 17%
 */
export function calculateLagerbeskatning(
  startValue: number,
  endValue: number,
  depositsInYear: number,
  withdrawalsInYear: number,
): { taxableGain: number; taxAmount: number; effectiveReturn: number } {
  const taxableGain = endValue - startValue - depositsInYear + withdrawalsInYear;
  const taxAmount = taxableGain > 0 ? Math.round(taxableGain * ASK_TAX_RATE) : 0;
  const effectiveReturn = startValue > 0
    ? ((endValue - startValue - depositsInYear + withdrawalsInYear) / startValue) * 100
    : 0;

  return {
    taxableGain: Math.round(taxableGain),
    taxAmount,
    effectiveReturn: Math.round(effectiveReturn * 10) / 10,
  };
}

/**
 * Project future ASK growth with compound returns and annual tax drag.
 */
export function projectASKGrowth(
  currentValue: number,
  annualReturn: number,       // e.g. 0.08 for 8%
  years: number,
  additionalYearlyDeposit: number = 0,
): { year: number; value: number; totalTaxPaid: number; netValue: number }[] {
  const projections: { year: number; value: number; totalTaxPaid: number; netValue: number }[] = [];
  let value = currentValue;
  let totalTaxPaid = 0;

  for (let y = 1; y <= years; y++) {
    const startOfYear = value;
    value += additionalYearlyDeposit;
    const gain = value * annualReturn;
    value += gain;

    // Lagerbeskatning: tax on the gain
    const yearTax = gain > 0 ? gain * ASK_TAX_RATE : 0;
    totalTaxPaid += yearTax;
    // Tax is paid from the account or externally — here we assume paid from account
    value -= yearTax;

    projections.push({
      year: y,
      value: Math.round(value),
      totalTaxPaid: Math.round(totalTaxPaid),
      netValue: Math.round(value),
    });
  }

  return projections;
}

/**
 * Compare ASK vs Regular depot for the same investment over time.
 */
export function compareASKvsRegular(
  investment: number,
  annualReturn: number,
  years: number,
): {
  askFinalValue: number;
  regularFinalValue: number;
  askTotalTax: number;
  regularTotalTax: number;
  advantage: number;
  advantagePct: number;
} {
  // ASK: lagerbeskatning (annual 17% on gains)
  let askValue = investment;
  let askTotalTax = 0;
  for (let y = 0; y < years; y++) {
    const gain = askValue * annualReturn;
    if (gain > 0) {
      const tax = gain * ASK_TAX_RATE;
      askTotalTax += tax;
      askValue += gain - tax;
    } else {
      askValue += gain;
    }
  }

  // Regular: realisationsbeskatning (tax only on sell)
  let regularValue = investment;
  for (let y = 0; y < years; y++) {
    regularValue += regularValue * annualReturn;
  }
  // Tax on total gain at sell
  const totalGain = regularValue - investment;
  let regularTotalTax = 0;
  if (totalGain > 0) {
    if (totalGain <= REGULAR_THRESHOLD) {
      regularTotalTax = totalGain * REGULAR_LOW_RATE;
    } else {
      regularTotalTax = REGULAR_THRESHOLD * REGULAR_LOW_RATE + (totalGain - REGULAR_THRESHOLD) * REGULAR_HIGH_RATE;
    }
  }
  const regularFinalAfterTax = regularValue - regularTotalTax;

  const advantage = askValue - regularFinalAfterTax;
  const advantagePct = regularFinalAfterTax > 0
    ? (advantage / regularFinalAfterTax) * 100
    : 0;

  return {
    askFinalValue: Math.round(askValue),
    regularFinalValue: Math.round(regularFinalAfterTax),
    askTotalTax: Math.round(askTotalTax),
    regularTotalTax: Math.round(regularTotalTax),
    advantage: Math.round(advantage),
    advantagePct: Math.round(advantagePct * 10) / 10,
  };
}

// ─── Optimization Tips ───────────────────────────────────────────────────────

export function getOptimizationTips(): ASKOptimizationTip[] {
  const summary = getASKSummary();
  const tips: ASKOptimizationTip[] = [];

  // Tip: Maximize deposits
  if (summary.remainingDepositRoom > 0) {
    tips.push({
      id: 'max-deposit',
      title: 'Maximize Your ASK Deposits',
      description: `You still have ${summary.remainingDepositRoom.toLocaleString()} DKK of deposit room. Every krone in your ASK saves you 10-25% in tax vs a regular depot. Consider filling it up before investing in a regular account.`,
      impact: 'high',
      category: 'deposit',
    });
  }

  // Tip: Deposit limit reached
  if (summary.depositUtilization >= 100) {
    tips.push({
      id: 'limit-reached',
      title: 'Deposit Limit Reached — Growth is Tax-Free to Add',
      description: `You've maxed out your ${ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK deposit limit. Good news: your account can grow beyond this limit through returns — only the gains are taxed at 17%, not additional growth.`,
      impact: 'low',
      category: 'deposit',
    });
  }

  // Tip: High-growth assets belong in ASK
  if (summary.holdingsCount > 0 && summary.unrealizedGainPct > 15) {
    tips.push({
      id: 'high-growth-ask',
      title: 'High-Growth Assets Benefit Most in ASK',
      description: `Your ASK holdings are up ${summary.unrealizedGainPct}%. The higher your returns, the more you save with the 17% flat rate. Keep your highest-conviction growth stocks here.`,
      impact: 'medium',
      category: 'allocation',
    });
  }

  // Tip: Consider ETFs for diversification
  if (summary.holdingsCount < 3 && summary.holdingsCount > 0) {
    tips.push({
      id: 'diversify-etf',
      title: 'Consider ETFs for Diversification',
      description: `With only ${summary.holdingsCount} holding(s) in your ASK, consider a broad-market ETF (like iShares MSCI World) for instant diversification while still enjoying the 17% tax rate.`,
      impact: 'medium',
      category: 'allocation',
    });
  }

  // Tip: Lagerbeskatning awareness
  tips.push({
    id: 'lagerbeskatning',
    title: 'Remember: ASK Uses Mark-to-Market Taxation',
    description: `Unlike a regular depot, your ASK is taxed annually on unrealized gains (lagerbeskatning). This means you pay 17% tax each year even if you don't sell. Keep some cash ready for the January tax bill, or ensure your broker handles it automatically.`,
    impact: 'medium',
    category: 'tax',
  });

  // Tip: Year-end tax planning
  const now = new Date();
  if (now.getMonth() >= 9) { // October-December
    tips.push({
      id: 'year-end-planning',
      title: 'Year-End Tax Planning',
      description: `The tax year ends December 31. Your ASK will be valued on this date for lagerbeskatning. If you have unrealized losses, consider if holding through year-end makes sense (losses offset gains in ASK too).`,
      impact: 'high',
      category: 'timing',
    });
  }

  // Tip: Empty account
  if (summary.holdingsCount === 0 && summary.totalDeposited === 0) {
    tips.push({
      id: 'get-started',
      title: 'Open Your Aktiesparekonto Today',
      description: `The ASK is the single best tax advantage for Danish stock investors. Open one at your bank or broker (Saxo, Nordnet, Lunar, etc.) and deposit up to ${ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK. You'll pay only 17% on gains instead of 27-42%.`,
      impact: 'high',
      category: 'deposit',
    });
  }

  // Tip: Tax savings highlight
  if (summary.taxSavedVsRegular > 0) {
    tips.push({
      id: 'tax-savings',
      title: `You're Saving ~${summary.taxSavedVsRegular.toLocaleString()} DKK in Tax`,
      description: `By holding these investments in your ASK instead of a regular depot, you're saving approximately ${summary.taxSavedVsRegular.toLocaleString()} DKK in tax. The 17% rate beats the 27-42% progressive rate on aktieindkomst.`,
      impact: 'high',
      category: 'tax',
    });
  }

  return tips;
}

// ─── Eligible Securities Check ───────────────────────────────────────────────

/**
 * Check if a security type is eligible for ASK.
 * ASK can hold: stocks, ETFs, and investment funds on regulated EU markets.
 * ASK cannot hold: bonds, unlisted securities, crypto, derivatives.
 */
export function isASKEligible(securityType: string): { eligible: boolean; reason: string } {
  const type = securityType.toLowerCase();

  if (['stock', 'aktie', 'equity'].includes(type)) {
    return { eligible: true, reason: 'Listed stocks are eligible for ASK' };
  }
  if (['etf', 'exchange-traded fund'].includes(type)) {
    return { eligible: true, reason: 'ETFs listed on regulated EU markets are eligible for ASK' };
  }
  if (['investment fund', 'investeringsforening', 'mutual fund'].includes(type)) {
    return { eligible: true, reason: 'Danish investment funds (investeringsforeninger) are eligible for ASK' };
  }
  if (['bond', 'obligation', 'government bond'].includes(type)) {
    return { eligible: false, reason: 'Bonds are NOT eligible for ASK — use a regular depot' };
  }
  if (['crypto', 'cryptocurrency', 'bitcoin'].includes(type)) {
    return { eligible: false, reason: 'Cryptocurrency is NOT eligible for ASK' };
  }
  if (['derivative', 'option', 'future', 'warrant'].includes(type)) {
    return { eligible: false, reason: 'Derivatives (options, futures, warrants) are NOT eligible for ASK' };
  }
  if (['unlisted', 'private equity', 'anpart'].includes(type)) {
    return { eligible: false, reason: 'Unlisted securities are NOT eligible for ASK' };
  }

  return { eligible: false, reason: 'Unknown security type — check with your broker if eligible for ASK' };
}

// ─── Demo Data ───────────────────────────────────────────────────────────────

export function loadDemoData(): ASKAccount {
  const demoAccount: ASKAccount = {
    holdings: [
      {
        id: crypto.randomUUID(),
        symbol: 'NOVO-B.CO',
        name: 'Novo Nordisk B',
        shares: 15,
        avgCostPerShare: 680,
        currentPricePerShare: 845,
        addedDate: '2025-03-15',
      },
      {
        id: crypto.randomUUID(),
        symbol: 'IWDA.AS',
        name: 'iShares MSCI World ETF',
        shares: 42,
        avgCostPerShare: 82,
        currentPricePerShare: 94.5,
        addedDate: '2025-01-10',
      },
      {
        id: crypto.randomUUID(),
        symbol: 'MAERSK-B.CO',
        name: 'A.P. Møller-Mærsk B',
        shares: 1,
        avgCostPerShare: 11200,
        currentPricePerShare: 12450,
        addedDate: '2025-06-01',
      },
      {
        id: crypto.randomUUID(),
        symbol: 'VWS.CO',
        name: 'Vestas Wind Systems',
        shares: 50,
        avgCostPerShare: 142,
        currentPricePerShare: 158,
        addedDate: '2025-04-20',
      },
    ],
    deposits: [
      { id: crypto.randomUUID(), amount: 50000, date: '2025-01-05', note: 'Initial deposit' },
      { id: crypto.randomUUID(), amount: 30000, date: '2025-03-01', note: 'Monthly savings' },
      { id: crypto.randomUUID(), amount: 25000, date: '2025-06-01', note: 'Bonus deposit' },
    ],
    withdrawals: [],
    taxHistory: [
      {
        id: crypto.randomUUID(),
        year: 2025,
        startValue: 50000,
        endValue: 98500,
        deposits: 55000,
        withdrawals: 0,
        taxableGain: -6500, // Loss year (value grew less than deposits)
        taxAmount: 0,
        paid: true,
      },
    ],
    createdDate: '2025-01-05',
    broker: 'Saxo Bank',
  };

  saveASKAccount(demoAccount);
  return demoAccount;
}
