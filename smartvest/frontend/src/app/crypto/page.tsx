'use client';

import { useState, useEffect } from 'react';
import {
  Coins, AlertTriangle, Loader2, TrendingUp, TrendingDown,
  Shield, Star, Bookmark, BookmarkCheck, RefreshCw, Info, XCircle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WATCHLIST_KEY = 'smartvest_crypto_watchlist';


interface Crypto {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_1h: number | null;
  price_change_24h: number | null;
  price_change_7d: number | null;
  price_change_30d: number | null;
  ath: number | null;
  ath_change_pct: number | null;
  beginner_score: {
    total_score: number;
    label: string;
    rating: string;
    breakdown: Record<string, number>;
    explanations: string[];
  };
}

function getCryptoWatchlist(): string[] {
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveCryptoWatchlist(list: string[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

function getRiskProfile(): string {
  try {
    const stored = localStorage.getItem('smartvest_profile');
    if (!stored) return 'Moderate';
    return JSON.parse(stored).riskProfile || 'Moderate';
  } catch { return 'Moderate'; }
}

function formatMarketCap(mcap: number): string {
  if (mcap >= 1_000_000_000_000) return `$${(mcap / 1_000_000_000_000).toFixed(1)}T`;
  if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(1)}B`;
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(0)}M`;
  return `$${mcap.toLocaleString()}`;
}


export default function CryptoPage() {
  const [cryptos, setCryptos] = useState<Crypto[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [tab, setTab] = useState<'all' | 'watchlist'>('all');
  const [showConservativeWarning, setShowConservativeWarning] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const riskProfile = getRiskProfile();
  const isConservative = riskProfile === 'Conservative';

  useEffect(() => {
    setWatchlist(getCryptoWatchlist());
    loadCryptos();
  }, []);

  async function loadCryptos() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/crypto/top`);
      if (res.ok) {
        const data = await res.json();
        setCryptos(data.cryptos || []);
      }
    } catch {}
    setLoading(false);
  }

  function toggleWatchlist(id: string) {
    if (isConservative && !watchlist.includes(id)) {
      setPendingAdd(id);
      setShowConservativeWarning(true);
      return;
    }
    doToggle(id);
  }

  function doToggle(id: string) {
    const updated = watchlist.includes(id)
      ? watchlist.filter(w => w !== id)
      : [...watchlist, id];
    setWatchlist(updated);
    saveCryptoWatchlist(updated);
    setShowConservativeWarning(false);
    setPendingAdd(null);
  }

  function confirmConservativeAdd() {
    if (pendingAdd) doToggle(pendingAdd);
  }

  const displayCryptos = tab === 'watchlist'
    ? cryptos.filter(c => watchlist.includes(c.id))
    : cryptos;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
            <Coins className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Cryptocurrency</h1>
            <p className="text-xs text-[var(--muted)]">
              Top 20 by market cap · Live prices · Beginner scores
            </p>
          </div>
        </div>
        <button onClick={loadCryptos} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* PERMANENT VOLATILITY WARNING */}
      <div className="rounded-xl border-2 border-[var(--loss)]/50 bg-[var(--loss)]/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-[var(--loss)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[var(--loss)]">Crypto Risk Warning</p>
            <p className="text-xs text-[var(--foreground)] mt-1 leading-relaxed">
              Cryptocurrencies are <strong>significantly more volatile</strong> than stocks. They can lose
              50% or more of their value in days. They have no earnings, no dividends, and no intrinsic value floor.
              They are <strong>NOT suitable for Conservative risk profiles</strong>. Only invest money you can afford to lose completely.
            </p>
          </div>
        </div>
      </div>

      {/* Conservative Profile Additional Warning */}
      {isConservative && (
        <div className="rounded-xl border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-[var(--warning)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--warning)]">Your Profile: Conservative</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Based on your risk profile, cryptocurrencies are NOT recommended for you.
                You can browse for education but adding to your watchlist requires explicit confirmation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Conservative Confirmation Modal */}
      {showConservativeWarning && (
        <div className="rounded-xl border-2 border-[var(--loss)]/50 bg-[var(--card)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-[var(--loss)]" />
            <p className="text-sm font-bold text-[var(--loss)]">Are You Sure?</p>
          </div>
          <p className="text-xs leading-relaxed">
            Your risk profile is <strong>Conservative</strong>. Cryptocurrency does not match your profile.
            Adding it to your watchlist does not mean you should buy it. Do you understand the risks and still want to track this coin?
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmConservativeAdd}
              className="rounded-lg bg-[var(--loss)] px-4 py-2 text-xs font-semibold text-white"
            >
              I Understand the Risk — Add Anyway
            </button>
            <button
              onClick={() => { setShowConservativeWarning(false); setPendingAdd(null); }}
              className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}


      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        <button
          onClick={() => setTab('all')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'all' ? 'bg-yellow-500/20 text-yellow-400' : 'text-[var(--muted)]'
          }`}
        >Top 20</button>
        <button
          onClick={() => setTab('watchlist')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'watchlist' ? 'bg-yellow-500/20 text-yellow-400' : 'text-[var(--muted)]'
          }`}
        >My Watchlist ({watchlist.length})</button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Loading live prices...</span>
        </div>
      )}

      {/* Crypto Cards */}
      {!loading && displayCryptos.length > 0 && (
        <div className="space-y-3">
          {displayCryptos.map(crypto => {
            const isWatched = watchlist.includes(crypto.id);
            const isExpanded = expanded === crypto.id;
            const score = crypto.beginner_score;

            return (
              <div key={crypto.id} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : crypto.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10 text-xs font-bold text-yellow-400">
                        #{crypto.market_cap_rank}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">{crypto.symbol}</p>
                          <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${
                            score.rating === 'yellow' ? 'bg-[var(--warning)]/10 text-[var(--warning)]' :
                            'bg-[var(--loss)]/10 text-[var(--loss)]'
                          }`}>{score.total_score.toFixed(1)}/10</span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)]">{crypto.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-tabular">
                        ${crypto.current_price >= 1 ? crypto.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : crypto.current_price.toFixed(6)}
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        {crypto.price_change_24h !== null && (
                          <span className={`text-[10px] font-medium font-tabular ${crypto.price_change_24h >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                            {crypto.price_change_24h >= 0 ? '+' : ''}{crypto.price_change_24h.toFixed(1)}% 24h
                          </span>
                        )}
                        {crypto.price_change_7d !== null && (
                          <span className={`text-[10px] font-tabular ${crypto.price_change_7d >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                            {crypto.price_change_7d >= 0 ? '+' : ''}{crypto.price_change_7d.toFixed(1)}% 7d
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-[var(--card-border)] p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-[var(--background)] p-2 text-center">
                        <p className="text-[9px] text-[var(--muted)]">Market Cap</p>
                        <p className="text-xs font-bold font-tabular">{formatMarketCap(crypto.market_cap)}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--background)] p-2 text-center">
                        <p className="text-[9px] text-[var(--muted)]">24h Volume</p>
                        <p className="text-xs font-bold font-tabular">{formatMarketCap(crypto.total_volume)}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--background)] p-2 text-center">
                        <p className="text-[9px] text-[var(--muted)]">From ATH</p>
                        <p className="text-xs font-bold font-tabular text-[var(--loss)]">
                          {crypto.ath_change_pct ? `${crypto.ath_change_pct.toFixed(0)}%` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className={`rounded-lg border p-3 ${
                      score.rating === 'yellow' ? 'border-[var(--warning)]/20 bg-[var(--warning)]/5' : 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold">{score.label}</p>
                        <p className="text-xs font-bold">{score.total_score.toFixed(1)}/10</p>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mb-2">
                        {Object.entries(score.breakdown).map(([k, v]) => (
                          <div key={k} className="text-center">
                            <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden mb-0.5">
                              <div className={`h-full rounded-full ${v >= 6 ? 'bg-[var(--warning)]' : 'bg-[var(--loss)]'}`}
                                style={{ width: `${v * 10}%` }} />
                            </div>
                            <p className="text-[7px] text-[var(--muted)] capitalize">{k.replace('_', ' ')}</p>
                          </div>
                        ))}
                      </div>
                      {score.explanations.length > 0 && (
                        <div className="space-y-0.5">
                          {score.explanations.map((e, i) => (
                            <p key={i} className="text-[9px] text-[var(--muted)]">• {e}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Watchlist toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(crypto.id); }}
                      className={`w-full rounded-lg py-2.5 text-xs font-medium border ${
                        isWatched
                          ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                          : 'border-[var(--card-border)] text-[var(--muted)] hover:text-yellow-400'
                      }`}
                    >
                      {isWatched ? (
                        <><BookmarkCheck className="inline h-3.5 w-3.5 mr-1.5" />On Watchlist — Remove</>
                      ) : (
                        <><Bookmark className="inline h-3.5 w-3.5 mr-1.5" />Add to Crypto Watchlist</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty watchlist */}
      {!loading && tab === 'watchlist' && displayCryptos.length === 0 && (
        <div className="text-center py-16">
          <Coins className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
          <p className="text-sm text-[var(--muted)]">Your crypto watchlist is empty.</p>
          <button onClick={() => setTab('all')} className="mt-3 text-xs text-yellow-400 hover:underline">
            Browse Top 20
          </button>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Prices from CoinGecko. Not financial advice. Crypto is highly speculative.
      </p>
    </div>
  );
}
