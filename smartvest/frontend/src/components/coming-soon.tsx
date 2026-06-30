'use client';

/**
 * Coming Soon Placeholder
 *
 * Replaces decorative pages that show fake data.
 * Displays an honest message about what's needed.
 */

import { Construction, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ComingSoonProps {
  featureName: string;
  description: string;
  requirements: string[];
}

export function ComingSoon({ featureName, description, requirements }: ComingSoonProps) {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto py-16 px-4">
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--muted)]/10 border border-[var(--card-border)]">
          <Construction className="h-8 w-8 text-[var(--muted)]" />
        </div>

        <div>
          <h1 className="text-xl font-bold">{featureName}</h1>
          <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="rounded-xl bg-[var(--background)] border border-[var(--card-border)] p-4 text-left">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">
            Requires (not yet connected):
          </p>
          <ul className="space-y-1.5">
            {requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--foreground)]/70">
                <span className="text-[var(--muted)] mt-0.5">•</span>
                {req}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10px] text-[var(--muted)]">
          This page is hidden from navigation until the required
          infrastructure is connected. No fake data is shown.
        </p>

        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
