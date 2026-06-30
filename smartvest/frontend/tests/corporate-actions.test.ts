/**
 * Corporate Actions Tests — Stock Splits & Ticker Changes
 *
 * Verifies that splits adjust cost basis correctly and ticker changes
 * maintain FIFO matching between old buys and new sells.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { recordStockSplit, recordTickerChange } from '@/lib/corporate-actions';

// Mock getCurrentUserId
vi.mock('@/lib/supabase/client', () => ({
  supabase: {},
  isSupabaseConfigured: () => false, // use localStorage path
  getCurrentUserId: async () => 'test-user',
}));

import { vi } from 'vitest';

describe('recordStockSplit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('4:1 split — shares ×4, cost ÷4, total unchanged', async () => {
    // Setup: 10 shares @ 2800
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'AAPL', shares: 10, avg_cost_per_share: 2800 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([
      { id: 'o1', symbol: 'AAPL', side: 'buy', shares: 10, price_per_share: 2800 },
    ]));

    const result = await recordStockSplit('AAPL', 4, 1);
    expect(result.success).toBe(true);

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].shares).toBe(40);          // 10 × 4
    expect(holdings[0].avg_cost_per_share).toBe(700); // 2800 ÷ 4

    // Total cost unchanged: 40 × 700 = 28000 = 10 × 2800
    expect(holdings[0].shares * holdings[0].avg_cost_per_share).toBe(28000);

    const orders = JSON.parse(localStorage.getItem('smartvest_sb_orders')!);
    expect(orders[0].shares).toBe(40);
    expect(orders[0].price_per_share).toBe(700);
  });

  it('2:1 split — shares ×2, cost ÷2', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'KO', shares: 12, avg_cost_per_share: 420 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([
      { id: 'o1', symbol: 'KO', side: 'buy', shares: 12, price_per_share: 420 },
    ]));

    await recordStockSplit('KO', 2, 1);

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].shares).toBe(24);
    expect(holdings[0].avg_cost_per_share).toBe(210);
    expect(holdings[0].shares * holdings[0].avg_cost_per_share).toBe(5040); // unchanged
  });

  it('reverse split 1:10 — shares ÷10, cost ×10', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'GE', shares: 100, avg_cost_per_share: 8 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([
      { id: 'o1', symbol: 'GE', side: 'buy', shares: 100, price_per_share: 8 },
    ]));

    await recordStockSplit('GE', 1, 10); // 1 new share for every 10 old

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].shares).toBe(10);          // 100 × (1/10)
    expect(holdings[0].avg_cost_per_share).toBe(80); // 8 × 10
    expect(holdings[0].shares * holdings[0].avg_cost_per_share).toBe(800); // unchanged
  });

  it('only affects the specified symbol, not others', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'AAPL', shares: 10, avg_cost_per_share: 2800 },
      { id: '2', symbol: 'KO', shares: 12, avg_cost_per_share: 420 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([]));

    await recordStockSplit('AAPL', 4, 1);

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].shares).toBe(40);   // AAPL adjusted
    expect(holdings[1].shares).toBe(12);   // KO unchanged
    expect(holdings[1].avg_cost_per_share).toBe(420); // KO unchanged
  });

  it('rejects invalid ratio (0 or negative)', async () => {
    const r1 = await recordStockSplit('AAPL', 0, 1);
    expect(r1.success).toBe(false);

    const r2 = await recordStockSplit('AAPL', -4, 1);
    expect(r2.success).toBe(false);

    const r3 = await recordStockSplit('AAPL', 1, 1);
    expect(r3.success).toBe(false);
  });
});

describe('recordTickerChange', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renames symbol across holdings, orders, and watchlist', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'FB', shares: 5, avg_cost_per_share: 200 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([
      { id: 'o1', symbol: 'FB', side: 'buy', shares: 5, price_per_share: 200 },
    ]));
    localStorage.setItem('smartvest_sb_watchlist', JSON.stringify([
      { id: 'w1', symbol: 'FB', name: 'Meta' },
    ]));

    const result = await recordTickerChange('FB', 'META');
    expect(result.success).toBe(true);

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].symbol).toBe('META');

    const orders = JSON.parse(localStorage.getItem('smartvest_sb_orders')!);
    expect(orders[0].symbol).toBe('META');

    const watchlist = JSON.parse(localStorage.getItem('smartvest_sb_watchlist')!);
    expect(watchlist[0].symbol).toBe('META');
  });

  it('preserves shares and cost (only symbol changes)', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'FB', shares: 5, avg_cost_per_share: 200 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([]));

    await recordTickerChange('FB', 'META');

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].shares).toBe(5);
    expect(holdings[0].avg_cost_per_share).toBe(200);
  });

  it('only affects the old symbol, not other holdings', async () => {
    localStorage.setItem('smartvest_sb_holdings', JSON.stringify([
      { id: '1', symbol: 'FB', shares: 5, avg_cost_per_share: 200 },
      { id: '2', symbol: 'AAPL', shares: 10, avg_cost_per_share: 150 },
    ]));
    localStorage.setItem('smartvest_sb_orders', JSON.stringify([]));

    await recordTickerChange('FB', 'META');

    const holdings = JSON.parse(localStorage.getItem('smartvest_sb_holdings')!);
    expect(holdings[0].symbol).toBe('META');
    expect(holdings[1].symbol).toBe('AAPL'); // unchanged
  });

  it('rejects empty or same symbols', async () => {
    const r1 = await recordTickerChange('', 'META');
    expect(r1.success).toBe(false);

    const r2 = await recordTickerChange('FB', 'FB');
    expect(r2.success).toBe(false);
  });
});
