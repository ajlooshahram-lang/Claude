/**
 * Price Cache Integration Tests
 *
 * Tests the caching logic that determines whether the user sees
 * live data, stale data, or "unavailable." Getting this wrong means
 * showing outdated prices without warning — leading to bad decisions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to mock the alpha-vantage module and test price-cache in isolation
// Mock the external dependency
vi.mock('@/lib/market-data/alpha-vantage', () => ({
  fetchQuote: vi.fn(),
  isRateLimited: vi.fn(() => false),
  isAlphaVantageConfigured: vi.fn(() => true),
}));

import { getPrice } from '@/lib/market-data/price-cache';
import { fetchQuote, isRateLimited, isAlphaVantageConfigured } from '@/lib/market-data/alpha-vantage';

const mockFetchQuote = vi.mocked(fetchQuote);
const mockIsRateLimited = vi.mocked(isRateLimited);
const mockIsAlphaVantageConfigured = vi.mocked(isAlphaVantageConfigured);

const MOCK_QUOTE = {
  symbol: 'AAPL',
  price: 284.50,
  change: 2.30,
  changePct: 0.82,
  volume: 45000000,
  previousClose: 282.20,
  high: 285.00,
  low: 280.50,
  open: 281.00,
  latestTradingDay: '2026-06-30',
  fetchedAt: new Date().toISOString(),
};

describe('Price cache — freshness and staleness', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchQuote.mockReset();
    mockIsRateLimited.mockReturnValue(false);
    mockIsAlphaVantageConfigured.mockReturnValue(true);
  });

  it('fresh cache (< 15 min) — serves cached price without API call', async () => {
    // Pre-populate cache with a recent entry
    const recentCache = {
      [MOCK_QUOTE.symbol]: {
        quote: MOCK_QUOTE,
        cachedAt: Date.now() - (5 * 60 * 1000), // 5 min ago
      },
    };
    localStorage.setItem('smartvest_price_cache', JSON.stringify(recentCache));

    const result = await getPrice('AAPL');

    // Should NOT have called fetchQuote (served from cache)
    expect(mockFetchQuote).not.toHaveBeenCalled();
    expect(result.price).toBe(284.50);
    expect(result.isStale).toBe(false);
    expect(result.isLive).toBe(true);
    expect(result.source).not.toBe('unavailable');
  });

  it('stale cache (> 15 min) — triggers refetch', async () => {
    // Pre-populate cache with an OLD entry
    const staleCache = {
      [MOCK_QUOTE.symbol]: {
        quote: MOCK_QUOTE,
        cachedAt: Date.now() - (20 * 60 * 1000), // 20 min ago (stale)
      },
    };
    localStorage.setItem('smartvest_price_cache', JSON.stringify(staleCache));

    // Mock a successful refetch
    const freshQuote = { ...MOCK_QUOTE, price: 285.00, fetchedAt: new Date().toISOString() };
    mockFetchQuote.mockResolvedValue(freshQuote);

    const result = await getPrice('AAPL');

    // Should have called fetchQuote (cache was stale)
    expect(mockFetchQuote).toHaveBeenCalledWith('AAPL');
    expect(result.price).toBe(285.00);
    expect(result.isStale).toBe(false);
    expect(result.source).not.toBe('unavailable');
  });

  it('rate limited + stale cache — returns stale price with warning flag', async () => {
    // Pre-populate with stale cache
    const staleCache = {
      [MOCK_QUOTE.symbol]: {
        quote: MOCK_QUOTE,
        cachedAt: Date.now() - (60 * 60 * 1000), // 1 hour ago
      },
    };
    localStorage.setItem('smartvest_price_cache', JSON.stringify(staleCache));

    // Rate limited — can't refetch
    mockIsRateLimited.mockReturnValue(true);

    const result = await getPrice('AAPL');

    // Should NOT have called fetchQuote (rate limited)
    expect(mockFetchQuote).not.toHaveBeenCalled();
    // Should return stale data with clear stale flag
    expect(result.price).toBe(284.50); // Last known price
    expect(result.isStale).toBe(true);
    expect(result.isLive).toBe(false);
    expect(result.source).toBe('cached');
    expect(result.rateLimitedNote).toContain('Rate limit');
  });

  it('rate limited + no cache — returns unavailable, not fake data', async () => {
    // No cache at all
    localStorage.clear();
    mockIsRateLimited.mockReturnValue(true);

    const result = await getPrice('NEWSTOCK');

    expect(result.source).toBe('unavailable');
    expect(result.price).toBe(0);
    expect(result.isStale).toBe(true);
    expect(result.rateLimitedNote).toContain('Rate limit');
    expect(result.rateLimitedNote).toContain('no cached price');
  });

  it('API key not configured — returns stale cache or unavailable with explanation', async () => {
    mockIsAlphaVantageConfigured.mockReturnValue(false);
    localStorage.clear();

    const result = await getPrice('AAPL');

    expect(result.source).toBe('unavailable');
    expect(result.rateLimitedNote).toContain('API key not configured');
  });

  it('fetch fails (network error) + stale cache — serves stale with warning', async () => {
    // Stale cache exists
    const staleCache = {
      [MOCK_QUOTE.symbol]: {
        quote: MOCK_QUOTE,
        cachedAt: Date.now() - (30 * 60 * 1000), // 30 min ago
      },
    };
    localStorage.setItem('smartvest_price_cache', JSON.stringify(staleCache));

    // Fetch fails
    mockFetchQuote.mockResolvedValue(null);

    const result = await getPrice('AAPL');

    expect(result.price).toBe(284.50); // Falls back to stale cache
    expect(result.isStale).toBe(true);
    expect(result.rateLimitedNote).toContain('Fetch failed');
  });
});
