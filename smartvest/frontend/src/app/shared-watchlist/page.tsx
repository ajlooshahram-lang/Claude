'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Bookmark, Loader2, TrendingUp, TrendingDown, Eye,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SharedStock {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  dayChangePct: number;
  score: number | null;
  scoreLabel: string | null;
  beginnerRating: string;
  sector: string;
}

export default function SharedWatchlistPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    }>
      <SharedWatchlistContent />
    </Suspense>
  );
}

function SharedWatchlistContent() {
  const searchParams = useSearchParams();
  const [stocks, setStocks] = useState<SharedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const symbolsParam = searchParams.get('stocks') || '';
  const symbols = symbolsParam.split(',').filter(s => s.trim().length > 0);

  useEffect(() => {
    if (symbols.length === 0) {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      setLoading(true);
      const results: SharedStock[] = [];

      for (const symbol of symbols) {
        try {
          const [profileRes, scoreRes] = await Promise.allSettled([
            fetch(`${API_BASE}/api/profile/${symbol.trim()}`, { signal: AbortSignal.timeout(12000) }),
            fetch(`${API_BASE}/api/score/${symbol.trim()}`, { signal: AbortSignal.timeout(15000) }),
          ]);

          const profile = profileRes.status === 'fulfilled' && profileRes.value.ok
            ? await profileRes.value.json() : null;
          const score = scoreRes.status === 'fulfilled' && scoreRes.value.ok
            ? await scoreRes.value.json() : null;

          if (!profile) continue;

          const vol = profile.annualized_volatility;
          const beta = profile.beta;
          let beginnerRating = 'Intermediate';
          if (vol && vol * 100 < 25 && (!beta || beta < 1.0)) beginnerRating = 'Beginner Friendly';
          else if (vol && vol * 100 > 40 || (beta && beta > 1.5)) beginnerRating = 'Risky';

          results.push({
            symbol: symbol.trim(),
            name: profile.name || symbol,
            price: profile.current_price,
            currency: profile.currency || 'USD',
            dayChangePct: profile.day_change_pct || 0,
            score: score?.total_score || null,
            scoreLabel: score?.label || null,
            beginnerRating,
            sector: profile.sector || 'Unknown',
          });
        } catch {}
      }

      if (results.length === 0 && symbols.length > 0) {
        setError('Could not load the shared watchlist. The stocks may not be available right now.');
      }
      setStocks(results);
      setLoading(false);
    }

    fetchAll();
  }, [symbolsParam]);

  // No stocks in URL
  if (!symbolsParam) {
    return (
      <div className="max-w-3xl text-center py-20">
        <Bookmark className="h-10 w-10 text-[var(--muted)] mx-auto mb-4" />
        <h1 className="text-xl font-bold">Shared Watchlist</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          No stocks found in this link. Ask the person who shared it to generate a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]/10">
          <Eye className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Shared Watchlist</h1>
          <p className="text-xs text-[var(--muted)]">
            {symbols.length} stock{symbols.length !== 1 ? 's' : ''} · Read-only view · Live prices
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Loading watchlist data...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-[var(--warning)] text-center">{error}</p>
      )}

      {/* Stock cards */}
      {!loading && stocks.length > 0 && (
        <div className="space-y-3">
          {stocks.map((stock) => (
            <SharedStockCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center">
        Powered by SmartVest · Prices from Yahoo Finance · This is not financial advice
      </p>
    </div>
  );
}

function SharedStockCard({ stock }: { stock: SharedStock }) {
  const isUp = stock.dayChangePct >= 0;
  const brConfig: Record<string, { emoji: string; color: string }> = {
    'Beginner Friendly': { emoji: '🟢', color: 'text-[var(--gain)]' },
    'Intermediate': { emoji: '🟡', color: 'text-[var(--warning)]' },
    'Risky': { emoji: '🔴', color: 'text-[var(--loss)]' },
  };
  const br = brConfig[stock.beginnerRating] || brConfig['Intermediate'];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{stock.symbol}</p>
            <p className="text-xs text-[var(--muted)]">{stock.name}</p>
          </div>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">{stock.sector}</p>
        </div>
        <div className="flex items-center gap-3">
          {stock.score && (
            <div className={`flex flex-col items-center h-10 w-10 rounded-lg border justify-center ${
              stock.score >= 7 ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' :
              stock.score >= 5 ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5' :
              'border-[var(--warning)]/30 bg-[var(--warning)]/5'
            }`}>
              <span className={`text-sm font-bold font-tabular ${
                stock.score >= 7 ? 'text-[var(--gain)]' :
                stock.score >= 5 ? 'text-[var(--primary)]' :
                'text-[var(--warning)]'
              }`}>{stock.score}</span>
              <span className="text-[7px] text-[var(--muted)]">/10</span>
            </div>
          )}
          <div className="text-right">
            <p className="font-bold font-tabular">
              {stock.currency} {stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {isUp ? '+' : ''}{stock.dayChangePct.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-[10px] font-medium ${br.color}`}>
          {br.emoji} {stock.beginnerRating}
        </span>
        {stock.scoreLabel && (
          <span className="text-[10px] text-[var(--muted)]">· {stock.scoreLabel}</span>
        )}
      </div>
    </div>
  );
}
