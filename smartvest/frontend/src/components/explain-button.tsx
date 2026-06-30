'use client';

/**
 * "Explain This" Button Component
 *
 * Drop this next to ANY score/prediction in the app.
 * When clicked, shows a modal with the full SHAP-equivalent
 * feature contribution breakdown.
 *
 * Usage:
 *   <ExplainButton symbol="NOVO-B.CO" score={78} />
 */

import { useState } from 'react';
import { Info, X, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { explainStockScore, Explanation, FeatureContribution } from '@/lib/explainability';

interface ExplainButtonProps {
  symbol: string;
  score: number;
  size?: 'sm' | 'md';
}

export function ExplainButton({ symbol, score, size = 'sm' }: ExplainButtonProps) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  function handleClick() {
    const exp = explainStockScore(symbol, score);
    setExplanation(exp);
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-colors ${
          size === 'sm' ? 'px-2 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'
        } text-[var(--muted)] hover:text-[var(--primary)]`}
        title="Explain this prediction"
      >
        <Info className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        Explain
      </button>

      {/* Modal */}
      {open && explanation && (
        <ExplainModal explanation={explanation} onClose={() => setOpen(false)} />
      )}
    </>
  );
}


// ─── Modal ───────────────────────────────────────────────────────────────────

function ExplainModal({ explanation: e, onClose }: { explanation: Explanation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl" onClick={ev => ev.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[var(--card)] px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between z-10">
          <div>
            <h2 className="text-sm font-bold">Why This Score?</h2>
            <p className="text-[10px] text-[var(--muted)]">{e.targetLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Score Display */}
          <div className="text-center">
            <div className={`inline-flex items-center justify-center h-16 w-16 rounded-2xl text-2xl font-bold ${
              e.targetValue >= 65 ? 'bg-[var(--gain)]/10 text-[var(--gain)]' :
              e.targetValue <= 35 ? 'bg-[var(--loss)]/10 text-[var(--loss)]' :
              'bg-[var(--muted)]/10 text-[var(--muted)]'
            }`}>
              {Math.round(e.targetValue)}
            </div>
            <p className="text-[9px] text-[var(--muted)] mt-1">Baseline: {e.baseline} (neutral)</p>
          </div>

          {/* Plain English Summary */}
          <div className="rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 p-4">
            <p className="text-[11px] leading-relaxed text-[var(--foreground)]/85">
              {e.summary.split('**').map((part, i) =>
                i % 2 === 0 ? part : <strong key={i}>{part}</strong>
              )}
            </p>
          </div>

          {/* Positive Drivers */}
          {e.topPositive.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--gain)] mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> Positive Drivers
              </h3>
              <div className="space-y-2">
                {e.topPositive.map(c => (
                  <ContributionBar key={c.feature} contribution={c} />
                ))}
              </div>
            </div>
          )}

          {/* Negative Factors */}
          {e.topNegative.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--loss)] mb-2 flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" /> Negative Factors
              </h3>
              <div className="space-y-2">
                {e.topNegative.map(c => (
                  <ContributionBar key={c.feature} contribution={c} />
                ))}
              </div>
            </div>
          )}

          {/* Watch Factor */}
          <div className="rounded-xl bg-[var(--warning)]/5 border border-[var(--warning)]/20 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className="h-3.5 w-3.5 text-[var(--warning)]" />
              <span className="text-[10px] font-bold text-[var(--warning)]">Factor to Watch</span>
            </div>
            <p className="text-[10px] text-[var(--foreground)]/80 leading-relaxed">
              <strong>{e.watchFactor.feature}</strong> — {e.watchFactor.reason}
            </p>
          </div>

          {/* Methodology */}
          <div className="border-t border-[var(--card-border)] pt-3">
            <p className="text-[8px] text-[var(--muted)] leading-relaxed">{e.methodology}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributionBar({ contribution: c }: { contribution: FeatureContribution }) {
  const maxPoints = 15;
  const barWidth = Math.min(100, (Math.abs(c.contribution) / maxPoints) * 100);
  const color = c.contribution > 0 ? 'bg-[var(--gain)]' : 'bg-[var(--loss)]';

  return (
    <div className="flex items-center gap-3">
      <div className="w-36 flex-shrink-0">
        <p className="text-[10px] font-medium truncate">{c.feature}</p>
        <p className="text-[8px] text-[var(--muted)] truncate">{c.description}</p>
      </div>
      <div className="flex-1 h-3 rounded-full bg-[var(--card-border)]/30 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className={`w-12 text-right text-[10px] font-tabular font-bold ${c.contribution > 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
        {c.contribution > 0 ? '+' : ''}{c.contribution.toFixed(1)}
      </span>
    </div>
  );
}
