'use client';

import { useState } from 'react';
import {
  Layers, Search, Loader2, TrendingUp, TrendingDown,
  DollarSign, PieChart, BarChart3, ArrowLeftRight, Shield,
  AlertTriangle, Star, Info,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface ETFProfile {
  symbol: string;
  name: string;
  category: string;
  fund_family: string;
  description: string;
  expense_ratio: number | null;
  total_assets_formatted: string;
  dividend_yield: number | null;
  current_price: number | null;
  day_change_pct: number | null;
  return_1y: number | null;
  return_5y_annualized: number | null;
  top_holdings: { name: string; symbol: string; weight_pct: number }[];
  beginner_score: {
    total_score: number;
    label: string;
    rating: string;
    breakdown: Record<string, number>;
    explanations: string[];
  };
  currency: string;
}

interface SearchResult {
  symbol: string;
  name: string;
  category: string;
}

interface CompareData {
  etf_a: ETFProfile;
  etf_b: ETFProfile;
  insights: string[];
  recommendation: string;
}


export default function ETFPage() {
  const [tab, setTab] = useState<'explore' | 'compare'>('explore');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [profile, setProfile] = useState<ETFProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Compare state
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  async function searchETFs() {
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/etf/search/${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {}
    setSearchLoading(false);
  }

  async function loadProfile(symbol: string) {
    setLoading(true);
    setProfile(null);
    try {
      const res = await fetch(`${API_BASE}/api/etf/profile/${symbol}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch {}
    setLoading(false);
  }

  async function runCompare() {
    if (!compareA.trim() || !compareB.trim()) return;
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await fetch(`${API_BASE}/api/etf/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etf_a: compareA.trim().toUpperCase(), etf_b: compareB.trim().toUpperCase() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompareData(data);
      }
    } catch {}
    setCompareLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10">
          <Layers className="h-5 w-5 text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">ETF Explorer</h1>
          <p className="text-xs text-[var(--muted)]">
            Search, analyze, and compare Exchange-Traded Funds
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        <button
          onClick={() => setTab('explore')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'explore' ? 'bg-teal-500/20 text-teal-400' : 'text-[var(--muted)]'
          }`}
        >
          <Search className="inline h-4 w-4 mr-1.5" />Explore
        </button>
        <button
          onClick={() => setTab('compare')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'compare' ? 'bg-teal-500/20 text-teal-400' : 'text-[var(--muted)]'
          }`}
        >
          <ArrowLeftRight className="inline h-4 w-4 mr-1.5" />Compare
        </button>
      </div>


      {/* Explore Tab */}
      {tab === 'explore' && (
        <div className="space-y-5">
          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchETFs()}
              placeholder="Search by ticker or name (e.g. VOO, S&P 500, bond)..."
              className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-sm"
            />
            <button
              onClick={searchETFs}
              disabled={searchLoading}
              className="rounded-lg bg-teal-500 px-5 py-3 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </div>

          {/* Quick Picks */}
          <div className="flex gap-2 flex-wrap">
            {['VOO', 'QQQ', 'VTI', 'SCHD', 'AGG', 'VGT', 'ARKK', 'GLD'].map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); loadProfile(s); }}
                className="rounded-md px-3 py-1.5 text-xs border border-[var(--card-border)] text-[var(--muted)] hover:border-teal-500/50 hover:text-teal-400"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && !profile && (
            <div className="space-y-2">
              {searchResults.map(r => (
                <button
                  key={r.symbol}
                  onClick={() => loadProfile(r.symbol)}
                  className="w-full flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 hover:border-teal-500/30 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">{r.symbol}</p>
                    <p className="text-xs text-[var(--muted)]">{r.name}</p>
                  </div>
                  <span className="rounded-md bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-400">{r.category}</span>
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              <span className="ml-2 text-sm text-[var(--muted)]">Loading ETF data...</span>
            </div>
          )}

          {/* Profile Card */}
          {profile && !loading && <ETFProfileCard etf={profile} />}
        </div>
      )}


      {/* Compare Tab */}
      {tab === 'compare' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <p className="text-sm font-semibold">Compare Two ETFs</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={compareA}
                onChange={(e) => setCompareA(e.target.value.toUpperCase())}
                placeholder="ETF A (e.g. VOO)"
                className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                value={compareB}
                onChange={(e) => setCompareB(e.target.value.toUpperCase())}
                placeholder="ETF B (e.g. QQQ)"
                className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
            </div>
            <button
              onClick={runCompare}
              disabled={compareLoading || !compareA.trim() || !compareB.trim()}
              className="w-full rounded-xl bg-teal-500 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {compareLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Compare'}
            </button>
          </div>

          {compareData && (
            <div className="space-y-4">
              {/* Insights */}
              {compareData.insights.length > 0 && (
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-teal-400" />
                    <p className="text-sm font-semibold text-teal-400">Key Differences</p>
                  </div>
                  {compareData.insights.map((insight, i) => (
                    <p key={i} className="text-xs leading-relaxed">• {insight}</p>
                  ))}
                  <p className="text-xs font-medium text-[var(--foreground)] mt-2 pt-2 border-t border-teal-500/20">
                    {compareData.recommendation}
                  </p>
                </div>
              )}

              {/* Side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ETFProfileCard etf={compareData.etf_a} compact />
                <ETFProfileCard etf={compareData.etf_b} compact />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        ETF data from Yahoo Finance. Past performance does not guarantee future results. Not financial advice.
      </p>
    </div>
  );
}


// ─── ETF Profile Card Component ──────────────────────────────────────────────

function ETFProfileCard({ etf, compact = false }: { etf: ETFProfile; compact?: boolean }) {
  const score = etf.beginner_score;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold">{etf.symbol}</p>
            <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold ${
              score.rating === 'green' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' :
              score.rating === 'yellow' ? 'bg-[var(--warning)]/10 text-[var(--warning)]' :
              'bg-[var(--loss)]/10 text-[var(--loss)]'
            }`}>
              {score.total_score.toFixed(1)}/10
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">{etf.name}</p>
          <p className="text-[10px] text-[var(--muted)]">{etf.category} · {etf.fund_family}</p>
        </div>
        {etf.current_price && (
          <div className="text-right">
            <p className="text-lg font-bold font-tabular">${etf.current_price.toFixed(2)}</p>
            {etf.day_change_pct !== null && (
              <p className={`text-[10px] font-medium ${etf.day_change_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {etf.day_change_pct >= 0 ? '+' : ''}{etf.day_change_pct.toFixed(2)}% today
              </p>
            )}
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
          <p className="text-[9px] text-[var(--muted)]">Expense Ratio</p>
          <p className="text-xs font-bold font-tabular">
            {etf.expense_ratio !== null ? `${etf.expense_ratio.toFixed(2)}%` : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
          <p className="text-[9px] text-[var(--muted)]">AUM</p>
          <p className="text-xs font-bold font-tabular">{etf.total_assets_formatted}</p>
        </div>
        <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
          <p className="text-[9px] text-[var(--muted)]">1Y Return</p>
          <p className={`text-xs font-bold font-tabular ${(etf.return_1y || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {etf.return_1y !== null ? `${etf.return_1y >= 0 ? '+' : ''}${etf.return_1y.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
          <p className="text-[9px] text-[var(--muted)]">5Y Ann.</p>
          <p className={`text-xs font-bold font-tabular ${(etf.return_5y_annualized || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {etf.return_5y_annualized !== null ? `${etf.return_5y_annualized >= 0 ? '+' : ''}${etf.return_5y_annualized.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Dividend */}
      {etf.dividend_yield !== null && etf.dividend_yield > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/10 p-2.5">
          <DollarSign className="h-3.5 w-3.5 text-[var(--gain)]" />
          <p className="text-xs">
            Dividend Yield: <span className="font-bold text-[var(--gain)]">{etf.dividend_yield.toFixed(2)}%</span>
          </p>
        </div>
      )}

      {/* Beginner Score */}
      <div className={`rounded-lg border p-3 space-y-2 ${
        score.rating === 'green' ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5' :
        score.rating === 'yellow' ? 'border-[var(--warning)]/20 bg-[var(--warning)]/5' :
        'border-[var(--loss)]/20 bg-[var(--loss)]/5'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-teal-400" />
            <p className="text-xs font-semibold">Beginner Score</p>
          </div>
          <p className={`text-sm font-bold ${
            score.rating === 'green' ? 'text-[var(--gain)]' :
            score.rating === 'yellow' ? 'text-[var(--warning)]' :
            'text-[var(--loss)]'
          }`}>{score.total_score.toFixed(1)}/10 — {score.label}</p>
        </div>
        {!compact && score.explanations.length > 0 && (
          <div className="space-y-0.5">
            {score.explanations.map((exp, i) => (
              <p key={i} className="text-[10px] text-[var(--muted)]">• {exp}</p>
            ))}
          </div>
        )}
        {/* Score breakdown bar */}
        <div className="grid grid-cols-4 gap-1">
          {Object.entries(score.breakdown).map(([key, val]) => (
            <div key={key} className="text-center">
              <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden mb-0.5">
                <div className={`h-full rounded-full ${val >= 7 ? 'bg-[var(--gain)]' : val >= 4 ? 'bg-[var(--warning)]' : 'bg-[var(--loss)]'}`}
                  style={{ width: `${val * 10}%` }} />
              </div>
              <p className="text-[8px] text-[var(--muted)] capitalize">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Holdings */}
      {!compact && etf.top_holdings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-teal-400" />
            <p className="text-xs font-semibold">Top 10 Holdings</p>
          </div>
          <div className="space-y-1">
            {etf.top_holdings.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted)] w-4">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="font-medium">{h.name} {h.symbol && `(${h.symbol})`}</span>
                    <span className="text-[var(--muted)] font-tabular">{h.weight_pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(h.weight_pct * 3, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {!compact && etf.description && (
        <p className="text-[10px] text-[var(--muted)] leading-relaxed border-t border-[var(--card-border)] pt-3">
          {etf.description}
        </p>
      )}
    </div>
  );
}
