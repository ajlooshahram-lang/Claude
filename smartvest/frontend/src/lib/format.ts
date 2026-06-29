/**
 * Shared number formatting for the entire app.
 * Ensures consistency: always 2 decimal places for prices,
 * 1 decimal for percentages, proper locale formatting.
 */

/** Format a price with currency symbol and 2 decimal places. */
export function formatPrice(value: number, currency?: string): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

/** Format a percentage with 1 or 2 decimal places and +/- sign. */
export function formatPct(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Format a large number (market cap, volume) with K/M/B suffix. */
export function formatLargeNumber(value: number | null): string {
  if (!value) return '—';
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toLocaleString();
}

/** Format a gain/loss amount with +/- sign and no decimals for large values. */
export function formatGainLoss(value: number): string {
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(value) >= 1000) {
    return `${sign}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${sign}${value.toFixed(2)}`;
}
