'use client';

import { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';

// ─── Market Definitions ──────────────────────────────────────────────────────

interface Market {
  id: string;
  name: string;
  short: string;
  timezone: string;
  open: [number, number];   // [hour, minute] in local time
  close: [number, number];
  preOpen?: [number, number];
  afterClose?: [number, number];
  weekdays: number[];       // 1=Mon ... 5=Fri
}

const MARKETS: Market[] = [
  {
    id: 'nyse', name: 'NYSE / NASDAQ', short: 'US',
    timezone: 'America/New_York',
    open: [9, 30], close: [16, 0],
    preOpen: [4, 0], afterClose: [20, 0],
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: 'cph', name: 'Nasdaq Nordic', short: 'CPH',
    timezone: 'Europe/Copenhagen',
    open: [9, 0], close: [17, 0],
    preOpen: [8, 0], afterClose: [17, 30],
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: 'lse', name: 'London Stock Exchange', short: 'LON',
    timezone: 'Europe/London',
    open: [8, 0], close: [16, 30],
    preOpen: [7, 0], afterClose: [17, 0],
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: 'xetra', name: 'Frankfurt XETRA', short: 'FRA',
    timezone: 'Europe/Berlin',
    open: [9, 0], close: [17, 30],
    preOpen: [8, 0], afterClose: [20, 0],
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: 'tse', name: 'Tokyo TSE', short: 'TYO',
    timezone: 'Asia/Tokyo',
    open: [9, 0], close: [15, 0],
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: 'hkex', name: 'Hong Kong HKEX', short: 'HKG',
    timezone: 'Asia/Hong_Kong',
    open: [9, 30], close: [16, 0],
    weekdays: [1, 2, 3, 4, 5],
  },
];

// ─── Status Helpers ──────────────────────────────────────────────────────────

type MarketStatus = 'open' | 'pre-market' | 'after-hours' | 'closed';

function getMarketTime(timezone: string): Date {
  const now = new Date();
  const str = now.toLocaleString('en-US', { timeZone: timezone });
  return new Date(str);
}

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

function getStatus(market: Market): { status: MarketStatus; localTime: string; until: string } {
  const localNow = getMarketTime(market.timezone);
  const day = localNow.getDay(); // 0=Sun
  const dayOfWeek = day === 0 ? 7 : day; // 1=Mon
  const nowMins = toMinutes(localNow.getHours(), localNow.getMinutes());

  const localTime = localNow.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const isWeekday = market.weekdays.includes(dayOfWeek);

  if (!isWeekday) {
    // Find hours until Monday open
    const daysUntilMon = dayOfWeek === 6 ? 2 : dayOfWeek === 7 ? 1 : 0;
    const openMins = toMinutes(market.open[0], market.open[1]);
    const minsUntil = daysUntilMon * 24 * 60 + (openMins - nowMins);
    return { status: 'closed', localTime, until: formatMinutes(Math.max(0, minsUntil)) };
  }

  const openMins = toMinutes(market.open[0], market.open[1]);
  const closeMins = toMinutes(market.close[0], market.close[1]);
  const preOpenMins = market.preOpen ? toMinutes(market.preOpen[0], market.preOpen[1]) : openMins;
  const afterCloseMins = market.afterClose ? toMinutes(market.afterClose[0], market.afterClose[1]) : closeMins;

  if (nowMins >= openMins && nowMins < closeMins) {
    const minsLeft = closeMins - nowMins;
    return { status: 'open', localTime, until: `closes in ${formatMinutes(minsLeft)}` };
  }
  if (market.preOpen && nowMins >= preOpenMins && nowMins < openMins) {
    const minsLeft = openMins - nowMins;
    return { status: 'pre-market', localTime, until: `opens in ${formatMinutes(minsLeft)}` };
  }
  if (market.afterClose && nowMins >= closeMins && nowMins < afterCloseMins) {
    // Next open is tomorrow
    const minsUntilTomorrow = (24 * 60 - nowMins) + openMins;
    return { status: 'after-hours', localTime, until: `opens in ${formatMinutes(minsUntilTomorrow)}` };
  }

  // Closed — calculate time until next open
  let minsUntilOpen: number;
  if (nowMins < openMins) {
    minsUntilOpen = openMins - nowMins;
  } else {
    // After close, next day
    const nextDay = dayOfWeek + 1;
    const daysWait = nextDay > 5 ? (8 - nextDay) : 1; // Skip weekends
    minsUntilOpen = (daysWait * 24 * 60) - nowMins + openMins;
  }
  return { status: 'closed', localTime, until: `opens in ${formatMinutes(Math.max(0, minsUntilOpen))}` };
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

// ─── Components ──────────────────────────────────────────────────────────────

export function MarketHoursWidget() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-3 py-3 border-t border-[var(--card-border)]">
      <div className="flex items-center gap-1.5 px-3 mb-2">
        <Globe className="h-3 w-3 text-[var(--muted)]" />
        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Markets</span>
      </div>
      <div className="space-y-0.5">
        {MARKETS.map(market => {
          const { status, localTime, until } = getStatus(market);
          return (
            <div key={market.id} className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-white/5">
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${
                  status === 'open' ? 'bg-[var(--gain)] animate-pulse' :
                  status === 'pre-market' || status === 'after-hours' ? 'bg-[var(--warning)]' :
                  'bg-[var(--muted)]/40'
                }`} />
                <span className="text-[10px] font-medium">{market.short}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--muted)] font-tabular">{localTime}</span>
                <span className={`text-[8px] font-medium ${
                  status === 'open' ? 'text-[var(--gain)]' :
                  status === 'pre-market' || status === 'after-hours' ? 'text-[var(--warning)]' :
                  'text-[var(--muted)]'
                }`}>
                  {status === 'open' ? 'OPEN' : status === 'pre-market' ? 'PRE' : status === 'after-hours' ? 'AH' : 'CLOSED'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Closed Market Banner ────────────────────────────────────────────────────

export function MarketClosedBanner({ exchange }: { exchange?: string }) {
  // Determine if US market is closed (most stocks)
  const usMarket = MARKETS.find(m => m.id === 'nyse')!;
  const { status, until } = getStatus(usMarket);

  if (status === 'open') return null;

  return (
    <div className="rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/5 px-3 py-2 flex items-center gap-2">
      <Clock className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
      <p className="text-[10px] text-[var(--muted)]">
        {exchange || 'US'} market is {status === 'pre-market' ? 'in pre-market' : status === 'after-hours' ? 'in after-hours' : 'closed'}.
        Price shown is the last closing price.
        {status === 'closed' && ` ${until.charAt(0).toUpperCase() + until.slice(1)}.`}
      </p>
    </div>
  );
}
