'use client';

import {
  Shield, AlertTriangle, Activity, TrendingDown,
  BarChart3, Grid3X3,
} from 'lucide-react';
import { MonthlyRiskReport, FactorExposure, CorrelationChange, ConcentrationRisk } from '@/lib/reporting-engine';

interface Props {
  report: MonthlyRiskReport;
}

export function ReportMonthlyRisk({ report }: Props) {
  return (
    <div className="space-y-6 report-content" id={`report-${report.meta.id}`}>
      {/* Header */}
      <div className="border-b border-[var(--card-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Monthly Risk Report</h2>
            <p className="text-xs text-[var(--muted)]">
              {report.meta.periodStart} — {report.meta.periodEnd} &middot; Parametric VaR &amp; Factor Model
            </p>
          </div>
        </div>
      </div>


      {/* Risk Metrics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <RiskMetricCard label="Sharpe Ratio" value={report.sharpeRatio.toFixed(2)} status={report.sharpeRatio > 1.5 ? 'good' : report.sharpeRatio > 1 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Sortino Ratio" value={report.sortinoRatio.toFixed(2)} status={report.sortinoRatio > 2 ? 'good' : report.sortinoRatio > 1.5 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Max Drawdown" value={`${report.maxDrawdown.toFixed(1)}%`} status={report.maxDrawdown > -5 ? 'good' : report.maxDrawdown > -10 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Beta" value={report.beta.toFixed(2)} status={report.beta <= 1 ? 'good' : report.beta <= 1.2 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Volatility (ann.)" value={`${report.volatility.toFixed(1)}%`} status={report.volatility < 15 ? 'good' : report.volatility < 20 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Tracking Error" value={`${report.trackingError.toFixed(1)}%`} status="neutral" />
        <RiskMetricCard label="Info Ratio" value={report.informationRatio.toFixed(2)} status={report.informationRatio > 0.5 ? 'good' : report.informationRatio > 0 ? 'ok' : 'bad'} />
        <RiskMetricCard label="Bench Vol" value={`${report.benchmarkVol.toFixed(1)}%`} status="neutral" />
      </div>

      {/* Value-at-Risk Section */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-semibold">Value-at-Risk (VaR)</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <VaRCard label="95% 1-Day VaR" value={report.var.var95_1day} pct={report.var.var95Pct} />
          <VaRCard label="99% 1-Day VaR" value={report.var.var99_1day} pct={(report.var.var99_1day / report.var.portfolioValue) * 100} />
          <VaRCard label="95% 10-Day VaR" value={report.var.var95_10day} pct={(report.var.var95_10day / report.var.portfolioValue) * 100} />
          <VaRCard label="CVaR (ES) 95%" value={report.var.cvar95} pct={(report.var.cvar95 / report.var.portfolioValue) * 100} />
        </div>


        {/* VaR Interpretation */}
        <div className="rounded-lg bg-[var(--background)]/50 border border-[var(--card-border)] p-3">
          <p className="text-[10px] text-[var(--foreground)]/70 leading-relaxed">
            <strong>Interpretation:</strong> With 95% confidence, the portfolio will not lose more than{' '}
            <span className="font-bold text-[var(--loss)]">{report.var.var95_1day.toLocaleString()} DKK</span> ({report.var.var95Pct.toFixed(2)}%) in a single trading day.
            Over 10 days, max expected loss is{' '}
            <span className="font-bold text-[var(--loss)]">{report.var.var95_10day.toLocaleString()} DKK</span>.
            The Conditional VaR (Expected Shortfall) indicates that when losses <em>do</em> exceed VaR, the average loss would be{' '}
            <span className="font-bold text-[var(--loss)]">{report.var.cvar95.toLocaleString()} DKK</span>.
          </p>
          <p className="text-[9px] text-[var(--muted)] mt-2">
            Methodology: {report.var.methodology}
          </p>
        </div>
      </div>

      {/* Factor Exposures */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Factor Exposures (Multi-Factor Model)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left py-2 px-3 font-medium text-[var(--muted)]">Factor</th>
                <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">Beta (β)</th>
                <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">t-Stat</th>
                <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">Risk Contribution</th>
                <th className="text-left py-2 px-3 font-medium text-[var(--muted)]">Exposure Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {report.factorExposures.map((f) => (
                <FactorRow key={f.factor} factor={f} />
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Correlation Matrix Changes */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Grid3X3 className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Correlation Matrix Changes</h3>
          <span className="text-[9px] text-[var(--muted)]">(vs previous month)</span>
        </div>
        <div className="space-y-2">
          {report.correlationChanges.map((cc, i) => (
            <CorrelationChangeRow key={i} change={cc} />
          ))}
        </div>
        <p className="text-[9px] text-[var(--muted)] mt-3">
          Significant correlation changes may indicate regime shifts or breakdown in diversification benefits.
          &quot;Breaking&quot; changes (|Δρ| &gt; 0.25) require immediate attention.
        </p>
      </div>

      {/* Concentration Risks */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
          <h3 className="text-sm font-semibold">Concentration Risk Alerts</h3>
        </div>
        <div className="space-y-3">
          {report.concentrationRisks.map((risk, i) => (
            <ConcentrationRiskRow key={i} risk={risk} />
          ))}
        </div>
      </div>


      {/* Risk Budget Summary */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold">Risk Budget Utilization</h3>
        </div>
        <div className="space-y-3">
          <RiskBudgetBar label="Market Risk (β)" usage={report.beta * 100} limit={120} />
          <RiskBudgetBar label="Tracking Error" usage={report.trackingError} limit={8} />
          <RiskBudgetBar label="Single Stock Max" usage={28.4} limit={20} />
          <RiskBudgetBar label="Sector Max" usage={38.2} limit={30} />
          <RiskBudgetBar label="Volatility" usage={report.volatility} limit={20} />
        </div>
        <p className="text-[9px] text-[var(--muted)] mt-3">
          Red bars indicate limit breaches requiring action. Amber indicates approaching limits.
        </p>
      </div>
    </div>
  );
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskMetricCard({ label, value, status }: {
  label: string; value: string;
  status: 'good' | 'ok' | 'bad' | 'neutral';
}) {
  const borderColor = {
    good: 'border-[var(--gain)]/30',
    ok: 'border-[var(--warning)]/30',
    bad: 'border-[var(--loss)]/30',
    neutral: 'border-[var(--card-border)]',
  }[status];
  const valueColor = {
    good: 'text-[var(--gain)]',
    ok: 'text-[var(--warning)]',
    bad: 'text-[var(--loss)]',
    neutral: 'text-[var(--foreground)]',
  }[status];

  return (
    <div className={`rounded-xl border ${borderColor} bg-[var(--card)] p-3`}>
      <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-tabular mt-1 ${valueColor}`}>{value}</p>
    </div>
  );
}

function VaRCard({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="rounded-lg border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-3">
      <p className="text-[9px] text-[var(--muted)] font-medium">{label}</p>
      <p className="text-sm font-bold font-tabular text-[var(--loss)] mt-1">
        {value.toLocaleString()} DKK
      </p>
      <p className="text-[9px] text-[var(--muted)] font-tabular">{pct.toFixed(2)}% of portfolio</p>
    </div>
  );
}


function FactorRow({ factor }: { factor: FactorExposure }) {
  const isSignificant = Math.abs(factor.tStat) > 2;
  const barWidth = Math.min(100, factor.contribution);

  return (
    <tr>
      <td className="px-3 py-2.5 font-medium">{factor.factor}</td>
      <td className={`text-right px-3 py-2.5 font-tabular font-medium ${
        factor.beta > 0 ? 'text-[var(--gain)]' : factor.beta < 0 ? 'text-[var(--loss)]' : ''
      }`}>
        {factor.beta >= 0 ? '+' : ''}{factor.beta.toFixed(2)}
      </td>
      <td className={`text-right px-3 py-2.5 font-tabular ${isSignificant ? 'font-bold' : 'text-[var(--muted)]'}`}>
        {factor.tStat.toFixed(1)}
        {isSignificant && <span className="text-[8px] ml-0.5">**</span>}
      </td>
      <td className="text-right px-3 py-2.5 font-tabular">{factor.contribution.toFixed(1)}%</td>
      <td className="px-3 py-2.5">
        <div className="h-3 w-full bg-[var(--card-border)]/30 rounded overflow-hidden">
          <div
            className={`h-full rounded ${factor.beta > 0 ? 'bg-[var(--primary)]' : 'bg-[var(--loss)]'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </td>
    </tr>
  );
}

function CorrelationChangeRow({ change }: { change: CorrelationChange }) {
  const sigColor = {
    breaking: 'border-[var(--loss)]/40 bg-[var(--loss)]/5',
    notable: 'border-[var(--warning)]/40 bg-[var(--warning)]/5',
    minor: 'border-[var(--card-border)] bg-[var(--card)]',
  }[change.significance];
  const sigLabel = {
    breaking: { text: 'BREAKING', color: 'text-[var(--loss)]' },
    notable: { text: 'NOTABLE', color: 'text-[var(--warning)]' },
    minor: { text: 'MINOR', color: 'text-[var(--muted)]' },
  }[change.significance];

  return (
    <div className={`rounded-lg border ${sigColor} p-3 flex items-center gap-4`}>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium">
          {change.pair[0]} ↔ {change.pair[1]}
        </p>
        <div className="flex items-center gap-3 mt-1 text-[10px] font-tabular">
          <span className="text-[var(--muted)]">ρ: {change.previousCorr.toFixed(2)}</span>
          <span>→</span>
          <span className="font-medium">{change.currentCorr.toFixed(2)}</span>
          <span className={`font-bold ${change.change > 0 ? 'text-[var(--warning)]' : 'text-[var(--primary)]'}`}>
            (Δ {change.change > 0 ? '+' : ''}{change.change.toFixed(2)})
          </span>
        </div>
      </div>
      <span className={`text-[8px] font-bold uppercase tracking-wider ${sigLabel.color}`}>
        {sigLabel.text}
      </span>
    </div>
  );
}


function ConcentrationRiskRow({ risk }: { risk: ConcentrationRisk }) {
  const severityStyle = {
    critical: { border: 'border-[var(--loss)]/40', bg: 'bg-[var(--loss)]/10', label: 'CRITICAL', color: 'text-[var(--loss)]' },
    warning: { border: 'border-[var(--warning)]/40', bg: 'bg-[var(--warning)]/10', label: 'WARNING', color: 'text-[var(--warning)]' },
    watch: { border: 'border-[var(--primary)]/40', bg: 'bg-[var(--primary)]/10', label: 'WATCH', color: 'text-[var(--primary)]' },
  }[risk.severity];

  const overshoot = risk.exposure - risk.threshold;

  return (
    <div className={`rounded-lg border ${severityStyle.border} ${severityStyle.bg} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium">{risk.description}</p>
        <span className={`text-[8px] font-bold uppercase tracking-wider ${severityStyle.color}`}>
          {severityStyle.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-[var(--card-border)]/40 overflow-hidden relative">
          {/* Threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--foreground)]/40 z-10"
            style={{ left: `${Math.min(100, risk.threshold)}%` }}
          />
          {/* Exposure bar */}
          <div
            className={`h-full rounded-full ${
              risk.severity === 'critical' ? 'bg-[var(--loss)]' :
              risk.severity === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'
            }`}
            style={{ width: `${Math.min(100, risk.exposure)}%` }}
          />
        </div>
        <span className="text-[10px] font-tabular font-medium w-20 text-right">
          {risk.exposure.toFixed(1)}% / {risk.threshold}%
        </span>
      </div>
      {overshoot > 0 && (
        <p className={`text-[9px] mt-1.5 ${severityStyle.color}`}>
          Exceeds limit by {overshoot.toFixed(1)} percentage points — action recommended
        </p>
      )}
    </div>
  );
}

function RiskBudgetBar({ label, usage, limit }: { label: string; usage: number; limit: number }) {
  const pct = (usage / limit) * 100;
  const isBreached = usage > limit;
  const isNear = usage > limit * 0.8;

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] w-28 flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-[var(--card-border)]/30 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${
            isBreached ? 'bg-[var(--loss)]' : isNear ? 'bg-[var(--warning)]' : 'bg-[var(--gain)]'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-[10px] font-tabular w-20 text-right ${
        isBreached ? 'text-[var(--loss)] font-bold' : isNear ? 'text-[var(--warning)]' : 'text-[var(--muted)]'
      }`}>
        {usage.toFixed(1)} / {limit}
      </span>
    </div>
  );
}
