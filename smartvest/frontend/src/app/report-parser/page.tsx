'use client';

import { useState, useCallback } from 'react';
import {
  FileUp, FileText, AlertTriangle, TrendingUp,
  TrendingDown, Minus, Users, DollarSign, Shield,
  BarChart3, MessageSquare, Loader2, CheckCircle2,
  ArrowRight, Sparkles,
} from 'lucide-react';
import {
  extractTextFromPDF, extractMetrics, formatLargeNumber,
  ParsedAnnualReport, ExtractedMetric, MetricFlag,
  ForwardGuidance, ParseProgress,
} from '@/lib/report-parser';

export default function ReportParserPage() {
  const [report, setReport] = useState<ParsedAnnualReport | null>(null);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File too large (max 50 MB)');
      return;
    }

    setError('');
    setReport(null);

    // Stage 1: Uploading
    setProgress({ stage: 'uploading', percent: 10, message: 'Reading file...' });
    await delay(300);

    // Stage 2: Extracting text
    setProgress({ stage: 'extracting', percent: 30, message: 'Extracting text from PDF...' });
    const text = await extractTextFromPDF(file);

    if (text.length < 100) {
      setError('Could not extract enough text from this PDF. The file may be image-based (scanned). Try a text-based PDF.');
      setProgress(null);
      return;
    }

    // Stage 3: Analyzing
    setProgress({ stage: 'analyzing', percent: 50, message: 'Identifying financial metrics...' });
    await delay(500);

    // Stage 4: Flagging
    setProgress({ stage: 'flagging', percent: 70, message: 'Checking for warning signs...' });
    await delay(300);

    // Stage 5: Interpreting
    setProgress({ stage: 'interpreting', percent: 90, message: 'Generating interpretation...' });
    const parsed = extractMetrics(text, file.name);
    await delay(400);

    // Done
    setProgress({ stage: 'complete', percent: 100, message: 'Analysis complete!' });
    setReport(parsed);
    await delay(500);
    setProgress(null);
  }, []);


  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-[var(--primary)]" />
          Annual Report Parser
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Upload any company&apos;s annual report (PDF) and get an instant structured analysis
        </p>
      </div>

      {/* Upload Area */}
      {!report && !progress && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
            dragOver
              ? 'border-[var(--primary)] bg-[var(--primary)]/5'
              : 'border-[var(--card-border)] hover:border-[var(--primary)]/50'
          }`}
        >
          <FileUp className="h-12 w-12 text-[var(--muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">Drop PDF here or click to upload</h3>
          <p className="text-xs text-[var(--muted)] mb-4">
            Supports annual reports in English or Danish. Max 50 MB.
          </p>
          <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer hover:bg-[var(--primary)]/80 transition-colors">
            <FileUp className="h-4 w-4" />
            Choose File
            <input type="file" accept=".pdf" onChange={handleFileInput} className="hidden" />
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--loss)] flex-shrink-0" />
          <p className="text-sm text-[var(--loss)]">{error}</p>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
            <p className="text-sm font-medium">{progress.message}</p>
          </div>
          <div className="h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}


      {/* Results */}
      {report && (
        <div className="space-y-6">
          {/* Company Header */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{report.companyName}</h2>
              <p className="text-xs text-[var(--muted)]">
                {report.reportYear} Annual Report &middot; {report.currency} &middot; Confidence: {(report.confidence * 100).toFixed(0)}%
              </p>
            </div>
            <button
              onClick={() => { setReport(null); setProgress(null); }}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Parse Another
            </button>
          </div>

          {/* Flags (if any) */}
          {report.flags.length > 0 && (
            <div className="space-y-2">
              {report.flags.map((flag, i) => (
                <FlagCard key={i} flag={flag} />
              ))}
            </div>
          )}

          {/* AI Interpretation */}
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--primary)]">What This Means (Plain English)</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--foreground)]/85">
              {report.aiInterpretation}
            </p>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard metric={report.metrics.revenue} icon={DollarSign} format="currency" currency={report.currency} />
            <MetricCard metric={report.metrics.revenueGrowth} icon={TrendingUp} format="percent" />
            <MetricCard metric={report.metrics.netProfitMargin} icon={BarChart3} format="percent" />
            <MetricCard metric={report.metrics.debtToEquity} icon={Shield} format="ratio" />
            <MetricCard metric={report.metrics.freeCashFlow} icon={DollarSign} format="currency" currency={report.currency} />
            <MetricCard metric={report.metrics.returnOnEquity} icon={TrendingUp} format="percent" />
            <MetricCard metric={report.metrics.employees} icon={Users} format="number" />
            <MetricCard metric={report.metrics.revenuePerEmployee} icon={Users} format="currency" currency={report.currency} />
          </div>


          {/* 3-Year Margin Trend */}
          {report.metrics.netProfitMargin3yr && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
              <h3 className="text-sm font-semibold mb-3">Net Profit Margin — 3 Year Trend</h3>
              <div className="flex items-end gap-4 h-20">
                {[report.metrics.netProfitMargin3yr.year1, report.metrics.netProfitMargin3yr.year2, report.metrics.netProfitMargin3yr.year3].map(({ year, value }) => (
                  <div key={year} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-tabular font-bold">{value}%</span>
                    <div className="w-full rounded-t bg-[var(--primary)]" style={{ height: `${Math.max(10, value * 3)}px` }} />
                    <span className="text-[9px] text-[var(--muted)]">{year}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forward Guidance */}
          {report.forwardGuidance.length > 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold">Forward Guidance from Management</h3>
              </div>
              <div className="space-y-2">
                {report.forwardGuidance.map((g, i) => (
                  <GuidanceItem key={i} guidance={g} />
                ))}
              </div>
            </div>
          )}

          {/* Low Confidence Warning */}
          {report.confidence < 0.5 && (
            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-[var(--warning)] mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-[var(--warning)] leading-relaxed">
                <strong>Low confidence extraction.</strong> Only {(report.confidence * 100).toFixed(0)}% of metrics could be reliably identified. This might be because the PDF uses images instead of text, is in an unusual format, or the financial data is presented differently than expected. Verify numbers manually.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ metric, icon: Icon, format, currency }: {
  metric: ExtractedMetric;
  icon: typeof TrendingUp;
  format: 'currency' | 'percent' | 'ratio' | 'number';
  currency?: string;
}) {
  if (metric.value === null) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 opacity-50">
        <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">{metric.label}</p>
        <p className="text-sm font-medium text-[var(--muted)] mt-1">Not found</p>
      </div>
    );
  }

  let displayValue = '';
  const val = typeof metric.value === 'number' ? metric.value : parseFloat(String(metric.value));
  switch (format) {
    case 'currency': displayValue = formatLargeNumber(val) + ' ' + (currency || ''); break;
    case 'percent': displayValue = val.toFixed(1) + '%'; break;
    case 'ratio': displayValue = val.toFixed(2) + 'x'; break;
    case 'number': displayValue = val.toLocaleString(); break;
  }

  const trendIcon = metric.trend === 'improving' ? TrendingUp :
                    metric.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = metric.trend === 'improving' ? 'text-[var(--gain)]' :
                     metric.trend === 'declining' ? 'text-[var(--loss)]' : 'text-[var(--muted)]';
  const TrendIcon = trendIcon;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">{metric.label}</p>
        <Icon className="h-3.5 w-3.5 text-[var(--muted)]" />
      </div>
      <p className="text-sm font-bold font-tabular">{displayValue}</p>
      {metric.yearOverYear !== null && metric.yearOverYear !== undefined && (
        <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          <span className="text-[10px] font-tabular font-medium">
            {metric.yearOverYear >= 0 ? '+' : ''}{metric.yearOverYear.toFixed(1)}% YoY
          </span>
        </div>
      )}
    </div>
  );
}

function FlagCard({ flag }: { flag: MetricFlag }) {
  const styles = {
    critical: { border: 'border-[var(--loss)]/30', bg: 'bg-[var(--loss)]/5', icon: 'text-[var(--loss)]', label: 'RED FLAG' },
    warning: { border: 'border-[var(--warning)]/30', bg: 'bg-[var(--warning)]/5', icon: 'text-[var(--warning)]', label: 'WARNING' },
    info: { border: 'border-[var(--primary)]/30', bg: 'bg-[var(--primary)]/5', icon: 'text-[var(--primary)]', label: 'NOTE' },
  }[flag.severity];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 flex items-start gap-3`}>
      <AlertTriangle className={`h-4 w-4 ${styles.icon} flex-shrink-0 mt-0.5`} />
      <div>
        <span className={`text-[8px] font-bold uppercase tracking-wider ${styles.icon}`}>{styles.label}</span>
        <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed mt-0.5">{flag.message}</p>
      </div>
    </div>
  );
}

function GuidanceItem({ guidance }: { guidance: ForwardGuidance }) {
  const categoryColor = {
    revenue: 'bg-[var(--gain)]/10 text-[var(--gain)]',
    profit: 'bg-[var(--primary)]/10 text-[var(--primary)]',
    growth: 'bg-blue-500/10 text-blue-400',
    investment: 'bg-purple-500/10 text-purple-400',
    risk: 'bg-[var(--warning)]/10 text-[var(--warning)]',
    general: 'bg-[var(--muted)]/10 text-[var(--muted)]',
  }[guidance.category];

  return (
    <div className="flex items-start gap-3 rounded-lg bg-[var(--background)]/50 p-3">
      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${categoryColor} flex-shrink-0 mt-0.5`}>
        {guidance.category}
      </span>
      <p className="text-[11px] text-[var(--foreground)]/70 leading-relaxed italic">
        &ldquo;{guidance.statement}&rdquo;
      </p>
    </div>
  );
}
