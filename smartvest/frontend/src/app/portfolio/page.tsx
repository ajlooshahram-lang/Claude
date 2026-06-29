'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Shield, PieChart,
  Calendar, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight,
  Clock, Percent, BarChart3, Globe, Loader2,
} from 'lucide-react';
import { api, StockQuote } from '@/lib/api';
import { fetchWithOffline } from '@/lib/offline-cache';
import { OfflineBanner } from '@/components/offline-banner';
import { LearningTip } from '@/components/learning-tip';
import { shouldShowWeeklySummary, dismissWeeklySummary } from '@/lib/weekly-summary';
import { BrokerConnect } from '@/components/broker-connect';
import { StopLossPanel } from '@/components/stop-loss-panel';
import { CurrencyBreakdown } from '@/components/currency-breakdown';
import { AnomalyAlerts } from '@/components/anomaly-alerts';

// ─── Types ───────────────────────────────────────────────────────────────────

/** What the USER owns — this is their personal data (shares, cost basis). */
interface UserPosition {
  symbol: string;
  shares: number;
  avgCost: number;   // Average cost per share in local currency
}

/** A fully-hydrated holding: user position + live market data. */
interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
  sector: string;
  region: string;
  country: string;
  dividendYield: number;
  beta: number;
  smartScore: number;
  dayChangePct: number;
  peRatio: number | null;
  marketCap: number | null;
}

interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  dayChange: number;
  dayChangePct: number;
  annualDividendIncome: number;
  portfolioBeta: number;
  diversificationScore: number;
}

// ─── User's Portfolio Positions ──────────────────────────────────────────────
// This is the user's personal data: which stocks they own and at what cost.
// In production this would come from a database. For now it's local config.

const MY_POSITIONS: UserPosition[] = [
  { symbol: 'NOVO-B.CO', shares: 8,  avgCost: 290.00 },
  { symbol: 'AAPL',      shares: 3,  avgCost: 260.00 },
  { symbol: 'KO',        shares: 12, avgCost: 58.50 },
  { symbol: 'JNJ',       shares: 4,  avgCost: 235.00 },
  { symbol: 'AZN.L',     shares: 6,  avgCost: 13200.00 },
  { symbol: '7203.T',    shares: 30, avgCost: 2550.00 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function regionFromCountry(country: string): string {
  const map: Record<string, string> = {
    'United States': 'US', 'Denmark': 'Denmark', 'United Kingdom': 'UK',
    'Switzerland': 'Europe', 'Japan': 'Japan', 'Germany': 'Europe',
    'France': 'Europe', 'Hong Kong': 'Asia', 'Australia': 'Asia Pacific',
  };
  return map[country] || country || 'Unknown';
}

/** Compute a simple smart score from fundamentals (placeholder until scoring engine). */
function estimateSmartScore(quote: StockQuote): number {
  let score = 50;
  // Low beta = safer
  if (quote.beta !== null) {
    if (quote.beta < 0.8) score += 15;
    else if (quote.beta < 1.2) score += 5;
    else score -= 10;
  }
  // Has dividends
  if (quote.dividend_yield && quote.dividend_yield > 0.01) score += 10;
  // Reasonable P/E
  if (quote.pe_ratio !== null) {
    if (quote.pe_ratio > 0 && quote.pe_ratio < 25) score += 10;
    else if (quote.pe_ratio >= 25 && quote.pe_ratio < 40) score += 3;
    else score -= 5;
  }
  // Large cap = stability
  if (quote.market_cap && quote.market_cap > 50e9) score += 5;
  return Math.max(20, Math.min(95, score));
}

function computeSummary(holdings: Holding[]): PortfolioSummary {
  let totalValue = 0, totalCost = 0, dayChangeValue = 0;

  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    const cost = h.shares * h.avgCost;
    totalValue += value;
    totalCost += cost;
    dayChangeValue += value * (h.dayChangePct / 100);
  }

  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const dayChangePct = totalValue > 0 ? (dayChangeValue / totalValue) * 100 : 0;

  const annualDiv = holdings.reduce((sum, h) => sum + h.shares * h.currentPrice * h.dividendYield, 0);
  const weightedBeta = holdings.reduce((sum, h) => {
    const weight = (h.shares * h.currentPrice) / (totalValue || 1);
    return sum + weight * h.beta;
  }, 0);

  const sectors = new Set(holdings.map(h => h.sector));
  const regions = new Set(holdings.map(h => h.region));
  const divScore = Math.min(100, (holdings.length / 8) * 40 + (sectors.size / 5) * 30 + (regions.size / 3) * 30);

  return {
    totalValue: Math.round(totalValue),
    totalCost: Math.round(totalCost),
    totalGainLoss: Math.round(totalGainLoss),
    totalGainLossPct: Math.round(totalGainLossPct * 100) / 100,
    dayChange: Math.round(dayChangeValue),
    dayChangePct: Math.round(dayChangePct * 100) / 100,
    annualDividendIncome: Math.round(annualDiv),
    portfolioBeta: Math.round(weightedBeta * 100) / 100,
    diversificationScore: Math.round(divScore),
  };
}

/** Generate dynamic Guardian Insights from real data. */
function generateInsights(holdings: Holding[], summary: PortfolioSummary): Array<{ type: 'good' | 'tip' | 'warning' | 'info'; text: string }> {
  const insights: Array<{ type: 'good' | 'tip' | 'warning' | 'info'; text: string }> = [];

  // Beta insight
  if (summary.portfolioBeta < 1.0) {
    insights.push({ type: 'good', text: `Portfolio beta is ${summary.portfolioBeta} — you're protected in market downturns` });
  } else {
    insights.push({ type: 'warning', text: `Portfolio beta is ${summary.portfolioBeta} — more volatile than the market. Consider defensive stocks.` });
  }

  // Dividend insight
  if (summary.annualDividendIncome > 0) {
    const yieldPct = ((summary.annualDividendIncome / summary.totalValue) * 100).toFixed(1);
    insights.push({ type: 'good', text: `Estimated dividend income: ~${summary.annualDividendIncome.toLocaleString()}/year (${yieldPct}% yield)` });
  }

  // Sector concentration
  const sectorWeights: Record<string, number> = {};
  if (summary.totalValue > 0) {
    for (const h of holdings) {
      const weight = (h.shares * h.currentPrice) / summary.totalValue * 100;
      sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + weight;
    }
  }
  const topSector = Object.entries(sectorWeights).sort((a, b) => b[1] - a[1])[0];
  if (topSector && topSector[1] > 40) {
    insights.push({ type: 'warning', text: `${topSector[0]} is ${topSector[1].toFixed(0)}% of your portfolio — consider diversifying to reduce risk` });
  } else if (topSector) {
    insights.push({ type: 'good', text: `Good sector balance — largest sector (${topSector[0]}) is only ${topSector[1].toFixed(0)}%` });
  }

  // Diversification
  const regions = new Set(holdings.map(h => h.region));
  if (regions.size >= 3) {
    insights.push({ type: 'good', text: `Invested across ${regions.size} regions — good geographic diversification` });
  } else {
    insights.push({ type: 'tip', text: `Only ${regions.size} region(s) represented. Adding international stocks reduces country-specific risk.` });
  }

  // Day performance
  if (summary.dayChangePct > 2) {
    insights.push({ type: 'info', text: `Strong day (+${summary.dayChangePct}%) — remember to stick to your plan and avoid FOMO` });
  } else if (summary.dayChangePct < -2) {
    insights.push({ type: 'info', text: `Rough day (${summary.dayChangePct}%) — daily swings are normal. Focus on long-term quality.` });
  }

  return insights.slice(0, 5);
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState<string | null>(null);

  const fetchLiveData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFromCache(false);
    setCacheAge(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const symbols = MY_POSITIONS.map(p => p.symbol);
      const url = `${API_URL}/api/quotes`;

      const result = await fetchWithOffline<{ count: number; quotes: Record<string, any> }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });

      if (result.fromCache) {
        setFromCache(true);
        setCacheAge(result.cacheAge);
      }

      if (!result.data) {
        setError(result.error || 'Could not load stock prices right now.');
        setLoading(false);
        return;
      }

      const quotes = result.data.quotes;

      // Merge user positions with live market data
      const liveHoldings: Holding[] = MY_POSITIONS.map(pos => {
        const quote = quotes[pos.symbol];
        if (!quote) {
          return {
            symbol: pos.symbol,
            name: pos.symbol,
            shares: pos.shares,
            avgCost: pos.avgCost,
            currentPrice: pos.avgCost,
            currency: '???',
            sector: 'Unknown',
            region: 'Unknown',
            country: 'Unknown',
            dividendYield: 0,
            beta: 1.0,
            smartScore: 50,
            dayChangePct: 0,
            peRatio: null,
            marketCap: null,
          };
        }

        return {
          symbol: pos.symbol,
          name: quote.name,
          shares: pos.shares,
          avgCost: pos.avgCost,
          currentPrice: quote.current_price,
          currency: quote.currency,
          sector: quote.sector || 'Unknown',
          region: regionFromCountry(quote.country),
          country: quote.country,
          dividendYield: quote.dividend_yield || 0,
          beta: quote.beta || 1.0,
          smartScore: estimateSmartScore(quote),
          dayChangePct: quote.day_change_pct,
          peRatio: quote.pe_ratio,
          marketCap: quote.market_cap,
        };
      });

      setHoldings(liveHoldings);
      setLastUpdated(new Date().toLocaleTimeString('en-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not load stock prices right now. Please make sure the SmartVest backend is running and try again.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  const summary = computeSummary(holdings);
  const insights = generateInsights(holdings, summary);

  // Loading state
  if (loading && holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-4" />
        <p className="text-sm text-[var(--muted)]">Fetching live market data...</p>
        <p className="text-[10px] text-[var(--muted)] mt-1">Connecting to Yahoo Finance for real-time prices</p>
      </div>
    );
  }

  // Error state
  if (error && holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-8 w-8 text-[var(--warning)] mb-4" />
        <p className="text-sm text-[var(--foreground)] font-medium">Connection Error</p>
        <p className="text-xs text-[var(--muted)] mt-2 max-w-md text-center">{error}</p>
        <button
          onClick={fetchLiveData}
          className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Portfolio</h1>
          <p className="text-sm text-[var(--muted)]">
            {holdings.length} holdings across {new Set(holdings.map(h => h.region)).size} regions
            {' '}&middot; Live data from Yahoo Finance
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          <Clock className="h-3 w-3" />
          Updated {lastUpdated}
          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="ml-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Broker Connection */}
      <BrokerConnect onPositionsLoaded={(positions) => {
        // When broker data arrives, replace manual holdings with real ones
        const brokerHoldings: Holding[] = positions.map((p: any) => ({
          symbol: p.symbol,
          name: p.name,
          shares: p.shares,
          avgCost: p.avg_cost,
          currentPrice: p.current_price,
          currency: p.currency,
          sector: 'Unknown',
          region: 'Unknown',
          country: 'Unknown',
          dividendYield: 0,
          beta: 1.0,
          smartScore: 50,
          dayChangePct: 0,
          peRatio: null,
          marketCap: null,
        }));
        if (brokerHoldings.length > 0) setHoldings(brokerHoldings);
      }} />

      {/* Weekly Summary Card */}
      <WeeklySummaryCard />

      {/* Error banner (partial failure) */}
      {error && holdings.length > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* Offline banner */}
      <OfflineBanner fromCache={fromCache} cacheAge={cacheAge} />

      {/* Learning tip: diversification */}
      <LearningTip
        tipId="portfolio_diversification"
        title="💡 Why diversification matters"
        text="Spreading your money across different stocks, sectors, and countries is the single most effective way to reduce risk without reducing expected returns. If one company fails, the others protect you. Aim for at least 5-8 stocks across 3+ sectors — no single stock should be more than 15-20% of your portfolio."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Total Value"
          value={`${summary.totalValue.toLocaleString()}`}
          subtext={`Cost: ${summary.totalCost.toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <SummaryCard
          label="Total Gain/Loss"
          value={`${summary.totalGainLoss >= 0 ? '+' : ''}${summary.totalGainLoss.toLocaleString()}`}
          subtext={`${summary.totalGainLossPct >= 0 ? '+' : ''}${summary.totalGainLossPct}%`}
          icon={summary.totalGainLoss >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          positive={summary.totalGainLoss >= 0}
        />
        <SummaryCard
          label="Today"
          value={`${summary.dayChange >= 0 ? '+' : ''}${summary.dayChange.toLocaleString()}`}
          subtext={`${summary.dayChangePct >= 0 ? '+' : ''}${summary.dayChangePct}%`}
          icon={summary.dayChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          positive={summary.dayChange >= 0}
        />
        <SummaryCard
          label="Annual Dividends"
          value={`${summary.annualDividendIncome.toLocaleString()}`}
          subtext={`${summary.totalValue > 0 ? ((summary.annualDividendIncome / summary.totalValue) * 100).toFixed(1) : '0.0'}% yield`}
          icon={<Calendar className="h-4 w-4" />}
        />
      </div>

      {/* Diversification Checker — warns about dangerous concentration */}
      <DiversificationChecker holdings={holdings} totalValue={summary.totalValue} />

      {/* Anomaly Detection */}
      <AnomalyAlerts />

      {/* Stop-Loss Protection */}
      <StopLossPanel holdings={holdings.map(h => ({
        symbol: h.symbol,
        name: h.name,
        currentPrice: h.currentPrice,
        currency: h.currency,
      }))} />

      {/* Risk & Diversification Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricPill label="Portfolio Beta" value={summary.portfolioBeta.toString()} status={summary.portfolioBeta < 1 ? 'good' : 'warning'} hint={summary.portfolioBeta < 1 ? 'Less volatile than the market' : 'More volatile than the market'} />
        <MetricPill label="Diversification" value={`${summary.diversificationScore}/100`} status={summary.diversificationScore >= 60 ? 'good' : 'warning'} hint={`${new Set(holdings.map(h => h.sector)).size} sectors, ${new Set(holdings.map(h => h.region)).size} regions`} />
        <MetricPill label="Risk Level" value={summary.portfolioBeta < 0.7 ? 'Low' : summary.portfolioBeta < 1.1 ? 'Moderate' : 'High'} status={summary.portfolioBeta < 1.1 ? 'neutral' : 'warning'} hint={summary.portfolioBeta < 0.7 ? 'Conservative, capital-preserving' : summary.portfolioBeta < 1.1 ? 'Balanced between safety and growth' : 'Aggressive, expect larger swings'} />
      </div>

      {/* Holdings Table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <BriefcaseIcon className="h-4 w-4 text-[var(--primary)]" />
            Holdings
          </h2>
          <span className="text-xs text-[var(--muted)]">Sorted by value &middot; Prices are live</span>
        </div>

        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider border-b border-[var(--card-border)] bg-black/20">
          <div className="col-span-3">Stock</div>
          <div className="col-span-1 text-right">Shares</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2 text-right">Gain/Loss</div>
          <div className="col-span-1 text-right">Today</div>
          <div className="col-span-1 text-right">Score</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--card-border)]">
          {[...holdings]
            .sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice))
            .map((h) => (
              <HoldingRow key={h.symbol} holding={h} />
            ))}
        </div>
      </div>

      {/* Bottom Grid: Sector Breakdown + Guardian Insights */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sector Breakdown */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-[var(--accent)]" />
            Allocation
          </h2>
          <SectorBreakdown holdings={holdings} totalValue={summary.totalValue} />
        </div>

        {/* Guardian Insights — dynamically generated from real data */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-[var(--gain)]" />
            Guardian Insights
          </h2>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <Insight key={i} type={insight.type} text={insight.text} />
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Currency Breakdown */}
      <CurrencyBreakdown holdings={holdings.map(h => ({
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgCost: h.avgCost,
        currentPrice: h.currentPrice,
        currency: h.currency,
      }))} />

      {/* Dividend Income — from real dividend_yield data */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--warning)]" />
            Dividend Income
          </h2>
          {summary.annualDividendIncome > 0 && (
            <div className="text-right">
              <p className="text-sm font-bold text-[var(--gain)] font-tabular">
                ~{summary.annualDividendIncome.toLocaleString()}/year
              </p>
              <p className="text-[9px] text-[var(--muted)]">
                estimated annual income ({summary.totalValue > 0 ? ((summary.annualDividendIncome / summary.totalValue) * 100).toFixed(1) : '0'}% portfolio yield)
              </p>
            </div>
          )}
        </div>
        {holdings.filter(h => h.dividendYield > 0).length === 0 ? (
          <p className="text-xs text-[var(--muted)]">None of your current holdings pay a dividend.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {holdings
              .filter(h => h.dividendYield > 0)
              .sort((a, b) => b.dividendYield - a.dividendYield)
              .map(h => {
                const annualDiv = h.shares * h.currentPrice * h.dividendYield;
                return (
                  <DividendEvent
                    key={h.symbol}
                    symbol={h.symbol}
                    name={h.name}
                    date={`${(h.dividendYield * 100).toFixed(1)}% yield`}
                    amount={`~${Math.round(annualDiv).toLocaleString()} ${h.currency}/yr`}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}



// ─── Components ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, subtext, icon, positive }: {
  label: string; value: string; subtext: string;
  icon: React.ReactNode; positive?: boolean;
}) {
  const colorClass = positive === undefined
    ? 'text-[var(--foreground)]'
    : positive ? 'text-[var(--gain)]' : 'text-[var(--loss)]';

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted)] mb-1">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold font-tabular ${colorClass}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${positive === undefined ? 'text-[var(--muted)]' : colorClass}`}>
        {subtext}
      </p>
    </div>
  );
}


function MetricPill({ label, value, status, hint }: {
  label: string; value: string;
  status: 'good' | 'warning' | 'neutral'; hint: string;
}) {
  const colors = {
    good: 'border-[var(--gain)]/30 bg-[var(--gain)]/5 text-[var(--gain)]',
    warning: 'border-[var(--warning)]/30 bg-[var(--warning)]/5 text-[var(--warning)]',
    neutral: 'border-[var(--primary)]/30 bg-[var(--primary)]/5 text-[var(--primary)]',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[status]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium opacity-80">{label}</span>
        <span className="text-sm font-bold">{value}</span>
      </div>
      <p className="text-[10px] mt-1 opacity-60">{hint}</p>
    </div>
  );
}


function HoldingRow({ holding: h }: { holding: Holding }) {
  const value = h.shares * h.currentPrice;
  const cost = h.shares * h.avgCost;
  const gainLoss = value - cost;
  const gainLossPct = cost > 0 ? ((gainLoss) / cost) * 100 : 0;
  const isGain = gainLoss >= 0;
  const isDayGain = h.dayChangePct >= 0;

  return (
    <div className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
      {/* Mobile layout */}
      <div className="flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-[var(--muted)]">
            {h.symbol.substring(0, 2)}
          </div>
          <div>
            <p className="font-medium text-sm">{h.symbol}</p>
            <p className="text-[10px] text-[var(--muted)]">{h.shares} shares</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-tabular">{h.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className={`text-[10px] font-medium ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {isGain ? '+' : ''}{gainLossPct.toFixed(1)}%
          </p>
        </div>
      </div>
      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-12 gap-2 items-center text-sm">
        <div className="col-span-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-[var(--muted)]">
              {h.symbol.substring(0, 2)}
            </div>
            <div>
              <p className="font-medium text-sm">{h.symbol}</p>
              <p className="text-[10px] text-[var(--muted)]">{h.name}</p>
            </div>
          </div>
        </div>
        <div className="col-span-1 text-right font-tabular text-[var(--muted)]">
          {h.shares}
        </div>
        <div className="col-span-2 text-right">
          <p className="font-tabular">
            {h.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-[var(--muted)]">{h.currency}</p>
        </div>
        <div className="col-span-2 text-right font-tabular font-medium">
          {value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className={`col-span-2 text-right ${isGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          <p className="font-tabular text-sm">
            {isGain ? '+' : ''}{gainLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px]">{isGain ? '+' : ''}{gainLossPct.toFixed(1)}%</p>
        </div>
        <div className={`col-span-1 text-right text-xs font-medium ${isDayGain ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          {isDayGain ? '+' : ''}{h.dayChangePct.toFixed(2)}%
        </div>
        <div className="col-span-1 text-right">
          <span className={`inline-flex items-center justify-center h-6 w-8 rounded text-[10px] font-bold ${
            h.smartScore >= 75 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' :
            h.smartScore >= 60 ? 'bg-[var(--primary)]/10 text-[var(--primary)]' :
            'bg-[var(--warning)]/10 text-[var(--warning)]'
          }`}>
            {h.smartScore}
          </span>
        </div>
      </div>
    </div>
  );
}


function SectorBreakdown({ holdings, totalValue }: {
  holdings: Holding[]; totalValue: number;
}) {
  const sectors: Record<string, { value: number; count: number }> = {};
  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    if (!sectors[h.sector]) sectors[h.sector] = { value: 0, count: 0 };
    sectors[h.sector].value += value;
    sectors[h.sector].count += 1;
  }
  const sorted = Object.entries(sectors).sort((a, b) => b[1].value - a[1].value);
  const colors = ['bg-[var(--primary)]', 'bg-[var(--gain)]', 'bg-[var(--accent)]',
                  'bg-[var(--warning)]', 'bg-pink-500'];

  return (
    <div className="space-y-3">
      {sorted.map(([sector, data], i) => {
        const pct = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
        return (
          <div key={sector}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs">{sector}</span>
              <span className="text-xs text-[var(--muted)]">
                {pct.toFixed(0)}% &middot; {data.count} stock{data.count > 1 ? 's' : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${colors[i % colors.length]}`}
                   style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-[var(--card-border)]">
        <span className="text-[10px] text-[var(--muted)] mr-1 flex items-center gap-1">
          <Globe className="h-3 w-3" /> Regions:
        </span>
        {[...new Set(holdings.map(h => h.region))].map(r => (
          <span key={r} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--muted)]">
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}


function Insight({ type, text }: {
  type: 'good' | 'tip' | 'warning' | 'info'; text: string;
}) {
  const config = {
    good: { icon: <TrendingUp className="h-3.5 w-3.5" />, bg: 'bg-[var(--gain)]/5 border-[var(--gain)]/20' },
    tip: { icon: <BarChart3 className="h-3.5 w-3.5" />, bg: 'bg-[var(--primary)]/5 border-[var(--primary)]/20' },
    warning: { icon: <AlertTriangle className="h-3.5 w-3.5" />, bg: 'bg-[var(--warning)]/5 border-[var(--warning)]/20' },
    info: { icon: <Calendar className="h-3.5 w-3.5" />, bg: 'bg-[var(--accent)]/5 border-[var(--accent)]/20' },
  };
  const c = config[type];
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${c.bg}`}>
      <span className="mt-0.5">{c.icon}</span>
      <p className="text-xs leading-relaxed">{text}</p>
    </div>
  );
}

function DividendEvent({ symbol, name, date, amount }: {
  symbol: string; name: string; date: string; amount: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--card-border)] bg-black/20 p-3">
      <div className="h-9 w-9 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center">
        <Percent className="h-4 w-4 text-[var(--warning)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{name}</p>
        <p className="text-[10px] text-[var(--muted)]">{symbol}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold text-[var(--gain)]">{amount}</p>
        <p className="text-[10px] text-[var(--muted)]">{date}</p>
      </div>
    </div>
  );
}

function BriefcaseIcon(props: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={props.className}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}



// ─── Diversification Checker ─────────────────────────────────────────────────
// Warns the user in plain English if their portfolio is too concentrated.
// Two checks:
//   1. Single stock > 50% of total value → dangerous concentration
//   2. Single sector > 60% of total value → sector overexposure

interface ConcentrationWarning {
  type: 'stock' | 'sector';
  name: string;
  percentage: number;
  explanation: string;
}

function checkDiversification(holdings: Holding[], totalValue: number): ConcentrationWarning[] {
  const warnings: ConcentrationWarning[] = [];

  if (totalValue <= 0 || holdings.length === 0) return warnings;

  // Check 1: Any single stock > 50% of portfolio?
  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    const pct = (value / totalValue) * 100;
    if (pct > 50) {
      warnings.push({
        type: 'stock',
        name: `${h.name} (${h.symbol})`,
        percentage: Math.round(pct),
        explanation:
          `${h.name} makes up ${Math.round(pct)}% of your portfolio. ` +
          `If this one company has a bad earnings report, a scandal, or an industry downturn, ` +
          `you could lose more than half your money in one event. ` +
          `Consider selling some shares and spreading that money across 2-3 other stocks in different sectors.`,
      });
    }
  }

  // Check 2: Any single sector > 60% of portfolio?
  const sectorTotals: Record<string, number> = {};
  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    const sector = h.sector || 'Unknown';
    sectorTotals[sector] = (sectorTotals[sector] || 0) + value;
  }

  for (const [sector, value] of Object.entries(sectorTotals)) {
    const pct = (value / totalValue) * 100;
    if (pct > 60) {
      const stocksInSector = holdings.filter(h => (h.sector || 'Unknown') === sector);
      const names = stocksInSector.map(h => h.symbol).join(', ');
      warnings.push({
        type: 'sector',
        name: sector,
        percentage: Math.round(pct),
        explanation:
          `${Math.round(pct)}% of your money is in ${sector} (${names}). ` +
          `If something hurts this entire sector — like new regulations, a recession hitting that industry, ` +
          `or a shift in consumer behavior — all these stocks could drop together. ` +
          `Try adding stocks from different sectors like Consumer Staples, Technology, or Industrials to protect yourself.`,
      });
    }
  }

  return warnings;
}

function DiversificationChecker({ holdings, totalValue }: {
  holdings: Holding[];
  totalValue: number;
}) {
  const warnings = checkDiversification(holdings, totalValue);

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {warnings.map((w, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5 text-[var(--loss)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--loss)]">
                {w.type === 'stock'
                  ? `⚠️ Too much in one stock: ${w.name} is ${w.percentage}% of your portfolio`
                  : `⚠️ Sector overload: ${w.percentage}% in ${w.name}`
                }
              </p>
              <p className="text-xs text-[var(--foreground)]/70 mt-1.5 leading-relaxed">
                {w.explanation}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}



// ─── Weekly Summary Card ─────────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const WEEKLY_POSITIONS = [
  { symbol: 'NOVO-B.CO', shares: 8, avg_cost: 290.00 },
  { symbol: 'AAPL', shares: 3, avg_cost: 260.00 },
  { symbol: 'KO', shares: 12, avg_cost: 58.50 },
  { symbol: 'JNJ', shares: 4, avg_cost: 235.00 },
  { symbol: 'AZN.L', shares: 6, avg_cost: 13200.00 },
  { symbol: '7203.T', shares: 30, avg_cost: 2550.00 },
];

interface WeeklySummaryData {
  portfolio_change: number;
  portfolio_change_pct: number;
  biggest_mover: { symbol: string; name: string; weekly_change_pct: number; currency: string } | null;
  market_insight: string;
  suggestion: string;
}

function WeeklySummaryCard() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldShowWeeklySummary()) return;
    setShow(true);
    setLoading(true);

    fetch(`${API_BASE_URL}/api/weekly-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positions: WEEKLY_POSITIONS,
        risk_profile: 'moderate',
      }),
      signal: AbortSignal.timeout(30000),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleDismiss() {
    dismissWeeklySummary();
    setShow(false);
  }

  if (!show) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-5 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
        <span className="text-sm text-[var(--muted)]">Preparing your weekly summary...</span>
      </div>
    );
  }

  if (!data) return null;

  const isUp = data.portfolio_change >= 0;

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-gradient-to-br from-[var(--primary)]/5 to-transparent p-5 relative">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
        title="Dismiss until next week"
      >
        <span className="text-xs">✕</span>
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-[var(--primary)]" />
        <span className="text-xs font-semibold text-[var(--primary)]">Weekly Summary</span>
      </div>

      {/* Portfolio performance */}
      <div className="mb-4">
        <p className="text-sm text-[var(--muted)]">Your portfolio this week:</p>
        <p className={`text-2xl font-bold font-tabular mt-1 ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          {isUp ? '+' : ''}{data.portfolio_change.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          <span className="text-sm ml-2">({isUp ? '+' : ''}{data.portfolio_change_pct.toFixed(2)}%)</span>
        </p>
      </div>

      {/* Biggest mover */}
      {data.biggest_mover && (
        <div className="mb-3 rounded-lg bg-white/[0.03] border border-[var(--card-border)] p-3">
          <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Biggest Mover</p>
          <p className="text-xs">
            <span className="font-semibold">{data.biggest_mover.name}</span>
            <span className="text-[var(--muted)]"> ({data.biggest_mover.symbol})</span>
            <span className={`ml-2 font-bold ${data.biggest_mover.weekly_change_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
              {data.biggest_mover.weekly_change_pct >= 0 ? '+' : ''}{data.biggest_mover.weekly_change_pct.toFixed(2)}%
            </span>
          </p>
        </div>
      )}

      {/* Market insight */}
      <div className="mb-3">
        <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Market Insight</p>
        <p className="text-xs leading-relaxed text-[var(--foreground)]/80">{data.market_insight}</p>
      </div>

      {/* Suggestion */}
      <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-3">
        <p className="text-[10px] font-semibold text-[var(--primary)] mb-0.5">💡 This week&apos;s suggestion</p>
        <p className="text-xs leading-relaxed text-[var(--foreground)]/70">{data.suggestion}</p>
      </div>

      {/* Footer */}
      <p className="text-[9px] text-[var(--muted)] mt-3 text-center">
        Click ✕ to dismiss · Appears every Monday
      </p>
    </div>
  );
}
