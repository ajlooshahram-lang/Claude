'use client';

import { useState, useEffect } from 'react';
import {
  Newspaper, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Loader2, RefreshCw, ThumbsUp, ThumbsDown, Meh, Zap,
  ArrowUpRight, ArrowDownRight, BarChart3,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrendDay {
  date: string;
  day_label: string;
  score: number;
  label: string;
}

interface Article {
  title: string;
  published: string;
  source: string;
  sentiment_score: number;
  sentiment_label: string;
  positive_words: string[];
  negative_words: string[];
}

interface StockSentiment {
  symbol: string;
  overall_score: number;
  overall_label: string;
  headline_count: number;
  trend_7d: TrendDay[];
  shift_detected: boolean;
  shift_description: string | null;
  top_headline: string | null;
}

interface ShiftAlert {
  symbol: string;
  description: string;
  current_score: number;
  current_label: string;
}

interface DetailData {
  symbol: string;
  overall_score: number;
  overall_label: string;
  headline_count: number;
  articles: Article[];
  top_drivers: Article[];
  trend_7d: TrendDay[];
  shift_detected: boolean;
  shift_description: string | null;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function getSentimentColor(label: string): string {
  switch (label) {
    case 'Positive': return 'text-[var(--gain)]';
    case 'Negative': return 'text-[var(--loss)]';
    default: return 'text-[var(--muted)]';
  }
}

function getSentimentBg(label: string): string {
  switch (label) {
    case 'Positive': return 'bg-[var(--gain)]/10 border-[var(--gain)]/20';
    case 'Negative': return 'bg-[var(--loss)]/10 border-[var(--loss)]/20';
    default: return 'bg-[var(--card)] border-[var(--card-border)]';
  }
}

function getSentimentIcon(label: string) {
  switch (label) {
    case 'Positive': return <ThumbsUp className="h-4 w-4 text-[var(--gain)]" />;
    case 'Negative': return <ThumbsDown className="h-4 w-4 text-[var(--loss)]" />;
    default: return <Meh className="h-4 w-4 text-[var(--muted)]" />;
  }
}

function getScoreBarWidth(score: number): number {
  return Math.round((score + 1) * 50); // -1 to 1 → 0% to 100%
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SentimentPage() {
  const [stocks, setStocks] = useState<StockSentiment[]>([]);
  const [shifts, setShifts] = useState<ShiftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadWatchlistSentiment();
  }, []);

  async function loadWatchlistSentiment() {
    setLoading(true);
    try {
      // Get watchlist from localStorage
      const stored = localStorage.getItem('smartvest_watchlist');
      let symbols: string[] = [];
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          symbols = Array.isArray(parsed) ? parsed : parsed.map((s: { symbol: string }) => s.symbol);
        } catch {
          symbols = [];
        }
      }

      // Fallback demo stocks if no watchlist
      if (symbols.length === 0) {
        symbols = ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'AMZN'];
      }

      const res = await fetch(`${API_BASE}/api/sentiment/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbols.slice(0, 10) }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStocks(data.stocks || []);
      setShifts(data.shift_alerts || []);
    } catch {
      setStocks([]);
    }
    setLoading(false);
  }

  async function loadDetail(symbol: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`${API_BASE}/api/sentiment/stock/${symbol}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
            <Newspaper className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Sentiment Analysis</h1>
            <p className="text-xs text-[var(--muted)]">
              News sentiment for your watchlist · Updated daily
            </p>
          </div>
        </div>
        <button
          onClick={loadWatchlistSentiment}
          disabled={loading}
          className="rounded-lg border border-[var(--card-border)] p-2 hover:bg-white/5"
        >
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Explainer */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          This engine analyzes news headlines for each stock on your watchlist. It scores them as
          Positive, Neutral, or Negative based on language patterns. Sentiment often moves <strong>before</strong> price —
          if everyone is writing negative articles about a stock you hold, that is an early warning signal.
        </p>
      </div>

      {/* Shift Alerts */}
      {shifts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--warning)]" />
            <p className="text-sm font-semibold text-[var(--warning)]">Dramatic Sentiment Shifts</p>
          </div>
          {shifts.map((shift) => (
            <div
              key={shift.symbol}
              className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
                <p className="text-sm font-semibold">{shift.symbol}</p>
                <span className={`text-xs font-medium ${getSentimentColor(shift.current_label)}`}>
                  {shift.current_label}
                </span>
              </div>
              <p className="text-xs text-[var(--foreground)] leading-relaxed">
                {shift.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          <span className="ml-3 text-sm text-[var(--muted)]">Analyzing headlines...</span>
        </div>
      )}

      {/* Stock Sentiment Cards */}
      {!loading && stocks.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Your Watchlist Sentiment</p>
          {stocks.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => loadDetail(stock.symbol)}
              className={`w-full text-left rounded-xl border p-4 transition-colors hover:border-cyan-500/30 ${getSentimentBg(stock.overall_label)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getSentimentIcon(stock.overall_label)}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{stock.symbol}</p>
                      {stock.shift_detected && (
                        <span className="rounded bg-[var(--warning)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">
                          SHIFT
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--muted)] line-clamp-1">
                      {stock.top_headline || 'No recent headlines'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${getSentimentColor(stock.overall_label)}`}>
                    {stock.overall_label}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">{stock.headline_count} headlines</p>
                </div>
              </div>

              {/* Mini 7-day trend bar */}
              {stock.trend_7d.length > 0 && (
                <div className="flex items-center gap-1 mt-3">
                  {stock.trend_7d.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={`w-full h-2 rounded-sm ${
                          day.label === 'Positive' ? 'bg-[var(--gain)]' :
                          day.label === 'Negative' ? 'bg-[var(--loss)]' :
                          'bg-[var(--muted)]/30'
                        }`}
                        style={{ opacity: 0.4 + Math.abs(day.score) * 0.6 }}
                      />
                      <span className="text-[8px] text-[var(--muted)]">{day.day_label}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No stocks */}
      {!loading && stocks.length === 0 && (
        <div className="text-center py-16">
          <Newspaper className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--muted)]">
            Add stocks to your watchlist to see sentiment analysis.
          </p>
        </div>
      )}

      {/* Detail View */}
      {detailLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Loading details...</span>
        </div>
      )}

      {detail && !detailLoading && (
        <div className="space-y-4 rounded-xl border border-cyan-500/20 bg-[var(--card)] p-5">
          {/* Detail Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{detail.symbol}</h2>
                {getSentimentIcon(detail.overall_label)}
                <span className={`text-sm font-semibold ${getSentimentColor(detail.overall_label)}`}>
                  {detail.overall_label}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">{detail.headline_count} headlines analyzed</p>
            </div>
            <button
              onClick={() => setDetail(null)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Close
            </button>
          </div>

          {/* Sentiment Score Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>Very Negative</span>
              <span>Neutral</span>
              <span>Very Positive</span>
            </div>
            <div className="h-3 rounded-full bg-gradient-to-r from-[var(--loss)] via-[var(--muted)]/20 to-[var(--gain)] relative">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white border-2 border-[var(--foreground)] shadow-lg"
                style={{ left: `${getScoreBarWidth(detail.overall_score)}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <p className="text-center text-xs font-tabular text-[var(--muted)]">
              Score: {detail.overall_score.toFixed(3)}
            </p>
          </div>

          {/* 7-Day Trend Chart */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <p className="text-sm font-semibold">7-Day Sentiment Trend</p>
            </div>
            <div className="flex items-end gap-1 h-24">
              {detail.trend_7d.map((day, i) => {
                const height = Math.max(10, Math.abs(day.score) * 100);
                const isPositive = day.score >= 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="flex-1 flex items-end w-full justify-center">
                      <div
                        className={`w-full max-w-[28px] rounded-t-md ${
                          isPositive ? 'bg-[var(--gain)]' : 'bg-[var(--loss)]'
                        }`}
                        style={{ height: `${height}%`, opacity: 0.5 + Math.abs(day.score) * 0.5 }}
                      />
                    </div>
                    <p className="text-[9px] text-[var(--muted)] mt-1">{day.day_label}</p>
                    <p className={`text-[8px] font-tabular ${isPositive ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      {day.score > 0 ? '+' : ''}{day.score.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shift Alert (if any) */}
          {detail.shift_detected && detail.shift_description && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-[var(--warning)]" />
                <p className="text-xs font-semibold text-[var(--warning)]">Sentiment Shift Detected</p>
              </div>
              <p className="text-xs leading-relaxed">{detail.shift_description}</p>
            </div>
          )}

          {/* Top 3 Driving Headlines */}
          {detail.top_drivers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Top Headlines Driving Sentiment</p>
              {detail.top_drivers.map((article, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${getSentimentBg(article.sentiment_label)}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">
                      {article.sentiment_label === 'Positive' ? '🟢' :
                       article.sentiment_label === 'Negative' ? '🔴' : '⚪'}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-medium leading-snug">{article.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[var(--muted)]">{article.source}</span>
                        <span className={`text-[10px] font-medium ${getSentimentColor(article.sentiment_label)}`}>
                          {article.sentiment_score > 0 ? '+' : ''}{article.sentiment_score.toFixed(2)}
                        </span>
                      </div>
                      {(article.positive_words.length > 0 || article.negative_words.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {article.positive_words.slice(0, 3).map((w) => (
                            <span key={w} className="rounded bg-[var(--gain)]/10 px-1.5 py-0.5 text-[9px] text-[var(--gain)]">
                              {w}
                            </span>
                          ))}
                          {article.negative_words.slice(0, 3).map((w) => (
                            <span key={w} className="rounded bg-[var(--loss)]/10 px-1.5 py-0.5 text-[9px] text-[var(--loss)]">
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All Headlines */}
          {detail.articles.length > 3 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">All Headlines ({detail.articles.length})</p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {detail.articles.slice(3).map((article, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] p-2.5">
                    <span className="text-xs">
                      {article.sentiment_label === 'Positive' ? '🟢' :
                       article.sentiment_label === 'Negative' ? '🔴' : '⚪'}
                    </span>
                    <p className="text-[11px] flex-1 line-clamp-1">{article.title}</p>
                    <span className={`text-[10px] font-tabular shrink-0 ${getSentimentColor(article.sentiment_label)}`}>
                      {article.sentiment_score > 0 ? '+' : ''}{article.sentiment_score.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Sentiment is based on keyword analysis of news headlines. It is not a buy or sell recommendation.
        Always do your own research.
      </p>
    </div>
  );
}
