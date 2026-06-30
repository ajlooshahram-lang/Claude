/**
 * Price Cache Layer
 *
 * Stores fetched prices with timestamps. Only re-fetches if:
 * - Price is older than 15 minutes
 * - AND we haven't hit the daily rate limit
 *
 * If rate limited, returns the last cached price with a
 * stale flag so the UI can show "may be outdated".
 */

import { fetchQuote, AlphaVantageQuote, isRateLimited, isAlphaVantageConfigured } from './alpha-vantage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedPrice {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  fetchedAt: string;         // When this was actually fetched from API
  isStale: boolean;          // True if >15 min old and couldn't refresh
  isLive: boolean;           // True if fetched <15 min ago
  staleSince: string | null; // When it became stale
  source: 'live' | 'cached' | 'unavailable';
  rateLimitedNote: string | null;
}

// ─── Cache Storage ───────────────────────────────────────────────────────────

const CACHE_KEY = 'smartvest_price_cache';
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  quote: AlphaVantageQuote;
  cachedAt: number; // Unix ms
}

function getCache(): Record<string, CacheEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function setCache(symbol: string, quote: AlphaVantageQuote): void {
  if (typeof window === 'undefined') return;
  const cache = getCache();
  cache[symbol] = { quote, cachedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getCachedEntry(symbol: string): CacheEntry | null {
  return getCache()[symbol] || null;
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get a price for a symbol, using cache + live fetch intelligently.
 *
 * Logic:
 * 1. If we have a cached price < 15 min old → return it (source: 'cached')
 * 2. If cache is stale AND we're not rate limited → fetch fresh (source: 'live')
 * 3. If cache is stale AND rate limited → return stale + warning (source: 'cached', isStale: true)
 * 4. If no cache AND rate limited → return unavailable
 */
export async function getPrice(symbol: string): Promise<CachedPrice> {
  const cached = getCachedEntry(symbol);
  const now = Date.now();

  // No API key configured
  if (!isAlphaVantageConfigured()) {
    if (cached) {
      return buildCachedPrice(cached.quote, true, 'API key not configured. Showing last known price.');
    }
    return unavailablePrice(symbol, 'Alpha Vantage API key not configured. Set NEXT_PUBLIC_ALPHA_VANTAGE_KEY in .env.local');
  }

  // Check if cache is fresh (< 15 min)
  if (cached && (now - cached.cachedAt) < STALE_THRESHOLD_MS) {
    return buildCachedPrice(cached.quote, false, null);
  }

  // Cache is stale or missing — try to fetch
  if (isRateLimited()) {
    // Rate limited — return stale cache if available
    if (cached) {
      const staleSince = new Date(cached.cachedAt + STALE_THRESHOLD_MS).toISOString();
      return buildCachedPrice(cached.quote, true, `Rate limit reached (25/day). Price from ${formatAge(cached.cachedAt)}. Will refresh when limit resets at midnight UTC.`);
    }
    return unavailablePrice(symbol, 'Rate limit reached and no cached price available. Resets at midnight UTC.');
  }

  // Fetch fresh
  const fresh = await fetchQuote(symbol);
  if (fresh) {
    setCache(symbol, fresh);
    return buildCachedPrice(fresh, false, null);
  }

  // Fetch failed — return stale cache
  if (cached) {
    return buildCachedPrice(cached.quote, true, `Fetch failed. Showing price from ${formatAge(cached.cachedAt)}.`);
  }

  return unavailablePrice(symbol, 'Could not fetch price and no cache available.');
}

/**
 * Get prices for multiple symbols (batched with rate awareness).
 */
export async function getPrices(symbols: string[]): Promise<Record<string, CachedPrice>> {
  const results: Record<string, CachedPrice> = {};
  for (const symbol of symbols) {
    results[symbol] = await getPrice(symbol);
    // Small delay between requests to respect 5/min limit
    if (isAlphaVantageConfigured() && !isRateLimited()) {
      await new Promise(r => setTimeout(r, 12500)); // 12.5s gap
    }
  }
  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCachedPrice(quote: AlphaVantageQuote, isStale: boolean, note: string | null): CachedPrice {
  return {
    symbol: quote.symbol,
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    volume: quote.volume,
    high: quote.high,
    low: quote.low,
    open: quote.open,
    previousClose: quote.previousClose,
    fetchedAt: quote.fetchedAt,
    isStale,
    isLive: !isStale,
    staleSince: isStale ? quote.fetchedAt : null,
    source: isStale ? 'cached' : 'live',
    rateLimitedNote: note,
  };
}

function unavailablePrice(symbol: string, note: string): CachedPrice {
  return {
    symbol, price: 0, change: 0, changePct: 0, volume: 0,
    high: 0, low: 0, open: 0, previousClose: 0,
    fetchedAt: '', isStale: true, isLive: false,
    staleSince: null, source: 'unavailable',
    rateLimitedNote: note,
  };
}

function formatAge(cachedAt: number): string {
  const minutes = Math.round((Date.now() - cachedAt) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Get a human-readable "last updated" string.
 */
export function formatLastUpdated(fetchedAt: string): string {
  if (!fetchedAt) return 'Never';
  const diff = Date.now() - new Date(fetchedAt).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return new Date(fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
