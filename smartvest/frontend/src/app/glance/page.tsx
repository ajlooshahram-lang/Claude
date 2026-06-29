'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { fetchWithOffline } from '@/lib/offline-cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

const POSITIONS = [
  { symbol: 'NOVO-B.CO', shares: 8, avgCost: 290.00 },
  { symbol: 'AAPL', shares: 3, avgCost: 260.00 },
  { symbol: 'KO', shares: 12, avgCost: 58.50 },
  { symbol: 'JNJ', shares: 4, avgCost: 235.00 },
  { symbol: 'AZN.L', shares: 6, avgCost: 13200.00 },
  { symbol: '7203.T', shares: 30, avgCost: 2550.00 },
];

export default function GlancePage() {
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [dayChange, setDayChange] = useState<number>(0);
  const [dayChangePct, setDayChangePct] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 minutes
    const interval = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    setLoading(true);
    const symbols = POSITIONS.map(p => p.symbol);
    const url = `${API_BASE}/api/quotes`;

    const result = await fetchWithOffline<{ quotes: Record<string, any> }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });

    if (result.fromCache) setFromCache(true);

    if (result.data && result.data.quotes) {
      const quotes = result.data.quotes;
      let value = 0;
      let cost = 0;
      let dayVal = 0;

      for (const pos of POSITIONS) {
        const q = quotes[pos.symbol];
        if (q) {
          const v = pos.shares * q.current_price;
          value += v;
          cost += pos.shares * pos.avgCost;
          dayVal += v * (q.day_change_pct / 100);
        }
      }

      setTotalValue(value);
      setTotalCost(cost);
      setDayChange(dayVal);
      setDayChangePct(value > 0 ? (dayVal / value) * 100 : 0);
      setLastUpdated(new Date().toLocaleTimeString('en-DK', { hour: '2-digit', minute: '2-digit' }));
    }

    setLoading(false);
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
              {fromCache && <p>Cached data · may be outdated</p>}
              <p>Tap to open full portfolio →</p>
            </div>
          </>
        )}
      </div>
    </a>
  );
}
