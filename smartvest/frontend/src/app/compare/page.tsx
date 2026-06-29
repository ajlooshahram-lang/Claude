'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, Loader2, AlertCircle, TrendingUp, TrendingDown,
  Minus, Search, Sparkles,
} from 'lucide-react';
import { getWatchlist, WatchlistItem } from '@/lib/watchlist';
import { getProfile, RiskProfile } from '@/lib/profile';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockData {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  dayChangePct: number;
  sector: string;
  country: string;
  beta: number | null;
  volatility: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  // Score
  score: number | null;
  scoreLabel: string | null;
  safetyScore: number | null;
  valueScore: number | null;
  momentumScore: number | null;
  // Trend
  trendDirection: 'up' | 'down' | 'flat' | null;
  trendPct: number | null;
  // Beginner
  beginnerRating: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [profile, setProfile] = useState<RiskProfile>('Moderate');
  const [symbolA, setSymbolA] = useState('');
  const [symbolB, setSymbolB] = useState('');
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [stockA, setStockA] = useState<StockData | null>(null);
  const [stockB, setStockB] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWatchlist(getWatchlist());
    const p = getProfile();
    if (p) setProfile(p.riskProfile);
  }, []);

  const fetchStock = useCallback(async (symbol: string): Promise<StockData | null> => {
    try {
      const [profileRes, scoreRes, trendRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/profile/${symbol}`, { signal: AbortSignal.timeout(15000) }),
        fetch(`${API_BASE}/api/score/${symbol}`, { signal: AbortSignal.timeout(20000) }),
        fetch(`${API_BASE}/api/trend/${symbol}`, { signal: AbortSignal.timeout(10000) }),
      ]);

      const profileData = profileRes.status === 'fulfilled' && profileRes.value.ok
        ? await profileRes.value.json() : null;
      const scoreData = scoreRes.status === 'fulfilled' && scoreRes.value.ok
        ? await scoreRes.value.json() : null;
      const trendData = trendRes.status === 'fulfilled' && trendRes.value.ok
        ? await trendRes.value.json() : null;

      if (!profileData) return null;

      // Beginner rating
      const vol = profileData.annualized_volatility;
      const beta = profileData.beta;
      let beginnerRating = 'Intermediate';
      if (vol && vol * 100 < 25 && (!beta || beta < 1.0)) beginnerRating = 'Beginner Friendly';
      else if (vol && vol * 100 > 40 || (beta && beta > 1.5)) beginnerRating = 'Risky';

      return {
        symbol,
        name: profileData.name || symbol,
        price: profileData.current_price,
        currency: profileData.currency || 'USD',
        dayChangePct: profileData.day_change_pct || 0,
        sector: profileData.sector || 'Unknown',
        country: profileData.country || 'Unknown',
        beta: profileData.beta,
        volatility: profileData.annualized_volatility,
        peRatio: profileData.pe_ratio,
        dividendYield: profileData.dividend_yield,
        marketCap: profileData.market_cap,
        score: scoreData?.total_score || null,
        scoreLabel: scoreData?.label || null,
        safetyScore: scoreData?.breakdown?.safety?.score || null,
        valueScore: scoreData?.breakdown?.value?.score || null,
        momentumScore: scoreData?.breakdown?.momentum?.score || null,
        trendDirection: trendData?.direction || null,
        trendPct: trendData?.change_pct || null,
        beginnerRating,
      };
    } catch {
      return null;
    }
  }, []);

  async function handleCompare() {
    const sA = symbolA || searchA.trim().toUpperCase();
    const sB = symbolB || searchB.trim().toUpperCase();
    if (!sA || !sB) { setError('Please select or type two stock symbols.'); return; }
    if (sA === sB) { setError('Pick two different stocks to compare.'); return; }

    setLoading(true);
    setError(null);
    setStockA(null);
    setStockB(null);

    const [a, b] = await Promise.all([fetchStock(sA), fetchStock(sB)]);

    if (!a) setError(`Could not load data for ${sA}. Check the symbol and try again.`);
    else if (!b) setError(`Could not load data for ${sB}. Check the symbol and try again.`);

    setStockA(a);
    setStockB(b);
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-[var(--primary)]" />
          Compare Stocks
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pick two stocks to see them side by side
        </p>
      </div>

      {/* Stock Pickers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StockPicker
          label="Stock A"
          watchlist={watchlist}
          selectedSymbol={symbolA}
          onSelect={setSymbolA}
          searchValue={searchA}
          onSearchChange={setSearchA}
        />
        <StockPicker
          label="Stock B"
          watchlist={watchlist}
          selectedSymbol={symbolB}
          onSelect={setSymbolB}
          searchValue={searchB}
          onSearchChange={setSearchB}
        />
      </div>

      {/* Compare button */}
      <button
        onClick={handleCompare}
        disabled={loading || (!symbolA && !searchA.trim()) || (!symbolB && !searchB.trim())}
        className="w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
        {loading ? 'Comparing...' : 'Compare'}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Results */}
      {stockA && stockB && !loading && (
        <ComparisonResult stockA={stockA} stockB={stockB} profile={profile} />
      )}
    </div>
  );
}


// ─── Stock Picker ────────────────────────────────────────────────────────────

function StockPicker({ label, watchlist, selectedSymbol, onSelect, searchValue, onSearchChange }: {
  label: string;
  watchlist: WatchlistItem[];
  selectedSymbol: string;
  onSelect: (s: string) => void;
  searchValue: string;
  onSearchChange: (s: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="text-xs font-medium text-[var(--muted)] mb-2">{label}</p>

      {/* From watchlist */}
      {watchlist.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {watchlist.map((item) => (
            <button
              key={item.symbol}
              onClick={() => { onSelect(item.symbol); onSearchChange(''); }}
              className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors ${
                selectedSymbol === item.symbol
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)]/50'
              }`}
            >
              {item.symbol}
            </button>
          ))}
        </div>
      )}

      {/* Or type a symbol */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2">
        <Search className="h-3.5 w-3.5 text-[var(--muted)]" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => { onSearchChange(e.target.value); onSelect(''); }}
          placeholder="Or type a symbol (e.g. MSFT)"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--muted)]"
        />
      </div>
    </div>
  );
}


// ─── Comparison Result ───────────────────────────────────────────────────────

function ComparisonResult({ stockA, stockB, profile }: {
  stockA: StockData; stockB: StockData; profile: RiskProfile;
}) {
  const verdict = generateVerdict(stockA, stockB, profile);

  return (
    <div className="space-y-4">
      {/* Side by side cards */}
      <div className="grid grid-cols-2 gap-4">
        <CompareCard stock={stockA} />
        <CompareCard stock={stockB} />
      </div>

      {/* Metrics comparison table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="divide-y divide-[var(--card-border)]">
          <MetricRow label="Score" a={stockA.score ? `${stockA.score}/10` : '—'} b={stockB.score ? `${stockB.score}/10` : '—'} winA={(stockA.score || 0) > (stockB.score || 0)} />
          <MetricRow label="Safety" a={stockA.safetyScore ? `${stockA.safetyScore}/10` : '—'} b={stockB.safetyScore ? `${stockB.safetyScore}/10` : '—'} winA={(stockA.safetyScore || 0) > (stockB.safetyScore || 0)} />
          <MetricRow label="Value" a={stockA.valueScore ? `${stockA.valueScore}/10` : '—'} b={stockB.valueScore ? `${stockB.valueScore}/10` : '—'} winA={(stockA.valueScore || 0) > (stockB.valueScore || 0)} />
          <MetricRow label="Momentum" a={stockA.momentumScore ? `${stockA.momentumScore}/10` : '—'} b={stockB.momentumScore ? `${stockB.momentumScore}/10` : '—'} winA={(stockA.momentumScore || 0) > (stockB.momentumScore || 0)} />
          <MetricRow label="Beta" a={stockA.beta ? stockA.beta.toFixed(2) : '—'} b={stockB.beta ? stockB.beta.toFixed(2) : '—'} winA={(stockA.beta || 1) < (stockB.beta || 1)} />
          <MetricRow label="P/E Ratio" a={stockA.peRatio ? stockA.peRatio.toFixed(1) : '—'} b={stockB.peRatio ? stockB.peRatio.toFixed(1) : '—'} winA={(stockA.peRatio || 99) < (stockB.peRatio || 99)} />
          <MetricRow label="Dividend" a={stockA.dividendYield ? `${(stockA.dividendYield * 100).toFixed(1)}%` : '—'} b={stockB.dividendYield ? `${(stockB.dividendYield * 100).toFixed(1)}%` : '—'} winA={(stockA.dividendYield || 0) > (stockB.dividendYield || 0)} />
        </div>
      </div>

      {/* AI Verdict */}
      <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-[var(--primary)] mb-1">
              For your {profile} profile:
            </p>
            <p className="text-xs leading-relaxed text-[var(--foreground)]/80">
              {verdict}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareCard({ stock }: { stock: StockData }) {
  const tl = { up: '🟢', down: '🔴', flat: '🟡' };
  const brConfig: Record<string, { emoji: string; color: string }> = {
    'Beginner Friendly': { emoji: '🟢', color: 'text-[var(--gain)]' },
    'Intermediate': { emoji: '🟡', color: 'text-[var(--warning)]' },
    'Risky': { emoji: '🔴', color: 'text-[var(--loss)]' },
  };
  const br = brConfig[stock.beginnerRating] || brConfig['Intermediate'];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="font-semibold text-sm">{stock.symbol}</p>
      <p className="text-[10px] text-[var(--muted)] truncate">{stock.name}</p>

      {/* Price */}
      <p className="text-xl font-bold font-tabular mt-2">
        {stock.currency} {stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className={`text-[11px] font-medium ${stock.dayChangePct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {stock.dayChangePct >= 0 ? '+' : ''}{stock.dayChangePct.toFixed(2)}% today
      </p>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {/* Score */}
        {stock.score && (
          <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
            stock.score >= 7 ? 'border-[var(--gain)]/30 text-[var(--gain)]' :
            stock.score >= 5 ? 'border-[var(--primary)]/30 text-[var(--primary)]' :
            'border-[var(--warning)]/30 text-[var(--warning)]'
          }`}>
            {stock.score}/10
          </span>
        )}
        {/* Beginner */}
        <span className={`text-[10px] font-medium ${br.color}`}>
          {br.emoji} {stock.beginnerRating}
        </span>
      </div>

      {/* Traffic light + trend */}
      {stock.trendDirection && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span>{tl[stock.trendDirection] || '🟡'}</span>
          <span className="text-[var(--muted)]">
            {stock.trendPct !== null ? `${stock.trendPct >= 0 ? '+' : ''}${stock.trendPct.toFixed(1)}% (14d)` : ''}
          </span>
        </div>
      )}

      {/* Sector */}
      <p className="text-[10px] text-[var(--muted)] mt-2">{stock.sector} · {stock.country}</p>
    </div>
  );
}

function MetricRow({ label, a, b, winA }: { label: string; a: string; b: string; winA: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2.5 items-center text-xs">
      <span className={`font-tabular text-right ${winA ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted)]'}`}>{a}</span>
      <span className="text-center text-[10px] text-[var(--muted)]">{label}</span>
      <span className={`font-tabular text-left ${!winA ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted)]'}`}>{b}</span>
    </div>
  );
}


// ─── AI Verdict Generator ────────────────────────────────────────────────────

function generateVerdict(a: StockData, b: StockData, profile: RiskProfile): string {
  const scoreA = a.score || 5;
  const scoreB = b.score || 5;
  const safeA = a.safetyScore || 5;
  const safeB = b.safetyScore || 5;
  const momA = a.momentumScore || 5;
  const momB = b.momentumScore || 5;

  let winner: StockData;
  let reason: string;

  if (profile === 'Conservative') {
    // Conservative cares most about safety
    if (safeA > safeB + 1) {
      winner = a;
      reason = `${a.name} has a significantly higher safety score (${safeA}/10 vs ${safeB}/10), meaning lower volatility and more predictable price movements — exactly what a conservative investor needs.`;
    } else if (safeB > safeA + 1) {
      winner = b;
      reason = `${b.name} scores higher on safety (${safeB}/10 vs ${safeA}/10) with less price volatility, making it more suitable if protecting your capital is your top priority.`;
    } else {
      // Similar safety — use overall score
      winner = scoreA >= scoreB ? a : b;
      reason = `Both stocks have similar safety profiles. ${winner.name} edges ahead with an overall score of ${winner.score}/10, offering a slightly better balance of safety and value.`;
    }
  } else if (profile === 'Growth') {
    // Growth cares most about momentum and upside
    if (momA > momB + 1) {
      winner = a;
      reason = `${a.name} has stronger momentum right now (${momA}/10 vs ${momB}/10), meaning the price trend is more favorable — important for growth-oriented investors looking for stocks with wind at their backs.`;
    } else if (momB > momA + 1) {
      winner = b;
      reason = `${b.name} shows stronger recent momentum (${momB}/10 vs ${momA}/10), indicating more buying pressure — a signal that growth investors typically want to see.`;
    } else {
      winner = scoreA >= scoreB ? a : b;
      reason = `Both have similar momentum. ${winner.name} wins on overall quality (${winner.score}/10), giving you growth potential backed by solid fundamentals.`;
    }
  } else {
    // Moderate — balanced view
    if (scoreA > scoreB + 0.5) {
      winner = a;
      reason = `${a.name} scores ${scoreA}/10 overall vs ${scoreB}/10 for ${b.name}, offering a better balance of safety, value, and momentum — a solid all-around pick for a balanced investor.`;
    } else if (scoreB > scoreA + 0.5) {
      winner = b;
      reason = `${b.name} scores ${scoreB}/10 vs ${scoreA}/10 for ${a.name}, making it the stronger pick across all three dimensions — safety, value, and momentum combined.`;
    } else {
      reason = `These two stocks are very close in overall quality (${scoreA}/10 vs ${scoreB}/10). Consider which sector you're less exposed to in your portfolio — diversification might be the tiebreaker here.`;
      return reason;
    }
  }

  return reason;
}
