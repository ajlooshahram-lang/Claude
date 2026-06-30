'use client';

import { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, Check, X, Clock,
  RefreshCw, Zap, Shield, Database, Brain,
  Bell, FileText, TrendingUp,
} from 'lucide-react';
import {
  getOrchestratorState, getFrequencyLabel, formatDuration,
  OrchestratorState, OrchestratorProcess, SystemAlert,
  ProcessFrequency,
} from '@/lib/orchestrator';

export default function SystemPage() {
  const [state, setState] = useState<OrchestratorState | null>(null);
  const [filter, setFilter] = useState<ProcessFrequency | 'all'>('all');

  useEffect(() => {
    setState(getOrchestratorState());
    const interval = setInterval(() => setState(getOrchestratorState()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!state) return null;

  const filtered = filter === 'all'
    ? state.processes
    : state.processes.filter(p => p.frequency === filter);

  const categoryIcons: Record<string, typeof Activity> = {
    data: Database, scoring: TrendingUp, analysis: Brain,
    reports: FileText, ml: Zap, alerts: Bell,
  };


  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-[var(--primary)]" />
            System Orchestrator
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {state.processes.length} processes across 7 execution frequencies
          </p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase ${
          state.overallHealth === 'healthy' ? 'bg-[var(--gain)]/10 text-[var(--gain)] border border-[var(--gain)]/30' :
          state.overallHealth === 'degraded' ? 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30' :
          'bg-[var(--loss)]/10 text-[var(--loss)] border border-[var(--loss)]/30'
        }`}>
          {state.overallHealth === 'healthy' ? '● ' : state.overallHealth === 'degraded' ? '◐ ' : '○ '}
          System {state.overallHealth}
        </div>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-3 text-center">
          <p className="text-xl font-bold text-[var(--gain)]">{state.processesHealthy}</p>
          <p className="text-[9px] text-[var(--gain)]">Healthy</p>
        </div>
        <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-3 text-center">
          <p className="text-xl font-bold text-[var(--primary)]">{state.processesRunning}</p>
          <p className="text-[9px] text-[var(--primary)]">Running Now</p>
        </div>
        <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-3 text-center">
          <p className="text-xl font-bold text-[var(--loss)]">{state.processesFailed}</p>
          <p className="text-[9px] text-[var(--loss)]">Failed</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
          <p className="text-xl font-bold">{state.uptime}</p>
          <p className="text-[9px] text-[var(--muted)]">Uptime</p>
        </div>
      </div>

      {/* Alerts */}
      {state.alerts.length > 0 && (
        <div className="space-y-2">
          {state.alerts.map(alert => (
            <div key={alert.id} className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold">{alert.processName} — Failed</p>
                <p className="text-[10px] text-[var(--foreground)]/70 mt-0.5">{alert.message}</p>
                {alert.staleData.length > 0 && (
                  <p className="text-[9px] text-[var(--warning)] mt-1">
                    ⚠️ Data may be stale in: {alert.staleData.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Frequency Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', '1min', '15min', '1hour', 'daily_7am', 'weekly_sunday', 'monthly_1st', 'quarterly'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-medium transition-colors ${filter === f ? 'bg-[var(--primary)] text-white' : 'border border-[var(--card-border)] text-[var(--muted)]'}`}>
            {f === 'all' ? `All (${state.processes.length})` : `${getFrequencyLabel(f as ProcessFrequency)} (${state.processes.filter(p => p.frequency === f).length})`}
          </button>
        ))}
      </div>

      {/* Process Table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Status</th>
              <th className="text-left px-3 py-2.5 font-medium text-[var(--muted)]">Process</th>
              <th className="text-left px-3 py-2.5 font-medium text-[var(--muted)]">Frequency</th>
              <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Last Run</th>
              <th className="text-right px-3 py-2.5 font-medium text-[var(--muted)]">Duration</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--muted)]">Next Run</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {filtered.map(proc => {
                const Icon = categoryIcons[proc.category] || Activity;
                return (
                  <tr key={proc.id} className={proc.status === 'failed' ? 'bg-[var(--loss)]/5' : proc.status === 'running' ? 'bg-[var(--primary)]/5' : ''}>
                    <td className="px-4 py-2.5">
                      {proc.status === 'success' && <Check className="h-3.5 w-3.5 text-[var(--gain)]" />}
                      {proc.status === 'running' && <RefreshCw className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />}
                      {proc.status === 'failed' && <X className="h-3.5 w-3.5 text-[var(--loss)]" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-[var(--muted)]" />
                        <div>
                          <p className="font-medium">{proc.name}</p>
                          <p className="text-[8px] text-[var(--muted)]">{proc.description}</p>
                          {proc.staleDataWarning && <p className="text-[8px] text-[var(--warning)] mt-0.5">⚠️ {proc.staleDataWarning}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{getFrequencyLabel(proc.frequency)}</td>
                    <td className="px-3 py-2.5 text-right font-tabular text-[var(--muted)]">
                      {proc.lastRun ? new Date(proc.lastRun).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-tabular">{proc.lastDuration ? formatDuration(proc.lastDuration) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-tabular text-[var(--muted)]">
                      {new Date(proc.nextRun).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Architecture Note */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-[10px] text-[var(--muted)] space-y-2">
        <h3 className="text-xs font-bold text-[var(--foreground)]">Production Architecture</h3>
        <p>This dashboard monitors {state.processes.length} scheduled processes across 7 execution frequencies. In production deployment:</p>
        <ul className="space-y-1 pl-3">
          <li>• <strong>1-min tasks:</strong> WebSocket connections to market data providers (Polygon, IEX)</li>
          <li>• <strong>15-min / hourly:</strong> Celery workers with Redis broker (Python backend)</li>
          <li>• <strong>Daily / weekly:</strong> Kubernetes CronJobs with retry logic</li>
          <li>• <strong>Monthly / quarterly:</strong> Airflow DAGs with dependency management</li>
          <li>• <strong>Health monitoring:</strong> Prometheus metrics → Grafana dashboards → PagerDuty alerts</li>
        </ul>
        <p>The process registry, dependency graph, and alerting logic shown here are architecturally correct — only the execution environment changes from browser timers to server-side infrastructure.</p>
      </div>
    </div>
  );
}
