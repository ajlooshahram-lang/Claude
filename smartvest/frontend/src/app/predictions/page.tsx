'use client';

import { useState, useEffect } from 'react';
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Info, ChevronDown, ChevronUp, Shield, Target, Activity,
} from 'lucide-react';
import {
  generateAllPredictions, getEngineMetadata,
  PredictionOutput, SignalInput, EngineMetadata,
} from '@/lib/prediction-engine';

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<PredictionOutput[]>([]);
  const [metadata, setMetadata] = useState<EngineMetadata | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    setPredictions(generateAllPredictions());
    setMetadata(getEngineMetadata());
  }, []);


  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-[var(--primary)]" />
          Signal Engine
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Multi-factor quantitative signals for your watchlist &mdash; rules-based, not ML
        </p>
      </div>

      {/* Honesty Banner */}
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-[var(--warning)] mb-1">Transparency Notice</p>
          <p className="text-[10px] text-[var(--foreground)]/70 leading-relaxed">
            This is a <strong>rules-based signal system</strong>, not a machine learning model. It combines 12 quantitative signals using fixed weights. Historical accuracy ranges from 53-65% depending on the signal — which means it is <strong>wrong 35-47% of the time</strong>. Never use this as your sole investment decision factor. It is one data point among many.
          </p>
        </div>
      </div>

      {/* Methodology Toggle */}
      <button onClick={() => setShowMethod(!showMethod)} className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
        <Info className="h-3.5 w-3.5" />
        {showMethod ? 'Hide' : 'Show'} Methodology & Limitations
        {showMethod ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showMethod && metadata && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
            <div><p className="text-[var(--muted)]">Methodology</p><p className="font-medium">Rules-based (NOT ML)</p></div>
            <div><p className="text-[var(--muted)]">Signals</p><p className="font-medium">{metadata.signalCount} factors</p></div>
            <div><p className="text-[var(--muted)]">Data Window</p><p className="font-medium">{metadata.dataWindow}</p></div>
            <div><p className="text-[var(--muted)]">Backtest</p><p className="font-medium">{metadata.backtestPeriod}</p></div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[var(--loss)] mb-1.5">Limitations:</p>
            <ul className="space-y-1">
              {metadata.limitations.map((l, i) => (
                <li key={i} className="text-[10px] text-[var(--muted)] flex items-start gap-2">
                  <span className="text-[var(--loss)] mt-0.5">•</span>{l}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Predictions Grid */}
      <div className="space-y-4">
        {predictions.map(pred => (
          <PredictionCard
            key={pred.symbol}
            prediction={pred}
            expanded={expanded === pred.symbol}
            onToggle={() => setExpanded(expanded === pred.symbol ? null : pred.symbol)}
          />
        ))}
      </div>
    </div>
  );
}


// ─── Sub-component ───────────────────────────────────────────────────────────

function PredictionCard({ prediction: p, expanded, onToggle }: {
  prediction: PredictionOutput; expanded: boolean; onToggle: () => void;
}) {
  const DirIcon = p.direction === 'bullish' ? TrendingUp : p.direction === 'bearish' ? TrendingDown : Minus;
  const dirColor = p.direction === 'bullish' ? 'text-[var(--gain)]' : p.direction === 'bearish' ? 'text-[var(--loss)]' : 'text-[var(--muted)]';

  return (
    <div className={`rounded-xl border bg-[var(--card)] overflow-hidden ${p.accuracyWarning && p.modelAccuracy < 55 ? 'border-[var(--warning)]/30' : 'border-[var(--card-border)]'}`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-[var(--background)]/30" onClick={onToggle}>
        {/* Score Gauge */}
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-lg font-bold ${
          p.compositeScore >= 65 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' :
          p.compositeScore <= 35 ? 'bg-[var(--loss)]/10 text-[var(--loss)]' :
          'bg-[var(--muted)]/10 text-[var(--muted)]'
        }`}>
          {Math.round(p.compositeScore)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-bold">{p.symbol}</span>
            <span className="text-[10px] text-[var(--muted)]">{p.name}</span>
            <DirIcon className={`h-4 w-4 ${dirColor}`} />
            <span className={`text-[9px] font-bold uppercase ${dirColor}`}>{p.direction}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[var(--muted)]">Confidence: {(p.confidence * 100).toFixed(0)}%</span>
            <span className="text-[var(--muted)]">Range: {p.confidenceInterval.low}-{p.confidenceInterval.high}</span>
            <span className={`font-medium ${p.modelAccuracy >= 58 ? 'text-[var(--gain)]' : p.modelAccuracy >= 55 ? 'text-[var(--foreground)]' : 'text-[var(--warning)]'}`}>
              Accuracy: {p.modelAccuracy}%
            </span>
          </div>
        </div>

        {/* Horizons */}
        <div className="hidden sm:flex gap-2">
          {Object.entries(p.horizons).map(([key, h]) => (
            <div key={key} className="text-center px-2">
              <p className="text-[8px] text-[var(--muted)]">{key.replace('days', '')}D</p>
              <p className={`text-[10px] font-bold ${h.direction === 'Higher' ? 'text-[var(--gain)]' : h.direction === 'Lower' ? 'text-[var(--loss)]' : 'text-[var(--muted)]'}`}>
                {h.direction}
              </p>
              <p className="text-[8px] text-[var(--muted)]">{h.accuracy}%</p>
            </div>
          ))}
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-[var(--muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--muted)]" />}
      </div>

      {/* Accuracy Warning */}
      {p.accuracyWarning && (
        <div className="px-5 pb-3">
          <div className="rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/20 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
            <p className="text-[9px] text-[var(--warning)] leading-relaxed">{p.accuracyWarning}</p>
          </div>
        </div>
      )}

      {/* Expanded Signals */}
      {expanded && (
        <div className="border-t border-[var(--card-border)] px-5 py-4 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Individual Signal Breakdown</h4>
          <div className="space-y-2">
            {p.signals.sort((a, b) => b.normalizedScore - a.normalizedScore).map(s => (
              <div key={s.name} className="flex items-center gap-3 text-[10px]">
                <span className="w-28 text-[var(--muted)] truncate" title={s.description}>{s.description.split('—')[0].trim()}</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
                  <div className={`h-full rounded-full ${s.normalizedScore >= 60 ? 'bg-[var(--gain)]' : s.normalizedScore <= 40 ? 'bg-[var(--loss)]' : 'bg-[var(--muted)]'}`}
                    style={{ width: `${s.normalizedScore}%` }} />
                </div>
                <span className="w-10 text-right font-tabular font-medium">{Math.round(s.normalizedScore)}</span>
                <span className="w-12 text-right font-tabular text-[var(--muted)]">{s.historicalAccuracy}%</span>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
            Rightmost column = historical accuracy of each signal in isolation (backtest). Higher = more reliable.
          </p>
        </div>
      )}
    </div>
  );
}
