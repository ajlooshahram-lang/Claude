'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { getHoldings } from '@/lib/supabase';
import { getPrice, CachedPrice, formatLastUpdated } from '@/lib/market-data';

/**
 * Glance Page — ultra-minimal portfolio snapshot.
 *
 * Designed to be added as a home screen shortcut on Android.
 * Shows ONLY: total value, daily change, direction arrow.
 * Loads as fast as possible (minimal UI, single API call).
 * Tap anywhere to open the full portfolio page.
 *
 * To add to Android home screen:
 *   1. Open this page in Chrome
 *   2. Tap ⋮ menu → "Add to Home Screen"
 *   3. Name it "Portfolio" or "SmartVest Widget"
 */

export default function GlancePage() {
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [dayChange, setDayChange] = useState<number>(0);
  const [dayChangePct, setDayChangePct] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    try {
      // Load holdings from Supabase
      const holdings = await getHoldings();
      if (holdings.length === 0) {
        setLoading(false);
        return;
      }

      let value = 0;
      let cost = 0;
      let dayVal = 0;
      let anyStale = false;

      // Fetch live prices for each holding
      for (const h of holdings) {
        try {
          const cached = await getPrice(h.symbol);
          if (cached.source !== 'unavailable') {
            const v = h.shares * cached.price;
            value += v;
            cost += h.shares * h.avg_cost_per_share;
            dayVal += v * (cached.changePct / 100);
            if (cached.isStale) anyStale = true;
          }
        } catch {
          // Skip holdings where price fetch fails
          cost += h.shares * h.avg_cost_per_share;
        }
      }

      setTotalValue(value);
      setTotalCost(cost);
      setDayChange(dayVal);
      setDayChangePct(value > 0 ? (dayVal / value) * 100 : 0);
      setIsStale(anyStale);
      setLastUpdated(new Date().toLocaleTimeString('en-DK', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Supabase load failed
    } finally {
      setLoading(false);
    }
  }

  const isUp = dayChange >= 0;
  const gainLoss = totalValue !== null ? totalValue - totalCost : 0;
  const gainLossPct = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

  return (
    <a href="/portfolio" className="block min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xs text-center space-y-4">
        {/* Loading */}
        {loading && totalValue === null && (
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mx-auto" />
        )}

        {/* Value */}
        {totalValue !== null && (
          <>
            {/* Direction arrow */}
            <div className="flex justify-center">
              {isUp ? (
                <TrendingUp className="h-12 w-12 text-[var(--gain)]" />
              ) : (
                <TrendingDown className="h-12 w-12 text-[var(--loss)]" />
              )}
            </div>

            {/* Total value */}
            <p className="text-4xl font-bold font-tabular">
              {totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>

            {/* Daily change */}
            <p className={`text-xl font-semibold font-tabular ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? '+' : ''}{dayChange.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              <span className="text-sm ml-2">({isUp ? '+' : ''}{dayChangePct.toFixed(2)}%)</span>
            </p>

            {/* Total gain */}
            <p className={`text-xs ${gainLoss >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              Total: {gainLoss >= 0 ? '+' : ''}{gainLoss.toLocaleString('en-US', { minimumFractionDigits: 0 })} ({gainLossPct >= 0 ? '+' : ''}{gainLossPct.toFixed(1)}%)
            </p>

            {/* Meta */}
            <div className="text-[10px] text-[var(--muted)] space-y-0.5">
              {lastUpdated && <p>Updated {lastUpdated}</p>}
              {isStale && <p>Some prices may be outdated</p>}
              <p>Tap to open full portfolio →</p>
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && totalValue === null && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--muted)]">No holdings yet</p>
            <p className="text-[10px] text-[var(--muted)]">Tap to open portfolio →</p>
          </div>
        )}
      </div>
    </a>
  );
}
