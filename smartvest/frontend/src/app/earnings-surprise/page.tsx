'use client';

import { useState, useEffect } from 'react';
import {
  Flame, Loader2, TrendingUp, TrendingDown, RefreshCw,
  BarChart3, Info, Target, AlertTriangle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Signal { score: number; reasoning: string; weight: string; implied_move_pct?: number | null; beats?: number; total_quarters?: number; avg_surprise_pct?: number | null; }
interface Stock { symbol: string; name: string; price: number; surprise_score: number; overall_reasoning: string; signals: { revision_trend: Signal; implied_move: Signal; historical_beats: Signal; }; }
interface SurpriseData { stocks_analyzed: number; results: Stock[]; methodology: string; disclaimer: string; }

function getWatchlist(): string[] {
  try { const s = localStorage.getItem('smartvest_watchlist'); if (!s) return ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD']; const p = JSON.parse(s); return Array.isArray(p) ? p : p.map((x:any) => x.symbol || x); } catch { return ['AAPL','MSFT','NVDA','TSLA','AMZN']; }
}

export default function EarningsSurprisePage() {
  const [data, setData] = useState<SurpriseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { analyze(); }, []);

  async function analyze() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/earnings-surprise/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: getWatchlist().slice(0, 10) }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  function scoreColor(score: number) {
    if (score >= 70) return 'text-[var(--gain)]';
    if (score >= 50) return 'text-[var(--warning)]';
    return 'text-[var(--loss)]';
  }
  function scoreBg(score: number) {
    if (score >= 70) return 'border-[var(--gain)]/20 bg-[var(--gain)]/5';
    if (score >= 50) return 'border-[var(--warning)]/20 bg-[var(--warning)]/5';
    return 'border-[var(--loss)]/20 bg-[var(--loss)]/5';
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <Flame className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Earnings Surprise Predictor</h1>
            <p className="text-xs text-[var(--muted)]">Probability score based on 3 signals · Transparent reasoning</p>
          </div>
        </div>
        <button onClick={analyze} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          This model scores how likely a positive earnings surprise is based on three factors:
          <strong> historical beat rate</strong> (40%), <strong>analyst revision trend</strong> (35%),
          and <strong>options implied move</strong> (25%). A high score means the conditions statistically
          associated with beats are present — it is NOT a guarantee.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Analyzing signals...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          {data.results.map(stock => (
            <div key={stock.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <button onClick={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)} className="w-full p-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg border text-base font-bold ${scoreBg(stock.surprise_score)} ${scoreColor(stock.surprise_score)}`}>
                      {stock.surprise_score}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{stock.symbol}</p>
                      <p className="text-[10px] text-[var(--muted)]">{stock.name} · ${stock.price.toFixed(2)}</p>
                    </div>
                  </div>
                  <p className={`text-xs font-medium max-w-[200px] text-right ${scoreColor(stock.surprise_score)}`}>{stock.overall_reasoning}</p>
                </div>
              </button>

              {expanded === stock.symbol && (
                <div className="border-t border-[var(--card-border)] p-4 space-y-3">
                  {/* Three Signal Bars */}
                  {([
                    { label: 'Historical Beat Rate', key: 'historical_beats' as const, icon: <BarChart3 className="h-3.5 w-3.5" /> },
                    { label: 'Analyst Revision Trend', key: 'revision_trend' as const, icon: <TrendingUp className="h-3.5 w-3.5" /> },
                    { label: 'Options Implied Move', key: 'implied_move' as const, icon: <Target className="h-3.5 w-3.5" /> },
                  ]).map(({ label, key, icon }) => {
                    const signal = stock.signals[key];
                    return (
                      <div key={key} className="rounded-lg border border-[var(--card-border)] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={scoreColor(signal.score)}>{icon}</span>
                            <p className="text-xs font-medium">{label}</p>
                            <span className="text-[9px] text-[var(--muted)]">({signal.weight})</span>
                          </div>
                          <span className={`text-sm font-bold font-tabular ${scoreColor(signal.score)}`}>{signal.score}/100</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                          <div className={`h-full rounded-full ${signal.score >= 65 ? 'bg-[var(--gain)]' : signal.score >= 45 ? 'bg-[var(--warning)]' : 'bg-[var(--loss)]'}`}
                            style={{ width: `${signal.score}%` }} />
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed">{signal.reasoning}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="rounded-lg border border-[var(--card-border)] p-3">
            <p className="text-[9px] text-[var(--muted)] text-center">{data.disclaimer}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Earnings predictions are inherently uncertain. Use as one input among many. Not financial advice.
      </p>
    </div>
  );
}
