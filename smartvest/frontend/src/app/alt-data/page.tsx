'use client';

import { useState, useEffect } from 'react';
import {
  Database, TrendingUp, TrendingDown, Globe,
  Briefcase, Smartphone, Search, ChevronDown,
  ChevronUp, Activity,
} from 'lucide-react';
import {
  getAltDataDashboard, getSignalStyle,
  AltDataDashboard, StockAltData, AltDataSignal,
} from '@/lib/alternative-data';

export default function AltDataPage() {
  const [data, setData] = useState<AltDataDashboard | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { setData(getAltDataDashboard()); }, []);
  if (!data) return null;


  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-[var(--primary)]" />
          Alternative Data
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Non-financial signals that predict business performance before it shows in earnings
        </p>
      </div>

      {/* Signal Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gain)]">{data.accelerating}</p>
          <p className="text-[10px] text-[var(--gain)] font-medium">Accelerating 🚀</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--muted)]">{data.stable}</p>
          <p className="text-[10px] text-[var(--muted)] font-medium">Stable ➡️</p>
        </div>
        <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4 text-center">
          <p className="text-2xl font-bold text-[var(--loss)]">{data.decelerating}</p>
          <p className="text-[10px] text-[var(--loss)] font-medium">Decelerating 📉</p>
        </div>
      </div>

      {/* Stock Cards */}
      <div className="space-y-4">
        {data.stocks.map(stock => {
          const style = getSignalStyle(stock.combinedSignal);
          const isExpanded = expanded === stock.symbol;
          return (
            <div key={stock.symbol} className={`rounded-xl border ${style.bg} overflow-hidden`}>
              {/* Summary Row */}
              <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : stock.symbol)}>
                <span className="text-2xl">{style.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold">{stock.symbol}</span>
                    <span className="text-[10px] text-[var(--muted)]">{stock.name}</span>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${style.color} ${style.bg}`}>{style.label}</span>
                  </div>
                  <p className="text-[11px] text-[var(--foreground)]/70 leading-relaxed">{stock.summary}</p>
                  <p className="text-[9px] text-[var(--muted)] mt-1">Primary driver: <strong>{stock.primaryDriver}</strong> &middot; Strength: {stock.signalStrength}/10</p>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--muted)]" />}
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-5 py-4 space-y-4">
                  {/* Google Trends */}
                  {stock.googleTrends && (
                    <DataSourceRow icon={Search} title="Google Trends" subtitle={`"${stock.googleTrends.searchTerm}"`} signal={stock.googleTrends.signal}
                      metric={`${stock.googleTrends.threeMonthChange >= 0 ? '+' : ''}${stock.googleTrends.threeMonthChange.toFixed(1)}% (3mo)`}
                      insight={stock.googleTrends.insight}
                      trend={stock.googleTrends.trend} />
                  )}
                  {/* Web Traffic */}
                  {stock.webTraffic && (
                    <DataSourceRow icon={Globe} title="Web Traffic" subtitle={stock.webTraffic.domain} signal={stock.webTraffic.signal}
                      metric={`${stock.webTraffic.threeMonthTrend >= 0 ? '+' : ''}${stock.webTraffic.threeMonthTrend.toFixed(1)}% (3mo) · ${(stock.webTraffic.monthlyVisits / 1000000).toFixed(1)}M visits/mo`}
                      insight={stock.webTraffic.insight} />
                  )}
                  {/* App Ranking */}
                  {stock.appRanking && (
                    <DataSourceRow icon={Smartphone} title="App Store Ranking" subtitle={stock.appRanking.appName} signal={stock.appRanking.signal}
                      metric={`Rank #${stock.appRanking.currentRank} (${stock.appRanking.rankChange30d < 0 ? '↑' : '↓'}${Math.abs(stock.appRanking.rankChange30d)} in 30d) · ${stock.appRanking.rating}★`}
                      insight={stock.appRanking.insight} />
                  )}
                  {/* Job Postings */}
                  {stock.jobPostings && (
                    <DataSourceRow icon={Briefcase} title="Job Postings" subtitle={`${stock.jobPostings.openPositions.toLocaleString()} open roles`} signal={stock.jobPostings.signal}
                      metric={`${stock.jobPostings.ninetyDayChange >= 0 ? '+' : ''}${stock.jobPostings.ninetyDayChange}% (90d) · Hiring: ${stock.jobPostings.hiringSignal}`}
                      insight={stock.jobPostings.insight}
                      extra={<p className="text-[9px] text-[var(--muted)] mt-1">Top roles: {stock.jobPostings.topRoles.join(', ')}</p>} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Educational Section */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          Why Alternative Data Matters
        </h2>
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          Traditional financial analysis looks backward — quarterly earnings tell you what ALREADY happened. Alternative data looks forward. Rising Google searches for a product often predict the next quarter&apos;s revenue 4-8 weeks before the earnings call. Aggressive hiring indicates management confidence in growth that hasn&apos;t been publicly announced yet. Website traffic trends show customer engagement in real-time, not quarterly.
        </p>
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          <strong>Limitations:</strong> Alternative data is noisy. A spike in searches doesn&apos;t always translate to revenue. Hiring can be reversed. Use as one signal among many, not in isolation.
        </p>
      </div>
    </div>
  );
}


// ─── Sub-component ───────────────────────────────────────────────────────────

function DataSourceRow({ icon: Icon, title, subtitle, signal, metric, insight, trend, extra }: {
  icon: typeof Search; title: string; subtitle: string;
  signal: AltDataSignal; metric: string; insight: string;
  trend?: { month: string; value: number }[];
  extra?: React.ReactNode;
}) {
  const style = getSignalStyle(signal);
  return (
    <div className="rounded-lg border border-[var(--card-border)] p-3">
      <div className="flex items-center gap-3 mb-2">
        <Icon className="h-4 w-4 text-[var(--muted)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold">{title}</span>
            <span className="text-[9px] text-[var(--muted)]">{subtitle}</span>
          </div>
          <span className="text-[10px] font-tabular font-medium">{metric}</span>
        </div>
        <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${style.color} ${style.bg}`}>{style.label}</span>
      </div>
      {/* Mini trend chart */}
      {trend && (
        <div className="flex items-end gap-0.5 h-6 mb-2">
          {trend.map((t, i) => (
            <div key={i} className="flex-1 rounded-t bg-[var(--primary)]/60"
              style={{ height: `${(t.value / 100) * 100}%` }}
              title={`${t.month}: ${t.value}`} />
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--foreground)]/70 leading-relaxed">{insight}</p>
      {extra}
    </div>
  );
}
