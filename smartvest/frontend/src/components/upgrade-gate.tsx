'use client';

/**
 * UpgradeGate Component
 *
 * Wraps any feature that requires a paid tier. If the user's current
 * subscription doesn't include access, shows a locked overlay with:
 * - What the feature does (plain language)
 * - Which tier is required
 * - A clear upgrade button
 *
 * Usage:
 *   <UpgradeGate featureKey="portfolio">
 *     <PortfolioPage />
 *   </UpgradeGate>
 *
 * If the user HAS access, children render normally with no overhead.
 * If the user does NOT have access, children are replaced with the gate.
 */

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Zap, Building2, ArrowRight, Crown } from 'lucide-react';
import {
  getCurrentTier, hasFeatureAccess, getFeatureGate,
  getTierLabel, getTierColor, SubscriptionTier,
  TIER_CONFIGS,
} from '@/lib/subscription';

// ─── Props ───────────────────────────────────────────────────────────────────

interface UpgradeGateProps {
  /** The feature key from the FEATURE_GATES registry */
  featureKey: string;
  /** Content to render if user has access */
  children: ReactNode;
  /** Optional: render a compact inline lock instead of full-page */
  inline?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UpgradeGate({ featureKey, children, inline = false }: UpgradeGateProps) {
  const router = useRouter();

  // Check access
  if (hasFeatureAccess(featureKey)) {
    return <>{children}</>;
  }

  // Get gate info
  const gate = getFeatureGate(featureKey);
  const currentTier = getCurrentTier();
  const requiredTier = gate?.requiredTier || 'pro';
  const tierConfig = TIER_CONFIGS.find(t => t.id === requiredTier);

  // ─── Inline Lock (compact) ───────────────────────────────────────────────────
  if (inline) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-[var(--muted)]/10 border border-[var(--card-border)] flex items-center justify-center flex-shrink-0">
          <Lock className="h-5 w-5 text-[var(--muted)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{gate?.name || featureKey}</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5 truncate">
            Requires {getTierLabel(requiredTier)} plan
          </p>
        </div>
        <button
          onClick={() => router.push('/pricing')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-medium bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors flex-shrink-0"
        >
          Upgrade <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // ─── Full Page Lock ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center space-y-6">
        {/* Lock Icon */}
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--muted)]/10 border border-[var(--card-border)]">
          <Lock className="h-8 w-8 text-[var(--muted)]" />
        </div>

        {/* Feature Name */}
        <div>
          <h2 className="text-xl font-bold">{gate?.name || 'Premium Feature'}</h2>
          <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-sm mx-auto">
            {gate?.description || 'This feature requires a paid subscription.'}
          </p>
        </div>

        {/* Required Tier Badge */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Requires</span>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${getTierColor(requiredTier)}`}>
            {requiredTier === 'institutional' ? (
              <Building2 className="h-3.5 w-3.5" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {getTierLabel(requiredTier)}
          </span>
        </div>

        {/* What you get */}
        {tierConfig && (
          <div className="rounded-xl bg-[var(--background)]/50 border border-[var(--card-border)] p-4 text-left">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              {tierConfig.name} includes:
            </p>
            <ul className="space-y-1.5">
              {tierConfig.features.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-[var(--foreground)]/70">
                  <span className="text-[var(--gain)]">✓</span>
                  {f}
                </li>
              ))}
              {tierConfig.features.length > 6 && (
                <li className="text-[11px] text-[var(--primary)]">
                  +{tierConfig.features.length - 6} more features...
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Pricing Info */}
        {tierConfig && tierConfig.monthlyPrice > 0 && (
          <p className="text-xs text-[var(--muted)]">
            Starting at <span className="font-bold text-[var(--foreground)]">{tierConfig.monthlyPrice} DKK/month</span>
          </p>
        )}

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/pricing')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/80 transition-colors"
          >
            <Crown className="h-4 w-4" />
            View Plans & Upgrade
          </button>
          <button
            onClick={() => router.back()}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            ← Go Back
          </button>
        </div>

        {/* Current Plan Info */}
        <p className="text-[9px] text-[var(--muted)]">
          You&apos;re currently on the <strong>{getTierLabel(currentTier)}</strong> plan.
          Upgrade to unlock this feature instantly.
        </p>
      </div>
    </div>
  );
}

// ─── Sidebar Lock Badge ──────────────────────────────────────────────────────

/**
 * Small lock icon shown next to locked nav items in the sidebar.
 */
export function NavLockBadge({ featureKey }: { featureKey: string }) {
  if (hasFeatureAccess(featureKey)) return null;

  const gate = getFeatureGate(featureKey);
  const requiredTier = gate?.requiredTier || 'pro';

  return (
    <span
      className={`ml-auto text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${getTierColor(requiredTier)}`}
      title={`Requires ${getTierLabel(requiredTier)}`}
    >
      {requiredTier === 'institutional' ? 'INST' : 'PRO'}
    </span>
  );
}
