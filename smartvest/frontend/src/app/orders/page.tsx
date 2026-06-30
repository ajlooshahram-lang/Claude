'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Plus, Loader2, TrendingUp, TrendingDown,
  AlertCircle, X,
} from 'lucide-react';
import { getOrders, addOrder, getWatchlist } from '@/lib/supabase';
import { getPrice, CachedPrice, formatLastUpdated } from '@/lib/market-data';
import { getCurrentUserId } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DisplayOrder {
  id: string;
  side: 'buy' | 'sell';
  symbol: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  currency: string;
  date: string;
  notes: string | null;
  status: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [prices, setPrices] = useState<Record<string, CachedPrice>>({});
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setNetworkError(null);
    try {
      const rawOrders = await getOrders();

      // If empty and offline, it might be a network failure
      if (rawOrders.length === 0 && typeof window !== 'undefined' && !navigator.onLine) {
        setNetworkError('You appear to be offline. Your orders may not be loading correctly.');
        setOrders([]);
        setLoading(false);
        return;
      }

      const mapped: DisplayOrder[] = rawOrders.map((o) => ({
        id: o.id,
        side: o.side,
        symbol: o.symbol,
        shares: o.shares,
        pricePerShare: o.price_per_share,
        totalValue: o.total_value,
        currency: 'USD',
        date: o.executed_at || o.created_at,
        notes: o.notes,
        status: o.status,
      }));
      setOrders(mapped);
    } catch {
      // Network error or Supabase down
      if (typeof window !== 'undefined' && !navigator.onLine) {
        setNetworkError('You are offline. Connect to the internet to see your orders.');
      } else {
        setNetworkError('Could not load orders. The server may be temporarily unavailable.');
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentPrices = useCallback(async (orderList: DisplayOrder[]) => {
    if (orderList.length === 0) return;
    setPricesLoading(true);
    const symbols = [...new Set(orderList.map(o => o.symbol))];
    const priceMap: Record<string, CachedPrice> = {};

    for (const symbol of symbols) {
      try {
        priceMap[symbol] = await getPrice(symbol);
      } catch {}
    }
    setPrices(priceMap);
    setPricesLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (orders.length > 0) {
      fetchCurrentPrices(orders);
    }
  }, [orders, fetchCurrentPrices]);

  async function handleAddOrder(order: {
    side: 'buy' | 'sell';
    symbol: string;
    shares: number;
    pricePerShare: number;
    currency: string;
  }) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const result = await addOrder({
      user_id: userId,
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      shares: order.shares,
      price_per_share: order.pricePerShare,
      total_value: order.shares * order.pricePerShare,
      order_type: 'market',
      status: 'filled',
      commission: 0,
      notes: null,
      executed_at: new Date().toISOString(),
    });

    if (!result) {
      // Order failed to save — keep form open and alert the user
      alert('Failed to save order. Please check your connection and try again.');
      return;
    }

    setShowForm(false);
    await loadOrders();
  }

  // Calculate totals
  const totalInvested = orders
    .filter(o => o.side === 'buy')
    .reduce((sum, o) => sum + o.totalValue, 0);
  const totalSold = orders
    .filter(o => o.side === 'sell')
    .reduce((sum, o) => sum + o.totalValue, 0);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--primary)]" />
            Order History
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {orders.length} order{orders.length !== 1 ? 's' : ''} logged
            {totalInvested > 0 && ` · Total invested: ${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Order
        </button>
      </div>

      {/* Add Order Form */}
      {showForm && (
        <AddOrderForm onSubmit={handleAddOrder} onCancel={() => setShowForm(false)} />
      )}

      {/* Network error */}
      {networkError && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {networkError}
        </div>
      )}

      {/* Empty state */}
      {!loading && orders.length === 0 && !showForm && (
        <div className="flex flex-col items-center text-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Receipt className="h-8 w-8 text-[var(--muted)]" />
          </div>
          <h2 className="text-lg font-semibold">No orders logged yet</h2>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-sm">
            When you buy or sell a stock through your broker, log it here to track your performance over time.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Loading orders...</span>
        </div>
      )}

      {/* Prices loading indicator */}
      {pricesLoading && orders.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Fetching current prices...
        </div>
      )}

      {/* Orders list */}
      {!loading && orders.length > 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider border-b border-[var(--card-border)] bg-black/20">
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Stock</div>
            <div className="col-span-1 text-right">Shares</div>
            <div className="col-span-2 text-right">Price Paid</div>
            <div className="col-span-2 text-right">Current</div>
            <div className="col-span-2 text-right">Gain/Loss</div>
          </div>

          <div className="divide-y divide-[var(--card-border)]">
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                currentPrice={prices[order.symbol] || null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Order Row ───────────────────────────────────────────────────────────────

function OrderRow({ order, currentPrice }: {
  order: DisplayOrder; currentPrice: CachedPrice | null;
}) {
  const isBuy = order.side === 'buy';
  const livePrice = currentPrice && currentPrice.source !== 'unavailable' ? currentPrice.price : null;
  const gainLoss = livePrice !== null && isBuy
    ? (livePrice - order.pricePerShare) * order.shares
    : null;
  const gainLossPct = livePrice !== null && isBuy && order.pricePerShare > 0
    ? ((livePrice - order.pricePerShare) / order.pricePerShare) * 100
    : null;
  const isGain = gainLoss !== null && gainLoss >= 0;

  return (
    <div className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
      {/* Mobile layout */}
      <div className="flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
            isBuy ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'
          }`}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
          <div>
            <p className="text-sm font-medium">{order.symbol}</p>
            <p className="text-[9px] text-[var(--muted)]">{order.shares} shares · {new Date(order.date).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="text-right">
          {gainLoss !== null ? (
            <p className={`text-xs font-medium ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isGain ? '+' : ''}{gainLoss.toFixed(0)} ({gainLossPct?.toFixed(1)}%)
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">{order.currency} {order.totalValue.toFixed(0)}</p>
          )}
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-12 gap-2 items-center text-xs">
        <div className="col-span-1">
          <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
            isBuy ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'
          }`}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>
        <div className="col-span-2 text-[var(--muted)]">
          {new Date(order.date).toLocaleDateString('en-DK', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <div className="col-span-2">
          <p className="font-medium">{order.symbol}</p>
        </div>
        <div className="col-span-1 text-right font-tabular">{order.shares}</div>
        <div className="col-span-2 text-right font-tabular">
          {order.currency} {order.pricePerShare.toFixed(2)}
        </div>
        <div className="col-span-2 text-right font-tabular">
          {livePrice !== null
            ? `${order.currency} ${livePrice.toFixed(2)}`
            : <span className="text-[var(--muted)]">—</span>
          }
          {currentPrice && currentPrice.isStale && (
            <span className="text-[7px] text-[var(--warning)] block">may be outdated</span>
          )}
        </div>
        <div className="col-span-2 text-right">
          {gainLoss !== null ? (
            <span className={`font-tabular font-medium ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isGain ? '+' : ''}{gainLossPct?.toFixed(1)}%
            </span>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Add Order Form ──────────────────────────────────────────────────────────

function AddOrderForm({ onSubmit, onCancel }: {
  onSubmit: (order: {
    side: 'buy' | 'sell';
    symbol: string;
    shares: number;
    pricePerShare: number;
    currency: string;
  }) => void;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<{ symbol: string; name: string }[]>([]);

  // Load watchlist items for quick-select (async)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const items = await getWatchlist();
        if (!cancelled) {
          setWatchlistItems(items.map(i => ({ symbol: i.symbol, name: i.name })));
        }
      } catch {}
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSelectWatchlist(sym: string) {
    setSymbol(sym);
    setLoadingPrice(true);
    try {
      const p = await getPrice(sym);
      if (p.source !== 'unavailable') {
        setPrice(p.price.toFixed(2));
      }
    } catch {}
    setLoadingPrice(false);
  }

  function handleSubmit() {
    const s = parseFloat(shares);
    const p = parseFloat(price);
    if (!symbol || !s || !p || s <= 0 || p <= 0 || submitting) return;

    setSubmitting(true);
    onSubmit({
      side,
      symbol: symbol.toUpperCase(),
      shares: s,
      pricePerShare: p,
      currency,
    });
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Log a New Order</h2>
        <button onClick={onCancel} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Buy / Sell toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            side === 'buy'
              ? 'bg-[var(--gain)]/10 text-[var(--gain)] border border-[var(--gain)]/30'
              : 'bg-white/5 text-[var(--muted)] border border-[var(--card-border)]'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            side === 'sell'
              ? 'bg-[var(--loss)]/10 text-[var(--loss)] border border-[var(--loss)]/30'
              : 'bg-white/5 text-[var(--muted)] border border-[var(--card-border)]'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Stock picker (from watchlist or type) */}
      {watchlistItems.length > 0 && (
        <div>
          <p className="text-[10px] text-[var(--muted)] mb-1.5">From watchlist:</p>
          <div className="flex flex-wrap gap-1.5">
            {watchlistItems.map((item) => (
              <button
                key={item.symbol}
                onClick={() => handleSelectWatchlist(item.symbol)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors ${
                  symbol === item.symbol
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)]/50'
                }`}
              >
                {item.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual symbol entry */}
      <div>
        <label className="text-[10px] text-[var(--muted)] block mb-1">Symbol</label>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="e.g. AAPL"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Shares and price */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-[var(--muted)] block mb-1">Shares</label>
          <input
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="10"
            min="0.01"
            step="1"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)] font-tabular"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--muted)] block mb-1">
            Price per share {loadingPrice && <Loader2 className="h-2.5 w-2.5 inline animate-spin" />}
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="283.78"
            min="0.01"
            step="0.01"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)] font-tabular"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--muted)] block mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="USD">USD</option>
            <option value="DKK">DKK</option>
            <option value="EUR">EUR</option>
            <option value="GBp">GBp</option>
            <option value="JPY">JPY</option>
            <option value="CHF">CHF</option>
          </select>
        </div>
      </div>

      {/* Total preview */}
      {shares && price && parseFloat(shares) > 0 && parseFloat(price) > 0 && (
        <div className="rounded-lg bg-white/[0.03] border border-[var(--card-border)] p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Total {side === 'buy' ? 'cost' : 'proceeds'}</p>
          <p className="text-lg font-bold font-tabular mt-0.5">
            {currency} {(parseFloat(shares) * parseFloat(price)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {/* Realism warning — large orders that might be typos */}
      {shares && parseFloat(shares) > 10000 && (
        <p className="text-[10px] text-[var(--warning)]">
          ⚠️ {parseFloat(shares).toLocaleString()} shares is unusually large. Double-check this matches your broker confirmation.
        </p>
      )}
      {shares && price && parseFloat(shares) > 0 && parseFloat(price) > 0 && parseFloat(shares) * parseFloat(price) > 1000000 && (
        <p className="text-[10px] text-[var(--warning)]">
          ⚠️ Total exceeds 1,000,000 {currency}. This will affect your tax calculations — verify it matches your broker statement.
        </p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!symbol || !shares || !price || parseFloat(shares) <= 0 || parseFloat(price) <= 0 || submitting}
        className={`w-full rounded-lg py-3 text-sm font-semibold transition-opacity disabled:opacity-40 ${
          side === 'buy'
            ? 'bg-[var(--gain)] text-white'
            : 'bg-[var(--loss)] text-white'
        }`}
      >
        {submitting ? 'Saving...' : `Log ${side === 'buy' ? 'Buy' : 'Sell'} Order`}
      </button>
    </div>
  );
}
