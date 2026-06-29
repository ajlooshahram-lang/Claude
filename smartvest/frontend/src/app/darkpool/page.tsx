'use client';

import { useState, useEffect } from 'react';
import {
  Eye, Loader2, AlertTriangle, RefreshCw, BarChart3, Info, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface BlockSignal { date: string; volume: number; avg_volume: number; multiple: number; price_change_pct: number; z_score: number; explanation: string; }
interface TrendDay { date: string; estimated_offex_pct: number; public_volume: number; }
interface Alert { severity: string; message: string; }
interface StockDP { symbol: string; name: string; price: number; estimated_offex_pct: number; short_interest_pct: number | null; avg_daily_volume: number; block_signals: BlockSignal[]; trend_30d: TrendDay[]; alert: Alert | null; has_alert: boolean; }
interface DPData { stocks_scanned: number; alerts_found: number; results: StockDP[]; explanation: string; data_note: string; }

function getWatchlist(): string[] {
  try { const s = localStorage.getItem('smartvest_watchlist'); if (!s) return ['AAPL','TSLA','NVDA','MSFT','AMZN','AMD','META','SPY']; const p = JSON.parse(s); return Array.isArray(p) ? p : p.map((x:any) => x.symbol||x); } catch { return ['AAPL','TSLA','NVDA','MSFT','AMZN']; }
}

export default function DarkPoolPage() {
  const [data, setData] = useState<DPData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { scan(); }, []);

  async function scan() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/darkpool/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: getWatchlist().slice(0, 10) }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-500/10">
            <Eye className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Off-Exchange Activity Monitor</h1>
            <p className="text-xs text-[var(--muted)]">Estimated dark pool volume · Block trade detection · 30-day trends</p>
          </div>
        </div>
        <button onClick={scan} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Explanation */}
      {data && (
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2"><Info className="h-4 w-4 text-slate-400" /><p className="text-xs font-semibold text-slate-400">What Are Dark Pools?</p></div>
          <p className="text-xs text-[var(--muted)] leading-relaxed">{data.explanation}</p>
          <p className="text-[9px] text-[var(--warning)] italic mt-2">{data.data_note}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Analyzing volume patterns...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          <div className="text-xs text-[var(--muted)]">{data.stocks_scanned} scanned · {data.alerts_found} alerts</div>

          {data.results.map(stock => (
            <div key={stock.symbol} className={`rounded-xl border bg-[var(--card)] overflow-hidden ${stock.has_alert ? 'border-[var(--warning)]/30' : 'border-[var(--card-border)]'}`}>
              <button onClick={() => setExpanded(expanded === stock.symbol ? null : stock.symbol)} className="w-full p-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {stock.has_alert && <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />}
                    <div>
                      <p className="text-sm font-bold">{stock.symbol}</p>
                      <p className="text-[10px] text-[var(--muted)]">{stock.name} · ${stock.price}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold font-tabular ${stock.estimated_offex_pct > 50 ? 'text-[var(--warning)]' : 'text-[var(--foreground)]'}`}>
                      ~{stock.estimated_offex_pct}% off-exchange
                    </p>
                    <p className="text-[9px] text-[var(--muted)]">{stock.block_signals.length} block signal{stock.block_signals.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </button>

              {expanded === stock.symbol && (
                <div className="border-t border-[var(--card-border)] p-4 space-y-4">
                  {/* Alert */}
                  {stock.alert && (
                    <div className={`rounded-lg border p-3 ${stock.alert.severity === 'high' ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' : 'border-[var(--primary)]/20 bg-[var(--primary)]/5'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className={`h-3.5 w-3.5 ${stock.alert.severity === 'high' ? 'text-[var(--warning)]' : 'text-[var(--primary)]'}`} />
                        <p className={`text-[10px] font-semibold ${stock.alert.severity === 'high' ? 'text-[var(--warning)]' : 'text-[var(--primary)]'}`}>
                          {stock.alert.severity === 'high' ? 'Elevated Off-Exchange Activity' : 'Activity Increasing'}
                        </p>
                      </div>
                      <p className="text-[10px] leading-relaxed">{stock.alert.message}</p>
                    </div>
                  )}

                  {/* Key Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                      <p className="text-[9px] text-[var(--muted)]">Est. Off-Exchange</p>
                      <p className="text-sm font-bold font-tabular">{stock.estimated_offex_pct}%</p>
                    </div>
                    <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                      <p className="text-[9px] text-[var(--muted)]">Short Interest</p>
                      <p className="text-sm font-bold font-tabular">{stock.short_interest_pct ? `${stock.short_interest_pct}%` : 'N/A'}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                      <p className="text-[9px] text-[var(--muted)]">Avg Volume</p>
                      <p className="text-sm font-bold font-tabular">{(stock.avg_daily_volume / 1_000_000).toFixed(1)}M</p>
                    </div>
                  </div>

                  {/* 30-day Trend Mini Chart */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-slate-400" /><p className="text-xs font-semibold">30-Day Off-Exchange Trend</p></div>
                    <div className="flex items-end gap-0.5 h-16">
                      {stock.trend_30d.map((day, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            className={`w-full rounded-t-sm ${day.estimated_offex_pct > 50 ? 'bg-[var(--warning)]' : 'bg-slate-500'}`}
                            style={{ height: `${Math.min(day.estimated_offex_pct * 1.3, 100)}%`, opacity: 0.4 + (day.estimated_offex_pct / 100) * 0.6 }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[8px] text-[var(--muted)]">
                      <span>30d ago</span><span>Today</span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="h-1.5 w-3 bg-[var(--warning)] rounded" /><span className="text-[8px] text-[var(--muted)]">&gt;50%</span>
                      <span className="h-1.5 w-3 bg-slate-500 rounded ml-2" /><span className="text-[8px] text-[var(--muted)]">Normal</span>
                    </div>
                  </div>

                  {/* Block Signals */}
                  {stock.block_signals.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold">Block Trade Signals (Volume Spikes)</p>
                      {stock.block_signals.map((sig, i) => (
                        <div key={i} className="rounded-lg border border-[var(--card-border)] p-3 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{sig.date}</span>
                            <span className="font-bold font-tabular text-[var(--warning)]">{sig.multiple}× normal volume</span>
                          </div>
                          <p className="text-[10px] text-[var(--muted)] leading-relaxed">{sig.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Off-exchange estimates based on volume patterns. Not actual FINRA ATS data. Not financial advice.
      </p>
    </div>
  );
}
