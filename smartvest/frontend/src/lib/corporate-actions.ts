/**
 * Corporate Actions — Stock Splits & Ticker Changes
 *
 * When a stock splits or changes its ticker, the user must manually
 * record the action. This module adjusts holdings and order history
 * to maintain correct cost basis and FIFO matching.
 *
 * WHY MANUAL: Automated feeds cost money, can be wrong, and hide
 * changes from the user. For tax-relevant adjustments to cost basis,
 * you want to see it happen and confirm it matches your broker statement.
 *
 * USAGE:
 *   import { recordStockSplit, recordTickerChange } from '@/lib/corporate-actions';
 *   await recordStockSplit('AAPL', 4, 1);  // 4-for-1 split
 *   await recordTickerChange('FB', 'META');
 */

import { supabase, isSupabaseConfigured, getCurrentUserId } from './supabase/client';

// Type alias for cleaner code (supabase client is typed with Database generic)
const db = supabase as any;

/**
 * Record a stock split.
 *
 * Adjusts both holdings and historical orders so that:
 * - shares are multiplied by (newShares / oldShares)
 * - avg_cost_per_share is divided by (newShares / oldShares)
 * - Total investment value remains unchanged
 * - FIFO lot matching uses the adjusted prices going forward
 *
 * Example: 4-for-1 split → ratio = 4/1 = 4
 *   10 shares @ 2800 → 40 shares @ 700
 *   Total cost: 28,000 (unchanged)
 *
 * @param symbol - The stock symbol (e.g., 'AAPL')
 * @param newShares - New shares received per old share (e.g., 4 for a 4:1)
 * @param oldShares - Old shares (e.g., 1 for a 4:1)
 */
export async function recordStockSplit(
  symbol: string,
  newShares: number,
  oldShares: number,
): Promise<{ success: boolean; error?: string }> {
  if (newShares <= 0 || oldShares <= 0) {
    return { success: false, error: 'Split ratio must be positive numbers.' };
  }
  if (newShares === oldShares) {
    return { success: false, error: 'Split ratio 1:1 does nothing.' };
  }

  const ratio = newShares / oldShares;
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Not logged in.' };

  if (!isSupabaseConfigured()) {
    return applyStockSplitLocalStorage(symbol, ratio);
  }

  // 1. Adjust holding: multiply shares, divide avg_cost
  const { data: holdings, error: hErr } = await db
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol);

  if (hErr) return { success: false, error: 'Failed to fetch holdings: ' + hErr.message };

  for (const h of holdings || []) {
    const newShareCount = h.shares * ratio;
    const newAvgCost = h.avg_cost_per_share / ratio;
    const { error } = await db
      .from('holdings')
      .update({ shares: newShareCount, avg_cost_per_share: newAvgCost })
      .eq('id', h.id);
    if (error) return { success: false, error: 'Failed to update holding: ' + error.message };
  }

  // 2. Adjust all historical orders for this symbol: multiply shares, divide price
  const { data: orders, error: oErr } = await db
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol);

  if (oErr) return { success: false, error: 'Failed to fetch orders: ' + oErr.message };

  for (const o of orders || []) {
    const newOrderShares = o.shares * ratio;
    const newOrderPrice = o.price_per_share / ratio;
    const { error } = await db
      .from('orders')
      .update({
        shares: newOrderShares,
        price_per_share: newOrderPrice,
        // total_value stays the same (shares×price is constant)
      })
      .eq('id', o.id);
    if (error) return { success: false, error: 'Failed to update order: ' + error.message };
  }

  return { success: true };
}

/**
 * Record a ticker change.
 *
 * Updates the symbol on both holdings and historical orders so that
 * FIFO matching continues to work (buys under old ticker match sells
 * under new ticker).
 *
 * Example: FB → META
 *   All holdings with symbol='FB' become symbol='META'
 *   All orders with symbol='FB' become symbol='META'
 *   FIFO now correctly matches old buys to new sells
 *
 * @param oldSymbol - Previous ticker (e.g., 'FB')
 * @param newSymbol - New ticker (e.g., 'META')
 */
export async function recordTickerChange(
  oldSymbol: string,
  newSymbol: string,
): Promise<{ success: boolean; error?: string }> {
  if (!oldSymbol || !newSymbol) {
    return { success: false, error: 'Both old and new symbols are required.' };
  }
  if (oldSymbol === newSymbol) {
    return { success: false, error: 'Old and new symbols are the same.' };
  }

  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Not logged in.' };

  if (!isSupabaseConfigured()) {
    return applyTickerChangeLocalStorage(oldSymbol, newSymbol);
  }

  // Update holdings
  const { error: hErr } = await db
    .from('holdings')
    .update({ symbol: newSymbol })
    .eq('user_id', userId)
    .eq('symbol', oldSymbol);

  if (hErr) return { success: false, error: 'Failed to update holdings: ' + hErr.message };

  // Update orders
  const { error: oErr } = await db
    .from('orders')
    .update({ symbol: newSymbol })
    .eq('user_id', userId)
    .eq('symbol', oldSymbol);

  if (oErr) return { success: false, error: 'Failed to update orders: ' + oErr.message };

  // Update watchlist
  const { error: wErr } = await db
    .from('watchlist')
    .update({ symbol: newSymbol })
    .eq('user_id', userId)
    .eq('symbol', oldSymbol);

  if (wErr) return { success: false, error: 'Failed to update watchlist: ' + wErr.message };

  return { success: true };
}

// ─── localStorage fallbacks (dev mode) ───────────────────────────────────────

function applyStockSplitLocalStorage(symbol: string, ratio: number): { success: boolean; error?: string } {
  try {
    // Holdings
    const holdingsRaw = localStorage.getItem('smartvest_sb_holdings');
    if (holdingsRaw) {
      const holdings = JSON.parse(holdingsRaw);
      for (const h of holdings) {
        if (h.symbol === symbol) {
          h.shares = h.shares * ratio;
          h.avg_cost_per_share = h.avg_cost_per_share / ratio;
        }
      }
      localStorage.setItem('smartvest_sb_holdings', JSON.stringify(holdings));
    }

    // Orders
    const ordersRaw = localStorage.getItem('smartvest_sb_orders');
    if (ordersRaw) {
      const orders = JSON.parse(ordersRaw);
      for (const o of orders) {
        if (o.symbol === symbol) {
          o.shares = o.shares * ratio;
          o.price_per_share = o.price_per_share / ratio;
        }
      }
      localStorage.setItem('smartvest_sb_orders', JSON.stringify(orders));
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function applyTickerChangeLocalStorage(oldSymbol: string, newSymbol: string): { success: boolean; error?: string } {
  try {
    for (const table of ['smartvest_sb_holdings', 'smartvest_sb_orders', 'smartvest_sb_watchlist']) {
      const raw = localStorage.getItem(table);
      if (raw) {
        const items = JSON.parse(raw);
        for (const item of items) {
          if (item.symbol === oldSymbol) item.symbol = newSymbol;
        }
        localStorage.setItem(table, JSON.stringify(items));
      }
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
