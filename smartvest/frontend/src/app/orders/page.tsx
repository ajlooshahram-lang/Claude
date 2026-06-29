'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Plus, Trash2, Loader2, TrendingUp, TrendingDown,
  AlertCircle, X,
} from 'lucide-react';
import { getOrders, addOrder, removeOrder, Order, OrderType } from '@/lib/orders';
import { getWatchlist } from '@/lib/watchlist';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setOrders(getOrders());
    fetchCurrentPrices();
  }, []);

  const fetchCurrentPrices = useCallback(async () => {
    setLoading(true);
    const allOrders = getOrders();
    const symbols = [...new Set(allOrders.map(o => o.symbol))];

    const priceMap: Record<string, number> = {};
    for (const symbol of symbols) {
      try {
        const res = await fetch(`${API_BASE}/api/quote/${symbol}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          priceMap[symbol] = data.current_price;
        }
      } catch {}
    }
    setPrices(priceMap);
    setLoading(false);
  }, []);

  function handleAddOrder(order: Omit<Order, 'id' | 'date' | 'totalCost'>) {
    addOrder(order);
    setOrders(getOrders());
    setShowForm(false);
    fetchCurrentPrices();
  }

  function handleRemove(id: string) {
    removeOrder(id);
    setOrders(getOrders());
  }

  // Calculate totals
  const totalInvested = orders
    .filter(o => o.type === 'buy')
    .reduce((sum, o) => sum + o.totalCost, 0);
  const totalSold = orders
    .filter(o => o.type === 'sell')
    .reduce((sum, o) => sum + o.totalCost, 0);

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

      {/* Empty state */}
      {orders.length === 0 && !showForm && (
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
      {loading && orders.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Fetching current prices...
        </div>
      )}

      {/* Orders list */}
      {orders.length > 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider border-b border-[var(--card-border)] bg-black/20">
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Stock</div>
            <div className="col-span-1 text-right">Shares</div>
            <div className="col-span-2 text-right">Price Paid</div>
            <div className="col-span-2 text-right">Current</div>
            <div className="col-span-1 text-right">Gain/Loss</div>
            <div className="col-span-1"></div>
          </div>

          <div className="divide-y divide-[var(--card-border)]">
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                currentPrice={prices[order.symbol] || null}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Order Row ───────────────────────────────────────────────────────────────

function OrderRow({ order, currentPrice, onRemove }: {
  order: Order; currentPrice: number | null; onRemove: (id: string) => void;
}) {
  const isBuy = order.type === 'buy';
  const gainLoss = currentPrice !== null && isBuy
    ? (currentPrice - order.pricePerShare) * order.shares
    : null;
  const gainLossPct = currentPrice !== null && isBuy && order.pricePerShare > 0
    ? ((currentPrice - order.pricePerShare) / order.pricePerShare) * 100
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
            <p className="text-xs text-[var(--muted)]">{order.currency} {order.totalCost.toFixed(0)}</p>
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
          <p className="text-[9px] text-[var(--muted)]">{order.name}</p>
        </div>
        <div className="col-span-1 text-right font-tabular">{order.shares}</div>
        <div className="col-span-2 text-right font-tabular">
          {order.currency} {order.pricePerShare.toFixed(2)}
        </div>
        <div className="col-span-2 text-right font-tabular">
          {currentPrice !== null
            ? `${order.currency} ${currentPrice.toFixed(2)}`
            : <span className="text-[var(--muted)]">—</span>
          }
        </div>
        <div className="col-span-1 text-right">
          {gainLoss !== null ? (
            <span className={`font-tabular font-medium ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isGain ? '+' : ''}{gainLossPct?.toFixed(1)}%
            </span>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </div>
        <div className="col-span-1 text-right">
          <button
            onClick={() => onRemove(order.id)}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--loss)] transition-colors"
            title="Delete order"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Add Order Form ──────────────────────────────────────────────────────────

function AddOrderForm({ onSubmit, onCancel }: {
  onSubmit: (order: Omit<Order, 'id' | 'date' | 'totalCost'>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<OrderType>('buy');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('DKK');
  const [loadingPrice, setLoadingPrice] = useState(false);

  const watchlist = getWatchlist();

  function handleSelectWatchlist(sym: string, stockName: string) {
    setSymbol(sym);
    setName(stockName);
    // Auto-fetch current price
    setLoadingPrice(true);
    fetch(`${API_BASE}/api/quote/${sym}`, { signal: AbortSignal.timeout(10000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPrice(data.current_price.toFixed(2));
          setCurrency(data.currency || 'DKK');
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }

  function handleSubmit() {
    const s = parseFloat(shares);
    const p = parseFloat(price);
    if (!symbol || !s || !p || s <= 0 || p <= 0) return;

    onSubmit({
      type,
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
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
          onClick={() => setType('buy')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            type === 'buy'
              ? 'bg-[var(--gain)]/10 text-[var(--gain)] border border-[var(--gain)]/30'
              : 'bg-white/5 text-[var(--muted)] border border-[var(--card-border)]'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setType('sell')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            type === 'sell'
              ? 'bg-[var(--loss)]/10 text-[var(--loss)] border border-[var(--loss)]/30'
              : 'bg-white/5 text-[var(--muted)] border border-[var(--card-border)]'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Stock picker (from watchlist or type) */}
      {watchlist.length > 0 && (
        <div>
          <p className="text-[10px] text-[var(--muted)] mb-1.5">From watchlist:</p>
          <div className="flex flex-wrap gap-1.5">
            {watchlist.map((item) => (
              <button
                key={item.symbol}
                onClick={() => handleSelectWatchlist(item.symbol, item.name)}
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
      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <label className="text-[10px] text-[var(--muted)] block mb-1">Company Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apple Inc."
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
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
            <option value="DKK">DKK</option>
            <option value="USD">USD</option>
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
          <p className="text-[10px] text-[var(--muted)]">Total {type === 'buy' ? 'cost' : 'proceeds'}</p>
          <p className="text-lg font-bold font-tabular mt-0.5">
            {currency} {(parseFloat(shares) * parseFloat(price)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!symbol || !shares || !price || parseFloat(shares) <= 0 || parseFloat(price) <= 0}
        className={`w-full rounded-lg py-3 text-sm font-semibold transition-opacity disabled:opacity-40 ${
          type === 'buy'
            ? 'bg-[var(--gain)] text-white'
            : 'bg-[var(--loss)] text-white'
        }`}
      >
        Log {type === 'buy' ? 'Buy' : 'Sell'} Order
      </button>
    </div>
  );
}
