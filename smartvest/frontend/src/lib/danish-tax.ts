/**
 * Danish Capital Gains Tax Calculator (Aktieindkomst)
 *
 * Danish tax rules for stock gains (2024/2025/2026 rates):
 *   - First 61,000 DKK of gains per year: 27% tax
 *   - Gains above 61,000 DKK: 42% tax
 *   - For married couples filing jointly: thresholds are doubled (122,000 DKK)
 *
 * Losses can offset gains in the same year.
 * Unused losses carry forward to future years.
 *
 * ASK (Aktiesparekonto) has a flat 17% rate — simpler.
 *
 * DISCLAIMER: This is an ESTIMATE for educational purposes.
 * Not official tax advice. Consult a tax advisor or SKAT.dk for your situation.
 */

// 2026 thresholds (updated annually by SKAT)
const THRESHOLD_SINGLE = 61000;  // DKK
const RATE_LOW = 0.27;           // 27% on first 61,000
const RATE_HIGH = 0.42;          // 42% above 61,000
const RATE_ASK = 0.17;           // 17% flat for ASK accounts

export type AccountType = 'regular' | 'ask';

export interface TaxEstimate {
  grossGain: number;           // Total realized gains
  totalLosses: number;         // Total realized losses (positive number)
  netGain: number;             // Gain after loss offset (can be negative)
  taxableGain: number;         // Amount subject to tax (≥0)
  taxAtLowRate: number;        // Tax at 27% (on first 61,000)
  taxAtHighRate: number;       // Tax at 42% (on amount above 61,000)
  totalTax: number;            // Total estimated tax
  effectiveRate: number;       // Effective tax rate (%)
  netProfit: number;           // What you actually keep after tax
  lossCarryForward: number;    // Losses that carry to next year
  accountType: AccountType;
}

export function calculateDanishTax(
  realizedGains: number,       // Total gains from sells this year (positive)
  realizedLosses: number,      // Total losses from sells this year (positive)
  accountType: AccountType = 'regular',
  isMarried: boolean = false,
): TaxEstimate {
  // Net gain after offsetting losses
  const netGain = realizedGains - realizedLosses;
  const taxableGain = Math.max(0, netGain);
  const lossCarryForward = Math.max(0, -netGain); // Unused losses

  let taxAtLowRate = 0;
  let taxAtHighRate = 0;
  let totalTax = 0;

  if (accountType === 'ask') {
    // ASK: flat 17% on all gains
    totalTax = taxableGain * RATE_ASK;
    taxAtLowRate = totalTax;
  } else {
    // Regular depot: progressive rates
    const threshold = isMarried ? THRESHOLD_SINGLE * 2 : THRESHOLD_SINGLE;

    if (taxableGain <= threshold) {
      taxAtLowRate = taxableGain * RATE_LOW;
    } else {
      taxAtLowRate = threshold * RATE_LOW;
      taxAtHighRate = (taxableGain - threshold) * RATE_HIGH;
    }
    totalTax = taxAtLowRate + taxAtHighRate;
  }

  const effectiveRate = taxableGain > 0 ? (totalTax / taxableGain) * 100 : 0;
  const netProfit = netGain - totalTax;

  return {
    grossGain: realizedGains,
    totalLosses: realizedLosses,
    netGain,
    taxableGain,
    taxAtLowRate: Math.round(taxAtLowRate),
    taxAtHighRate: Math.round(taxAtHighRate),
    totalTax: Math.round(totalTax),
    effectiveRate: Math.round(effectiveRate * 10) / 10,
    netProfit: Math.round(netProfit),
    lossCarryForward: Math.round(lossCarryForward),
    accountType,
  };
}

/**
 * Estimate tax on a single sell order (preview before confirming).
 */
export function estimateSellTax(
  sellProceeds: number,
  costBasis: number,
  accountType: AccountType = 'regular',
  existingGainsThisYear: number = 0,
): {
  gain: number;
  estimatedTax: number;
  netAfterTax: number;
  explanation: string;
} {
  const gain = sellProceeds - costBasis;

  if (gain <= 0) {
    return {
      gain,
      estimatedTax: 0,
      netAfterTax: sellProceeds,
      explanation: `This sell would result in a loss of ${Math.abs(gain).toFixed(0)} DKK. No tax is owed on losses — and this loss can offset future gains.`,
    };
  }

  if (accountType === 'ask') {
    const tax = Math.round(gain * RATE_ASK);
    return {
      gain,
      estimatedTax: tax,
      netAfterTax: sellProceeds - tax,
      explanation: `ASK account: flat 17% tax on the ${gain.toFixed(0)} DKK gain = ${tax.toFixed(0)} DKK tax. You keep ${(sellProceeds - tax).toFixed(0)} DKK.`,
    };
  }

  // Check if this gain pushes over the threshold
  const totalGainsAfter = existingGainsThisYear + gain;
  const threshold = THRESHOLD_SINGLE;

  if (totalGainsAfter <= threshold) {
    const tax = Math.round(gain * RATE_LOW);
    return {
      gain,
      estimatedTax: tax,
      netAfterTax: sellProceeds - tax,
      explanation: `Your gain of ${gain.toFixed(0)} DKK stays within the 27% bracket (total ${totalGainsAfter.toFixed(0)} / ${threshold.toLocaleString()} DKK threshold). Tax: ~${tax.toFixed(0)} DKK.`,
    };
  }

  // Splits across brackets
  const inLowBracket = Math.max(0, threshold - existingGainsThisYear);
  const inHighBracket = gain - inLowBracket;
  const taxLow = inLowBracket * RATE_LOW;
  const taxHigh = inHighBracket * RATE_HIGH;
  const tax = Math.round(taxLow + taxHigh);

  return {
    gain,
    estimatedTax: tax,
    netAfterTax: sellProceeds - tax,
    explanation: `This gain crosses into the 42% bracket. ${inLowBracket.toFixed(0)} DKK taxed at 27% + ${inHighBracket.toFixed(0)} DKK at 42% = ~${tax.toFixed(0)} DKK total tax.`,
  };
}
