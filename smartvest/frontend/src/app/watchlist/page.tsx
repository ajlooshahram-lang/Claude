'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bookmark, Loader2, TrendingUp, TrendingDown, Trash2,
  RefreshCw, Clock, AlertCircle, Newspaper, ExternalLink, Bell,
  Share2,
} from 'lucide-react';
import { getWatchlist, removeFromWatchlist, WatchlistItem } from '@/lib/watchlist';
import { getProfile, RiskProfile } from '@/lib/profile';
import { addAlert, AlertDirection } from '@/lib/alerts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WatchlistStock {
  symbol: string;
  name: string;
  addedAt: string;
  // Live data (fetched from backend)
  currentPrice: number;
  currency: string;
  dayChangePct: number;
  beta: number | null;
  annualizedVolatility: number | null;
  marketCap: number | null;
  sector: string;
  country: string;
  dividendYield: number | null;
  // Derived
  beginnerRating: 'Beginner Friendly' | 'Intermediate' | 'Risky';
  beginnerExplanation: string;
  // 14-day trend
  trendDirection: 'up' | 'down' | 'flat' | null;
  trendChangePct: number | null;
  // SmartVest score
  smartScore: number | null;
  smartLabel: string | null;
}


// ─── Beginner Score Logic (same as search page) ──────────────────────────────

function assessBeginner(vol: number | null, beta: number | null, cap: number | null): {
  rating: 'Beginner Friendly' | 'Intermediate' | 'Risky';
  explanation: string;
} {
  if (vol === null || vol === undefined) {
    if (beta !== null && beta > 1.5) {
      return { rating: 'Risky', explanation: `High market sensitivity (beta ${beta.toFixed(1)}) — swings more than the market.` };
    }
    if (beta !== null && beta <= 0.8 && cap && cap > 10e9) {
      return { rating: 'Beginner Friendly', explanation: `Low beta (${beta.toFixed(1)}) and large company — tends to be steady.` };
    }
    return { rating: 'Intermediate', explanation: 'Insufficient volatility data — moderate risk assumed.' };
  }

  const volPct = vol * 100;

  if (volPct < 25 && (beta === null || beta < 1.0)) {
    return { rating: 'Beginner Friendly', explanation: `Low volatility (${volPct.toFixed(0)}% annual) — steady and predictable.` };
  }
  if (volPct > 40 || (beta !== null && beta > 1.5)) {
    return { rating: 'Risky', explanation: `High volatility (${volPct.toFixed(0)}% swings) — can drop 20-30% quickly.` };
  }
  return { rating: 'Intermediate', explanation: `Moderate volatility (${volPct.toFixed(0)}% annual) — some bumps but manageable.` };
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);

  // Load risk profile on mount
  useEffect(() => {
    const p = getProfile();
    if (p) setRiskProfile(p.riskProfile);
  }, []);

  const fetchWatchlistData = useCallback(async () => {
    const items = getWatchlist();
    if (items.length === 0) {
      setStocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all stocks in PARALLEL (not sequentially) for speed
      const results: WatchlistStock[] = [];
      
      const fetchOne = async (item: WatchlistItem): Promise<WatchlistStock | null> => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          
          // Fetch profile, trend, and score in parallel for each stock
          const [profileRes, trendRes, scoreRes] = await Promise.allSettled([
            fetch(`${API_BASE}/api/profile/${item.symbol}`, { signal: controller.signal }),
            fetch(`${API_BASE}/api/trend/${item.symbol}`, { signal: controller.signal }),
            fetch(`${API_BASE}/api/score/${item.symbol}`, { signal: controller.signal }),
          ]);
          clearTimeout(timeout);

          const p = profileRes.status === 'fulfilled' && profileRes.value.ok
            ? await profileRes.value.json() : null;
          if (!p) return null;

          let trendDirection: 'up' | 'down' | 'flat' | null = null;
          let trendChangePct: number | null = null;
          if (trendRes.status === 'fulfilled' && trendRes.value.ok) {
            const t = await trendRes.value.json();
            trendDirection = t.direction;
            trendChangePct = t.change_pct;
          }

          let smartScore: number | null = null;
          let smartLabel: string | null = null;
          if (scoreRes.status === 'fulfilled' && scoreRes.value.ok) {
            const s = await scoreRes.value.json();
            smartScore = s.total_score;
            smartLabel = s.label;
          }

          const { rating, explanation } = assessBeginner(
            p.annualized_volatility, p.beta, p.market_cap
          );

          return {
            symbol: item.symbol,
            name: p.name || item.name,
            addedAt: item.addedAt,
            currentPrice: p.current_price,
            currency: p.currency,
            dayChangePct: p.day_change_pct,
            beta: p.beta,
            annualizedVolatility: p.annualized_volatility,
            marketCap: p.market_cap,
            sector: p.sector,
            country: p.country,
            dividendYield: p.dividend_yield,
            beginnerRating: rating,
            beginnerExplanation: explanation,
            trendDirection,
            trendChangePct,
            smartScore,
            smartLabel,
          };
        } catch {
          return null;
        }
      };

      // Fetch ALL stocks in parallel
      const settled = await Promise.allSettled(items.map(fetchOne));
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      setStocks(results);
      setLastUpdated(new Date().toLocaleTimeString('en-DK', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not load live prices for your watchlist. Make sure the backend is running and try again.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlistData();
  }, [fetchWatchlistData]);

  function handleRemove(symbol: string) {
    removeFromWatchlist(symbol);
    setStocks(prev => prev.filter(s => s.symbol !== symbol));
  }

  // Empty state
  if (!loading && stocks.length === 0 && !error) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <div className="mt-12 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Bookmark className="h-8 w-8 text-[var(--muted)]" />
          </div>
          <h2 className="text-lg font-semibold">No stocks saved yet</h2>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-sm">
            Go to the <a href="/search" className="text-[var(--primary)] hover:underline">Search page</a>, find a stock you like, and click <strong>Save</strong> to add it to your watchlist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Watchlist</h1>
          <p className="text-sm text-[var(--muted)]">
            {stocks.length} stock{stocks.length !== 1 ? 's' : ''} saved &middot; Live prices from Yahoo Finance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Share button */}
          {stocks.length > 0 && (
            <ShareWatchlistButton symbols={stocks.map(s => s.symbol)} />
          )}
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            <Clock className="h-3 w-3" />
            {lastUpdated && `Updated ${lastUpdated}`}
            <button
              onClick={fetchWatchlistData}
              disabled={loading}
              className="ml-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && stocks.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Fetching live prices for your watchlist...</span>
        </div>
      )}

      {/* Stock Cards */}
      {stocks.length > 0 && (
        <div className="space-y-3">
          {sortWatchlistByProfile(stocks, riskProfile).map((stock) => (
            <WatchlistCard key={stock.symbol} stock={stock} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Watchlist Card ──────────────────────────────────────────────────────────

function WatchlistCard({ stock, onRemove }: {
  stock: WatchlistStock; onRemove: (symbol: string) => void;
}) {
  const isUp = stock.dayChangePct >= 0;

  const ratingConfig = {
    'Beginner Friendly': { emoji: '🟢', color: 'text-[var(--gain)]', bg: 'bg-[var(--gain)]/5 border-[var(--gain)]/20' },
    'Intermediate': { emoji: '🟡', color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/5 border-[var(--warning)]/20' },
    'Risky': { emoji: '🔴', color: 'text-[var(--loss)]', bg: 'bg-[var(--loss)]/5 border-[var(--loss)]/20' },
  };
  const rc = ratingConfig[stock.beginnerRating];

  function formatCap(cap: number | null): string {
    if (!cap) return '';
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(1)}T`;
    if (cap >= 1e9) return `${(cap / 1e9).toFixed(0)}B`;
    return `${(cap / 1e6).toFixed(0)}M`;
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 hover:border-[var(--primary)]/30 transition-colors">
      {/* Top row: name + price + remove */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-[var(--muted)] flex-shrink-0">
            {stock.symbol.substring(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{stock.symbol}</p>
              <p className="text-xs text-[var(--muted)] truncate">{stock.name}</p>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              {stock.sector} &middot; {stock.country}
              {stock.marketCap ? ` · ${formatCap(stock.marketCap)} ${stock.currency}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* SmartVest Score badge */}
          {stock.smartScore !== null && (
            <div className={`flex flex-col items-center justify-center h-11 w-11 rounded-lg border ${
              stock.smartScore >= 7 ? 'bg-[var(--gain)]/5 border-[var(--gain)]/30' :
              stock.smartScore >= 5 ? 'bg-[var(--primary)]/5 border-[var(--primary)]/30' :
              stock.smartScore >= 3 ? 'bg-[var(--warning)]/5 border-[var(--warning)]/30' :
              'bg-[var(--loss)]/5 border-[var(--loss)]/30'
            }`}>
              <span className={`text-sm font-bold font-tabular ${
                stock.smartScore >= 7 ? 'text-[var(--gain)]' :
                stock.smartScore >= 5 ? 'text-[var(--primary)]' :
                stock.smartScore >= 3 ? 'text-[var(--warning)]' :
                'text-[var(--loss)]'
              }`}>
                {stock.smartScore}
              </span>
              <span className="text-[8px] text-[var(--muted)]">/10</span>
            </div>
          )}

          {/* Price */}
          <div className="text-right">
            <p className="font-bold font-tabular">
              {stock.currency} {stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}{stock.dayChangePct.toFixed(2)}%
            </p>
          </div>

          {/* Remove button */}
          <button
            onClick={() => onRemove(stock.symbol)}
            className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/5 transition-colors"
            title="Remove from watchlist"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Traffic Light — 14-day trend */}
      {stock.trendDirection && (
        <div className={`mt-3 flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
          stock.trendDirection === 'up' ? 'bg-[var(--gain)]/5 border-[var(--gain)]/20' :
          stock.trendDirection === 'down' ? 'bg-[var(--loss)]/5 border-[var(--loss)]/20' :
          'bg-[var(--warning)]/5 border-[var(--warning)]/20'
        }`}>
          <span className="text-base">
            {stock.trendDirection === 'up' ? '🟢' : stock.trendDirection === 'down' ? '🔴' : '🟡'}
          </span>
          <span className={`text-xs font-bold ${
            stock.trendDirection === 'up' ? 'text-[var(--gain)]' :
            stock.trendDirection === 'down' ? 'text-[var(--loss)]' :
            'text-[var(--warning)]'
          }`}>
            {stock.trendDirection === 'up' ? 'Uptrend' : stock.trendDirection === 'down' ? 'Downtrend' : 'Flat'}
          </span>
          <span className="text-[11px] text-[var(--foreground)]/60">
            {stock.trendChangePct !== null && (
              stock.trendDirection === 'up'
                ? `+${stock.trendChangePct.toFixed(1)}% over 14 days`
                : stock.trendDirection === 'down'
                ? `${stock.trendChangePct.toFixed(1)}% over 14 days`
                : `${stock.trendChangePct >= 0 ? '+' : ''}${stock.trendChangePct.toFixed(1)}% over 14 days`
            )}
          </span>
        </div>
      )}

      {/* Beginner Score */}
      <div className={`mt-3 rounded-lg border ${rc.bg} p-3 flex items-start gap-2.5`}>
        <span className="text-base">{rc.emoji}</span>
        <div>
          <p className={`text-xs font-bold ${rc.color}`}>{stock.beginnerRating}</p>
          <p className="text-[11px] text-[var(--foreground)]/60 mt-0.5">
            {stock.beginnerExplanation}
          </p>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--muted)]">
        {stock.beta !== null && <span>Beta: {stock.beta.toFixed(2)}</span>}
        {stock.annualizedVolatility !== null && <span>Vol: {(stock.annualizedVolatility * 100).toFixed(0)}%</span>}
        {stock.dividendYield !== null && stock.dividendYield > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gain)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--gain)]">
            💰 {(stock.dividendYield * 100).toFixed(1)}% yield
          </span>
        )}
        <span className="ml-auto">Added {(() => { try { return new Date(stock.addedAt).toLocaleDateString(); } catch { return 'recently'; } })()}</span>
      </div>

      {/* Set Alert + News */}
      <div className="mt-3 flex items-center gap-3">
        <SetAlertButton symbol={stock.symbol} name={stock.name} currentPrice={stock.currentPrice} currency={stock.currency} />
        <WatchlistNewsSection symbol={stock.symbol} />
      </div>
    </div>
  );
}


// ─── News Section (expandable per card) ──────────────────────────────────────

interface NewsArticle {
  title: string;
  source: string;
  date: string;
  url: string;
}

function WatchlistNewsSection({ symbol }: { symbol: string }) {
  const [expanded, setExpanded] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);

  function handleToggle() {
    if (!expanded && articles.length === 0) {
      // Fetch on first expand
      setLoading(true);
      fetch(`${API_BASE}/api/news/${symbol}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.articles) setArticles(data.articles);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setExpanded(!expanded);
  }

  return (
    <div className="mt-3">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
      >
        <Newspaper className="h-3 w-3" />
        {expanded ? 'Hide news' : 'Show news'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading headlines...
            </div>
          )}
          {!loading && articles.length === 0 && (
            <p className="text-[10px] text-[var(--muted)] py-1">No recent news found.</p>
          )}
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-[var(--card-border)] bg-black/20 p-2.5 hover:border-[var(--primary)]/30 transition-colors"
            >
              <p className="text-[11px] font-medium leading-snug">
                {article.title}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--muted)]">
                <span>{article.source}</span>
                <span>&middot;</span>
                <span>{formatDate(article.date)}</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-DK', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr.substring(0, 10);
  }
}


// ─── Profile-Based Sorting for Watchlist ─────────────────────────────────────
// Sorts watchlist stocks based on the user's risk profile.
// Uses real data (volatility, beta, momentum) for accurate ranking:
//
//   Conservative → lowest volatility and beta first (safest stocks on top)
//   Moderate → sorted by SmartVest score (best balanced picks on top)
//   Growth → highest momentum/trend first (strongest movers on top)

function sortWatchlistByProfile(stocks: WatchlistStock[], profile: RiskProfile | null): WatchlistStock[] {
  if (!profile || stocks.length <= 1) return stocks;

  return [...stocks].sort((a, b) => {
    if (profile === 'Conservative') {
      // Conservative: prioritize low volatility, low beta (safest first)
      const volA = a.annualizedVolatility ?? 0.5;
      const volB = b.annualizedVolatility ?? 0.5;
      const betaA = a.beta ?? 1.0;
      const betaB = b.beta ?? 1.0;
      // Combined safety metric: lower is better
      const safetyA = volA * 0.6 + betaA * 0.4;
      const safetyB = volB * 0.6 + betaB * 0.4;
      return safetyA - safetyB;
    }

    if (profile === 'Growth') {
      // Growth: prioritize positive momentum (strongest trend first)
      const momA = a.trendChangePct ?? 0;
      const momB = b.trendChangePct ?? 0;
      return momB - momA;
    }

    // Moderate: sort by SmartVest score (best overall picks first)
    const scoreA = a.smartScore ?? 5;
    const scoreB = b.smartScore ?? 5;
    return scoreB - scoreA;
  });
}


// ─── Set Alert Button (inline form) ─────────────────────────────────────────

function SetAlertButton({ symbol, name, currentPrice, currency }: {
  symbol: string; name: string; currentPrice: number; currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) return;

    addAlert({
      symbol,
      name,
      targetPrice: price,
      direction,
      currency,
      priceWhenSet: currentPrice,
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); setTargetPrice(''); }, 1500);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
      >
        <Bell className="h-3 w-3" />
        Set alert
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-black/20 px-3 py-2">
      <select
        value={direction}
        onChange={(e) => setDirection(e.target.value as AlertDirection)}
        className="bg-transparent text-[10px] text-[var(--muted)] outline-none"
      >
        <option value="above">Above</option>
        <option value="below">Below</option>
      </select>
      <input
        type="number"
        value={targetPrice}
        onChange={(e) => setTargetPrice(e.target.value)}
        placeholder={currentPrice.toFixed(2)}
        className="w-20 bg-transparent text-xs font-tabular outline-none placeholder:text-[var(--muted)]"
        step="0.01"
        autoFocus
      />
      <span className="text-[9px] text-[var(--muted)]">{currency}</span>
      {saved ? (
        <span className="text-[10px] text-[var(--gain)] font-medium">✓ Saved</span>
      ) : (
        <>
          <button onClick={handleSave} className="text-[10px] font-medium text-[var(--primary)] hover:underline">
            Save
          </button>
          <button onClick={() => setOpen(false)} className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]">
            ✕
          </button>
        </>
      )}
    </div>
  );
}


// ─── Share Watchlist Button ──────────────────────────────────────────────────

function ShareWatchlistButton({ symbols }: { symbols: string[] }) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const encoded = symbols.join(',');
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/shared-watchlist?stocks=${encodeURIComponent(encoded)}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: select and copy via prompt
      window.prompt('Copy this link to share your watchlist:', shareUrl);
    });
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors"
    >
      <Share2 className="h-3 w-3" />
      {copied ? 'Link Copied!' : 'Share'}
    </button>
  );
}
