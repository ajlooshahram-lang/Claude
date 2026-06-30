'use client';

import { useState, useEffect } from 'react';
import {
  Zap, AlertTriangle, TrendingUp, TrendingDown,
  Activity, Shield, Eye, BarChart3,
} from 'lucide-react';
import { runAnomalyScan, AnomalyDashboard, AnomalyAlert, StockAnomalyStatus, SignalReading } from '@/lib/anomaly-detection';

export default function AnomaliesPage() {
  const [data, setData] = useState<AnomalyDashboard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { setData(runAnomalyScan()); }, []);
  if (!data) return null;

  const activeStock = selected ? data.stockStatuses.find(s => s.symbol === selected) : null;


  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-[var(--primary)]" />
          Anomaly Detection
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Multi-dimensional outlier detection across 15 signals — flags unusual patterns
        </p>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-3">
          {data.alerts.map(alert => (
            <div key={alert.id} className={`rounded-xl border p-5 ${alert.severity === 'critical' ? 'border-[var(--loss)]/40 bg-[var(--loss)]/5' : alert.severity === 'warning' ? 'border-[var(--warning)]/40 bg-[var(--warning)]/5' : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`h-4 w-4 ${alert.severity === 'critical' ? 'text-[var(--loss)]' : alert.severity === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--primary)]'}`} />
                <span className="text-xs font-bold">{alert.symbol}</span>
                <span className="text-[10px] text-[var(--muted)]">{alert.name}</span>
                <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ml-auto ${alert.direction === 'bullish' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : alert.direction === 'bearish' ? 'bg-[var(--loss)]/10 text-[var(--loss)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>{alert.direction}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80 mb-3">{alert.explanation}</p>
              <div className="flex gap-4 text-[10px]">
                <span><strong>{alert.totalSignalsAnomalous}</strong> signals anomalous</span>
                <span>Base rate: <strong>{alert.historicalBaseRate}%</strong> preceded &gt;5% move</span>
                <span>Accuracy: <strong>{alert.predictiveAccuracy}%</strong></span>
                <span>Composite z: <strong>{alert.compositeZScore}</strong></span>
              </div>
              {/* Anomalous signals */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {alert.anomalousSignals.map(s => (
                  <span key={s.name} className={`text-[8px] px-2 py-1 rounded-md border ${s.direction === 'high' ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5 text-[var(--gain)]' : 'border-[var(--loss)]/30 bg-[var(--loss)]/5 text-[var(--loss)]'}`}>
                    {s.name} ({s.direction === 'high' ? '↑' : '↓'}{Math.abs(s.zScore).toFixed(1)}σ)
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stock Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.stockStatuses.map(stock => {
          const statusColor = stock.status === 'anomalous' ? 'border-[var(--loss)]/40 bg-[var(--loss)]/5' : stock.status === 'elevated' ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' : 'border-[var(--card-border)] bg-[var(--card)]';
          return (
            <button key={stock.symbol} onClick={() => setSelected(stock.symbol === selected ? null : stock.symbol)}
              className={`rounded-xl border p-4 text-left transition-all ${statusColor} ${selected === stock.symbol ? 'ring-2 ring-[var(--primary)]' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">{stock.symbol}</span>
                <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${stock.status === 'anomalous' ? 'bg-[var(--loss)]/20 text-[var(--loss)]' : stock.status === 'elevated' ? 'bg-[var(--warning)]/20 text-[var(--warning)]' : 'bg-[var(--gain)]/20 text-[var(--gain)]'}`}>
                  {stock.status}
                </span>
              </div>
              <p className="text-[10px] text-[var(--muted)]">{stock.name}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
                  <div className={`h-full rounded-full ${stock.anomalyScore >= 40 ? 'bg-[var(--loss)]' : stock.anomalyScore >= 20 ? 'bg-[var(--warning)]' : 'bg-[var(--gain)]'}`} style={{ width: `${stock.anomalyScore}%` }} />
                </div>
                <span className="text-[10px] font-tabular font-medium">{stock.anomalyScore}/100</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Stock Detail */}
      {activeStock && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="text-sm font-semibold mb-3">{activeStock.symbol} — 15 Signal Readings</h2>
          <div className="space-y-1.5">
            {activeStock.signalReadings.map(s => (
              <div key={s.name} className="flex items-center gap-3 text-[10px]">
                <span className="w-36 truncate font-medium">{s.name}</span>
                <div className="flex-1 h-3 rounded-full bg-[var(--card-border)]/30 relative overflow-hidden">
                  {/* Normal range indicator */}
                  <div className="absolute h-full bg-[var(--card-border)]/20" style={{ left: '25%', width: '50%' }} />
                  {/* Current position */}
                  <div className={`absolute h-full w-1 rounded ${s.isAnomalous ? (s.direction === 'high' ? 'bg-[var(--gain)]' : 'bg-[var(--loss)]') : 'bg-[var(--muted)]'}`}
                    style={{ left: `${Math.min(95, Math.max(5, 50 + s.zScore * 15))}%` }} />
                </div>
                <span className={`w-10 text-right font-tabular font-medium ${s.isAnomalous ? (s.direction === 'high' ? 'text-[var(--gain)]' : 'text-[var(--loss)]') : 'text-[var(--muted)]'}`}>
                  {s.zScore > 0 ? '+' : ''}{s.zScore.toFixed(1)}σ
                </span>
                {s.isAnomalous && <span className="text-[8px] font-bold text-[var(--loss)]">!</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-[10px] text-[var(--muted)] space-y-2">
        <h3 className="text-xs font-bold text-[var(--foreground)]">Methodology</h3>
        <p>Each of 15 signals is compared to its 2-year rolling mean and standard deviation. A signal is &quot;anomalous&quot; when it deviates more than 2 standard deviations from normal. When 3+ signals are anomalous simultaneously, an alert fires.</p>
        <p><strong>Historical base rate:</strong> Shows how often this exact number of simultaneous anomalies preceded a &gt;5% price move within 10 trading days.</p>
        <p><strong>ML upgrade path:</strong> When a Python backend is added, this statistical z-score detection can be replaced with a trained Isolation Forest model that learns non-linear interaction patterns between the 15 dimensions.</p>
      </div>
    </div>
  );
}
