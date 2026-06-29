'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Search, Loader2, TrendingUp, TrendingDown, Globe,
  Building2, Users, ExternalLink, AlertCircle, Bookmark, BookmarkCheck,
  Newspaper,
} from 'lucide-react';
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from '@/lib/watchlist';
import { getProfile, RiskProfile } from '@/lib/profile';
import { ContradictionDetector } from '@/components/contradiction-detector';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector: string;
  industry: string;
}

interface CompanyProfile {
  symbol: string;
  name: string;
  description: string;
  currency: string;
  exchange: string;
  current_price: number;
  previous_close: number;
  day_change: number;
  day_change_pct: number;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  beta: number | null;
  annualized_volatility: number | null;
  sector: string;
  industry: string;
  country: string;
  employees: number | null;
  website: string | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);

  // Load risk profile on mount
  useEffect(() => {
    const p = getProfile();
    if (p) setRiskProfile(p.riskProfile);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setProfile(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(query.trim())}`
      );
      if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
      const data = await res.json();
      setResults(data.results || []);

      if (data.results.length === 0) {
        setError('No stocks found. Try a different name or ticker.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not connect to the server. Make sure SmartVest backend is running and try again.`);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectStock = useCallback(async (symbol: string) => {
    setLoadingProfile(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/profile/${symbol}`);
      if (!res.ok) throw new Error(`Failed to load profile: ${res.statusText}`);
      const data = await res.json();
      setProfile(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not load this stock's details. Please try again in a moment.`);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Stock Search</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Type a company name or ticker symbol to get the live price
          and what the company does
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 focus-within:border-[var(--primary)] transition-colors">
          <Search className="h-5 w-5 text-[var(--muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search... e.g. &quot;Apple&quot;, &quot;NOVO-B.CO&quot;, &quot;Toyota&quot;"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--muted)]"
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Search Results (before selecting one) */}
      {results.length > 0 && !profile && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)] text-xs text-[var(--muted)]">
            {results.length} result{results.length !== 1 ? 's' : ''} — click to see details
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {sortResultsByProfile(results, riskProfile).map((r) => (
              <button
                key={r.symbol}
                onClick={() => handleSelectStock(r.symbol)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-[var(--muted)]">
                  {r.symbol.substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {r.symbol} &middot; {r.exchange}
                    {r.sector ? ` · ${r.sector}` : ''}
                  </p>
                </div>
                <span className="text-[10px] rounded-full bg-white/5 px-2 py-0.5 text-[var(--muted)]">
                  {r.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading profile */}
      {loadingProfile && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Loading company data...</span>
        </div>
      )}

      {/* Company Profile Card */}
      {profile && !loadingProfile && (
        <ProfileCard profile={profile} onBack={() => setProfile(null)} riskProfile={riskProfile} />
      )}
    </div>
  );
}


// ─── Profile Card ────────────────────────────────────────────────────────────

function ProfileCard({ profile: p, onBack, riskProfile }: {
  profile: CompanyProfile; onBack: () => void; riskProfile: RiskProfile | null;
}) {
  const isUp = p.day_change_pct >= 0;
  const [saved, setSaved] = useState(isInWatchlist(p.symbol));
  const [trend, setTrend] = useState<{ direction: string; change_pct: number } | null>(null);
  const [score, setScore] = useState<{ total_score: number; label: string; breakdown: { safety: { score: number; explanation: string }; value: { score: number; explanation: string }; momentum: { score: number; explanation: string } } } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/trend/${p.symbol}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTrend(data); })
      .catch(() => {});
    fetch(`${API_BASE}/api/score/${p.symbol}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setScore(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [p.symbol]);

  function handleToggleWatchlist() {
    if (saved) {
      removeFromWatchlist(p.symbol);
      setSaved(false);
    } else {
      addToWatchlist(p.symbol, p.name);
      // Anonymous ping for community picks (just the symbol, no user data)
      fetch(`${API_BASE}/api/community/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: p.symbol }),
      }).catch(() => {}); // Silent — doesn't matter if it fails
      setSaved(true);
    }
  }

  function formatMarketCap(cap: number | null): string {
    if (!cap) return '—';
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(1)}T`;
    if (cap >= 1e9) return `${(cap / 1e9).toFixed(1)}B`;
    if (cap >= 1e6) return `${(cap / 1e6).toFixed(0)}M`;
    return cap.toLocaleString();
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {p.symbol} &middot; {p.exchange} &middot; {p.country}
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            &larr; Back to results
          </button>
        </div>

        {/* Price */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold font-tabular">
              {p.currency} {p.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isUp ? '+' : ''}{p.day_change.toFixed(2)} ({isUp ? '+' : ''}{p.day_change_pct.toFixed(2)}%)
            </span>
          </div>
          <button
            onClick={handleToggleWatchlist}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              saved
                ? 'bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30'
                : 'bg-white/5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/10 border border-[var(--card-border)]'
            }`}
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        {/* Traffic Light — 14-day trend */}
        {trend && (
          <TrafficLight direction={trend.direction} changePct={trend.change_pct} />
        )}
      </div>

      {/* Beginner Score */}
      <BeginnerScore profile={p} />

      {/* Dividend Yield badge (if stock pays a dividend) */}
      {p.dividend_yield && p.dividend_yield > 0.005 && (
        <div className="mx-6 mb-2 flex items-center gap-2.5 rounded-lg border border-[var(--gain)]/20 bg-[var(--gain)]/5 px-4 py-2.5">
          <span className="text-base">💰</span>
          <div>
            <span className="text-xs font-bold text-[var(--gain)]">
              Pays {(p.dividend_yield * 100).toFixed(2)}% annual dividend
            </span>
            <p className="text-[10px] text-[var(--foreground)]/60 mt-0.5">
              You earn this as cash income every year just for holding the stock
            </p>
          </div>
        </div>
      )}

      {/* SmartVest Score */}
      {score && <ScorePanel score={score} />}

      {/* Contradiction Detector */}
      <ContradictionDetector signals={{
        beginnerRating: assessBeginnerFriendliness(p).rating,
        trafficLight: (trend?.direction as 'up' | 'down' | 'flat') || null,
        trafficLightPct: trend?.change_pct || null,
        smartScore: score?.total_score || null,
        smartScoreLabel: score?.label || null,
        safetyScore: score?.breakdown?.safety?.score || null,
        momentumScore: score?.breakdown?.momentum?.score || null,
        valueScore: score?.breakdown?.value?.score || null,
        userProfile: riskProfile,
        stockName: p.name,
      }} />

      {/* Description */}
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--primary)]" />
          What does this company do?
        </h3>
        <p className="text-sm leading-relaxed text-[var(--foreground)]/80">
          {p.description}
        </p>
      </div>

      {/* Key Stats Grid */}
      <div className="px-6 py-5">
        <h3 className="text-sm font-semibold mb-3">Key Stats</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Market Cap" value={formatMarketCap(p.market_cap)} />
          <Stat label="P/E Ratio" value={p.pe_ratio ? p.pe_ratio.toFixed(1) : '—'} />
          <Stat label="Dividend Yield" value={p.dividend_yield ? `${(p.dividend_yield * 100).toFixed(2)}%` : '—'} />
          <Stat label="Beta" value={p.beta ? p.beta.toFixed(2) : '—'} />
          <Stat label="Sector" value={p.sector} />
          <Stat label="Industry" value={p.industry} />
          <Stat label="52W High" value={p.fifty_two_week_high ? `${p.currency} ${p.fifty_two_week_high.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} />
          <Stat label="52W Low" value={p.fifty_two_week_low ? `${p.currency} ${p.fifty_two_week_low.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} />
        </div>

        {/* Extra info */}
        <div className="mt-4 pt-4 border-t border-[var(--card-border)] flex flex-wrap gap-4 text-xs text-[var(--muted)]">
          {p.employees && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {p.employees.toLocaleString()} employees
            </span>
          )}
          {p.country && (
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" /> {p.country}
            </span>
          )}
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[var(--primary)] transition-colors">
              <ExternalLink className="h-3 w-3" /> Website
            </a>
          )}
        </div>
      </div>

      {/* Price Chart */}
      <PriceChart symbol={p.symbol} currency={p.currency} />

      {/* Recent News */}
      <NewsPanel symbol={p.symbol} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}


// ─── Beginner Score Component ────────────────────────────────────────────────

type BeginnerRating = 'Beginner Friendly' | 'Intermediate' | 'Risky';

interface BeginnerAssessment {
  rating: BeginnerRating;
  explanation: string;
}

function assessBeginnerFriendliness(p: CompanyProfile): BeginnerAssessment {
  /**
   * Rates a stock as Beginner Friendly, Intermediate, or Risky.
   *
   * Based on:
   *   - Annualized volatility (primary signal — how wildly the price swings)
   *   - Beta (how much it moves with the market)
   *   - Market cap (larger = more stable, less manipulation)
   *
   * Thresholds:
   *   - Volatility < 25% AND beta < 1.0  →  Beginner Friendly
   *   - Volatility 25-40% OR beta 1.0-1.5  →  Intermediate
   *   - Volatility > 40% OR beta > 1.5  →  Risky
   */
  const vol = p.annualized_volatility;
  const beta = p.beta;
  const cap = p.market_cap;

  // If we don't have volatility data, fall back to beta + cap
  if (vol === null || vol === undefined) {
    if (beta !== null && beta > 1.5) {
      return {
        rating: 'Risky',
        explanation: `High market sensitivity (beta ${beta.toFixed(1)}) means this stock swings more than the overall market — not ideal when you're starting out.`,
      };
    }
    if (beta !== null && beta <= 0.8 && cap && cap > 10e9) {
      return {
        rating: 'Beginner Friendly',
        explanation: `Low market sensitivity (beta ${beta.toFixed(1)}) and large company — this stock tends to be steadier than the market.`,
      };
    }
    return {
      rating: 'Intermediate',
      explanation: `Not enough price history to fully assess volatility, but metrics suggest moderate risk.`,
    };
  }

  const volPct = vol * 100;

  // ── Beginner Friendly ──
  if (volPct < 25 && (beta === null || beta < 1.0)) {
    let reason = `Low price volatility (${volPct.toFixed(0)}% annual swings)`;
    if (beta !== null) reason += ` and defensive beta (${beta.toFixed(2)})`;
    reason += ` — this stock moves gently, so you're less likely to panic-sell on a bad day.`;
    if (cap && cap > 100e9) reason = `Large, stable company with low volatility (${volPct.toFixed(0)}% annual) — steady and predictable.`;
    return { rating: 'Beginner Friendly', explanation: reason };
  }

  // ── Risky ──
  if (volPct > 40 || (beta !== null && beta > 1.5)) {
    let reason = `High price volatility (${volPct.toFixed(0)}% annual swings)`;
    if (beta !== null && beta > 1.5) reason += ` and high beta (${beta.toFixed(2)})`;
    reason += ` — the price can drop 20-30% in weeks. Only invest money you can afford to watch go down temporarily.`;
    return { rating: 'Risky', explanation: reason };
  }

  // ── Intermediate ──
  let reason = `Moderate volatility (${volPct.toFixed(0)}% annual swings)`;
  if (beta !== null) reason += ` with beta ${beta.toFixed(2)}`;
  reason += ` — expect occasional 10-15% drops, but manageable for investors who don't check prices hourly.`;
  return { rating: 'Intermediate', explanation: reason };
}

function BeginnerScore({ profile }: { profile: CompanyProfile }) {
  const { rating, explanation } = assessBeginnerFriendliness(profile);

  const config: Record<BeginnerRating, { color: string; bg: string; border: string; icon: string }> = {
    'Beginner Friendly': {
      color: 'text-[var(--gain)]',
      bg: 'bg-[var(--gain)]/5',
      border: 'border-[var(--gain)]/30',
      icon: '🟢',
    },
    'Intermediate': {
      color: 'text-[var(--warning)]',
      bg: 'bg-[var(--warning)]/5',
      border: 'border-[var(--warning)]/30',
      icon: '🟡',
    },
    'Risky': {
      color: 'text-[var(--loss)]',
      bg: 'bg-[var(--loss)]/5',
      border: 'border-[var(--loss)]/30',
      icon: '🔴',
    },
  };

  const c = config[rating];

  return (
    <div className={`mx-6 my-4 rounded-xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{c.icon}</span>
        <span className={`text-sm font-bold ${c.color}`}>{rating}</span>
      </div>
      <p className="text-xs leading-relaxed text-[var(--foreground)]/70 mt-1.5 pl-7">
        {explanation}
      </p>
    </div>
  );
}


// ─── Traffic Light Component ─────────────────────────────────────────────────

function TrafficLight({ direction, changePct }: {
  direction: string; changePct: number;
}) {
  const config: Record<string, { emoji: string; color: string; bg: string; label: string; hint: string }> = {
    up: {
      emoji: '🟢',
      color: 'text-[var(--gain)]',
      bg: 'bg-[var(--gain)]/5 border-[var(--gain)]/20',
      label: 'Uptrend',
      hint: `Price is up ${changePct.toFixed(1)}% over the last 14 days`,
    },
    down: {
      emoji: '🔴',
      color: 'text-[var(--loss)]',
      bg: 'bg-[var(--loss)]/5 border-[var(--loss)]/20',
      label: 'Downtrend',
      hint: `Price is down ${Math.abs(changePct).toFixed(1)}% over the last 14 days`,
    },
    flat: {
      emoji: '🟡',
      color: 'text-[var(--warning)]',
      bg: 'bg-[var(--warning)]/5 border-[var(--warning)]/20',
      label: 'Flat',
      hint: `Price is roughly unchanged (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%) over the last 14 days`,
    },
  };

  const c = config[direction] || config['flat'];

  return (
    <div className={`mt-3 flex items-center gap-2.5 rounded-lg border ${c.bg} px-3 py-2`}>
      <span className="text-base">{c.emoji}</span>
      <span className={`text-xs font-bold ${c.color}`}>{c.label}</span>
      <span className="text-[11px] text-[var(--foreground)]/60">{c.hint}</span>
    </div>
  );
}


// ─── News Panel Component ────────────────────────────────────────────────────

interface NewsArticle {
  title: string;
  source: string;
  date: string;
  url: string;
  summary: string;
}

function NewsPanel({ symbol }: { symbol: string }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/news/${symbol}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.articles) setArticles(data.articles);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="px-6 py-4 border-t border-[var(--card-border)] flex items-center gap-2 text-xs text-[var(--muted)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading news...
      </div>
    );
  }

  if (articles.length === 0) return null;

  return (
    <div className="px-6 py-5 border-t border-[var(--card-border)]">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-[var(--primary)]" />
        Recent News
      </h3>
      <div className="space-y-3">
        {articles.map((article, i) => (
          <a
            key={i}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-[var(--card-border)] bg-black/20 p-3 hover:border-[var(--primary)]/30 hover:bg-white/[0.02] transition-colors"
          >
            <p className="text-sm font-medium leading-snug">
              {article.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--muted)]">
              <span>{article.source}</span>
              <span>&middot;</span>
              <span>{formatNewsDate(article.date)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function formatNewsDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-DK', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr.substring(0, 10);
  }
}


// ─── Score Panel Component ───────────────────────────────────────────────────

function ScorePanel({ score }: {
  score: {
    total_score: number;
    label: string;
    breakdown: {
      safety: { score: number; explanation: string };
      value: { score: number; explanation: string };
      momentum: { score: number; explanation: string };
    };
  };
}) {
  const color =
    score.total_score >= 7 ? 'text-[var(--gain)]' :
    score.total_score >= 5 ? 'text-[var(--primary)]' :
    score.total_score >= 3 ? 'text-[var(--warning)]' :
    'text-[var(--loss)]';

  const bgColor =
    score.total_score >= 7 ? 'bg-[var(--gain)]/5 border-[var(--gain)]/20' :
    score.total_score >= 5 ? 'bg-[var(--primary)]/5 border-[var(--primary)]/20' :
    score.total_score >= 3 ? 'bg-[var(--warning)]/5 border-[var(--warning)]/20' :
    'bg-[var(--loss)]/5 border-[var(--loss)]/20';

  return (
    <div className={`mx-6 my-4 rounded-xl border ${bgColor} p-4`}>
      {/* Header: score + label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold font-tabular ${color}`}>
            {score.total_score}
          </span>
          <span className="text-sm text-[var(--muted)]">/ 10</span>
          <span className={`text-xs font-semibold ml-2 ${color}`}>
            {score.label}
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted)]">SmartVest Score</span>
      </div>

      {/* Sub-score bars */}
      <div className="space-y-2">
        <ScoreBar label="Safety" score={score.breakdown.safety.score} weight="40%" explanation={score.breakdown.safety.explanation} />
        <ScoreBar label="Value" score={score.breakdown.value.score} weight="35%" explanation={score.breakdown.value.explanation} />
        <ScoreBar label="Momentum" score={score.breakdown.momentum.score} weight="25%" explanation={score.breakdown.momentum.explanation} />
      </div>
    </div>
  );
}

function ScoreBar({ label, score, weight, explanation }: {
  label: string; score: number; weight: string; explanation: string;
}) {
  const pct = (score / 10) * 100;
  const barColor =
    score >= 7 ? 'bg-[var(--gain)]' :
    score >= 5 ? 'bg-[var(--primary)]' :
    score >= 3 ? 'bg-[var(--warning)]' :
    'bg-[var(--loss)]';

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-medium">
          {label} <span className="text-[var(--muted)] font-normal">({weight})</span>
        </span>
        <span className="text-[11px] font-bold font-tabular">{score}/10</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[9px] text-[var(--foreground)]/50 mt-0.5">{explanation}</p>
    </div>
  );
}


// ─── Profile-Based Sorting for Search Results ────────────────────────────────
// Sorts search results so stocks matching the user's risk profile appear first.
// Since search results only have sector/exchange info (no price data yet),
// we use sector as a heuristic:
//   Conservative → defensive sectors first (Healthcare, Consumer Staples, Utilities)
//   Moderate → balanced (no strong preference, original order mostly preserved)
//   Growth → growth sectors first (Technology, Consumer Cyclical, Communication)

const DEFENSIVE_SECTORS = ['Healthcare', 'Consumer Defensive', 'Consumer Staples', 'Utilities', 'Real Estate'];
const GROWTH_SECTORS = ['Technology', 'Consumer Cyclical', 'Communication Services', 'Financial Services', 'Industrials'];

function sectorScore(sector: string, profile: RiskProfile | null): number {
  if (!profile || !sector) return 0;

  if (profile === 'Conservative') {
    if (DEFENSIVE_SECTORS.some(s => sector.toLowerCase().includes(s.toLowerCase()))) return 2;
    if (GROWTH_SECTORS.some(s => sector.toLowerCase().includes(s.toLowerCase()))) return -1;
    return 0;
  }

  if (profile === 'Growth') {
    if (GROWTH_SECTORS.some(s => sector.toLowerCase().includes(s.toLowerCase()))) return 2;
    if (DEFENSIVE_SECTORS.some(s => sector.toLowerCase().includes(s.toLowerCase()))) return -1;
    return 0;
  }

  // Moderate: no strong preference
  return 0;
}

function sortResultsByProfile(results: SearchResult[], profile: RiskProfile | null): SearchResult[] {
  if (!profile) return results;
  return [...results].sort((a, b) => {
    return sectorScore(b.sector, profile) - sectorScore(a.sector, profile);
  });
}


// ─── Price Chart Component ───────────────────────────────────────────────────

type ChartPeriod = '1mo' | '3mo' | '1y';

function PriceChart({ symbol, currency }: { symbol: string; currency: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('1mo');
  const [points, setPoints] = useState<{ date: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    fetch(`${API_BASE}/api/chart/${symbol}?period=${period}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.points) setPoints(data.points); else setPoints([]); })
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [symbol, period]);

  const tabs: { value: ChartPeriod; label: string }[] = [
    { value: '1mo', label: '30 Days' },
    { value: '3mo', label: '90 Days' },
    { value: '1y', label: '1 Year' },
  ];

  // Calculate chart dimensions
  const prices = points.map(p => p.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const range = maxPrice - minPrice || 1;
  const startPrice = prices[0] || 0;
  const endPrice = prices[prices.length - 1] || 0;
  const changePct = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
  const isUp = changePct >= 0;

  return (
    <div className="px-6 py-5 border-t border-[var(--card-border)]">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Price History</h3>
        <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setPeriod(tab.value)}
              className={`px-3 py-1 text-[10px] font-medium transition-colors ${
                period === tab.value
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted)] hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
        </div>
      )}

      {/* Chart */}
      {!loading && points.length > 1 && (
        <>
          {/* Period change summary */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--muted)]">
              {currency} {minPrice.toFixed(2)} — {maxPrice.toFixed(2)}
            </span>
            <span className={`text-xs font-medium ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? '+' : ''}{changePct.toFixed(2)}% over this period
            </span>
          </div>

          {/* SVG line chart */}
          <div className="relative h-32 w-full">
            <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="none">
              {/* Grid lines */}
              <line x1="0" y1="30" x2="400" y2="30" stroke="var(--card-border)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="0" y1="60" x2="400" y2="60" stroke="var(--card-border)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="0" y1="90" x2="400" y2="90" stroke="var(--card-border)" strokeWidth="0.5" strokeDasharray="4" />

              {/* Area fill */}
              <path
                d={buildAreaPath(points, minPrice, range)}
                fill={isUp ? 'var(--gain)' : 'var(--loss)'}
                opacity="0.1"
              />

              {/* Line */}
              <path
                d={buildLinePath(points, minPrice, range)}
                fill="none"
                stroke={isUp ? 'var(--gain)' : 'var(--loss)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Date labels */}
          <div className="flex justify-between mt-1 text-[9px] text-[var(--muted)]">
            <span>{points[0]?.date}</span>
            <span>{points[Math.floor(points.length / 2)]?.date}</span>
            <span>{points[points.length - 1]?.date}</span>
          </div>
        </>
      )}

      {/* No data */}
      {!loading && points.length <= 1 && (
        <p className="text-xs text-[var(--muted)] text-center py-6">
          No price history available for this period.
        </p>
      )}
    </div>
  );
}

function buildLinePath(points: { price: number }[], minPrice: number, range: number): string {
  const width = 400;
  const height = 110;
  const padding = 5;

  return points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = padding + (1 - (p.price - minPrice) / range) * (height - padding * 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function buildAreaPath(points: { price: number }[], minPrice: number, range: number): string {
  const linePath = buildLinePath(points, minPrice, range);
  const width = 400;
  return `${linePath} L ${width} 120 L 0 120 Z`;
}
