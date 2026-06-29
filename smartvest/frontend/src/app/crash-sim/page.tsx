'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle, Play, RotateCcw, TrendingDown, Shield,
  Bell, ShieldAlert, BarChart3,
} from 'lucide-react';
import { getWatchlist } from '@/lib/watchlist';
import { getActiveAlerts, PriceAlert } from '@/lib/alerts';
import { getActiveStopLosses, StopLoss } from '@/lib/stop-losses';

// ─── Sector Crash Correlations ───────────────────────────────────────────────
// Realistic: Tech drops most, Consumer Staples drops least.
// Based on historical crash patterns (2008, 2020, 2022).

const SECTOR_DROP_RANGES: Record<string, [number, number]> = {
  'Technology':         [35, 50],  // Most volatile in crashes
  'Consumer Cyclical':  [30, 45],
  'Communication Services': [30, 45],
  'Financial Services': [30, 45],
  'Industrials':        [25, 40],
  'Energy':             [25, 45],  // High variance
  'Healthcare':         [15, 30],  // Defensive
  'Consumer Defensive': [10, 25],  // Most defensive
  'Consumer Staples':   [10, 25],
  'Utilities':          [10, 20],  // Least affected
  'Real Estate':        [20, 35],
  'Unknown':            [20, 40],
};

function getSectorDrop(sector: string): number {
  const range = SECTOR_DROP_RANGES[sector] || SECTOR_DROP_RANGES['Unknown'];
  const [min, max] = range;
  return min + Math.random() * (max - min);
}

// ─── Portfolio simulation ────────────────────────────────────────────────────

interface SimHolding {
  symbol: string;
  name: string;
  sector: string;
  shares: number;
  preBuyPrice: number;
  prePrice: number;
  postPrice: number;
  dropPct: number;
  preCost: number;
  preValue: number;
  postValue: number;
  currency: string;
}

interface SimResult {
  holdings: SimHolding[];
  preTotal: number;
  postTotal: number;
  totalDropPct: number;
  totalLoss: number;
  alertsTriggered: { symbol: string; name: string; targetPrice: number; direction: string }[];
  stopLossesTriggered: { symbol: string; name: string; stopPrice: number }[];
  worstSector: string;
  bestSector: string;
}

// Sample portfolio (same as portfolio page)
const PORTFOLIO = [
  { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', shares: 8, avgCost: 290, currentPrice: 316, sector: 'Healthcare', currency: 'DKK' },
  { symbol: 'AAPL', name: 'Apple', shares: 3, avgCost: 260, currentPrice: 284, sector: 'Technology', currency: 'USD' },
  { symbol: 'KO', name: 'Coca-Cola', shares: 12, avgCost: 58.50, currentPrice: 83, sector: 'Consumer Defensive', currency: 'USD' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', shares: 4, avgCost: 235, currentPrice: 255, sector: 'Healthcare', currency: 'USD' },
  { symbol: 'AZN.L', name: 'AstraZeneca', shares: 6, avgCost: 13200, currentPrice: 14280, sector: 'Healthcare', currency: 'GBp' },
  { symbol: '7203.T', name: 'Toyota Motor', shares: 30, avgCost: 2550, currentPrice: 2772, sector: 'Consumer Cyclical', currency: 'JPY' },
];

function simulateCrash(): SimResult {
  const holdings: SimHolding[] = PORTFOLIO.map(h => {
    const dropPct = getSectorDrop(h.sector);
    const postPrice = h.currentPrice * (1 - dropPct / 100);
    return {
      symbol: h.symbol,
      name: h.name,
      sector: h.sector,
      shares: h.shares,
      preBuyPrice: h.avgCost,
      prePrice: h.currentPrice,
      postPrice: Math.round(postPrice * 100) / 100,
      dropPct: Math.round(dropPct * 10) / 10,
      preCost: h.shares * h.avgCost,
      preValue: h.shares * h.currentPrice,
      postValue: Math.round(h.shares * postPrice * 100) / 100,
      currency: h.currency,
    };
  });

  const preTotal = holdings.reduce((s, h) => s + h.preValue, 0);
  const postTotal = holdings.reduce((s, h) => s + h.postValue, 0);
  const totalLoss = preTotal - postTotal;
  const totalDropPct = (totalLoss / preTotal) * 100;

  // Check which alerts would trigger
  const alerts = getActiveAlerts();
  const alertsTriggered = alerts
    .filter(a => {
      const holding = holdings.find(h => h.symbol === a.symbol);
      if (!holding) return false;
      if (a.direction === 'below') return holding.postPrice <= a.targetPrice;
      return false;
    })
    .map(a => ({ symbol: a.symbol, name: a.name, targetPrice: a.targetPrice, direction: a.direction }));

  // Check stop-losses
  const stopLosses = getActiveStopLosses();
  const stopLossesTriggered = stopLosses
    .filter(sl => {
      const holding = holdings.find(h => h.symbol === sl.symbol);
      return holding && holding.postPrice <= sl.stopPrice;
    })
    .map(sl => ({ symbol: sl.symbol, name: sl.name, stopPrice: sl.stopPrice }));

  // Worst/best sector
  const sectorDrops: Record<string, number[]> = {};
  for (const h of holdings) {
    if (!sectorDrops[h.sector]) sectorDrops[h.sector] = [];
    sectorDrops[h.sector].push(h.dropPct);
  }
  const sectorAvgs = Object.entries(sectorDrops).map(([s, drops]) => ({
    sector: s, avg: drops.reduce((a, b) => a + b, 0) / drops.length
  }));
  sectorAvgs.sort((a, b) => b.avg - a.avg);
  const worstSector = sectorAvgs[0]?.sector || 'Unknown';
  const bestSector = sectorAvgs[sectorAvgs.length - 1]?.sector || 'Unknown';

  return { holdings, preTotal, postTotal, totalDropPct, totalLoss, alertsTriggered, stopLossesTriggered, worstSector, bestSector };
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CrashSimPage() {
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);

  function handleSimulate() {
    setRunning(true);
    // Brief delay for dramatic effect
    setTimeout(() => {
      setResult(simulateCrash());
      setRunning(false);
    }, 800);
  }

  function handleReset() {
    setResult(null);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-[var(--loss)]" />
          Crash Simulator
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Training tool: see what happens to your portfolio in a market crash
        </p>
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <p className="text-xs leading-relaxed text-[var(--foreground)]/70">
          This simulates a sudden market crash where every stock drops 20-50%.
          Technology and cyclical stocks drop more; Healthcare and Consumer Staples drop less
          (based on real crash patterns from 2008 and 2020).
          <strong> This uses fake prices — your real portfolio is not affected.</strong>
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        {!result ? (
          <button
            onClick={handleSimulate}
            disabled={running}
            className="flex items-center gap-2 rounded-xl bg-[var(--loss)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <><span className="animate-pulse">Crashing markets...</span></>
            ) : (
              <><Play className="h-4 w-4" /> Simulate Crash</>
            )}
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" /> Reset Simulation
          </button>
        )}
      </div>

      {/* Results */}
      {result && <CrashResults result={result} />}
    </div>
  );
}


// ─── Results Display ─────────────────────────────────────────────────────────

function CrashResults({ result }: { result: SimResult }) {
  return (
    <div className="space-y-5">
      {/* Total impact card */}
      <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-6">
        <p className="text-sm text-[var(--muted)]">Portfolio Impact</p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-4xl font-bold text-[var(--loss)] font-tabular">
            -{result.totalDropPct.toFixed(1)}%
          </span>
          <span className="text-lg text-[var(--loss)]">
            (-{result.totalLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
          </span>
        </div>
        <div className="flex gap-6 mt-3 text-xs text-[var(--muted)]">
          <span>Before: {result.preTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
          <span>After: {result.postTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
        </div>
      </div>

      {/* Sector breakdown */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-[var(--muted)]" />
          Per-Stock Impact
        </h2>
        <div className="space-y-2">
          {result.holdings
            .sort((a, b) => b.dropPct - a.dropPct)
            .map(h => (
              <div key={h.symbol} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-black/20 p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{h.symbol}</p>
                    <p className="text-[10px] text-[var(--muted)]">{h.sector}</p>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    {h.currency} {h.prePrice.toFixed(2)} → {h.postPrice.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[var(--loss)] font-tabular">-{h.dropPct}%</p>
                  <p className="text-[9px] text-[var(--muted)]">
                    Lost: {(h.preValue - h.postValue).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            ))}
        </div>
        <div className="flex justify-between mt-3 pt-3 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)]">
          <span>Hardest hit: {result.worstSector}</span>
          <span>Most resilient: {result.bestSector}</span>
        </div>
      </div>

      {/* Alerts triggered */}
      {result.alertsTriggered.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2 text-[var(--warning)]">
            <Bell className="h-4 w-4" />
            {result.alertsTriggered.length} Price Alert{result.alertsTriggered.length > 1 ? 's' : ''} Would Trigger
          </h2>
          {result.alertsTriggered.map((a, i) => (
            <p key={i} className="text-xs text-[var(--foreground)]/70 ml-6">
              {a.symbol} dropped below {a.targetPrice} target
            </p>
          ))}
        </div>
      )}

      {/* Stop-losses triggered */}
      {result.stopLossesTriggered.length > 0 && (
        <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2 text-[var(--loss)]">
            <ShieldAlert className="h-4 w-4" />
            {result.stopLossesTriggered.length} Stop-Loss{result.stopLossesTriggered.length > 1 ? 'es' : ''} Would Activate
          </h2>
          {result.stopLossesTriggered.map((sl, i) => (
            <p key={i} className="text-xs text-[var(--foreground)]/70 ml-6">
              {sl.symbol} hit stop-loss at {sl.stopPrice.toFixed(2)}
            </p>
          ))}
        </div>
      )}

      {/* No alerts/stops */}
      {result.alertsTriggered.length === 0 && result.stopLossesTriggered.length === 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <p className="text-xs text-[var(--muted)]">
            No price alerts or stop-losses would have triggered in this scenario.
            {' '}Consider setting some to protect yourself — go to the Portfolio page to add stop-losses.
          </p>
        </div>
      )}

      {/* Lessons */}
      <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-5">
        <h2 className="text-sm font-semibold text-[var(--primary)] mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          What This Teaches You
        </h2>
        <ul className="space-y-2 text-xs text-[var(--foreground)]/70">
          <li>• Your portfolio would lose <strong>{result.totalDropPct.toFixed(0)}%</strong> in a major crash. Could you handle that emotionally without selling?</li>
          <li>• <strong>{result.bestSector}</strong> stocks held up best — this is why diversification across defensive sectors matters.</li>
          <li>• <strong>{result.worstSector}</strong> stocks dropped most — having too much here amplifies your losses.</li>
          {result.stopLossesTriggered.length > 0 && (
            <li>• Your stop-losses would have limited some damage — they&apos;re working as intended.</li>
          )}
          {result.stopLossesTriggered.length === 0 && (
            <li>• You have no stop-losses set. In a real crash, you&apos;d have no automatic protection. Consider adding some.</li>
          )}
          <li>• Historically, markets recover from crashes within 1-3 years. Selling at the bottom locks in losses permanently.</li>
        </ul>
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-[var(--muted)] text-center">
        This is a training simulation using randomized data. It does not predict actual market behavior.
        Real crashes may be worse or better than simulated. Past patterns do not guarantee future results.
      </p>
    </div>
  );
}
