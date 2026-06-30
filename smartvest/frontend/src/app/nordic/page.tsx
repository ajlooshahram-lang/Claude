'use client';

import { useState, useEffect } from 'react';
import {
  Globe, TrendingUp, TrendingDown, Clock, Calendar,
  Activity, ChevronRight,
} from 'lucide-react';
import {
  getNordicOverview, NordicOverview, NordicExchange,
  EXCHANGE_INFO, formatLocalPrice, convertToDKK,
} from '@/lib/nordic-markets';

export default function NordicPage() {
  const [data, setData] = useState<NordicOverview | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<NordicExchange | 'all'>('all');

  useEffect(() => {
    setData(getNordicOverview());
  }, []);

  if (!data) return null;

  const filteredMovers = selectedExchange === 'all'
    ? Object.entries(data.topMovers)
    : [[selectedExchange, data.topMovers[selectedExchange as NordicExchange]]] as [string, typeof data.topMovers[NordicExchange]][];


  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-[var(--primary)]" />
          Nordic Markets
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Copenhagen &middot; Stockholm &middot; Helsinki &middot; Oslo &mdash; live overview
        </p>
      </div>

      {/* Market Status Bar */}
      <div className="grid grid-cols-4 gap-3">
        {data.marketStatus.map(ms => {
          const info = EXCHANGE_INFO[ms.exchange];
          return (
            <div key={ms.exchange} className={`rounded-xl border p-3 ${ms.isOpen ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{info.flag}</span>
                <span className="text-[10px] font-bold uppercase">{info.country}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${ms.isOpen ? 'bg-[var(--gain)] animate-pulse' : 'bg-[var(--muted)]'}`} />
                <span className="text-[10px] text-[var(--muted)]">
                  {ms.isOpen ? 'Open' : ms.reason || 'Closed'}
                </span>
              </div>
              <p className="text-[9px] text-[var(--muted)] mt-0.5">{info.openTime}–{info.closeTime} CET</p>
            </div>
          );
        })}
      </div>

      {/* Index Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.indices.map(idx => {
          const info = EXCHANGE_INFO[idx.exchange];
          const isPositive = idx.dayChangePct >= 0;
          return (
            <div key={idx.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{info.flag}</span>
                <span className="text-xs font-bold">{idx.symbol}</span>
              </div>
              <p className="text-lg font-bold font-tabular">{idx.currentValue.toLocaleString()}</p>
              <div className="flex items-center gap-1 mt-1">
                {isPositive ? <TrendingUp className="h-3 w-3 text-[var(--gain)]" /> : <TrendingDown className="h-3 w-3 text-[var(--loss)]" />}
                <span className={`text-xs font-tabular font-medium ${isPositive ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  {isPositive ? '+' : ''}{idx.dayChangePct.toFixed(2)}%
                </span>
              </div>
              <div className="flex gap-3 mt-2 text-[9px] text-[var(--muted)]">
                <span>W: {idx.weekChangePct >= 0 ? '+' : ''}{idx.weekChangePct}%</span>
                <span>M: {idx.monthChangePct >= 0 ? '+' : ''}{idx.monthChangePct}%</span>
                <span>YTD: {idx.ytdChangePct >= 0 ? '+' : ''}{idx.ytdChangePct}%</span>
              </div>
            </div>
          );
        })}
      </div>


      {/* Exchange Filter */}
      <div className="flex gap-2">
        <button onClick={() => setSelectedExchange('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium ${selectedExchange === 'all' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--card-border)] text-[var(--muted)]'}`}>All</button>
        {(Object.keys(EXCHANGE_INFO) as NordicExchange[]).map(ex => (
          <button key={ex} onClick={() => setSelectedExchange(ex)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium ${selectedExchange === ex ? 'bg-[var(--primary)] text-white' : 'border border-[var(--card-border)] text-[var(--muted)]'}`}>
            {EXCHANGE_INFO[ex].flag} {EXCHANGE_INFO[ex].country}
          </button>
        ))}
      </div>

      {/* Top Movers */}
      {(filteredMovers as [string, typeof data.topMovers[NordicExchange]][]).map(([ex, stocks]) => {
        const info = EXCHANGE_INFO[ex as NordicExchange];
        return (
          <div key={ex} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
              <span>{info.flag}</span>
              <h3 className="text-sm font-semibold">{info.name} — Top Movers</h3>
              <span className="text-[9px] text-[var(--muted)] ml-auto">{info.currency}</span>
            </div>
            <div className="divide-y divide-[var(--card-border)]">
              {stocks.map(stock => (
                <div key={stock.symbol} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{stock.symbol}</span>
                      <span className="text-[10px] text-[var(--muted)] truncate">{stock.name}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${stock.adjustedScore >= 70 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : stock.adjustedScore >= 50 ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>{stock.adjustedScore}/100</span>
                    </div>
                    <p className="text-[9px] text-[var(--muted)] mt-0.5">{stock.sector} &middot; Vol: {(stock.volume / 1000000).toFixed(1)}M</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold font-tabular">{formatLocalPrice(stock.currentPrice, stock.currency)}</p>
                    {stock.currency !== 'DKK' && <p className="text-[9px] text-[var(--muted)] font-tabular">≈ {stock.priceDKK.toFixed(1)} DKK</p>}
                  </div>
                  <div className={`text-right min-w-[60px] ${stock.dayChangePct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                    <p className="text-xs font-bold font-tabular">{stock.dayChangePct >= 0 ? '+' : ''}{stock.dayChangePct.toFixed(2)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Upcoming Holidays */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--muted)]" />
          <h3 className="text-sm font-semibold">Upcoming Market Closures</h3>
        </div>
        <div className="divide-y divide-[var(--card-border)]">
          {data.upcomingHolidays.map((h, i) => (
            <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-[11px]">
              <span className="font-tabular text-[var(--muted)] w-20">{new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span>{EXCHANGE_INFO[h.exchange].flag}</span>
              <span className="font-medium flex-1">{h.name}</span>
              <span className="text-[var(--muted)] italic">{h.nameLocal}</span>
              {h.halfDay && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--warning)]/10 text-[var(--warning)]">Half Day</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Scoring Explanation */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          Nordic Scoring Adjustments
        </h3>
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          Nordic large-caps like Novo Nordisk, Volvo, and Atlas Copco historically have lower volatility than US equivalents of similar size. Our beginner score adds +5 to +10 points for Danish/Swedish blue chips reflecting this stability. Conversely, Norwegian oil stocks and Finnish cyclicals receive a small penalty due to commodity-driven price swings. Small-cap Nordics get a -5 adjustment for lower liquidity.
        </p>
      </div>
    </div>
  );
}
