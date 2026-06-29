'use client';

import { AlertTriangle, History } from 'lucide-react';
import { PreTradeWarning } from '@/lib/mistake-patterns';

/**
 * Pre-Trade Mirror — shows a warning BEFORE a trade when it matches
 * a known personal mistake pattern.
 *
 * This is a MIRROR, not a block. It shows you your own history
 * and lets you decide.
 */
export function PreTradeMirror({ warning, onDismiss }: {
  warning: PreTradeWarning;
  onDismiss: () => void;
}) {
  const isLikely = warning.severity === 'likely';

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isLikely
        ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5'
        : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isLikely ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`} />
          <div>
            <p className={`text-xs font-bold ${isLikely ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`}>
              Pattern Match: {warning.pattern}
            </p>
            <p className="text-[11px] text-[var(--foreground)]/80 mt-1 leading-relaxed">
              {warning.message}
            </p>
          </div>
        </div>
      </div>

      {/* Historical example */}
      <div className="rounded-lg bg-black/20 border border-[var(--card-border)] p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <History className="h-3 w-3 text-[var(--muted)]" />
          <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Last time you did this:</span>
        </div>
        <p className="text-[11px] text-[var(--foreground)]/70">{warning.historicalExample}</p>
        <p className="text-[11px] text-[var(--foreground)]/70 mt-1"><strong>Result:</strong> {warning.whatHappenedLast}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[9px] text-[var(--muted)]">This is a mirror, not a block. You can still proceed.</p>
        <button
          onClick={onDismiss}
          className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          I've considered this — dismiss
        </button>
      </div>
    </div>
  );
}
