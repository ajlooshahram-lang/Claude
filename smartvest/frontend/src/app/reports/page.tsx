'use client';

import { useState, useEffect } from 'react';
import {
  FileText, Sun, BarChart3, Shield, PenLine,
  Download, Trash2, Clock, Play, Loader2,
} from 'lucide-react';
import {
  ReportType, StoredReport, getStoredReports, deleteReport,
  generateDailyBriefing, generateWeeklyAttribution,
  generateMonthlyRiskReport, generateQuarterlyLetter,
  exportReportAsPDF, getReportTypeLabel, getReportTypeIcon,
  DailyBriefing, WeeklyAttribution, MonthlyRiskReport, QuarterlyLetter,
} from '@/lib/reporting-engine';
import { ReportDailyBriefing } from '@/components/report-daily-briefing';
import { ReportWeeklyAttribution } from '@/components/report-weekly-attribution';
import { ReportMonthlyRisk } from '@/components/report-monthly-risk';
import { ReportQuarterlyLetter } from '@/components/report-quarterly-letter';

export default function ReportsPage() {
  const [history, setHistory] = useState<StoredReport[]>([]);
  const [activeReport, setActiveReport] = useState<StoredReport | null>(null);
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [view, setView] = useState<'selector' | 'report'>('selector');

  useEffect(() => {
    setHistory(getStoredReports());
  }, []);


  function handleGenerate(type: ReportType) {
    setGenerating(type);
    // Simulate async generation with slight delay for UX
    setTimeout(() => {
      let report: StoredReport;
      switch (type) {
        case 'daily': {
          const data = generateDailyBriefing();
          report = { meta: data.meta, data };
          break;
        }
        case 'weekly': {
          const data = generateWeeklyAttribution();
          report = { meta: data.meta, data };
          break;
        }
        case 'monthly': {
          const data = generateMonthlyRiskReport();
          report = { meta: data.meta, data };
          break;
        }
        case 'quarterly': {
          const data = generateQuarterlyLetter();
          report = { meta: data.meta, data };
          break;
        }
      }
      setActiveReport(report);
      setHistory(getStoredReports());
      setView('report');
      setGenerating(null);
    }, 800);
  }

  function handleViewReport(report: StoredReport) {
    setActiveReport(report);
    setView('report');
  }

  function handleDeleteReport(id: string) {
    deleteReport(id);
    setHistory(getStoredReports());
    if (activeReport?.meta.id === id) {
      setActiveReport(null);
      setView('selector');
    }
  }

  function handleExportPDF() {
    if (activeReport) {
      exportReportAsPDF(activeReport.meta.id);
    }
  }


  // Report type cards configuration
  const reportTypes: { type: ReportType; icon: typeof Sun; color: string; description: string; frequency: string }[] = [
    { type: 'daily', icon: Sun, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', description: 'Overnight moves, watchlist movers, economic calendar, market regime', frequency: 'Every morning' },
    { type: 'weekly', icon: BarChart3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', description: 'Stock selection, sector allocation, market timing, currency attribution', frequency: 'End of week' },
    { type: 'monthly', icon: Shield, color: 'text-red-400 bg-red-500/10 border-red-500/30', description: 'VaR metrics, factor exposures, correlation changes, concentration risks', frequency: 'Month-end' },
    { type: 'quarterly', icon: PenLine, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', description: 'Personal reflection: what worked, what didn\'t, lessons, next quarter plan', frequency: 'Quarter-end' },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--primary)]" />
            Reports
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Professional-grade investment reports &mdash; exportable as PDF
          </p>
        </div>
        {view === 'report' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
            <button
              onClick={() => { setView('selector'); setActiveReport(null); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>


      {/* Report View */}
      {view === 'report' && activeReport && (
        <div className="print:p-0">
          {activeReport.meta.type === 'daily' && (
            <ReportDailyBriefing report={activeReport.data as DailyBriefing} />
          )}
          {activeReport.meta.type === 'weekly' && (
            <ReportWeeklyAttribution report={activeReport.data as WeeklyAttribution} />
          )}
          {activeReport.meta.type === 'monthly' && (
            <ReportMonthlyRisk report={activeReport.data as MonthlyRiskReport} />
          )}
          {activeReport.meta.type === 'quarterly' && (
            <ReportQuarterlyLetter report={activeReport.data as QuarterlyLetter} />
          )}
        </div>
      )}

      {/* Selector View */}
      {view === 'selector' && (
        <>
          {/* Generate Report Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reportTypes.map(({ type, icon: Icon, color, description, frequency }) => (
              <div
                key={type}
                className={`rounded-xl border bg-[var(--card)] p-5 transition-all hover:scale-[1.01] ${
                  color.split(' ').slice(2).join(' ')
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color.split(' ').slice(0, 2).join(' ')}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-medium">
                    {frequency}
                  </span>
                </div>
                <h3 className="text-sm font-bold mb-1">{getReportTypeLabel(type)}</h3>
                <p className="text-[11px] text-[var(--muted)] leading-relaxed mb-4">
                  {description}
                </p>
                <button
                  onClick={() => handleGenerate(type)}
                  disabled={generating !== null}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    generating === type
                      ? 'bg-[var(--primary)]/20 text-[var(--primary)] cursor-wait'
                      : 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80'
                  } disabled:opacity-50`}
                >
                  {generating === type ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Generate Report
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>


          {/* Report History */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--muted)]" />
              <h3 className="text-sm font-semibold">Report History</h3>
              <span className="text-[10px] text-[var(--muted)] ml-auto">
                {history.length} report{history.length !== 1 ? 's' : ''}
              </span>
            </div>

            {history.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
                <p className="text-sm font-medium">No reports generated yet</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Generate your first report using the cards above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--card-border)] max-h-[400px] overflow-y-auto">
                {history.map((report) => (
                  <div
                    key={report.meta.id}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--background)]/50 transition-colors"
                  >
                    <span className="text-lg flex-shrink-0">
                      {getReportTypeIcon(report.meta.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{report.meta.title}</p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {new Date(report.meta.generatedAt).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleViewReport(report)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteReport(report.meta.id)}
                        className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/10 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* PDF Export Info */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
            <Download className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
            <div className="text-[10px] text-[var(--muted)] leading-relaxed space-y-1">
              <p><strong>PDF Export:</strong> Open any report and click &ldquo;Export PDF&rdquo; to save a print-optimized version. The browser&apos;s print dialog will open — select &ldquo;Save as PDF&rdquo; as the destination.</p>
              <p><strong>Best results:</strong> Use Chrome or Edge. Set margins to &ldquo;None&rdquo; and enable &ldquo;Background graphics&rdquo; for full styling.</p>
              <p><strong>Report cadence:</strong> Daily briefings each morning, weekly attribution on Fridays, monthly risk on the last business day, quarterly letters at quarter-end.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
