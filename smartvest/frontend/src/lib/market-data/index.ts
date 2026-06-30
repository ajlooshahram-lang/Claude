/**
 * Market Data Module — Public API
 *
 * All price data flows through this module.
 * It handles: live API fetching, caching, staleness, and rate limiting.
 *
 * Usage:
 *   import { getPrice, formatLastUpdated } from '@/lib/market-data';
 *   const price = await getPrice('NOVO-B.CO');
 *   // price.price = 845
 *   // price.isStale = false
 *   // price.fetchedAt = "2026-06-29T08:15:00Z"
 */

export { getPrice, getPrices, formatLastUpdated } from './price-cache';
export type { CachedPrice } from './price-cache';
export { isAlphaVantageConfigured, getRemainingRequests, isRateLimited } from './alpha-vantage';
export type { AlphaVantageQuote } from './alpha-vantage';
