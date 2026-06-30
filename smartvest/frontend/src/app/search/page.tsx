'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Search, Loader2, TrendingUp, TrendingDown, Globe,
  Building2, Users, ExternalLink, AlertCircle, Bookmark, BookmarkCheck,
} from 'lucide-react';
import { addToWatchlist, removeFromWatchlist, getWatchlist } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/supabase';
import { getPrice, CachedPrice, formatLastUpdated } from '@/lib/market-data';
import { isAlphaVantageConfigured } from '@/lib/market-data';
import { getProfile, RiskProfile } from '@/lib/profile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
}

// ─── Alpha Vantage Symbol Search ─────────────────────────────────────────────

const AV_KEY = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY || '')
  : '';

async function searchSymbols(query: string): Promise<SearchResult[]> {
  if (!AV_KEY) return [];
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json['Note'] || json['Error Message']) return [];

    const matches = json['bestMatches'] || [];
    return matches.map((m: Record<string, string>) => ({
      symbol: m['1. symbol'] || '',
      name: m['2. name'] || '',
      type: m['3. type'] || '',
      region: m['4. region'] || '',
      currency: m['8. currency'] || 'USD',
    }));
  } catch {
    return [];
  }
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [price, setPrice] = useState<CachedPrice | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
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
    setSelectedSymbol(null);
    setPrice(null);

    try {
      if (!isAlphaVantageConfigured()) {
        setError('Alpha Vantage API key not configured. Set NEXT_PUBLIC_ALPHA_VANTAGE_KEY in .env.local');
        setResults([]);
        setSearching(false);
        return;
      }

      const data = await searchSymbols(query.trim());
      setResults(data);

      if (data.length === 0) {
        setError('No stocks found. Try a different name or ticker.');
      }
    } catch {
      setError('Could not search. Please try again in a moment.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectStock = useCallback(async (symbol: string, name: string) => {
    setLoadingPrice(true);
    setError(null);
    setSelectedSymbol(symbol);
    setSelectedName(name);

    try {
      const p = await getPrice(symbol);
      setPrice(p);
    } catch {
      setError('Could not load price data. Please try again in a moment.');
    } finally {
      setLoadingPrice(false);
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
      {results.length > 0 && !selectedSymbol && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)] text-xs text-[var(--muted)]">
            {results.length} result{results.length !== 1 ? 's' : ''} — click to see live price
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => handleSelectStock(r.symbol, r.name)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-[var(--muted)]">
                  {r.symbol.substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {r.symbol} &middot; {r.region}
                    {r.currency ? ` · ${r.currency}` : ''}
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

      {/* Loading price */}
      {loadingPrice && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Loading live price...</span>
        </div>
      )}

      {/* Price Card */}
      {selectedSymbol && price && !loadingPrice && (
        <PriceCard
          symbol={selectedSymbol}
          name={selectedName}
          price={price}
          onBack={() => { setSelectedSymbol(null); setPrice(null); }}
        />
      )}
    </div>
  );
}


// ─── Price Card ──────────────────────────────────────────────────────────────

function PriceCard({ symbol, name, price: p, onBack }: {
  symbol: string; name: string; price: CachedPrice; onBack: () => void;
}) {
  const isUp = p.changePct >= 0;
  const [saved, setSaved] = useState(false);
  const [checkingWatchlist, setCheckingWatchlist] = useState(true);

  // Check if already in watchlist (async)
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const items = await getWatchlist();
        if (!cancelled) {
          setSaved(items.some(i => i.symbol === symbol));
        }
      } catch {}
      if (!cancelled) setCheckingWatchlist(false);
    }
    check();
    return () => { cancelled = true; };
  }, [symbol]);

  async function handleToggleWatchlist() {
    if (saved) {
      // Find the item id and remove
      try {
        const items = await getWatchlist();
        const item = items.find(i => i.symbol === symbol);
        if (item) {
          await removeFromWatchlist(item.id);
          setSaved(false);
        }
      } catch {}
    } else {
      try {
        const userId = await getCurrentUserId();
        if (userId) {
          await addToWatchlist({
            user_id: userId,
            symbol,
            name: name || symbol,
            notes: null,
          });
          setSaved(true);
        }
      } catch {}
    }
  }

  if (p.source === 'unavailable') {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{name || symbol}</h2>
          <button onClick={onBack} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            &larr; Back to results
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" />
          {p.rateLimitedNote || 'Price data unavailable.'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{name || symbol}</h2>
            <p className="text-sm text-[var(--muted)] mt-0.5">{symbol}</p>
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
              {p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isUp ? '+' : ''}{p.change.toFixed(2)} ({isUp ? '+' : ''}{p.changePct.toFixed(2)}%)
            </span>
          </div>
          <button
            onClick={handleToggleWatchlist}
            disabled={checkingWatchlist}
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

        {/* Staleness / last updated */}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]">
          <span>Updated {formatLastUpdated(p.fetchedAt)}</span>
          {p.isStale && (
            <span className="text-[var(--warning)]">· may be outdated</span>
          )}
          {p.rateLimitedNote && (
            <span className="text-[var(--warning)]">· {p.rateLimitedNote}</span>
          )}
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="px-6 py-5">
        <h3 className="text-sm font-semibold mb-3">Market Data</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Open" value={p.open > 0 ? p.open.toFixed(2) : '—'} />
          <Stat label="High" value={p.high > 0 ? p.high.toFixed(2) : '—'} />
          <Stat label="Low" value={p.low > 0 ? p.low.toFixed(2) : '—'} />
          <Stat label="Prev Close" value={p.previousClose > 0 ? p.previousClose.toFixed(2) : '—'} />
          <Stat label="Volume" value={p.volume > 0 ? p.volume.toLocaleString() : '—'} />
          <Stat label="Change" value={`${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}`} />
          <Stat label="Change %" value={`${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(2)}%`} />
          <Stat label="Source" value={p.isLive ? 'Live' : 'Cached'} />
        </div>
      </div>
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
