'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Award, Info,
  BarChart3, Target, Calendar,
} from 'lucide-react';
import {
  getBenchmarkComparison, BenchmarkComparison, BenchmarkSeries,
} from '@/lib/nordic-benchmark';

export default function BenchmarkPage() {
  const [period, setPeriod] = useState<12 | 24 | 36>(36);
  const [data, setData] = useState<BenchmarkComparison | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

  useEffect(() => {
    setData(getBenchmarkComparison(period));
  }, [period]);

  if (!data) return null;

  const allSeries = [data.portfolio, ...data.benchmarks];
  const maxValue = Math.max(...allSeries.flatMap(s => s.dataPoints.map(d => d.value)));
  const minValue = Math.min(...allSeries.flatMap(s => s.dataPoints.map(d => d.value)));


  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-[var(--primary)]" />
            Nordic Benchmark
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Performance vs benchmarks calibrated for a Danish retail investor
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {([12, 24, 36] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === p ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'}`}>
              {p/12}Y
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Rank Badge */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${
        data.portfolioRank <= 2 ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' :
        data.portfolioRank <= 3 ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5' :
        'border-[var(--warning)]/30 bg-[var(--warning)]/5'
      }`}>
        <div className={`h-14 w-14 rounded-xl flex items-center justify-center text-xl font-bold ${
          data.portfolioRank === 1 ? 'bg-[var(--gain)] text-white' :
          data.portfolioRank <= 2 ? 'bg-[var(--gain)]/20 text-[var(--gain)]' :
          data.portfolioRank <= 3 ? 'bg-[var(--primary)]/20 text-[var(--primary)]' :
          'bg-[var(--warning)]/20 text-[var(--warning)]'
        }`}>
          #{data.portfolioRank}
        </div>
        <div>
          <p className="text-sm font-bold">
            Your portfolio ranks #{data.portfolioRank} of 5
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            +{data.portfolio.totalReturn.toFixed(1)}% total return over {period} months ({data.portfolio.annualizedReturn.toFixed(1)}% annualized)
          </p>
        </div>
      </div>

      {/* Chart Area */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Performance Comparison (indexed to 100)</h2>
          <span className="text-[9px] text-[var(--muted)]">{data.startDate} → {data.endDate}</span>
        </div>

        {/* SVG Chart */}
        <div className="relative h-64 w-full">
          <svg viewBox={`0 0 800 250`} className="w-full h-full" preserveAspectRatio="none">
            {/* Grid lines */}
            {[100, (100 + maxValue) / 2, maxValue].map((v, i) => (
              <line key={i} x1="0" y1={250 - ((v - minValue) / (maxValue - minValue)) * 230 - 10} x2="800" y2={250 - ((v - minValue) / (maxValue - minValue)) * 230 - 10} stroke="var(--card-border)" strokeWidth="0.5" strokeDasharray="4,4" />
            ))}

            {/* Series lines */}
            {allSeries.map(series => {
              const points = series.dataPoints.map((dp, i) => {
                const x = (i / (series.dataPoints.length - 1)) * 800;
                const y = 250 - ((dp.value - minValue) / (maxValue - minValue)) * 230 - 10;
                return `${x},${y}`;
              }).join(' ');

              const isHovered = hoveredSeries === series.id || hoveredSeries === null;
              return (
                <polyline
                  key={series.id}
                  points={points}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.id === 'portfolio' ? 3 : 1.5}
                  opacity={isHovered ? 1 : 0.3}
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4">
          {allSeries.map(s => (
            <button
              key={s.id}
              onMouseEnter={() => setHoveredSeries(s.id)}
              onMouseLeave={() => setHoveredSeries(null)}
              className="flex items-center gap-2 text-[10px] px-2 py-1 rounded-lg hover:bg-[var(--background)]/50 transition-colors"
            >
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-medium">{s.shortName}</span>
              <span className={`font-tabular font-bold ${s.totalReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                +{s.totalReturn.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      </div>


      {/* Return Comparison Table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-semibold">Return Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                <th className="text-left px-5 py-2.5 font-medium text-[var(--muted)]">Benchmark</th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--muted)]">Total Return</th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--muted)]">Annualized</th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--muted)]">100K → Today</th>
                <th className="text-right px-5 py-2.5 font-medium text-[var(--muted)]">vs Portfolio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {allSeries.map(s => {
                const diff = s.totalReturn - data.portfolio.totalReturn;
                const valueOf100k = Math.round(100000 * s.currentValue / 100);
                return (
                  <tr key={s.id} className={s.id === 'portfolio' ? 'bg-[var(--primary)]/5 font-medium' : ''}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className={s.id === 'portfolio' ? 'font-bold' : ''}>{s.name}</span>
                      </div>
                    </td>
                    <td className={`text-right px-4 py-2.5 font-tabular font-medium ${s.totalReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      +{s.totalReturn.toFixed(1)}%
                    </td>
                    <td className="text-right px-4 py-2.5 font-tabular">
                      {s.annualizedReturn.toFixed(1)}%/yr
                    </td>
                    <td className="text-right px-4 py-2.5 font-tabular font-medium">
                      {valueOf100k.toLocaleString()} DKK
                    </td>
                    <td className={`text-right px-5 py-2.5 font-tabular font-medium ${
                      s.id === 'portfolio' ? 'text-[var(--foreground)]' :
                      diff > 0 ? 'text-[var(--loss)]' : 'text-[var(--gain)]'
                    }`}>
                      {s.id === 'portfolio' ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plain English Conclusion */}
      <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-bold text-[var(--primary)]">What This Means (Plain English)</h2>
        </div>
        <p className="text-[12px] leading-relaxed text-[var(--foreground)]/85">
          {data.conclusion}
        </p>
      </div>

      {/* Detailed Analysis */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--muted)]" />
          Detailed Breakdown
        </h2>
        <div className="text-[11px] leading-relaxed text-[var(--foreground)]/80 whitespace-pre-line">
          {data.detailedAnalysis}
        </div>
      </div>

      {/* Benchmark Descriptions */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-[var(--muted)]" />
          <h2 className="text-sm font-bold">What Each Benchmark Represents</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.benchmarks.map(b => (
            <div key={b.id} className="rounded-lg border border-[var(--card-border)] p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-xs font-bold">{b.shortName}</span>
              </div>
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why This Matters More Than S&P 500 */}
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--warning)] mb-2">
          Why Not Compare to the S&P 500?
        </h2>
        <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">
          The S&P 500 is an American benchmark denominated in USD. As a Danish investor, comparing to it is misleading for three reasons: (1) currency risk — a 15% S&P return becomes 5% if USD weakens 10% vs DKK; (2) tax differences — Danish aktieindkomst rules mean your after-tax return differs from a US investor&apos;s; (3) accessibility — you can&apos;t buy the S&P 500 in your ASK without ETF wrapper costs. The OMXC25 and a 60/40 global-Danish portfolio are what you would ACTUALLY earn with minimal effort — that is your true opportunity cost and the honest benchmark for judging your active investing skill.
        </p>
      </div>
    </div>
  );
}
