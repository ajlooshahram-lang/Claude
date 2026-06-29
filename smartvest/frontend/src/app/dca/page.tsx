'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Loader2, AlertCircle, DollarSign,
  Calendar, Minus,
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

interface MonthRow {
  month: number;
  invested: number;         // Total money put in so far
  priceFlat: number;        // Price this month (flat scenario)
  priceUp: number;          // Price this month (+5% scenario)
  priceDown: number;        // Price this month (-5% scenario)
  sharesFlat: number;       // Total shares accumulated (flat)
  sharesUp: number;         // Total shares accumulated (+5%)
  sharesDown: number;       // Total shares accumulated (-5%)
  valueFlat: number;        // Portfolio value (flat)
  valueUp: number;          // Portfolio value (+5%)
  valueDown: number;        // Portfolio value (-5%)
}

// ─── DCA Math ────────────────────────────────────────────────────────────────
// Each month:
//   1. Price changes by the monthly rate (annual / 12)
//   2. You buy (monthlyAmount / currentPrice) shares
//   3. Total value = totalShares × currentPrice
//
// Three scenarios:
//   Flat: price stays exactly the same every month
//   Up:   price grows 5% per year = ~0.407% per month
//   Down: price drops 5% per year = ~-0.427% per month

function calculateDCA(
  startPrice: number,
  monthlyAmount: number,
  months: number,
): MonthRow[] {
  const monthlyRateUp = Math.pow(1.05, 1 / 12) - 1;   // +5% annual
  const monthlyRateDown = Math.pow(0.95, 1 / 12) - 1;  // -5% annual

  const rows: MonthRow[] = [];
  let sharesFlat = 0, sharesUp = 0, sharesDown = 0;
  let priceFlat = startPrice, priceUp = startPrice, priceDown = startPrice;
  let totalInvested = 0;

  for (let m = 1; m <= months; m++) {
    // Month 1 uses the starting price, subsequent months adjust
    if (m > 1) {
      priceUp = priceUp * (1 + monthlyRateUp);
      priceDown = priceDown * (1 + monthlyRateDown);
      // Flat stays the same
    }

    // Buy shares this month
    totalInvested += monthlyAmount;
    sharesFlat += monthlyAmount / priceFlat;
    sharesUp += monthlyAmount / priceUp;
    sharesDown += monthlyAmount / priceDown;

    rows.push({
      month: m,
      invested: Math.round(totalInvested * 100) / 100,
      priceFlat: Math.round(priceFlat * 100) / 100,
      priceUp: Math.round(priceUp * 100) / 100,
      priceDown: Math.round(priceDown * 100) / 100,
      sharesFlat: Math.round(sharesFlat * 1000) / 1000,
      sharesUp: Math.round(sharesUp * 1000) / 1000,
      sharesDown: Math.round(sharesDown * 1000) / 1000,
      valueFlat: Math.round(sharesFlat * priceFlat * 100) / 100,
      valueUp: Math.round(sharesUp * priceUp * 100) / 100,
      valueDown: Math.round(sharesDown * priceDown * 100) / 100,
    });
  }

  return rows;
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DCAPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [stockPrice, setStockPrice] = useState<StockPrice | null>(null);
  const [monthlyAmount, setMonthlyAmount] = useState(500);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  const fetchPrice = useCallback(async (symbol: string) => {
    if (!symbol) { setStockPrice(null); return; }
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE}/api/quote/${symbol}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
      const data = await res.json();
      setStockPrice({
        symbol: data.symbol,
        name: data.name,
        current_price: data.current_price,
        currency: data.currency,
        day_change_pct: data.day_change_pct,
      });
    } catch (err: unknown) {
      setError(`Could not fetch the stock price. Please try again.`);
      setStockPrice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelectStock(symbol: string) {
    setSelectedSymbol(symbol);
    fetchPrice(symbol);
  }

  // Calculate DCA table
  const rows = useMemo(() => {
    if (!stockPrice || stockPrice.current_price <= 0) return [];
    return calculateDCA(stockPrice.current_price, monthlyAmount, months);
  }, [stockPrice, monthlyAmount, months]);

  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-[var(--primary)]" />
          DCA Calculator
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          See how dollar-cost averaging builds your position over time
        </p>
      </div>

      {/* Learning tip: long-term investing */}
      <LearningTip
        tipId="dca_long_term"
        title="💡 Why investing regularly beats timing the market"
        text="Dollar-cost averaging (DCA) means investing a fixed amount every month regardless of whether the market is up or down. When prices drop, your fixed amount buys more shares. When prices rise, your existing shares grow in value. Over time, this removes the stress of trying to pick the 'perfect moment' to buy — which even professional investors can't do consistently. The key is consistency: invest the same amount each month and let time do the work."
      />

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Stock picker */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Stock</label>
          {watchlist.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              <a href="/search" className="text-[var(--primary)] hover:underline">Save stocks</a> to your watchlist first.
            </p>
          ) : (
            <select
              value={selectedSymbol}
              onChange={(e) => handleSelectStock(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Select a stock...</option>
              {watchlist.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} — {item.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Monthly amount */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Monthly Investment</label>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[var(--muted)]" />
            <input
              type="number"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(Math.max(50, Number(e.target.value)))}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-bold outline-none focus:border-[var(--primary)] font-tabular"
              min={50}
              step={50}
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {[200, 500, 1000, 2000].map((amt) => (
              <button key={amt} onClick={() => setMonthlyAmount(amt)}
                className={`rounded px-2 py-0.5 text-[10px] border transition-colors ${monthlyAmount === amt ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--card-border)] text-[var(--muted)]'}`}>
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Duration (months)</label>
          <input
            type="range"
            min={3}
            max={36}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
            <span>3mo</span>
            <span className="font-medium text-[var(--foreground)]">{months} months</span>
            <span>36mo</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
          <span className="ml-2 text-sm text-[var(--muted)]">Fetching live price...</span>
        </div>
      )}


      {/* Results */}
      {stockPrice && lastRow && !loading && (
        <>
          {/* Summary cards */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold">{stockPrice.name}</p>
                <p className="text-xs text-[var(--muted)]">{stockPrice.symbol} · {stockPrice.currency} {stockPrice.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-right text-xs text-[var(--muted)]">
                {monthlyAmount.toLocaleString()} / month × {months} months = <span className="font-semibold text-[var(--foreground)]">{lastRow.invested.toLocaleString()} total invested</span>
              </div>
            </div>

            {/* Three scenario summary */}
            <div className="grid grid-cols-3 gap-3">
              <ScenarioCard
                label="If price drops 5%/yr"
                icon={<TrendingDown className="h-4 w-4" />}
                color="loss"
                finalValue={lastRow.valueDown}
                invested={lastRow.invested}
                currency={stockPrice.currency}
                shares={lastRow.sharesDown}
                finalPrice={lastRow.priceDown}
              />
              <ScenarioCard
                label="If price stays flat"
                icon={<Minus className="h-4 w-4" />}
                color="muted"
                finalValue={lastRow.valueFlat}
                invested={lastRow.invested}
                currency={stockPrice.currency}
                shares={lastRow.sharesFlat}
                finalPrice={lastRow.priceFlat}
              />
              <ScenarioCard
                label="If price grows 5%/yr"
                icon={<TrendingUp className="h-4 w-4" />}
                color="gain"
                finalValue={lastRow.valueUp}
                invested={lastRow.invested}
                currency={stockPrice.currency}
                shares={lastRow.sharesUp}
                finalPrice={lastRow.priceUp}
              />
            </div>
          </div>

          {/* Visual chart (ASCII-style bar chart) */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
            <h2 className="text-sm font-semibold mb-4">Portfolio Value Over Time</h2>
            <div className="space-y-1.5">
              {rows.filter((_, i) => {
                // Show every row if <=12, else sample evenly
                if (rows.length <= 12) return true;
                if (i === 0 || i === rows.length - 1) return true;
                return (i + 1) % Math.ceil(rows.length / 12) === 0;
              }).map((row) => {
                const maxVal = lastRow.valueUp;
                const barUp = (row.valueUp / maxVal) * 100;
                const barFlat = (row.valueFlat / maxVal) * 100;
                const barDown = (row.valueDown / maxVal) * 100;
                return (
                  <div key={row.month} className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--muted)] w-8 text-right">M{row.month}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--gain)]" style={{ width: `${barUp}%` }} />
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${barFlat}%` }} />
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--loss)]" style={{ width: `${barDown}%` }} />
                      </div>
                    </div>
                    <span className="text-[9px] text-[var(--muted)] w-16 text-right font-tabular">
                      {row.invested.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--gain)]" /> +5%/yr</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--primary)]" /> Flat</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--loss)]" /> -5%/yr</span>
              <span className="ml-auto">Right column = total invested</span>
            </div>
          </div>

          {/* Monthly table */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)]">
              <h2 className="text-sm font-semibold">Month-by-Month Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-black/20 text-[10px] text-[var(--muted)] uppercase">
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-right">Invested</th>
                    <th className="px-4 py-2 text-right text-[var(--loss)]">-5% Value</th>
                    <th className="px-4 py-2 text-right">Flat Value</th>
                    <th className="px-4 py-2 text-right text-[var(--gain)]">+5% Value</th>
                    <th className="px-4 py-2 text-right">Shares (flat)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {rows.map((row) => (
                    <tr key={row.month} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 font-medium">{row.month}</td>
                      <td className="px-4 py-2 text-right font-tabular">{row.invested.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-tabular text-[var(--loss)]">{row.valueDown.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-tabular">{row.valueFlat.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-tabular text-[var(--gain)]">{row.valueUp.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-tabular text-[var(--muted)]">{row.sharesFlat.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Note */}
          <p className="text-[10px] text-[var(--muted)] text-center">
            These scenarios assume a constant annual rate applied monthly. Real stock prices fluctuate daily.
            This is a planning tool, not a prediction. Past performance does not guarantee future results.
          </p>
        </>
      )}
    </div>
  );
}


// ─── Components ──────────────────────────────────────────────────────────────

function ScenarioCard({ label, icon, color, finalValue, invested, currency, shares, finalPrice }: {
  label: string;
  icon: React.ReactNode;
  color: 'gain' | 'loss' | 'muted';
  finalValue: number;
  invested: number;
  currency: string;
  shares: number;
  finalPrice: number;
}) {
  const gainLoss = finalValue - invested;
  const gainLossPct = invested > 0 ? (gainLoss / invested) * 100 : 0;

  const colorClass = {
    gain: 'text-[var(--gain)] border-[var(--gain)]/20 bg-[var(--gain)]/5',
    loss: 'text-[var(--loss)] border-[var(--loss)]/20 bg-[var(--loss)]/5',
    muted: 'text-[var(--foreground)] border-[var(--card-border)] bg-black/20',
  }[color];

  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="flex items-center gap-1.5 mb-2 opacity-80">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold font-tabular">
        {currency} {finalValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
      </p>
      <p className={`text-[11px] font-medium mt-0.5 ${gainLoss >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {gainLoss >= 0 ? '+' : ''}{gainLoss.toLocaleString(undefined, { minimumFractionDigits: 0 })} ({gainLossPct >= 0 ? '+' : ''}{gainLossPct.toFixed(1)}%)
      </p>
      <div className="mt-2 text-[9px] opacity-60 space-y-0.5">
        <p>{shares.toFixed(2)} shares</p>
        <p>@ {currency} {finalPrice.toFixed(2)}/share</p>
      </div>
    </div>
  );
}
