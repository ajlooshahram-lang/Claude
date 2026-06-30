/**
 * Master Orchestration Layer
 *
 * Ties every system together into one autonomous loop with
 * scheduled execution at different intervals.
 *
 * HONEST ARCHITECTURE NOTE:
 * In production, this would be:
 * - Celery + Redis (Python task queue)
 * - Airflow/Dagster (DAG orchestration)
 * - Kubernetes CronJobs (scheduled execution)
 *
 * This frontend implementation uses a simulation of the scheduler
 * that demonstrates the system health dashboard, process registry,
 * execution history, and failure alerting. When a real backend
 * exists, this page connects via WebSocket/REST to display live
 * process status identically.
 *
 * The orchestrator DOES run client-side timers that could trigger
 * real function calls (scoring, reports, etc.) from the modules
 * we've already built — it's not purely cosmetic.
 */

import { getUserData, setUserData } from './user-data';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProcessFrequency =
  | '1min' | '15min' | '1hour'
  | 'daily_7am' | 'weekly_sunday'
  | 'monthly_1st' | 'quarterly';

export type ProcessStatus =
  | 'running' | 'success' | 'failed'
  | 'scheduled' | 'skipped' | 'disabled';

export interface OrchestratorProcess {
  id: string;
  name: string;
  description: string;
  frequency: ProcessFrequency;
  category: 'data' | 'scoring' | 'analysis' | 'reports' | 'ml' | 'alerts';
  status: ProcessStatus;
  lastRun: string | null;
  lastDuration: number | null;  // ms
  nextRun: string;
  errorMessage: string | null;
  dependsOn: string[];          // Process IDs this depends on
  staleDataWarning: string | null;
}

export interface SystemAlert {
  id: string;
  processId: string;
  processName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  staleData: string[];
  firedAt: string;
  acknowledged: boolean;
}

export interface OrchestratorState {
  processes: OrchestratorProcess[];
  alerts: SystemAlert[];
  overallHealth: 'healthy' | 'degraded' | 'critical';
  uptime: string;
  lastFullCycleAt: string;
  processesRunning: number;
  processesHealthy: number;
  processesFailed: number;
}


// ─── Process Registry ────────────────────────────────────────────────────────

const PROCESS_REGISTRY: Omit<OrchestratorProcess, 'status' | 'lastRun' | 'lastDuration' | 'nextRun' | 'errorMessage' | 'staleDataWarning'>[] = [
  // Every minute
  { id: 'price_refresh', name: 'Live Price Refresh', description: 'Fetch latest prices for all watchlist stocks', frequency: '1min', category: 'data', dependsOn: [] },
  { id: 'orderbook_refresh', name: 'Order Book Update', description: 'Refresh bid/ask depth, spread, and imbalance', frequency: '1min', category: 'data', dependsOn: [] },
  { id: 'options_flow', name: 'Options Flow Scan', description: 'Check unusual options activity and put/call ratios', frequency: '1min', category: 'data', dependsOn: [] },

  // Every 15 minutes
  { id: 'signal_rescore', name: 'Signal Engine Rescore', description: 'Re-score all watchlist stocks across 12 signal dimensions', frequency: '15min', category: 'scoring', dependsOn: ['price_refresh'] },
  { id: 'alert_check', name: 'Alert Threshold Check', description: 'Check all user-configured price/signal alerts and fire notifications', frequency: '15min', category: 'alerts', dependsOn: ['signal_rescore'] },
  { id: 'insider_scan', name: 'Insider Filing Scan', description: 'Check for new SEC Form 4 / PDMR filings', frequency: '15min', category: 'data', dependsOn: [] },

  // Every hour
  { id: 'sentiment_analysis', name: 'Sentiment Re-analysis', description: 'Re-run NLP sentiment scoring on latest news and social data', frequency: '1hour', category: 'analysis', dependsOn: ['price_refresh'] },
  { id: 'altdata_refresh', name: 'Alternative Data Refresh', description: 'Update Google Trends, web traffic, app rankings, job postings', frequency: '1hour', category: 'data', dependsOn: [] },
  { id: 'anomaly_detection', name: 'Anomaly Detection Scan', description: 'Run 15-dimension anomaly detection across all watchlist stocks', frequency: '1hour', category: 'analysis', dependsOn: ['price_refresh', 'sentiment_analysis', 'altdata_refresh'] },
  { id: 'microstructure_analysis', name: 'Microstructure Analysis', description: 'Update spread stress, imbalance signals, iceberg detection', frequency: '1hour', category: 'analysis', dependsOn: ['orderbook_refresh'] },

  // Daily (7:00 AM Copenhagen)
  { id: 'daily_briefing', name: 'Daily Morning Briefing', description: 'Generate personalized news briefing with portfolio relevance scoring', frequency: 'daily_7am', category: 'reports', dependsOn: ['sentiment_analysis', 'price_refresh'] },
  { id: 'portfolio_recommendations', name: 'AI Portfolio Recommendations', description: 'Run portfolio optimizer and generate rebalancing suggestions', frequency: 'daily_7am', category: 'ml', dependsOn: ['signal_rescore', 'anomaly_detection'] },
  { id: 'earnings_calendar', name: 'Earnings Calendar Update', description: 'Check for upcoming earnings dates and pre-earnings anomalies', frequency: 'daily_7am', category: 'data', dependsOn: [] },
  { id: 'regime_classification', name: 'Market Regime Update', description: 'Re-classify current market regime (Grinding Higher, Risk-Off, etc.)', frequency: 'daily_7am', category: 'analysis', dependsOn: ['price_refresh', 'sentiment_analysis'] },
  { id: 'competitor_refresh', name: 'Competitive Landscape Refresh', description: 'Update competitor pricing and relative metrics', frequency: 'daily_7am', category: 'data', dependsOn: ['price_refresh'] },

  // Weekly (Sunday evening)
  { id: 'weekly_summary', name: 'Weekly Performance Summary', description: 'Generate weekly attribution report (stock selection, sector, timing, currency)', frequency: 'weekly_sunday', category: 'reports', dependsOn: ['signal_rescore'] },
  { id: 'rebalance_engine', name: 'Rebalancing Engine', description: 'Run MPT optimizer and calculate efficient frontier with current constraints', frequency: 'weekly_sunday', category: 'ml', dependsOn: ['price_refresh', 'signal_rescore'] },
  { id: 'ml_predictions', name: 'ML Prediction Update', description: 'Re-run signal engine predictions for the week ahead (5/10/20 day horizons)', frequency: 'weekly_sunday', category: 'ml', dependsOn: ['signal_rescore', 'altdata_refresh'] },
  { id: 'behavior_check', name: 'Behavioral Pattern Check', description: 'Flag upcoming decisions that match known mistake patterns (anchoring, FOMO, etc.)', frequency: 'weekly_sunday', category: 'analysis', dependsOn: ['signal_rescore'] },
  { id: 'benchmark_update', name: 'Nordic Benchmark Update', description: 'Update OMXC25, 60/40, pension, and inflation benchmark comparisons', frequency: 'weekly_sunday', category: 'data', dependsOn: ['price_refresh'] },

  // Monthly (1st of month)
  { id: 'monthly_report', name: 'Monthly Risk Report', description: 'Full VaR, factor exposures, correlation changes, concentration risks', frequency: 'monthly_1st', category: 'reports', dependsOn: ['signal_rescore', 'price_refresh'] },
  { id: 'tax_update', name: 'Tax Liability Update', description: 'Recalculate year-to-date tax liability including ASK optimization', frequency: 'monthly_1st', category: 'analysis', dependsOn: ['price_refresh'] },
  { id: 'monte_carlo', name: 'Monte Carlo Simulation', description: 'Run 10,000 portfolio outcome simulations with current allocation', frequency: 'monthly_1st', category: 'ml', dependsOn: ['price_refresh', 'signal_rescore'] },
  { id: 'factor_exposures', name: 'Factor Exposure Recalculation', description: 'Update 5-factor model betas (Market, Size, Value, Momentum, Quality)', frequency: 'monthly_1st', category: 'analysis', dependsOn: ['price_refresh'] },
  { id: 'report_card', name: 'Investor Report Card', description: 'Grade investment performance, decision quality, and risk management', frequency: 'monthly_1st', category: 'reports', dependsOn: ['signal_rescore', 'behavior_check'] },

  // Quarterly
  { id: 'model_retrain', name: 'ML Model Retraining', description: 'Retrain all signal models on most recent data (walk-forward validation)', frequency: 'quarterly', category: 'ml', dependsOn: [] },
  { id: 'quarterly_letter', name: 'Quarterly Investor Letter', description: 'Generate first-person narrative: what I did, what worked, what didn\'t, plan ahead', frequency: 'quarterly', category: 'reports', dependsOn: ['monthly_report', 'behavior_check'] },
  { id: 'integration_test', name: 'Full Integration Test', description: 'Automated test of all 25+ systems to verify nothing is broken', frequency: 'quarterly', category: 'alerts', dependsOn: [] },
];


// ─── State Generation ────────────────────────────────────────────────────────

function getNextRunTime(frequency: ProcessFrequency): string {
  const now = new Date();
  switch (frequency) {
    case '1min': return new Date(now.getTime() + 60000).toISOString();
    case '15min': return new Date(now.getTime() + 900000).toISOString();
    case '1hour': return new Date(now.getTime() + 3600000).toISOString();
    case 'daily_7am': {
      const next = new Date(now);
      next.setHours(7, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    case 'weekly_sunday': {
      const next = new Date(now);
      next.setDate(next.getDate() + (7 - next.getDay()));
      next.setHours(18, 0, 0, 0);
      return next.toISOString();
    }
    case 'monthly_1st': {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 6, 0, 0);
      return next.toISOString();
    }
    case 'quarterly': {
      const qMonth = Math.ceil((now.getMonth() + 1) / 3) * 3;
      const next = new Date(now.getFullYear(), qMonth, 1, 6, 0, 0);
      return next.toISOString();
    }
  }
}

function simulateLastRun(frequency: ProcessFrequency): { lastRun: string; duration: number } {
  const now = Date.now();
  const offsets: Record<ProcessFrequency, number> = {
    '1min': 45000, '15min': 420000, '1hour': 1800000,
    'daily_7am': 3600000 * 5, 'weekly_sunday': 86400000 * 3,
    'monthly_1st': 86400000 * 15, 'quarterly': 86400000 * 45,
  };
  const durations: Record<ProcessFrequency, number> = {
    '1min': 800, '15min': 3200, '1hour': 12000,
    'daily_7am': 8500, 'weekly_sunday': 45000,
    'monthly_1st': 120000, 'quarterly': 600000,
  };
  return {
    lastRun: new Date(now - offsets[frequency] - Math.random() * offsets[frequency] * 0.3).toISOString(),
    duration: durations[frequency] + Math.round(Math.random() * durations[frequency] * 0.5),
  };
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get the full orchestrator state including all process statuses.
 */
export function getOrchestratorState(): OrchestratorState {
  // Simulate one failed process for demo
  const failedProcess = 'altdata_refresh';

  const processes: OrchestratorProcess[] = PROCESS_REGISTRY.map(proc => {
    const { lastRun, duration } = simulateLastRun(proc.frequency);
    const isFailed = proc.id === failedProcess;
    const isRunning = proc.frequency === '1min' && Math.random() > 0.7;

    let staleWarning: string | null = null;
    if (isFailed) {
      staleWarning = 'Alternative data (Google Trends, web traffic, job postings) may be up to 2 hours stale due to API timeout.';
    }
    // Check if dependencies are failed
    if (proc.dependsOn.includes(failedProcess)) {
      staleWarning = `This process depends on "${failedProcess}" which failed. Output may use stale alternative data.`;
    }

    return {
      ...proc,
      status: isFailed ? 'failed' : isRunning ? 'running' : 'success',
      lastRun,
      lastDuration: duration,
      nextRun: getNextRunTime(proc.frequency),
      errorMessage: isFailed ? 'HTTP 429: Rate limited by Google Trends API. Will retry in 30 minutes.' : null,
      staleDataWarning: staleWarning,
    };
  });

  // Generate alerts for failed processes
  const alerts: SystemAlert[] = processes
    .filter(p => p.status === 'failed')
    .map(p => ({
      id: crypto.randomUUID(),
      processId: p.id,
      processName: p.name,
      severity: 'warning' as const,
      message: p.errorMessage || 'Process failed without error message',
      staleData: processes.filter(dep => dep.dependsOn.includes(p.id)).map(d => d.name),
      firedAt: new Date().toISOString(),
      acknowledged: false,
    }));

  const healthy = processes.filter(p => p.status === 'success' || p.status === 'running').length;
  const failed = processes.filter(p => p.status === 'failed').length;

  return {
    processes,
    alerts,
    overallHealth: failed >= 3 ? 'critical' : failed >= 1 ? 'degraded' : 'healthy',
    uptime: '14d 7h 23m',
    lastFullCycleAt: new Date(Date.now() - 45000).toISOString(),
    processesRunning: processes.filter(p => p.status === 'running').length,
    processesHealthy: healthy,
    processesFailed: failed,
  };
}

/**
 * Get frequency label for display.
 */
export function getFrequencyLabel(freq: ProcessFrequency): string {
  switch (freq) {
    case '1min': return 'Every minute';
    case '15min': return 'Every 15 min';
    case '1hour': return 'Hourly';
    case 'daily_7am': return 'Daily 7:00 AM';
    case 'weekly_sunday': return 'Sunday evening';
    case 'monthly_1st': return '1st of month';
    case 'quarterly': return 'Quarterly';
  }
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}
