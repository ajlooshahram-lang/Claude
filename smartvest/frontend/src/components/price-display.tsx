'use client';

/**
 * PriceDisplay Component
 *
 * Shows a stock price with:
 * - "Last updated" timestamp
 * - Stale indicator if >15 min old
 * - Rate limit warning if can't refresh
 *
 * Usage:
 *   <PriceDisplay price={cachedPrice} />
 */

import { Clock, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { CachedPrice, formatLastUpdated } from '@/lib/market-data';

interface PriceDisplayProps {
  price: CachedPrice;
  showChange?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PriceDisplay({ price: p, showChange = true, size = 'md' }: PriceDisplayProps) {
  if (p.source === 'unavailable') {
    return (
      <div className="text-[10px] text-[var(--muted)] flex items-center gap-1">
        <WifiOff className="h-3 w-3" />
        <span>No price data</span>
      </div>
    );
  }

  const sizeClass = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div>
      {/* Price + Change */}
      <div className="flex items-center gap-2">
        <span className={`font-bold font-tabular ${sizeClass}`}>
          {p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        {showChange && p.change !== 0 && (
          <span className={`text-[10px] font-tabular font-medium ${p.changePct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Last Updated + Staleness */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {p.isLive ? (
          <Wifi className="h-2.5 w-2.5 text-[var(--gain)]" />
        ) : (
          <Clock className="h-2.5 w-2.5 text-[var(--muted)]" />
        )}
        <span className={`text-[8px] ${p.isStale ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
          {formatLastUpdated(p.fetchedAt)}
        </span>
        {p.isStale && (
          <span className="text-[7px] text-[var(--warning)] flex items-center gap-0.5">
            <AlertTriangle className="h-2 w-2" />
            may be outdated
          </span>
        )}
      </div>

      {/* Rate limit note */}
      {p.rateLimitedNote && (
        <p className="text-[7px] text-[var(--warning)] mt-0.5 max-w-[200px] leading-relaxed">
          {p.rateLimitedNote}
        </p>
      )}
    </div>
  );
}
