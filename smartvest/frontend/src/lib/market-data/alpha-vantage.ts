/**
 * Alpha Vantage Market Data Client
 *
 * Free tier: 25 requests/day, 5 requests/minute.
 * Fetches real stock prices and caches them for 15 minutes.
 *
 * SETUP:
 *   1. Get free API key at https://www.alphavantage.co/support/#api-key
 *   2. Set NEXT_PUBLIC_ALPHA_VANTAGE_KEY in .env.local
 *
 * Without the key, returns null (UI shows "No API key configured").
 */

const API_KEY = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY || '')
  : '';

const BASE_URL = 'https://www.alphavantage.co/query';

// ─── Rate Tracking ───────────────────────────────────────────────────────────

const RATE_STORAGE_KEY = 'smartvest_av_rate';

interface RateState {
  requestsToday: number;
  lastRequestTime: number;  // Unix ms
  dateKey: string;          // YYYY-MM-DD (resets daily)
}

function getRateState(): RateState {
  if (typeof window === 'undefined') return { requestsToday: 0, lastRequestTime: 0, dateKey: '' };
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY);
    const state: RateState = raw ? JSON.parse(raw) : { requestsToday: 0, lastRequestTime: 0, dateKey: '' };
    // Reset if new day
    const today = new Date().toISOString().split('T')[0];
    if (state.dateKey !== today) {
      return { requestsToday: 0, lastRequestTime: 0, dateKey: today };
    }
    return state;
  } catch { return { requestsToday: 0, lastRequestTime: 0, dateKey: new Date().toISOString().split('T')[0] }; }
}

function recordRequest(): void {
  const state = getRateState();
  state.requestsToday++;
  state.lastRequestTime = Date.now();
  state.dateKey = new Date().toISOString().split('T')[0];
  localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(state));
}

export function getRemainingRequests(): number {
  return Math.max(0, 25 - getRateState().requestsToday);
}

export function isRateLimited(): boolean {
  const state = getRateState();
  // 25/day limit
  if (state.requestsToday >= 25) return true;
  // 5/min limit (12 second gap minimum)
  if (Date.now() - state.lastRequestTime < 12000) return true;
  return false;
}

// ─── API Calls ───────────────────────────────────────────────────────────────

export interface AlphaVantageQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  previousClose: number;
  high: number;
  low: number;
  open: number;
  latestTradingDay: string;
  fetchedAt: string;          // ISO timestamp of when we fetched
}

/**
 * Fetch a real-time quote from Alpha Vantage.
 * Returns null if API key is missing or rate limited.
 */
export async function fetchQuote(symbol: string): Promise<AlphaVantageQuote | null> {
  if (!API_KEY) return null;
  if (isRateLimited()) return null;

  try {
    const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();

    // Check for API error responses
    if (json['Note']) {
      // Rate limit hit (Alpha Vantage returns a "Note" field)
      console.warn('[AlphaVantage] Rate limit reached:', json['Note']);
      return null;
    }
    if (json['Error Message']) {
      console.warn('[AlphaVantage] Error:', json['Error Message']);
      return null;
    }

    const gq = json['Global Quote'];
    if (!gq || !gq['05. price']) return null;

    recordRequest();

    return {
      symbol: gq['01. symbol'] || symbol,
      price: parseFloat(gq['05. price']) || 0,
      change: parseFloat(gq['09. change']) || 0,
      changePct: parseFloat(gq['10. change percent']?.replace('%', '') || '0') || 0,
      volume: parseInt(gq['06. volume'] || '0') || 0,
      previousClose: parseFloat(gq['08. previous close'] || '0') || 0,
      high: parseFloat(gq['03. high'] || '0') || 0,
      low: parseFloat(gq['04. low'] || '0') || 0,
      open: parseFloat(gq['02. open'] || '0') || 0,
      latestTradingDay: gq['07. latest trading day'] || '',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AlphaVantage] Fetch failed:', err);
    return null;
  }
}

/**
 * Check if Alpha Vantage is configured.
 */
export function isAlphaVantageConfigured(): boolean {
  return !!API_KEY;
}
