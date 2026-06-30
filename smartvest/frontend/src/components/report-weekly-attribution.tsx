'use client';

import {
  BarChart3, TrendingUp, TrendingDown, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { WeeklyAttribution, AttributionComponent, SectorAttribution } from '@/lib/reporting-engine';

interface Props {
  report: WeeklyAttribution;
}

export function ReportWeeklyAttribution({ report }: Props) {
  const components = [
    report.stockSelection,
    report.sectorAllocation,
    report.marketTiming,
    report.currencyEffect,
    report.residual,
  ];

  const totalBps = components.reduce((s, c) => s + c.contribution, 0);

  return (
    <div className="space-y-6 report-content" id={`report-${report.meta.id}`}>
      {/* Header */}
      <div className="border-b border-[var(--card-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Weekly Performance Attribution</h2>
            <p className="text-xs text-[var(--muted)]">
              {report.meta.periodStart} — {report.meta.periodEnd} &middot; Brinson-Fachler Model
            </p>
          </div>
        </div>
      </div>


      {/* Performance Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Portfolio</p>
          <p className={`text-xl font-bold font-tabular mt-1 ${report.totalReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {report.totalReturn >= 0 ? '+' : ''}{report.totalReturn.toFixed(2)}%
          </p>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">Total return</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Benchmark</p>
          <p className={`text-xl font-bold font-tabular mt-1 ${report.benchmarkReturn >= 0 ? 'text-[var(--foreground)]' : 'text-[var(--loss)]'}`}>
            {report.benchmarkReturn >= 0 ? '+' : ''}{report.benchmarkReturn.toFixed(2)}%
          </p>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">OMX C25</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${
          report.activeReturn >= 0
            ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
            : 'border-[var(--loss)]/30 bg-[var(--loss)]/5'
        }`}>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Active Return (α)</p>
          <p className={`text-xl font-bold font-tabular mt-1 ${report.activeReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {report.activeReturn >= 0 ? '+' : ''}{report.activeReturn.toFixed(2)}%
          </p>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">{totalBps >= 0 ? '+' : ''}{totalBps} bps</p>
        </div>
      </div>


      {/* Attribution Waterfall */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-400" />
          Return Attribution Decomposition
        </h3>
        <div className="space-y-3">
          {components.filter(c => c.contribution !== 0).map((comp) => (
            <AttributionBar key={comp.label} component={comp} maxBps={Math.max(...components.map(c => Math.abs(c.contribution)))} />
          ))}
        </div>
        {/* Waterfall total */}
        <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex items-center justify-between">
          <span className="text-xs font-bold">Total Active Return</span>
          <span className={`text-sm font-bold font-tabular ${totalBps >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {totalBps >= 0 ? '+' : ''}{totalBps} bps
          </span>
        </div>
      </div>

      {/* Detailed Explanations */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <h3 className="text-sm font-semibold">Attribution Commentary</h3>
        {components.filter(c => c.contribution !== 0).map((comp) => (
          <div key={comp.label} className="border-l-2 border-[var(--primary)]/30 pl-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold">{comp.label}</span>
              <span className={`text-[10px] font-tabular font-medium px-1.5 py-0.5 rounded ${
                comp.contribution >= 0 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--loss)]/10 text-[var(--loss)]'
              }`}>
                {comp.contribution >= 0 ? '+' : ''}{comp.contribution} bps
              </span>
            </div>
            <p className="text-[11px] text-[var(--foreground)]/70 leading-relaxed">
              {comp.explanation}
            </p>
          </div>
        ))}
      </div>


      {/* Sector Attribution Table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)]">
          <h3 className="text-sm font-semibold">Sector-Level Attribution (Brinson-Fachler)</h3>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">
            Decomposing active return into allocation, selection, and interaction effects
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Sector</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Port W%</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Bench W%</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Port Ret</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Bench Ret</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Alloc</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Select</th>
                <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {report.sectorDetail.map((s) => (
                <SectorRow key={s.sector} sector={s} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="text-right px-3 py-2.5 font-tabular">100%</td>
                <td className="text-right px-3 py-2.5 font-tabular">100%</td>
                <td className="text-right px-3 py-2.5 font-tabular text-[var(--gain)]">+{report.totalReturn.toFixed(1)}%</td>
                <td className="text-right px-3 py-2.5 font-tabular">+{report.benchmarkReturn.toFixed(1)}%</td>
                <td className="text-right px-3 py-2.5 font-tabular">
                  {report.sectorDetail.reduce((s, x) => s + x.allocationEffect, 0)}
                </td>
                <td className="text-right px-3 py-2.5 font-tabular">
                  {report.sectorDetail.reduce((s, x) => s + x.selectionEffect, 0)}
                </td>
                <td className={`text-right px-3 py-2.5 font-tabular ${totalBps >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  {totalBps >= 0 ? '+' : ''}{report.sectorDetail.reduce((s, x) => s + x.totalEffect, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


      {/* Top Contributors & Detractors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpRight className="h-4 w-4 text-[var(--gain)]" />
            <h3 className="text-xs font-semibold text-[var(--gain)]">Top Contributors</h3>
          </div>
          <div className="space-y-2">
            {report.topContributors.map((c, i) => (
              <div key={c.symbol} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--muted)] w-4">{i + 1}.</span>
                  <span className="text-[11px] font-medium">{c.symbol}</span>
                </div>
                <span className="text-[11px] font-tabular font-medium text-[var(--gain)]">
                  +{c.contribution} bps
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownRight className="h-4 w-4 text-[var(--loss)]" />
            <h3 className="text-xs font-semibold text-[var(--loss)]">Top Detractors</h3>
          </div>
          <div className="space-y-2">
            {report.topDetractors.map((c, i) => (
              <div key={c.symbol} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--muted)] w-4">{i + 1}.</span>
                  <span className="text-[11px] font-medium">{c.symbol}</span>
                </div>
                <span className="text-[11px] font-tabular font-medium text-[var(--loss)]">
                  {c.contribution} bps
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function AttributionBar({ component, maxBps }: { component: AttributionComponent; maxBps: number }) {
  const isPositive = component.contribution >= 0;
  const barWidth = Math.min(100, (Math.abs(component.contribution) / maxBps) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 flex-shrink-0">
        <span className="text-[11px] font-medium">{component.label}</span>
      </div>
      <div className="flex-1 h-6 relative flex items-center">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--card-border)]" />
        {/* Bar */}
        <div
          className={`absolute h-5 rounded-sm ${isPositive ? 'bg-[var(--gain)]/70' : 'bg-[var(--loss)]/70'}`}
          style={{
            left: isPositive ? '50%' : `${50 - barWidth / 2}%`,
            width: `${barWidth / 2}%`,
            ...(isPositive ? {} : { right: '50%', left: 'auto', width: `${barWidth / 2}%` }),
          }}
        />
      </div>
      <div className="w-16 text-right flex-shrink-0">
        <span className={`text-[11px] font-tabular font-bold ${isPositive ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          {isPositive ? '+' : ''}{component.contribution} bps
        </span>
      </div>
    </div>
  );
}

function SectorRow({ sector }: { sector: SectorAttribution }) {
  const totalColor = sector.totalEffect >= 0 ? 'text-[var(--gain)]' : sector.totalEffect < 0 ? 'text-[var(--loss)]' : '';

  return (
    <tr>
      <td className="px-4 py-2.5 font-medium">{sector.sector}</td>
      <td className="text-right px-3 py-2.5 font-tabular">{sector.portfolioWeight}%</td>
      <td className="text-right px-3 py-2.5 font-tabular text-[var(--muted)]">{sector.benchmarkWeight}%</td>
      <td className={`text-right px-3 py-2.5 font-tabular ${sector.portfolioReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {sector.portfolioReturn >= 0 ? '+' : ''}{sector.portfolioReturn.toFixed(1)}%
      </td>
      <td className={`text-right px-3 py-2.5 font-tabular ${sector.benchmarkReturn >= 0 ? '' : 'text-[var(--loss)]'}`}>
        {sector.benchmarkReturn >= 0 ? '+' : ''}{sector.benchmarkReturn.toFixed(1)}%
      </td>
      <td className={`text-right px-3 py-2.5 font-tabular ${sector.allocationEffect >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {sector.allocationEffect >= 0 ? '+' : ''}{sector.allocationEffect}
      </td>
      <td className={`text-right px-3 py-2.5 font-tabular ${sector.selectionEffect >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {sector.selectionEffect >= 0 ? '+' : ''}{sector.selectionEffect}
      </td>
      <td className={`text-right px-3 py-2.5 font-tabular font-medium ${totalColor}`}>
        {sector.totalEffect >= 0 ? '+' : ''}{sector.totalEffect}
      </td>
    </tr>
  );
}
