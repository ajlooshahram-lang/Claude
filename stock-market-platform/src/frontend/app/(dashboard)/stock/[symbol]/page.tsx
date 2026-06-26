'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { TrendingUp, TrendingDown, Plus, Bell, Sparkles } from 'lucide-react';
import { PriceChart } from './components/price-chart';
import { KeyMetrics } from './components/key-metrics';
import { QuickAISummary } from './components/quick-ai-summary';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

// Mock quote data (production: fetched via TanStack Query from market data API)
const MOCK_QUOTE = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  price: 198.45,
  change: 3.21,
  changePercent: 1.64,
  dayOpen: 195.80,
  dayHigh: 199.12,
  dayLow: 195.22,
  prevClose: 195.24,
  volume: 58_432_100,
  avgVolume20d: 52_100_000,
  marketCap: 3_080_000_000_000,
  week52High: 199.62,
  week52Low: 164.08,
  marketStatus: 'open' as const,
};

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase() ?? 'AAPL';
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [showAISummary, setShowAISummary] = useState(false);

  const quote = { ...MOCK_QUOTE, symbol };
  const isPositive = quote.change >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{symbol}</h1>
              <p className="text-sm text-muted-foreground">{quote.name}</p>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-4xl font-bold font-tabular">
              ${quote.price.toFixed(2)}
            </span>
            <span className={`flex items-center gap-1 text-lg font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
              {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              <span className="font-tabular">
                {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">
            <Plus className="h-4 w-4" />
            Add to Portfolio
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">
            <Bell className="h-4 w-4" />
            Set Alert
          </button>
          <button
            onClick={() => setShowAISummary(!showAISummary)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" />
            AI Analysis
          </button>
        </div>
      </div>

      {/* AI Summary (collapsible) */}
      {showAISummary && <QuickAISummary symbol={symbol} />}

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        {/* Timeframe selector */}
        <div className="mb-4 flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Price chart */}
        <PriceChart symbol={symbol} timeframe={timeframe} />
      </div>

      {/* Key Metrics */}
      <KeyMetrics quote={quote} />

      {/* Company info + stats grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trading stats */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trading Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatRow label="Open" value={`$${quote.dayOpen.toFixed(2)}`} />
            <StatRow label="Previous Close" value={`$${quote.prevClose.toFixed(2)}`} />
            <StatRow label="Day High" value={`$${quote.dayHigh.toFixed(2)}`} />
            <StatRow label="Day Low" value={`$${quote.dayLow.toFixed(2)}`} />
            <StatRow label="52W High" value={`$${quote.week52High.toFixed(2)}`} />
            <StatRow label="52W Low" value={`$${quote.week52Low.toFixed(2)}`} />
            <StatRow label="Volume" value={formatNumber(quote.volume)} />
            <StatRow label="Avg Volume" value={formatNumber(quote.avgVolume20d)} />
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">About {symbol}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets,
            wearables, and accessories. The company offers iPhone, Mac, iPad, AirPods, Apple TV,
            Apple Watch, Beats products, and HomePod. It also provides AppleCare, cloud services,
            and operates the App Store, Apple Music, Apple TV+, and other digital content platforms.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatRow label="Sector" value="Technology" />
            <StatRow label="Industry" value="Consumer Electronics" />
            <StatRow label="Market Cap" value={formatLargeNumber(quote.marketCap)} />
            <StatRow label="Exchange" value="NASDAQ" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-tabular">{value}</span>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}
