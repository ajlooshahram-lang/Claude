'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Crown, Zap, Building2, Check, X, ArrowRight,
  Sparkles, Shield, Lock,
} from 'lucide-react';
import {
  TIER_CONFIGS, TierConfig, SubscriptionTier, getCurrentTier,
  createCheckoutSession, upgradeTier, getTierColor,
} from '@/lib/subscription';

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<SubscriptionTier | null>(null);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    setCurrentTier(getCurrentTier());
    if (searchParams.get('upgraded') === 'true') {
      setUpgraded(true);
      setCurrentTier(getCurrentTier());
    }
  }, [searchParams]);

  async function handleSubscribe(tier: SubscriptionTier) {
    if (tier === 'free' || tier === currentTier) return;
    setLoading(tier);
    const result = await createCheckoutSession(tier, interval);
    if ('url' in result) {
      if (result.url.startsWith('/')) {
        // Demo mode — already upgraded
        setCurrentTier(getCurrentTier());
        setUpgraded(true);
        setLoading(null);
      } else {
        window.location.href = result.url;
      }
    } else {
      alert(result.error);
      setLoading(null);
    }
  }

  function handleDemoUpgrade(tier: SubscriptionTier) {
    upgradeTier(tier);
    setCurrentTier(tier);
    setUpgraded(true);
  }

  const tierIcons = {
    free: Shield,
    pro: Zap,
    institutional: Building2,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">


      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/30">
          <Crown className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider">
            Pricing Plans
          </span>
        </div>
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-sm text-[var(--muted)] max-w-lg mx-auto">
          Start free, upgrade when you need more power. All plans include core market data.
          Cancel anytime.
        </p>
      </div>

      {/* Upgraded Banner */}
      {upgraded && (
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-[var(--gain)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--gain)]">
              Welcome to {TIER_CONFIGS.find(t => t.id === currentTier)?.name}!
            </p>
            <p className="text-xs text-[var(--muted)]">
              Your subscription is now active. All features for your tier are unlocked.
            </p>
          </div>
        </div>
      )}

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setInterval('monthly')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            interval === 'monthly'
              ? 'bg-[var(--primary)] text-white'
              : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval('yearly')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            interval === 'yearly'
              ? 'bg-[var(--primary)] text-white'
              : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          Yearly
          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[var(--gain)]/20 text-[var(--gain)] font-bold">
            Save 25%
          </span>
        </button>
      </div>


      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIER_CONFIGS.map((tier) => {
          const Icon = tierIcons[tier.id];
          const isCurrent = currentTier === tier.id;
          const isHighlighted = tier.highlighted;
          const price = interval === 'monthly' ? tier.monthlyPrice : Math.round(tier.yearlyPrice / 12);

          return (
            <div
              key={tier.id}
              className={`rounded-2xl border p-6 relative transition-all ${
                isHighlighted
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5 scale-[1.02] shadow-lg shadow-[var(--primary)]/10'
                  : 'border-[var(--card-border)] bg-[var(--card)]'
              }`}
            >
              {/* Recommended Badge */}
              {isHighlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--primary)] text-white text-[9px] font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              {/* Current Plan Badge */}
              {isCurrent && (
                <div className="absolute top-4 right-4 px-2 py-1 rounded-md bg-[var(--gain)]/10 border border-[var(--gain)]/30 text-[9px] font-bold text-[var(--gain)] uppercase">
                  Current
                </div>
              )}

              {/* Tier Header */}
              <div className="mb-6">
                <div className={`inline-flex items-center justify-center h-10 w-10 rounded-xl mb-3 ${getTierColor(tier.id)}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold">{tier.name}</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">{tier.tagline}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                {tier.monthlyPrice === 0 ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">Free</span>
                    <span className="text-sm text-[var(--muted)]">forever</span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{price}</span>
                    <span className="text-sm text-[var(--muted)]">DKK/mo</span>
                  </div>
                )}
                {tier.monthlyPrice > 0 && interval === 'yearly' && (
                  <p className="text-[10px] text-[var(--gain)] mt-1">
                    Billed {tier.yearlyPrice.toLocaleString()} DKK/year (save {Math.round((1 - tier.yearlyPrice / (tier.monthlyPrice * 12)) * 100)}%)
                  </p>
                )}
              </div>

              {/* CTA Button */}
              <button
                onClick={() => isCurrent ? null : handleSubscribe(tier.id)}
                disabled={isCurrent || loading !== null}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors mb-6 ${
                  isCurrent
                    ? 'bg-[var(--gain)]/10 text-[var(--gain)] border border-[var(--gain)]/30 cursor-default'
                    : isHighlighted
                    ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80'
                    : tier.id === 'free'
                    ? 'bg-[var(--card-border)] text-[var(--muted)] cursor-default'
                    : 'bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/20 border border-[var(--card-border)]'
                } disabled:opacity-60`}
              >
                {loading === tier.id ? (
                  <div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : isCurrent ? (
                  <>
                    <Check className="h-4 w-4" /> Current Plan
                  </>
                ) : tier.id === 'free' ? (
                  'Included Free'
                ) : (
                  <>
                    Upgrade to {tier.name} <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Feature List */}
              <ul className="space-y-2.5">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[11px]">
                    <Check className="h-3.5 w-3.5 text-[var(--gain)] flex-shrink-0 mt-0.5" />
                    <span className="text-[var(--foreground)]/80">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>


      {/* Feature Comparison Table */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-bold">Complete Feature Comparison</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">See exactly what&apos;s included in each plan</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                <th className="text-left px-6 py-3 font-semibold text-[var(--muted)] w-[40%]">Feature</th>
                <th className="text-center px-4 py-3 font-semibold text-[var(--muted)]">Free</th>
                <th className="text-center px-4 py-3 font-semibold text-[var(--primary)]">Pro</th>
                <th className="text-center px-4 py-3 font-semibold text-amber-400">Institutional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {/* Market Data */}
              <SectionHeader title="Market Data & Research" />
              <FeatureRow feature="Stock search & quotes" free pro institutional />
              <FeatureRow feature="Basic market overview" free pro institutional />
              <FeatureRow feature="Stock detail pages" free pro institutional />
              <FeatureRow feature="Watchlist (10 stocks)" free pro institutional />
              <FeatureRow feature="Unlimited watchlist" pro institutional />
              <FeatureRow feature="Real-time data" pro institutional />
              <FeatureRow feature="Dark pool activity" institutional />

              {/* Portfolio */}
              <SectionHeader title="Portfolio Management" />
              <FeatureRow feature="Budget simulator" free pro institutional />
              <FeatureRow feature="Full portfolio tracker" pro institutional />
              <FeatureRow feature="Order history" pro institutional />
              <FeatureRow feature="Performance attribution" pro institutional />
              <FeatureRow feature="Investment planner" pro institutional />
              <FeatureRow feature="TWAP execution" institutional />
              <FeatureRow feature="VWAP execution" institutional />

              {/* Analysis */}
              <SectionHeader title="Analysis & Intelligence" />
              <FeatureRow feature="Beginner glossary" free pro institutional />
              <FeatureRow feature="Smart Picks (AI)" pro institutional />
              <FeatureRow feature="Sector analysis" pro institutional />
              <FeatureRow feature="Stock comparison" pro institutional />
              <FeatureRow feature="Pattern recognition" pro institutional />
              <FeatureRow feature="Money flow tracking" pro institutional />
              <FeatureRow feature="Behavioral analysis" pro institutional />
              <FeatureRow feature="Crash simulator" pro institutional />
              <FeatureRow feature="Strategy backtesting" pro institutional />
              <FeatureRow feature="Algorithmic strategy builder" institutional />
              <FeatureRow feature="Monte Carlo simulation" institutional />
              <FeatureRow feature="Multi-factor analysis" institutional />

              {/* Tax & Reports */}
              <SectionHeader title="Tax & Reporting" />
              <FeatureRow feature="Tax estimation" pro institutional />
              <FeatureRow feature="ASK manager" pro institutional />
              <FeatureRow feature="Daily/Weekly/Monthly reports" pro institutional />
              <FeatureRow feature="Quarterly investor letter" pro institutional />
              <FeatureRow feature="Full tax optimization engine" institutional />

              {/* Alerts & Notifications */}
              <SectionHeader title="Alerts & Integration" />
              <FeatureRow feature="Price alerts" pro institutional />
              <FeatureRow feature="Push notifications" pro institutional />
              <FeatureRow feature="DCA calculator" pro institutional />
              <FeatureRow feature="Investor report card" pro institutional />
              <FeatureRow feature="Custom risk models" institutional />
              <FeatureRow feature="API access" institutional />
              <FeatureRow feature="Priority support" institutional />
            </tbody>
          </table>
        </div>
      </div>


      {/* Demo Upgrade Buttons */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-4 w-4 text-[var(--muted)]" />
          <h3 className="text-sm font-semibold">Demo Mode</h3>
        </div>
        <p className="text-[10px] text-[var(--muted)] mb-4">
          Stripe is not configured. Use these buttons to simulate a tier upgrade and see how feature gating works.
          In production, upgrades happen via Stripe Checkout.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleDemoUpgrade('free')}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
              currentTier === 'free' ? 'border-[var(--gain)]/30 bg-[var(--gain)]/10 text-[var(--gain)]' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Set Free
          </button>
          <button
            onClick={() => handleDemoUpgrade('pro')}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
              currentTier === 'pro' ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Set Pro
          </button>
          <button
            onClick={() => handleDemoUpgrade('institutional')}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
              currentTier === 'institutional' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Set Institutional
          </button>
        </div>
      </div>

      {/* FAQ */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-4">
        <h2 className="text-sm font-bold">Frequently Asked Questions</h2>
        <div className="grid gap-4 sm:grid-cols-2 text-[11px]">
          <div>
            <p className="font-semibold mb-1">Can I cancel anytime?</p>
            <p className="text-[var(--muted)] leading-relaxed">Yes. Cancel at any time and you&apos;ll keep access until your current billing period ends. No penalties or lock-in.</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Do I lose my data if I downgrade?</p>
            <p className="text-[var(--muted)] leading-relaxed">Never. Your data is always yours. You just won&apos;t be able to access Pro/Institutional features until you resubscribe.</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Is payment secure?</p>
            <p className="text-[var(--muted)] leading-relaxed">Payments are processed by Stripe, the same provider used by Amazon, Google, and Shopify. We never see your card details.</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Can I switch between plans?</p>
            <p className="text-[var(--muted)] leading-relaxed">Yes. Upgrade or downgrade at any time. When upgrading, you get immediate access. Downgrades take effect at period end.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Table Sub-components ────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <tr className="bg-[var(--background)]/30">
      <td colSpan={4} className="px-6 py-2.5 font-bold text-xs text-[var(--foreground)]/70 uppercase tracking-wider">
        {title}
      </td>
    </tr>
  );
}

function FeatureRow({ feature, free, pro, institutional }: {
  feature: string;
  free?: boolean;
  pro?: boolean;
  institutional?: boolean;
}) {
  return (
    <tr className="hover:bg-[var(--background)]/20">
      <td className="px-6 py-2.5 font-medium">{feature}</td>
      <td className="text-center px-4 py-2.5">
        {free ? <Check className="h-4 w-4 text-[var(--gain)] mx-auto" /> : <X className="h-4 w-4 text-[var(--card-border)] mx-auto" />}
      </td>
      <td className="text-center px-4 py-2.5">
        {pro ? <Check className="h-4 w-4 text-[var(--primary)] mx-auto" /> : <X className="h-4 w-4 text-[var(--card-border)] mx-auto" />}
      </td>
      <td className="text-center px-4 py-2.5">
        {institutional ? <Check className="h-4 w-4 text-amber-400 mx-auto" /> : <X className="h-4 w-4 text-[var(--card-border)] mx-auto" />}
      </td>
    </tr>
  );
}
