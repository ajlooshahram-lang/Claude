'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { checkForRollback, dismissRollbackWarning, isRollbackDismissed } from '@/lib/data-integrity-check';
import { getOrders, getHoldings } from '@/lib/supabase';

/**
 * RollbackWarning — Detects if the database was restored from backup.
 *
 * On mount, compares the last write timestamp (stored locally) against
 * the newest row in the database. If local says "I wrote at 14:00"
 * but the newest DB row is from 12:00, data was likely lost.
 *
 * Shows a red warning banner that persists until dismissed.
 */
export function RollbackWarning() {
  const [warning, setWarning] = useState<string | null>(null);
  const [newestDb, setNewestDb] = useState<string | null>(null);

  useEffect(() => {
    if (isRollbackDismissed()) return;

    async function check() {
      try {
        // Find the newest timestamp across key tables
        const [orders, holdings] = await Promise.all([getOrders(), getHoldings()]);

        let newest: string | null = null;
        for (const o of orders) {
          const ts = o.created_at || o.executed_at;
          if (ts && (!newest || ts > newest)) newest = ts;
        }
        for (const h of holdings) {
          const ts = h.updated_at || h.added_at;
          if (ts && (!newest || ts > newest)) newest = ts;
        }

        setNewestDb(newest);
        const result = checkForRollback(newest);
        if (result.detected) {
          setWarning(result.message);
        }
      } catch {
        // Can't check — don't show false positive
      }
    }

    check();
  }, []);

  if (!warning) return null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-[var(--loss)] flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-[var(--loss)]">Possible data loss detected</p>
        <p className="text-[10px] text-[var(--foreground)]/70 mt-1 leading-relaxed">
          {warning}
        </p>
        <p className="text-[10px] text-[var(--foreground)]/50 mt-2">
          Compare your recent orders against your broker statement. If anything is missing, re-enter it from your broker&apos;s trade confirmations.
        </p>
      </div>
      <button
        onClick={() => { dismissRollbackWarning(newestDb); setWarning(null); }}
        className="p-1 text-[var(--loss)]/50 hover:text-[var(--loss)] flex-shrink-0"
        title="Dismiss (I've verified my data)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
