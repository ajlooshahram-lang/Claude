'use client';

import { useState } from 'react';
import {
  Search, TrendingUp, TrendingDown, Minus, Users,
  BarChart3, AlertTriangle, Sparkles, Crown, Target,
} from 'lucide-react';
import {
  getCompetitiveLandscape, getSupportedTickers,
  CompetitiveLandscape, CompetitorData,
} from '@/lib/competitive-landscape';
import { formatLargeNumber } from '@/lib/report-parser';

export default function CompetitorsPage() {
  const [ticker, setTicker] = useState('');
  const [landscape, setLandscape] = useState<CompetitiveLandscape | null>(null);
  const [loading, setLoading] = useState(false);
  const supported = getSupportedTickers();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const result = getCompetitiveLandscape(ticker.trim());
    setLandscape(result);
    setLoading(false);
  }

  function handleQuickSearch(t: string) {
    setTicker(t);
    setLoading(true);
    setTimeout(() => {
      setLandscape(getCompetitiveLandscape(t));
      setLoading(false);
    }, 400);
  }


  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-[var(--primary)]" />
          Competitive Landscape
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Search any stock to see its top competitors compared side-by-side
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
          <input
            type="text"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter stock ticker (e.g. NOVO-B.CO)"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!ticker.trim() || loading}
          className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/80 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Analyzing...' : 'Map Competitors'}
        </button>
      </form>

      {/* Quick Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Try:</span>
        {supported.map(t => (
          <button
            key={t}
            onClick={() => handleQuickSearch(t)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--primary)]/50 transition-colors"
          >
            {t}
          </button>
        ))}
      </div>


      {/* Results */}
      {landscape && (
        <div className="space-y-6">
          {/* Sector Header */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{landscape.targetName} — Competitive Set</h2>
              <p className="text-xs text-[var(--muted)]">Sector: {landscape.sector} &middot; {landscape.companies.length} companies</p>
            </div>
            <Target className="h-5 w-5 text-[var(--primary)]" />
          </div>

          {/* AI Analysis */}
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--primary)]">Quantitative Analysis</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--foreground)]/85">
              {landscape.aiAnalysis}
            </p>
          </div>

          {/* Disclaimer */}
          <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-[var(--warning)] flex-shrink-0" />
            <p className="text-[10px] text-[var(--warning)]">{landscape.disclaimer}</p>
          </div>

          {/* Comparison Table */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)]">
              <h3 className="text-sm font-semibold">Side-by-Side Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                    <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)] sticky left-0 bg-[var(--card)] z-10">Metric</th>
                    {landscape.companies.map(c => (
                      <th key={c.symbol} className={`text-center px-3 py-2.5 font-medium min-w-[120px] ${c.isTarget ? 'text-[var(--primary)] bg-[var(--primary)]/5' : 'text-[var(--muted)]'}`}>
                        {c.isTarget && <Crown className="h-3 w-3 mx-auto mb-0.5 text-[var(--primary)]" />}
                        <span className="block font-bold">{c.symbol}</span>
                        <span className="block text-[8px] opacity-70 truncate">{c.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {/* Price */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Price</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>{c.currentPrice.toLocaleString()} {c.currency}</td>
                    ))}
                  </tr>
                  {/* 1Y Return */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">1-Year Return</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular font-medium ${c.oneYearReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'} ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>
                        {c.oneYearReturn >= 0 ? '+' : ''}{c.oneYearReturn.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  {/* Revenue */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Revenue</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>{c.revenue > 0 ? formatLargeNumber(c.revenue) : '—'}</td>
                    ))}
                  </tr>
                  {/* Revenue Growth */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Revenue Growth</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular font-medium ${c.revenueGrowth >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'} ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>
                        {c.revenueGrowth >= 0 ? '+' : ''}{c.revenueGrowth}%
                      </td>
                    ))}
                  </tr>
                  {/* Profit Margin */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Net Margin</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular font-medium ${c.profitMargin >= 0 ? '' : 'text-[var(--loss)]'} ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>
                        {c.profitMargin.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  {/* P/E */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">P/E Ratio</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>{c.peRatio > 0 ? `${c.peRatio.toFixed(1)}x` : 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Beginner Score */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Beginner Score</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${c.beginnerScore >= 70 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : c.beginnerScore >= 50 ? 'bg-[var(--warning)]/10 text-[var(--warning)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'}`}>
                          {c.beginnerScore}/100
                        </span>
                      </td>
                    ))}
                  </tr>
                  {/* Dividend */}
                  <tr>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-[var(--card)] z-10">Dividend Yield</td>
                    {landscape.companies.map(c => (
                      <td key={c.symbol} className={`text-center px-3 py-2 font-tabular ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>{c.dividendYield > 0 ? `${c.dividendYield.toFixed(1)}%` : '—'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>


          {/* Company Descriptions */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)]">
              <h3 className="text-sm font-semibold">How Each Competitor Differs</h3>
            </div>
            <div className="divide-y divide-[var(--card-border)]">
              {landscape.companies.map(c => (
                <div key={c.symbol} className={`px-5 py-3 flex items-start gap-4 ${c.isTarget ? 'bg-[var(--primary)]/5' : ''}`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {c.isTarget ? <Crown className="h-4 w-4 text-[var(--primary)]" /> : <Minus className="h-4 w-4 text-[var(--muted)]" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold">{c.symbol}</span>
                      <span className="text-[10px] text-[var(--muted)]">{c.name}</span>
                      {c.isTarget && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">YOUR STOCK</span>}
                    </div>
                    <p className="text-[11px] text-[var(--foreground)]/70 leading-relaxed">{c.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
