'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calculator, DollarSign, Loader2, AlertCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { getWatchlist, WatchlistItem } from '@/lib/watchlist';
import { LearningTip } from '@/components/learning-tip';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockPrice {
  symbol: string;
  name: string;
  current_price: number;
  currency: string;
  day_change_pct: number;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [budget, setBudget] = useState<number>(5000);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [stockPrice, setStockPrice] = useState<StockPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load watchlist on mount
  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  // Fetch live price when a stock is selected
  const fetchPrice = useCallback(async (symbol: string) => {
    if (!symbol) {
      setStockPrice(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE}/api/quote/${symbol}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
      const data = await res.json();
      if (!data.current_price || data.current_price === 0) {
        throw new Error(`No price data available for ${symbol}`);
      }
      setStockPrice({
        symbol: data.symbol,
        name: data.name,
        current_price: data.current_price,
        currency: data.currency,
        day_change_pct: data.day_change_pct,
      });
    } catch (err: unknown) {
      setError(`Could not fetch the stock price. Please check your connection and try again.`);
      setStockPrice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelectStock(symbol: string) {
    setSelectedSymbol(symbol);
    fetchPrice(symbol);
  }

  // Calculations
  const shares = stockPrice && stockPrice.current_price > 0
    ? Math.floor(budget / stockPrice.current_price)
    : 0;
  const totalCost = stockPrice ? shares * stockPrice.current_price : 0;
  const budgetPct = budget > 0 ? (totalCost / budget) * 100 : 0;
  const leftover = budget - totalCost;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-[var(--primary)]" />
          Budget Simulator
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          See how many shares you can afford from your watchlist
        </p>
      </div>

      <LearningTip
        tipId="simulator_position_sizing"
        title="💡 What is position sizing?"
        text="Position sizing means deciding how much of your budget to put into one stock. A common beginner mistake is putting too much into a single stock because you're excited about it. Professional investors rarely put more than 5-10% of their portfolio into any single stock. If you have 5,000 DKK, that means no more than 250-500 DKK in any one company. This way, even if one stock crashes, you only lose a small part of your total money."
      />

      {/* Budget Input */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <label className="text-sm font-medium flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-[var(--primary)]" />
          Your Budget
        </label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-2xl font-bold outline-none focus:border-[var(--primary)] font-tabular"
          min={0}
          step={100}
        />
        <div className="flex gap-2 mt-3">
          {[1000, 2500, 5000, 10000, 25000].map((amt) => (
            <button
              key={amt}
              onClick={() => setBudget(amt)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                budget === amt
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
              }`}
            >
              {amt.toLocaleString()} DKK
            </button>
          ))}
        </div>
      </div>


      {/* Stock Selector */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <label className="text-sm font-medium mb-3 block">
          Pick a stock from your watchlist
        </label>

        {watchlist.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-4 text-center">
            Your watchlist is empty.{' '}
            <a href="/search" className="text-[var(--primary)] hover:underline">
              Search for stocks
            </a>{' '}
            and save some first.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {watchlist.map((item) => (
              <button
                key={item.symbol}
                onClick={() => handleSelectStock(item.symbol)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedSymbol === item.symbol
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--card-border)] hover:border-[var(--primary)]/50 hover:bg-white/[0.02]'
                }`}
              >
                <p className="text-sm font-semibold">{item.symbol}</p>
                <p className="text-[10px] text-[var(--muted)] truncate">
                  {item.name}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
          <span className="ml-2 text-sm text-[var(--muted)]">
            Fetching live price...
          </span>
        </div>
      )}


      {/* Result */}
      {stockPrice && !loading && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          {/* Stock header */}
          <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div>
              <p className="font-semibold">{stockPrice.name}</p>
              <p className="text-xs text-[var(--muted)]">{stockPrice.symbol}</p>
            </div>
            <div className="text-right">
              <p className="font-bold font-tabular">
                {stockPrice.currency} {stockPrice.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${
                stockPrice.day_change_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'
              }`}>
                {stockPrice.day_change_pct >= 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {stockPrice.day_change_pct >= 0 ? '+' : ''}
                {stockPrice.day_change_pct.toFixed(2)}% today
              </p>
            </div>
          </div>

          {/* Calculation result */}
          <div className="p-5 space-y-5">
            {/* Main number */}
            <div className="text-center py-4">
              <p className="text-[var(--muted)] text-sm mb-1">You can buy</p>
              <p className="text-5xl font-bold text-[var(--primary)] font-tabular">
                {shares}
              </p>
              <p className="text-[var(--muted)] text-sm mt-1">
                full share{shares !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-3 gap-3">
              <ResultStat
                label="Total Cost"
                value={`${stockPrice.currency} ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <ResultStat
                label="% of Budget"
                value={`${budgetPct.toFixed(1)}%`}
              />
              <ResultStat
                label="Leftover"
                value={`${leftover.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
            </div>

            {/* Visual budget bar */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-[var(--muted)] mb-1">
                <span>Budget usage</span>
                <span>{budgetPct.toFixed(1)}% used</span>
              </div>
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    budgetPct > 80 ? 'bg-[var(--warning)]' :
                    budgetPct > 50 ? 'bg-[var(--primary)]' :
                    'bg-[var(--gain)]'
                  }`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
            </div>

            {/* Guidance note */}
            {shares === 0 && (
              <p className="text-xs text-[var(--warning)] text-center">
                The stock price ({stockPrice.currency} {stockPrice.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}) exceeds your budget. You&apos;d need a fractional-share broker to buy this.
              </p>
            )}
            {budgetPct > 50 && shares > 0 && (
              <p className="text-xs text-[var(--warning)] text-center">
                This would use {budgetPct.toFixed(0)}% of your budget in one stock — consider keeping each position under 10-15% for diversification.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-[var(--card-border)] p-3 text-center">
      <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold font-tabular mt-1">{value}</p>
    </div>
  );
}
