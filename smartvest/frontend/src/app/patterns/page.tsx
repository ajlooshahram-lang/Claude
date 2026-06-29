'use client';

import { useState, useEffect } from 'react';
import { Eye, AlertTriangle, History, TrendingDown, Flame, Repeat, Target, ArrowUpRight } from 'lucide-react';
import { detectMistakePatterns, MistakePattern } from '@/lib/mistake-patterns';

const PATTERN_ICONS: Record<string, React.ReactNode> = {
  sell_winners_early: <ArrowUpRight className="h-5 w-5" />,
  hold_losers_long: <TrendingDown className="h-5 w-5" />,
  chase_momentum: <Flame className="h-5 w-5" />,
  revenge_trade: <Repeat className="h-5 w-5" />,
  size_escalation: <Target className="h-5 w-5" />,
};

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<MistakePattern[]>([]);

  useEffect(() => {
    setPatterns(detectMistakePatterns());
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-[var(--accent)]" />
          Your Mistake Patterns
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Repeated behaviors detected from your trading history — awareness is the first defense
        </p>
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-xs text-[var(--foreground)]/70 leading-relaxed">
        This page shows your <strong>personal trading mistakes that keep repeating</strong>.
        When you're about to make a trade that matches one of these patterns,
        the app will show you a warning with your own history as a mirror.
        It won't stop you — just make you pause and think.
      </div>

      {/* No patterns */}
      {patterns.length === 0 && (
        <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-6 text-center">
          <p className="text-sm font-medium text-[var(--gain)]">No repeated patterns detected yet</p>
          <p className="text-xs text-[var(--muted)] mt-2 max-w-sm mx-auto">
            Either you haven't made enough trades for patterns to emerge, or you're
            genuinely not repeating mistakes. Keep logging trades — patterns become visible
            after 6-8 orders.
          </p>
        </div>
      )}

      {/* Patterns */}
      {patterns.map((p) => {
        const icon = PATTERN_ICONS[p.id] || <AlertTriangle className="h-5 w-5" />;
        return (
          <div key={p.id} className="rounded-xl border border-[var(--loss)]/20 bg-[var(--card)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-2.5">
                <span className="text-[var(--loss)]">{icon}</span>
                <div>
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Detected {p.frequency} time{p.frequency > 1 ? 's' : ''} · Last: {new Date(p.lastOccurrence).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-[var(--foreground)]/80 leading-relaxed">{p.description}</p>

              {/* Example */}
              <div className="rounded-lg bg-black/20 border border-[var(--card-border)] p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <History className="h-3 w-3 text-[var(--muted)]" />
                  <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Specific example from your history:</span>
                </div>
                <p className="text-[11px] text-[var(--foreground)]/70"><strong>What you did:</strong> {p.example.what}</p>
                <p className="text-[11px] text-[var(--foreground)]/70"><strong>What happened:</strong> {p.example.outcome}</p>
                <p className="text-[11px] text-[var(--foreground)]/70"><strong>The cost:</strong> {p.example.cost}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <p className="text-[9px] text-[var(--muted)] text-center">
        Patterns are detected from your logged orders. The more trades you log, the more accurate this becomes.
        Pre-trade warnings will appear automatically when you're about to repeat a known pattern.
      </p>
    </div>
  );
}
