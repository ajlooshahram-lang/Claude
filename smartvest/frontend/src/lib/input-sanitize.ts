/**
 * Input Sanitization Utilities
 *
 * Defense-in-depth: even though Supabase/PostgREST uses parameterized
 * queries and React auto-escapes output, we add input-level guards to:
 * - Prevent excessively long strings from reaching APIs (DoS/resource abuse)
 * - Strip obvious injection patterns at the input layer
 * - Provide consistent validation across all text inputs
 */

/** Maximum lengths for each field type */
export const MAX_LENGTHS = {
  symbol: 20,        // Longest real ticker: "NOVO-B.CO" = 9 chars
  name: 100,         // Company or display names
  note: 500,         // Order notes, deposit notes
  search: 100,       // Search queries
  email: 254,        // RFC 5321
  password: 128,     // Reasonable max
  transcript: 50000, // Earnings transcript (long text)
} as const;

/**
 * Truncate input to max length. Use on any value before sending to API.
 */
export function truncate(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

/**
 * Sanitize a stock ticker symbol.
 * Only allows: A-Z, 0-9, dot, dash (covers NOVO-B.CO, 7203.T, AAPL)
 */
export function sanitizeSymbol(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '')
    .slice(0, MAX_LENGTHS.symbol);
}

/**
 * Sanitize a text field (name, note, etc.)
 * Strips control characters but allows all printable unicode.
 */
export function sanitizeText(raw: string, maxLength: number = MAX_LENGTHS.name): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .slice(0, maxLength);
}

/**
 * Validate that a value looks like a reasonable number for financial input.
 * Returns the number or null if invalid.
 */
export function validateFinancialNumber(raw: string): number | null {
  const n = parseFloat(raw);
  if (isNaN(n) || !isFinite(n)) return null;
  if (n < 0) return null;
  if (n > 1e12) return null; // No position worth > 1 trillion
  return n;
}
