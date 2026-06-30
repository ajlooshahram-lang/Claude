'use client';

/**
 * Sample Data Banner
 *
 * Automatically shows on any page that uses hardcoded data.
 * Placed in the layout so it appears globally without modifying
 * each individual page file.
 *
 * When a real data source is connected, remove the page's entry
 * from sample-data-registry.ts and the banner disappears.
 */

import { usePathname } from 'next/navigation';
import { FlaskConical, X } from 'lucide-react';
import { useState } from 'react';
import { hasSampleData } from '@/lib/sample-data-registry';

export function SampleDataBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const entry = hasSampleData(pathname);
  if (!entry) return null;
  if (dismissed.has(pathname)) return null;

  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/20">
      <FlaskConical className="h-3.5 w-3.5 text-[var(--warning)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-bold text-[var(--warning)] uppercase tracking-wider">
          Sample data
        </span>
        <span className="text-[9px] text-[var(--warning)]/80 ml-1.5">
          — {entry.feedName} not connected
        </span>
      </div>
      <button
        onClick={() => setDismissed(prev => new Set(prev).add(pathname))}
        className="p-1 text-[var(--warning)]/50 hover:text-[var(--warning)] flex-shrink-0"
        title="Dismiss (reappears on page refresh)"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
