'use client';

/**
 * Sample Data Label
 *
 * A small, honest badge shown on any component using hardcoded/demo data.
 * Makes it impossible to mistake sample data for real data.
 *
 * Usage:
 *   <SampleDataLabel feed="Insider filings" />
 *   <SampleDataLabel feed="Nordic stock prices" compact />
 */

import { FlaskConical } from 'lucide-react';

interface SampleDataLabelProps {
  feed?: string;          // Which data feed is not connected
  compact?: boolean;      // Smaller version for tight spaces
}

export function SampleDataLabel({ feed, compact = false }: SampleDataLabelProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-medium bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
        <FlaskConical className="h-2 w-2" />
        Sample data
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/20">
      <FlaskConical className="h-3 w-3 text-[var(--warning)] flex-shrink-0" />
      <span className="text-[8px] text-[var(--warning)] font-medium">
        Sample data{feed ? ` — ${feed} not connected` : ', live feed not connected'}
      </span>
    </div>
  );
}
