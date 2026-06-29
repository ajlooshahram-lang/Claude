'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
}

interface CurrencyGroup {
  currency: string;
  rateToDKK: number;
  holdings: {
    symbol: string;
    name: string;
    localValue: number;
    dkkValue: number;
    localGainLoss: number;
    dkkGainLoss: number;
  }[];
  totalLocal: number;
  totalDKK: number;
  gainLossLocal: number;
  gainLossDKK: number;
}

interface ReturnAttribution {
  symbol: string;
  totalReturnDKK: number;
  stockReturn: number;         // Return from stock price movement (in DKK)
  currencyReturn: number;      // Return from FX rate movement (in DKK)
  stockReturnPct: number;
  currencyReturnPct: number;
}

/**
 * Currency Breakdown — shows portfolio value in DKK with FX attribution.
 *
 * For each holding:
 *   Total DKK return = Stock price return + Currency return
 *
 * Example: You bought AAPL at $260, now $284 (+9.2%)
 * But USD/DKK went from 6.90 to 6.85 (-0.7%)
 * Your DKK return is only +8.5% (stock helped, currency hurt)
 */
export function CurrencyBreakdown({ holdings }: { holdings: Holding[] }) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/fx/rates`, { signal: AbortSignal.timeout(8000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.rates) setRates(data.rates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading exchange rates...
      </div>
    );
  }

  if (Object.keys(rates).length === 0) return null;

  // Group holdings by currency
  const groups: Record<string, CurrencyGroup> = {};
  for (const h of holdings) {
    const rate = rates[h.currency] || 1.0;
    if (!groups[h.currency]) {
      groups[h.currency] = {
        currency: h.currency,
        rateToDKK: rate,
        holdings: [],
        totalLocal: 0,
        totalDKK: 0,
        gainLossLocal: 0,
        gainLossDKK: 0,
      };
    }
    const localValue = h.shares * h.currentPrice;
    const dkkValue = localValue * rate;
    const localGainLoss = (h.currentPrice - h.avgCost) * h.shares;
    const dkkGainLoss = localGainLoss * rate;

    groups[h.currency].holdings.push({
      symbol: h.symbol,
      name: h.name,
      localValue,
      dkkValue,
      localGainLoss,
      dkkGainLoss,
    });
    groups[h.currency].totalLocal += localValue;
    groups[h.currency].totalDKK += dkkValue;
    groups[h.currency].gainLossLocal += localGainLoss;
    groups[h.currency].gainLossDKK += dkkGainLoss;
  }

  const totalPortfolioDKK = Object.values(groups).reduce((s, g) => s + g.totalDKK, 0);
  const sortedGroups = Object.values(groups).sort((a, b) => b.totalDKK - a.totalDKK);

  // Return attribution per holding
  // stockReturn = (priceChange / avgCost) × avgCost × shares × currentRate
  // currencyReturn = totalValue × (rateChange / currentRate) [approximation]
  // For simplicity: we show stock vs currency contribution
  const attributions: ReturnAttribution[] = holdings
    .filter(h => h.currency !== 'DKK')
    .map(h => {
      const rate = rates[h.currency] || 1.0;
      const costDKK = h.shares * h.avgCost * rate;
      const valueDKK = h.shares * h.currentPrice * rate;
      const totalReturnDKK = valueDKK - costDKK;

      // Stock-only return (what you'd get if FX stayed the same)
      const stockReturnLocal = (h.currentPrice - h.avgCost) * h.shares;
      const stockReturnDKK = stockReturnLocal * rate;

      // Currency contribution (difference between total and stock-only)
      // This is an approximation — exact would require the historical rate
      const currencyReturnDKK = totalReturnDKK - stockReturnDKK;

      const costLocalDKK = h.shares * h.avgCost * rate;
      const stockReturnPct = costLocalDKK > 0 ? (stockReturnDKK / costLocalDKK) * 100 : 0;
      const currencyReturnPct = costLocalDKK > 0 ? (currencyReturnDKK / costLocalDKK) * 100 : 0;

      return {
        symbol: h.symbol,
        totalReturnDKK,
        stockReturn: stockReturnDKK,
        currencyReturn: currencyReturnDKK,
        stockReturnPct,
        currencyReturnPct,
      };
    });

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Globe className="h-4 w-4 text-[var(--primary)]" />
        Multi-Currency Breakdown
      </h2>

      {/* Total in DKK */}
      <div className="rounded-lg bg-white/[0.03] border border-[var(--card-border)] p-3 text-center">
        <p className="text-[10px] text-[var(--muted)]">Total Portfolio (converted to DKK)</p>
        <p className="text-2xl font-bold font-tabular mt-1">
          DKK {totalPortfolioDKK.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>
      </div>

      {/* By currency */}
      <div className="space-y-2">
        {sortedGroups.map(group => {
          const pct = totalPortfolioDKK > 0 ? (group.totalDKK / totalPortfolioDKK) * 100 : 0;
          const isGain = group.gainLossDKK >= 0;
          return (
            <div key={group.currency} className="rounded-lg border border-[var(--card-border)] bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold">{group.currency}</span>
                  <span className="text-[9px] text-[var(--muted)] ml-2">
                    Rate: 1 {group.currency} = {group.rateToDKK.toFixed(4)} DKK
                  </span>
                </div>
                <span className="text-xs font-tabular">{pct.toFixed(0)}% of portfolio</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-[var(--muted)] font-tabular">
                  {group.currency} {group.totalLocal.toLocaleString('en-US', { minimumFractionDigits: 0 })} = DKK {group.totalDKK.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </span>
                <span className={`text-xs font-tabular font-medium ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  {isGain ? '+' : ''}{group.gainLossDKK.toLocaleString('en-US', { minimumFractionDigits: 0 })} DKK
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Return Attribution */}
      {attributions.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
            Return Attribution (stock price vs. currency)
          </p>
          <div className="space-y-1.5">
            {attributions.map(a => (
              <div key={a.symbol} className="flex items-center gap-2 text-[10px]">
                <span className="w-16 font-medium">{a.symbol}</span>
                <span className={`w-20 font-tabular ${a.stockReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  Stock: {a.stockReturnPct >= 0 ? '+' : ''}{a.stockReturnPct.toFixed(1)}%
                </span>
                <span className={`w-20 font-tabular ${a.currencyReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  FX: {a.currencyReturnPct >= 0 ? '+' : ''}{a.currencyReturnPct.toFixed(1)}%
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                  <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.max(0, a.stockReturnPct / (Math.abs(a.stockReturnPct) + Math.abs(a.currencyReturnPct) || 1) * 100)}%` }} />
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.abs(a.currencyReturnPct) / (Math.abs(a.stockReturnPct) + Math.abs(a.currencyReturnPct) || 1) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[9px] text-[var(--muted)]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--primary)]" /> Stock price</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--accent)]" /> Currency (FX)</span>
          </div>
        </div>
      )}

      {/* Info */}
      <p className="text-[9px] text-[var(--muted)] leading-relaxed">
        Exchange rates from ECB via frankfurter.app. FX attribution is approximate — exact calculation requires knowing the rate on each purchase date.
      </p>
    </div>
  );
}
