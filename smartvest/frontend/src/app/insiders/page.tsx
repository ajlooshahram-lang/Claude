'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Users, AlertTriangle, TrendingUp, TrendingDown,
  Shield, Crown, Clock, DollarSign, Award, Eye,
  ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import {
  getInsiderMonitorData, getDefaultWatchlist,
  getTransactionTypeLabel, InsiderMonitorData,
  StockInsiderSummary, InsiderTransaction,
  ClusterAlert, InsiderTrackRecord,
} from '@/lib/insider-monitor';

export default function InsidersPage() {
  const [data, setData] = useState<InsiderMonitorData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'clusters' | 'transactions' | 'records'>('overview');

  useEffect(() => {
    const watchlist = getDefaultWatchlist();
    setData(getInsiderMonitorData(watchlist));
  }, []);

  if (!data) return null;


  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-[var(--primary)]" />
          Insider Trading Monitor
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Track insider buy/sell activity for your watchlist stocks &mdash; last 90 days
        </p>
      </div>

      {/* Cluster Alerts (Top Priority) */}
      {data.clusterAlerts.length > 0 && (
        <div className="space-y-3">
          {data.clusterAlerts.map((cluster, i) => (
            <div key={i} className={`rounded-xl border p-5 ${cluster.strength === 'very_strong' ? 'border-[var(--gain)]/50 bg-[var(--gain)]/5' : cluster.strength === 'strong' ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`h-5 w-5 ${cluster.strength === 'very_strong' ? 'text-[var(--gain)]' : 'text-[var(--primary)]'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--gain)]">
                  Cluster Buy Alert — {cluster.strength.replace('_', ' ')}
                </span>
                <span className="text-xs font-bold ml-auto">{cluster.symbol}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80 mb-3">{cluster.interpretation}</p>
              <div className="flex flex-wrap gap-2">
                {cluster.insiders.map((ins, j) => (
                  <span key={j} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--background)]/50 border border-[var(--card-border)] text-[10px]">
                    <Crown className="h-3 w-3 text-[var(--gain)]" />
                    {ins.name} ({ins.role}) — {(ins.value / 1000).toFixed(0)}K
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
        {(['overview', 'clusters', 'transactions', 'records'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'}`}>
            {tab === 'records' ? 'Track Records' : tab}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Filings Tracked" value={data.totalFilingsTracked.toString()} icon={Shield} />
        <StatCard label="Cluster Alerts" value={data.clusterAlerts.length.toString()} icon={Zap} />
        <StatCard label="Stocks Monitored" value={data.watchlistSummaries.length.toString()} icon={Eye} />
        <StatCard label="Last Updated" value="Just now" icon={Clock} />
      </div>


      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          {data.watchlistSummaries.map(s => (
            <div key={s.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{s.symbol}</span>
                  <span className="text-[10px] text-[var(--muted)]">{s.companyName}</span>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${s.signal === 'bullish' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : s.signal === 'bearish' ? 'bg-[var(--loss)]/10 text-[var(--loss)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>
                  {s.signal}
                </span>
              </div>
              <p className="text-[10px] text-[var(--foreground)]/70 leading-relaxed mb-2">{s.signalExplanation}</p>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="text-[var(--gain)] font-medium">{s.buyCount} buys</span>
                <span className="text-[var(--loss)] font-medium">{s.sellCount} sells</span>
                <span className={`font-tabular font-medium ${s.netBuyValue >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  Net: {s.netBuyValue >= 0 ? '+' : ''}{(s.netBuyValue / 1000).toFixed(0)}K
                </span>
                {s.clusterAlerts.length > 0 && <span className="text-[var(--gain)] font-bold flex items-center gap-1"><Zap className="h-3 w-3" /> Cluster!</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Date</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--muted)]">Stock</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--muted)]">Insider</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--muted)]">Type</th>
                <th className="text-right px-3 py-2 font-medium text-[var(--muted)]">Shares</th>
                <th className="text-right px-4 py-2 font-medium text-[var(--muted)]">Value</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {data.recentTransactions.map(t => {
                  const typeInfo = getTransactionTypeLabel(t.transactionType);
                  return (
                    <tr key={t.id} className="hover:bg-[var(--background)]/30">
                      <td className="px-4 py-2.5 font-tabular">{new Date(t.filingDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td className="px-3 py-2.5 font-medium">{t.symbol}</td>
                      <td className="px-3 py-2.5"><span className="font-medium">{t.insiderName}</span><br/><span className="text-[var(--muted)]">{t.insiderRole}</span></td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${t.direction === 'buy' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'}`}>
                          {t.direction === 'buy' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {typeInfo.label}
                        </span>
                        {!typeInfo.meaningful && <span className="block text-[8px] text-[var(--muted)] mt-0.5">Less meaningful</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-tabular">{t.shares.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-tabular font-medium">{(t.totalValue / 1000).toFixed(0)}K</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Track Records Tab */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {data.watchlistSummaries.filter(s => s.trackRecords.length > 0).map(s => (
            <div key={s.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--card-border)]"><h3 className="text-sm font-semibold">{s.symbol} — Insider Track Records</h3></div>
              <div className="divide-y divide-[var(--card-border)]">
                {s.trackRecords.map((r, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div><span className="text-xs font-bold">{r.insiderName}</span> <span className="text-[10px] text-[var(--muted)]">({r.role})</span></div>
                      <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${r.reliability === 'strong' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : r.reliability === 'moderate' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>{r.reliability}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-2 text-[10px]">
                      <div><p className="text-[var(--muted)]">Trades</p><p className="font-bold">{r.totalTransactions}</p></div>
                      <div><p className="text-[var(--muted)]">Avg 6mo Return</p><p className={`font-bold ${r.avgReturn6mo >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>{r.avgReturn6mo >= 0 ? '+' : ''}{r.avgReturn6mo}%</p></div>
                      <div><p className="text-[var(--muted)]">Win Rate</p><p className="font-bold">{r.winRate}%</p></div>
                      <div><p className="text-[var(--muted)]">Best Trade</p><p className="font-bold text-[var(--gain)]">+{r.bestTrade.return6mo}%</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clusters Tab */}
      {activeTab === 'clusters' && (
        <div className="space-y-4">
          {data.clusterAlerts.length === 0 ? (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
              <Zap className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
              <p className="text-sm font-medium">No cluster alerts currently</p>
              <p className="text-xs text-[var(--muted)] mt-1">Cluster alerts fire when 2+ executives buy within a 2-week window.</p>
            </div>
          ) : data.clusterAlerts.map((c, i) => (
            <div key={i} className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-5 space-y-3">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-[var(--gain)]" /><span className="text-sm font-bold">{c.symbol}</span><span className="text-xs text-[var(--muted)]">{c.companyName}</span></div>
              <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">{c.interpretation}</p>
              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div><p className="text-[var(--muted)]">Window</p><p className="font-tabular">{c.windowStart} → {c.windowEnd}</p></div>
                <div><p className="text-[var(--muted)]">Total Value</p><p className="font-bold text-[var(--gain)]">{(c.totalValue / 1000000).toFixed(1)}M</p></div>
                <div><p className="text-[var(--muted)]">Insiders</p><p className="font-bold">{c.insiders.length} executives</p></div>
              </div>
            </div>
          ))}

          {/* Educational */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
            <h3 className="text-sm font-semibold mb-2">Why Cluster Buying Matters</h3>
            <p className="text-[11px] text-[var(--muted)] leading-relaxed">
              When multiple executives at the same company buy open-market shares within a short window, it is one of the strongest positive signals available to retail investors. Studies show stocks with cluster insider buying outperform the market by 8-15% on average over the following 12 months. The logic is simple: these people have the best information about their company&apos;s future, and they&apos;re spending their own money. One insider buying could be routine. Three buying in the same two weeks is a statement.
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
        <p className="text-[9px] text-[var(--muted)] leading-relaxed">
          <strong>Data source:</strong> SEC Form 4 filings, EU PDMR notifications, Danish Finanstilsynet. Data may be delayed. Insider activity is one signal among many — it should not be the sole basis for investment decisions. Past insider trading patterns do not guarantee future results.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Shield }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <Icon className="h-4 w-4 text-[var(--muted)] mb-1" />
      <p className="text-sm font-bold font-tabular">{value}</p>
      <p className="text-[9px] text-[var(--muted)]">{label}</p>
    </div>
  );
}
