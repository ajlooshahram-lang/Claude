/**
 * Tamper Detection — Integrity check between fetched data and displayed UI
 *
 * Creates a simple fingerprint of the portfolio state at calculation time.
 * The portfolio page can display this fingerprint. If a browser extension
 * or MITM modifies the displayed numbers, the fingerprint won't match
 * a manual recalculation — giving the user a signal that something is wrong.
 *
 * This is NOT cryptographic security (an extension could also modify the
 * fingerprint). But it raises the bar significantly: an attacker must
 * modify BOTH the numbers AND the checksum consistently, which is much
 * harder than just changing a DOM text node.
 *
 * HOW TO VERIFY MANUALLY:
 *   1. Note the checksum shown on the portfolio page (e.g., "V:25994-C:14880-#4")
 *   2. Manually compute: V = sum(shares × price), C = sum(shares × avgCost)
 *   3. #N = number of holdings
 *   4. If they match → display is authentic
 *   5. If they don't → something modified the numbers after calculation
 */

export interface IntegrityFingerprint {
  /** Truncated portfolio value (first 5 digits) */
  v: string;
  /** Truncated cost basis (first 5 digits) */
  c: string;
  /** Number of holdings */
  n: number;
  /** Simple hash: (value XOR cost XOR count) mod 9999 */
  hash: number;
  /** Human-readable summary for display */
  display: string;
}

/**
 * Generate an integrity fingerprint from the raw calculation inputs.
 * Call this INSIDE computeSummary or right after, using the same
 * raw values that produced the displayed numbers.
 */
export function generateFingerprint(
  totalValue: number,
  totalCost: number,
  holdingsCount: number,
): IntegrityFingerprint {
  const v = Math.round(totalValue).toString().slice(0, 5);
  const c = Math.round(totalCost).toString().slice(0, 5);
  const n = holdingsCount;

  // Simple integrity hash — not cryptographic, just a consistency check.
  // XOR the integer representations and mod by a prime.
  const hash = Math.abs((Math.round(totalValue) ^ Math.round(totalCost) ^ n) % 9973);

  return {
    v,
    c,
    n,
    hash,
    display: `V:${v}·C:${c}·#${n}·H:${hash}`,
  };
}

/**
 * Verify a fingerprint against currently displayed values.
 * The user can do this manually, or the app can auto-check.
 */
export function verifyFingerprint(
  fingerprint: IntegrityFingerprint,
  displayedValue: number,
  displayedCost: number,
  displayedCount: number,
): boolean {
  const expected = generateFingerprint(displayedValue, displayedCost, displayedCount);
  return expected.hash === fingerprint.hash &&
         expected.v === fingerprint.v &&
         expected.c === fingerprint.c &&
         expected.n === fingerprint.n;
}
