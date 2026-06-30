'use client';

import {
  PenLine, TrendingUp, TrendingDown, CheckCircle2,
  XCircle, Lightbulb, ArrowRight,
} from 'lucide-react';
import { QuarterlyLetter } from '@/lib/reporting-engine';

interface Props {
  report: QuarterlyLetter;
}

export function ReportQuarterlyLetter({ report }: Props) {
  return (
    <div className="space-y-6 report-content" id={`report-${report.meta.id}`}>
      {/* Header */}
      <div className="border-b border-[var(--card-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <PenLine className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Quarterly Investor Letter</h2>
            <p className="text-xs text-[var(--muted)]">
              {report.quarter} &middot; {report.meta.periodStart} — {report.meta.periodEnd}
            </p>
          </div>
        </div>
      </div>


      {/* Letter Body - Styled as a printed letter */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 sm:p-8 space-y-6">
        {/* Greeting */}
        <p className="text-sm italic text-[var(--foreground)]/80">{report.greeting}</p>

        {/* Performance Summary */}
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--foreground)]/90">
            {report.performanceSummary}
          </p>

          {/* Performance Badge */}
          <div className="flex items-center gap-4 py-3 px-4 rounded-lg bg-[var(--background)]/50 border border-[var(--card-border)]">
            <div className="text-center">
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Portfolio</p>
              <p className={`text-lg font-bold font-tabular ${report.portfolioReturn >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {report.portfolioReturn >= 0 ? '+' : ''}{report.portfolioReturn.toFixed(1)}%
              </p>
            </div>
            <div className="h-8 w-px bg-[var(--card-border)]" />
            <div className="text-center">
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Benchmark</p>
              <p className="text-lg font-bold font-tabular text-[var(--foreground)]/70">
                {report.benchmarkReturn >= 0 ? '+' : ''}{report.benchmarkReturn.toFixed(1)}%
              </p>
            </div>
            <div className="h-8 w-px bg-[var(--card-border)]" />
            <div className="text-center">
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Alpha</p>
              <p className={`text-lg font-bold font-tabular ${
                (report.portfolioReturn - report.benchmarkReturn) >= 0 ? 'text-[var(--primary)]' : 'text-[var(--loss)]'
              }`}>
                {(report.portfolioReturn - report.benchmarkReturn) >= 0 ? '+' : ''}
                {(report.portfolioReturn - report.benchmarkReturn).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>


        {/* What I Did */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--primary)] flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5" />
            What I Did This Quarter
          </h3>
          <ul className="space-y-2 pl-1">
            {report.whatIDid.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--foreground)]/85 leading-relaxed">
                <span className="text-[var(--primary)] font-bold mt-0.5 flex-shrink-0">›</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What Worked */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gain)] flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            What Worked
          </h3>
          <ul className="space-y-2 pl-1">
            {report.whatWorked.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--foreground)]/85 leading-relaxed">
                <span className="text-[var(--gain)] font-bold mt-0.5 flex-shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What Did Not Work */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--loss)] flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5" />
            What Did Not Work
          </h3>
          <ul className="space-y-2 pl-1">
            {report.whatDidNot.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--foreground)]/85 leading-relaxed">
                <span className="text-[var(--loss)] font-bold mt-0.5 flex-shrink-0">✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>


        {/* Lessons Learned */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--warning)] flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5" />
            Lessons Learned
          </h3>
          <ul className="space-y-2 pl-1">
            {report.lessonsLearned.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--foreground)]/85 leading-relaxed">
                <span className="text-[var(--warning)] font-bold mt-0.5 flex-shrink-0">⚡</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Best & Worst Trade */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-[var(--gain)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--gain)]">Best Trade</span>
            </div>
            <p className="text-sm font-bold">{report.bestTrade.symbol}</p>
            <p className="text-xs font-tabular text-[var(--gain)] mt-0.5">
              +{report.bestTrade.returnPct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--foreground)]/70 mt-2 leading-relaxed">
              {report.bestTrade.narrative}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-[var(--loss)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--loss)]">Worst Trade</span>
            </div>
            <p className="text-sm font-bold">{report.worstTrade.symbol}</p>
            <p className="text-xs font-tabular text-[var(--loss)] mt-0.5">
              {report.worstTrade.returnPct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--foreground)]/70 mt-2 leading-relaxed">
              {report.worstTrade.narrative}
            </p>
          </div>
        </div>


        {/* Plan for Next Quarter */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--primary)] flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5" />
            Plan for Next Quarter
          </h3>
          <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4">
            <ul className="space-y-2">
              {report.planNextQuarter.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--foreground)]/85 leading-relaxed">
                  <span className="text-[var(--primary)] font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Closing */}
        <div className="pt-4 border-t border-[var(--card-border)]">
          <p className="text-[12px] leading-relaxed text-[var(--foreground)]/85 whitespace-pre-line">
            {report.closing}
          </p>
        </div>
      </div>

      {/* Report Metadata Footer */}
      <div className="text-center text-[9px] text-[var(--muted)] space-y-0.5">
        <p>Generated by SmartVest Reporting Engine</p>
        <p>{new Date(report.meta.generatedAt).toLocaleString('en-GB')}</p>
        <p className="italic">This letter is for personal reflection only — not investment advice.</p>
      </div>
    </div>
  );
}
