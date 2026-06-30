'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Activity, Eye, Info, RefreshCw, Layers,
} from 'lucide-react';
import {
  getAllMicrostructure, MICROSTRUCTURE_EDUCATION,
  MicrostructureAnalysis, OrderBookLevel,
} from '@/lib/order-book';

export default function OrderBookPage() {
  const [analyses, setAnalyses] = useState<MicrostructureAnalysis[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setAnalyses(getAllMicrostructure());
  }, []);

  const active = selected ? analyses.find(a => a.symbol === selected) : null;


  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-6 w-6 text-[var(--primary)]" />
          Order Book Microstructure
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          What the order book reveals about true supply and demand beneath the price
        </p>
      </div>

      {/* Stock Selector */}
      <div className="flex gap-2 flex-wrap">
        {analyses.map(a => {
          const signalColor = a.overallSignal === 'bullish_microstructure' ? 'border-[var(--gain)]/50 bg-[var(--gain)]/5' : a.overallSignal === 'stressed' ? 'border-[var(--loss)]/50 bg-[var(--loss)]/5' : a.overallSignal === 'bearish_microstructure' ? 'border-[var(--warning)]/50 bg-[var(--warning)]/5' : 'border-[var(--card-border)] bg-[var(--card)]';
          return (
            <button key={a.symbol} onClick={() => setSelected(a.symbol)}
              className={`px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${selected === a.symbol ? 'ring-2 ring-[var(--primary)]' : ''} ${signalColor}`}>
              <span className="font-bold">{a.symbol}</span>
              {a.alerts.length > 0 && <span className="ml-1.5 text-[8px] bg-[var(--loss)] text-white rounded-full px-1.5">{a.alerts.length}</span>}
            </button>
          );
        })}
      </div>

      {/* Active Analysis */}
      {active && (
        <div className="space-y-4">
          {/* Alerts */}
          {active.alerts.map((alert, i) => (
            <div key={i} className={`rounded-xl border p-4 flex items-start gap-3 ${alert.severity === 'critical' ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5' : alert.severity === 'warning' ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'}`}>
              <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${alert.severity === 'critical' ? 'text-[var(--loss)]' : alert.severity === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--primary)]'}`} />
              <p className="text-[11px] leading-relaxed">{alert.message}</p>
            </div>
          ))}

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricBox label="Bid-Ask Spread" value={`${active.spread.percentSpread.toFixed(3)}%`} sub={active.spread.isStressed ? 'STRESSED' : 'Normal'} status={active.spread.isStressed ? 'bad' : 'good'} />
            <MetricBox label="Imbalance" value={`${(active.depth.imbalanceRatio * 100).toFixed(0)}% bid`} sub={active.depth.imbalanceSignal.replace(/_/g, ' ')} status={active.depth.imbalanceRatio > 0.55 ? 'good' : active.depth.imbalanceRatio < 0.45 ? 'bad' : 'neutral'} />
            <MetricBox label="Refresh Rate" value={`${active.refresh.refreshRatePerSec}/s`} sub={active.refresh.algoActivityLevel} status={active.refresh.algoActivityLevel === 'extreme' || active.refresh.algoActivityLevel === 'high' ? 'good' : 'neutral'} />
            <MetricBox label="Iceberg" value={active.iceberg.detected ? 'DETECTED' : 'None'} sub={active.iceberg.detected ? `${active.iceberg.side} side` : 'Clean book'} status={active.iceberg.detected ? 'warning' : 'neutral'} />
          </div>

          {/* Order Book Visualization */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
            <h3 className="text-sm font-semibold mb-4">Order Book — Top 5 Levels</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Bids */}
              <div>
                <p className="text-[9px] font-bold uppercase text-[var(--gain)] mb-2">Bids (Buyers)</p>
                {active.snapshot.bids.map((lvl, i) => {
                  const maxSize = Math.max(...active.snapshot.bids.map(l => l.size));
                  return (
                    <div key={i} className="flex items-center gap-2 mb-1 text-[10px]">
                      <span className="w-16 text-right font-tabular font-medium text-[var(--gain)]">{lvl.price.toFixed(2)}</span>
                      <div className="flex-1 h-4 rounded-sm bg-[var(--gain)]/10 relative overflow-hidden">
                        <div className="h-full bg-[var(--gain)]/40 rounded-sm" style={{ width: `${(lvl.size / maxSize) * 100}%` }} />
                      </div>
                      <span className="w-14 text-right font-tabular text-[var(--muted)]">{lvl.size.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              {/* Asks */}
              <div>
                <p className="text-[9px] font-bold uppercase text-[var(--loss)] mb-2">Asks (Sellers)</p>
                {active.snapshot.asks.map((lvl, i) => {
                  const maxSize = Math.max(...active.snapshot.asks.map(l => l.size));
                  return (
                    <div key={i} className="flex items-center gap-2 mb-1 text-[10px]">
                      <span className="w-16 text-right font-tabular font-medium text-[var(--loss)]">{lvl.price.toFixed(2)}</span>
                      <div className="flex-1 h-4 rounded-sm bg-[var(--loss)]/10 relative overflow-hidden">
                        <div className="h-full bg-[var(--loss)]/40 rounded-sm" style={{ width: `${(lvl.size / maxSize) * 100}%` }} />
                      </div>
                      <span className="w-14 text-right font-tabular text-[var(--muted)]">{lvl.size.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Explanations */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Info className="h-4 w-4 text-[var(--muted)]" /> Signal Explanations</h3>
            <div className="space-y-2 text-[10px]">
              <p><strong>Spread:</strong> {active.spread.stressExplanation || `Normal spread at ${active.spread.percentSpread.toFixed(3)}%. Trading costs are standard.`}</p>
              <p><strong>Imbalance:</strong> {active.depth.imbalanceExplanation}</p>
              <p><strong>Algo Activity:</strong> {active.refresh.explanation}</p>
              <p><strong>Iceberg:</strong> {active.iceberg.explanation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Education */}
      {!active && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-4">
          <h2 className="text-sm font-bold">What Each Signal Tells You</h2>
          {Object.values(MICROSTRUCTURE_EDUCATION).map(edu => (
            <div key={edu.title} className="border-l-2 border-[var(--primary)]/30 pl-3">
              <p className="text-xs font-bold mb-0.5">{edu.title}</p>
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">{edu.plainEnglish}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, sub, status }: { label: string; value: string; sub: string; status: 'good' | 'bad' | 'warning' | 'neutral' }) {
  const border = status === 'good' ? 'border-[var(--gain)]/30' : status === 'bad' ? 'border-[var(--loss)]/30' : status === 'warning' ? 'border-[var(--warning)]/30' : 'border-[var(--card-border)]';
  const valueColor = status === 'good' ? 'text-[var(--gain)]' : status === 'bad' ? 'text-[var(--loss)]' : status === 'warning' ? 'text-[var(--warning)]' : '';
  return (
    <div className={`rounded-xl border ${border} bg-[var(--card)] p-3`}>
      <p className="text-[9px] text-[var(--muted)] uppercase">{label}</p>
      <p className={`text-sm font-bold font-tabular mt-0.5 ${valueColor}`}>{value}</p>
      <p className="text-[9px] text-[var(--muted)] capitalize">{sub}</p>
    </div>
  );
}
