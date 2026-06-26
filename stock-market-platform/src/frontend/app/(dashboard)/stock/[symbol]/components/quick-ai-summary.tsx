'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface QuickAISummaryProps {
  symbol: string;
}

/**
 * Displays a quick 3-sentence AI-generated summary of a stock.
 * In production: calls /ai/thesis/:symbol with depth=summary.
 * Shows streaming response with typing indicator.
 */
export function QuickAISummary({ symbol }: QuickAISummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate AI summary generation (production: SSE stream from /ai/thesis/:symbol)
    const timer = setTimeout(() => {
      setSummary(
        `${symbol} is a mega-cap technology company trading at a P/E of 31.2x, ` +
        `which is at a modest premium to its 5-year average of 27x — justified by improving ` +
        `services revenue (+12% YoY) and the AI-driven upgrade cycle. ` +
        `Key risks include China revenue concentration (18%) and potential regulatory headwinds. ` +
        `Consensus rates it a 'Buy' with a median price target 8% above current levels, ` +
        `though the stock is technically extended above its 50-day moving average.`
      );
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [symbol]);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">AI Quick Summary</h3>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>
          {summary ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground/60">
            AI analysis for educational purposes only. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
