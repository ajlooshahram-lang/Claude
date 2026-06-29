'use client';

import { useState, useEffect } from 'react';
import {
  Activity, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  RefreshCw, ArrowUpRight, ArrowDownRight, Zap, Info,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Signal { type: string; strike: number; expiry: string; volume: number; open_interest: number; vol_oi_ratio: number; premium_usd: number; implied_vol: number; is_otm: boolean; contradicts_trend: boolean; signal_strength: string; explanation: string; }
interface StockFlow { symbol: string; name: string; price: number; trend: string; put_call_ratio: number; options_sentiment: string; sentiment_explanation: string; total_call_volume: number; total_put_volume: number; unusual_signals: Signal[]; has_contradiction: boolean; signal_count: number; }
interface FlowData { stocks_scanned: number; stocks_with_signals: number; results: StockFlow[]; disclaimer: string; }

function getWatchlist(): string[] {
  try {
    const stored = localStorage.getItem('smartvest_watchlist');
    if (!stored) return ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'AMD', 'SPY'];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : parsed.map((s: any) => s.symbol || s);
  } catch { return ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN']; }
}

function formatPremium(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}


export default function OptionsFlowPage() {
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { scan(); }, []);

  async function scan() {
    setLoading(true);
    const symbols = getWatchlist();
    try {
      const res = await fetch(`${API_BASE}/api/options-flow/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbols.slice(0, 10) }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
            <Activity className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Options Activity Scanner</h1>
            <p className="text-xs text-[var(--muted)]">Unusual volume · Put/Call ratios · Trend contradictions</p>
          </div>
        </div>
        <button onClick={scan} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          This scanner detects <strong>unusual options activity</strong> — when today's volume on a specific contract
          is 3× or more above its open interest, it means new money is flowing into that position.
          When this contradicts the stock's current trend, pay attention — it often signals that
          someone with information is positioning for a move.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-red-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Scanning options chains...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            <span>{data.stocks_scanned} stocks scanned</span>
            <span>{data.stocks_with_signals} with unusual activity</span>
          </div>

          {/* Stock Cards */}
          {data.results.map(stock => (
            <div key={stock.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <button onClick={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)}
                className="w-full p-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${stock.has_contradiction ? 'bg-[var(--warning)] animate-pulse' : stock.signal_count > 0 ? 'bg-red-400' : 'bg-[var(--muted)]/30'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{stock.symbol}</p>
                        {stock.has_contradiction && (
                          <span className="rounded bg-[var(--warning)]/20 px-1.5 py-0.5 text-[8px] font-bold text-[var(--warning)]">CONTRADICTION</span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--muted)]">{stock.name} · ${stock.price.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${
                      stock.options_sentiment.includes('Bullish') ? 'text-[var(--gain)]' :
                      stock.options_sentiment.includes('Bearish') ? 'text-[var(--loss)]' : 'text-[var(--muted)]'
                    }`}>{stock.options_sentiment}</p>
                    <p className="text-[10px] text-[var(--muted)]">P/C: {stock.put_call_ratio} · {stock.signal_count} signals</p>
                  </div>
                </div>
              </button>

              {expanded === stock.symbol && (
                <div className="border-t border-[var(--card-border)] p-4 space-y-4">
                  {/* Sentiment bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--background)] overflow-hidden flex">
                      <div className="bg-[var(--gain)] h-full" style={{ width: `${(stock.total_call_volume / (stock.total_call_volume + stock.total_put_volume + 1)) * 100}%` }} />
                      <div className="bg-[var(--loss)] h-full" style={{ width: `${(stock.total_put_volume / (stock.total_call_volume + stock.total_put_volume + 1)) * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-[var(--muted)]">{stock.total_call_volume.toLocaleString()} calls / {stock.total_put_volume.toLocaleString()} puts</span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">{stock.sentiment_explanation}</p>

                  {/* Unusual signals */}
                  {stock.unusual_signals.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold">Unusual Activity</p>
                      {stock.unusual_signals.map((sig, i) => (
                        <div key={i} className={`rounded-lg border p-3 space-y-1.5 ${
                          sig.contradicts_trend ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' :
                          sig.type === 'call' ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5' :
                          'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {sig.type === 'call' ? (
                                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--gain)]" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5 text-[var(--loss)]" />
                              )}
                              <span className={`text-xs font-bold ${sig.type === 'call' ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                                {sig.type.toUpperCase()} ${sig.strike}
                              </span>
                              <span className="text-[9px] text-[var(--muted)]">exp {sig.expiry}</span>
                              {sig.contradicts_trend && <AlertTriangle className="h-3 w-3 text-[var(--warning)]" />}
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold font-tabular">{formatPremium(sig.premium_usd)}</p>
                              <p className="text-[8px] text-[var(--muted)]">{sig.vol_oi_ratio}× vol/OI</p>
                            </div>
                          </div>
                          <div className="flex gap-3 text-[9px] text-[var(--muted)]">
                            <span>Vol: {sig.volume.toLocaleString()}</span>
                            <span>OI: {sig.open_interest.toLocaleString()}</span>
                            <span>IV: {sig.implied_vol}%</span>
                            <span className={`font-medium ${sig.signal_strength === 'strong' ? 'text-red-400' : 'text-[var(--warning)]'}`}>
                              {sig.signal_strength}
                            </span>
                          </div>
                          <p className="text-[10px] leading-relaxed">{sig.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {stock.unusual_signals.length === 0 && (
                    <p className="text-xs text-[var(--muted)] text-center py-4">No unusual activity detected today.</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Disclaimer */}
          <div className="rounded-lg border border-[var(--card-border)] p-3">
            <p className="text-[9px] text-[var(--muted)] text-center leading-relaxed">{data.disclaimer}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Options data from Yahoo Finance. Does not include real-time sweep/block data (paid feeds only). Not financial advice.
      </p>
    </div>
  );
}
