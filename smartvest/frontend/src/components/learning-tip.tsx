'use client';

import { useState, useEffect } from 'react';
import { Lightbulb, X } from 'lucide-react';

/**
 * Persistence: tracks which tips have been dismissed.
 * Stored in localStorage so dismissed tips never come back.
 */
const STORAGE_KEY = 'smartvest_dismissed_tips';

function getDismissedTips(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function dismissTip(tipId: string): void {
  const dismissed = getDismissedTips();
  if (!dismissed.includes(tipId)) {
    dismissed.push(tipId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
  }
}

function isTipDismissed(tipId: string): boolean {
  return getDismissedTips().includes(tipId);
}

/**
 * LearningTip — a dismissible contextual learning paragraph.
 *
 * Props:
 *   tipId: unique key for persistence (e.g., "portfolio_diversification")
 *   title: short bold heading
 *   text: one-paragraph plain English explanation
 */
export function LearningTip({ tipId, title, text }: {
  tipId: string;
  title: string;
  text: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not previously dismissed
    setVisible(!isTipDismissed(tipId));
  }, [tipId]);

  if (!visible) return null;

  function handleDismiss() {
    dismissTip(tipId);
    setVisible(false);
  }

  return (
    <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Lightbulb className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--primary)]">{title}</p>
          <p className="text-xs text-[var(--foreground)]/70 mt-1 leading-relaxed">
            {text}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
          title="Dismiss this tip"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
