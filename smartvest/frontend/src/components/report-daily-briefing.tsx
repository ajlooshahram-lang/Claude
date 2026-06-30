'use client';

import {
  Sun, TrendingUp, TrendingDown, Calendar, AlertTriangle,
  Globe, Activity, Zap,
} from 'lucide-react';
import { DailyBriefing, MarketMove, WatchlistMover, EconomicEvent } from '@/lib/reporting-engine';

interface Props {
  report: DailyBriefing;
}

export function ReportDailyBriefing({ report }: Props) {
  return (
    <div className="space-y-6 report-content" id={`report-${report.meta.id}`}>
      {/* Header */}
      <div className="border-b border-[var(--card-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Sun className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Daily Morning Briefing</h2>
            <p className="text-xs text-[var(--muted)]">
              {new Date(report.meta.generatedAt).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })} &middot; Generated {new Date(report.meta.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>


      {/* Market Regime Banner */}
      <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
            Market Regime: {report.marketRegime}
          </span>
        </div>
        <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">
          {report.regimeSentence}
        </p>
      </div>

      {/* Overnight Market Moves */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Globe className="h-4 w-4 text-[var(--muted)]" />
          <h3 className="text-sm font-semibold">Overnight Market Moves</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-[var(--card-border)]">
          {report.overnightMoves.map((move) => (
            <MarketMoveCard key={move.index} move={move} />
          ))}
        </div>
      </div>


      {/* Watchlist Pre-Market Movers */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Watchlist Pre-Market Movers</h3>
        </div>
        <div className="divide-y divide-[var(--card-border)]">
          {report.watchlistMovers.map((mover) => (
            <WatchlistMoverRow key={mover.symbol} mover={mover} />
          ))}
        </div>
      </div>

      {/* Economic Calendar */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold">Economic Events Today</h3>
        </div>
        <div className="divide-y divide-[var(--card-border)]">
          {report.economicEvents.map((event, i) => (
            <EconomicEventRow key={i} event={event} />
          ))}
        </div>
      </div>


      {/* Key Risks */}
      {report.keyRisks.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--warning)]">
              Key Risks to Monitor
            </span>
          </div>
          <ul className="space-y-2">
            {report.keyRisks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--foreground)]/80">
                <span className="text-[var(--warning)] mt-0.5 font-bold">•</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MarketMoveCard({ move }: { move: MarketMove }) {
  const isPositive = move.changePct >= 0;
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider">
          {move.region}
        </span>
        {isPositive
          ? <TrendingUp className="h-3 w-3 text-[var(--gain)]" />
          : <TrendingDown className="h-3 w-3 text-[var(--loss)]" />
        }
      </div>
      <p className="text-[10px] font-semibold truncate">{move.index}</p>
      <p className="text-xs font-tabular font-bold mt-0.5">
        {move.close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </p>
      <p className={`text-[10px] font-tabular font-medium ${isPositive ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {isPositive ? '+' : ''}{move.changePct.toFixed(2)}%
      </p>
    </div>
  );
}


function WatchlistMoverRow({ mover }: { mover: WatchlistMover }) {
  const isPositive = mover.preMarketChangePct >= 0;
  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">{mover.symbol}</span>
          <span className="text-[10px] text-[var(--muted)] truncate">{mover.name}</span>
        </div>
        <p className="text-[10px] text-[var(--foreground)]/70 mt-0.5 leading-relaxed">
          {mover.catalyst}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-tabular font-bold">
          {mover.preMarketPrice.toLocaleString()} DKK
        </p>
        <p className={`text-[10px] font-tabular font-medium ${isPositive ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          {isPositive ? '+' : ''}{mover.preMarketChangePct.toFixed(2)}%
          <span className="text-[var(--muted)] ml-1">
            ({isPositive ? '+' : ''}{mover.preMarketChange.toFixed(0)})
          </span>
        </p>
      </div>
    </div>
  );
}

function EconomicEventRow({ event }: { event: EconomicEvent }) {
  const importanceColor = {
    high: 'bg-[var(--loss)]/20 text-[var(--loss)]',
    medium: 'bg-[var(--warning)]/20 text-[var(--warning)]',
    low: 'bg-[var(--muted)]/20 text-[var(--muted)]',
  }[event.importance];

  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div className="w-12 flex-shrink-0">
        <span className="text-xs font-tabular font-medium">{event.time}</span>
      </div>
      <div className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${importanceColor}`}>
        {event.importance}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{event.event}</p>
        <p className="text-[9px] text-[var(--muted)]">{event.country}</p>
      </div>
      <div className="text-right flex-shrink-0 text-[10px] font-tabular">
        {event.forecast && (
          <p>F: <span className="font-medium">{event.forecast}</span></p>
        )}
        {event.previous && (
          <p className="text-[var(--muted)]">P: {event.previous}</p>
        )}
      </div>
    </div>
  );
}
