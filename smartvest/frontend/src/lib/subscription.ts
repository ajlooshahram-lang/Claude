/**
 * Subscription & Tier Management System
 *
 * Three-tier model:
 *   FREE         — Stock search, basic watchlist (10), simulator, glossary
 *   PRO          — Everything free + portfolio, scoring, alerts, news, tax, reports
 *   INSTITUTIONAL — Everything pro + algo builder, Monte Carlo, factor analysis,
 *                   dark pool, TWAP/VWAP, full tax optimization
 *
 * Pricing is configurable via smartvest.config.ts.
 * Payment processing via Stripe Checkout.
 *
 * Architecture:
 *   - Tier state stored per-user in user-data service
 *   - Feature gates check current tier before rendering
 *   - Stripe webhook would update tier (mock in localStorage for demo)
 */

import { getUserData, setUserData } from './user-data';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro' | 'institutional';

export interface SubscriptionState {
  tier: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;   // ISO date when current billing period ends
  cancelAtPeriodEnd?: boolean;
  subscribedAt?: string;       // ISO date
}

export interface TierConfig {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  monthlyPrice: number;       // In configured currency. 0 = free.
  yearlyPrice: number;        // Annual price (discounted)
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];         // Human-readable feature list for pricing page
  highlighted: boolean;       // Show as "recommended" on pricing page
}

export interface FeatureGate {
  featureKey: string;
  requiredTier: SubscriptionTier;
  name: string;
  description: string;
}

// ─── Tier Hierarchy ──────────────────────────────────────────────────────────

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  institutional: 2,
};

/**
 * Check if a user's tier meets or exceeds the required tier.
 */
export function hasTierAccess(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

// ─── Tier Definitions ────────────────────────────────────────────────────────

export const TIER_CONFIGS: TierConfig[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Get started with the basics',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    highlighted: false,
    features: [
      'Stock search & quotes',
      'Basic watchlist (up to 10 stocks)',
      'Budget simulator',
      'Beginner glossary',
      'Market overview',
      'Basic stock details',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For serious investors',
    monthlyPrice: 99,        // Configurable — overridden by config
    yearlyPrice: 899,        // Configurable
    stripePriceIdMonthly: 'price_pro_monthly',
    stripePriceIdYearly: 'price_pro_yearly',
    highlighted: true,
    features: [
      'Everything in Free',
      'Unlimited watchlist',
      'Full portfolio tracker',
      'All scoring systems (Smart Picks, Report Card)',
      'Price alerts & notifications',
      'News feed integration',
      'Tax estimation (incl. ASK)',
      'All reporting (Daily, Weekly, Monthly, Quarterly)',
      'Performance attribution',
      'DCA calculator',
      'Sector analysis',
      'Stock comparison tool',
      'Behavioral analysis',
      'Pattern recognition',
      'Money flow tracking',
    ],
  },
  {
    id: 'institutional',
    name: 'Institutional',
    tagline: 'Professional-grade tools',
    monthlyPrice: 499,       // Configurable
    yearlyPrice: 4499,       // Configurable
    stripePriceIdMonthly: 'price_institutional_monthly',
    stripePriceIdYearly: 'price_institutional_yearly',
    highlighted: false,
    features: [
      'Everything in Pro',
      'Algorithmic strategy builder',
      'Monte Carlo simulation engine',
      'Multi-factor analysis (5-factor model)',
      'Dark pool activity monitor',
      'TWAP execution engine',
      'VWAP execution engine',
      'Full tax optimization engine',
      'Custom risk models',
      'API access',
      'Priority support',
      'White-glove onboarding',
    ],
  },
];

// ─── Feature Gate Registry ───────────────────────────────────────────────────

/**
 * Maps every feature in the app to its minimum required tier.
 * Used by the UpgradeGate component to show/hide features.
 */
export const FEATURE_GATES: FeatureGate[] = [
  // FREE features
  { featureKey: 'search', requiredTier: 'free', name: 'Stock Search', description: 'Search and view stock quotes' },
  { featureKey: 'watchlist_basic', requiredTier: 'free', name: 'Basic Watchlist', description: 'Track up to 10 stocks' },
  { featureKey: 'simulator', requiredTier: 'free', name: 'Budget Simulator', description: 'Simulate investment scenarios' },
  { featureKey: 'glossary', requiredTier: 'free', name: 'Glossary', description: 'Learn investment terminology' },
  { featureKey: 'dashboard_basic', requiredTier: 'free', name: 'Dashboard', description: 'Basic market overview' },

  // PRO features
  { featureKey: 'portfolio', requiredTier: 'pro', name: 'Portfolio Tracker', description: 'Track all your holdings, cost basis, and returns in real-time' },
  { featureKey: 'watchlist_unlimited', requiredTier: 'pro', name: 'Unlimited Watchlist', description: 'Track as many stocks as you want with advanced filters' },
  { featureKey: 'alerts', requiredTier: 'pro', name: 'Price Alerts', description: 'Get notified when stocks hit your target prices' },
  { featureKey: 'smart_picks', requiredTier: 'pro', name: 'Smart Picks', description: 'AI-powered stock recommendations based on your profile' },
  { featureKey: 'report_card', requiredTier: 'pro', name: 'Investor Report Card', description: 'Grade your investment performance across multiple dimensions' },
  { featureKey: 'tax', requiredTier: 'pro', name: 'Tax Estimation', description: 'Calculate Danish capital gains tax and ASK optimization' },
  { featureKey: 'ask', requiredTier: 'pro', name: 'ASK Manager', description: 'Manage your Aktiesparekonto with deposit tracking and tax preview' },
  { featureKey: 'reports', requiredTier: 'pro', name: 'Professional Reports', description: 'Generate daily, weekly, monthly, and quarterly investment reports' },
  { featureKey: 'performance', requiredTier: 'pro', name: 'Performance Analytics', description: 'Detailed return attribution and benchmark comparison' },
  { featureKey: 'dca', requiredTier: 'pro', name: 'DCA Calculator', description: 'Plan dollar-cost-averaging strategies with projections' },
  { featureKey: 'sectors', requiredTier: 'pro', name: 'Sector Analysis', description: 'Analyze sector performance and rotation patterns' },
  { featureKey: 'compare', requiredTier: 'pro', name: 'Stock Comparison', description: 'Compare multiple stocks side by side on key metrics' },
  { featureKey: 'behavior', requiredTier: 'pro', name: 'Behavioral Analysis', description: 'Track and improve your investing behavior patterns' },
  { featureKey: 'patterns', requiredTier: 'pro', name: 'Pattern Recognition', description: 'Identify technical chart patterns automatically' },
  { featureKey: 'money_flow', requiredTier: 'pro', name: 'Money Flow', description: 'Track institutional money flows across sectors and stocks' },
  { featureKey: 'orders', requiredTier: 'pro', name: 'Order History', description: 'Log and analyze all your buy/sell orders' },
  { featureKey: 'crash_sim', requiredTier: 'pro', name: 'Crash Simulator', description: 'See how your portfolio would perform in historical crashes' },
  { featureKey: 'backtest', requiredTier: 'pro', name: 'Strategy Backtesting', description: 'Test your investment strategies against historical data' },
  { featureKey: 'planner', requiredTier: 'pro', name: 'Investment Planner', description: 'Plan your portfolio allocation and rebalancing' },

  // INSTITUTIONAL features
  { featureKey: 'algo_builder', requiredTier: 'institutional', name: 'Algorithmic Strategy Builder', description: 'Design and deploy automated trading strategies with custom rules, entry/exit signals, and position sizing' },
  { featureKey: 'monte_carlo', requiredTier: 'institutional', name: 'Monte Carlo Simulation', description: 'Run thousands of probability simulations to model portfolio outcomes, tail risks, and retirement scenarios' },
  { featureKey: 'factor_analysis', requiredTier: 'institutional', name: 'Multi-Factor Analysis', description: 'Full Fama-French 5-factor model exposure analysis with style drift detection and factor timing signals' },
  { featureKey: 'dark_pool', requiredTier: 'institutional', name: 'Dark Pool Monitor', description: 'Track off-exchange trading activity, large block prints, and institutional positioning signals' },
  { featureKey: 'twap', requiredTier: 'institutional', name: 'TWAP Execution', description: 'Time-Weighted Average Price execution engine for large orders with minimal market impact' },
  { featureKey: 'vwap', requiredTier: 'institutional', name: 'VWAP Execution', description: 'Volume-Weighted Average Price execution with adaptive slicing and real-time volume profiles' },
  { featureKey: 'tax_optimization', requiredTier: 'institutional', name: 'Full Tax Optimization', description: 'Advanced tax-loss harvesting, wash sale avoidance, and multi-year tax strategy optimization across all accounts' },
  { featureKey: 'custom_risk', requiredTier: 'institutional', name: 'Custom Risk Models', description: 'Build proprietary risk models with custom factors, stress scenarios, and portfolio constraints' },
  { featureKey: 'api_access', requiredTier: 'institutional', name: 'API Access', description: 'Full REST API access for programmatic trading, data export, and custom integrations' },
];

// ─── Subscription State Management ──────────────────────────────────────────

/**
 * Get the current user's subscription state.
 */
export function getSubscription(): SubscriptionState {
  const data = getUserData<SubscriptionState>('subscription' as any);
  return data || { tier: 'free' };
}

/**
 * Get the current user's tier.
 */
export function getCurrentTier(): SubscriptionTier {
  return getSubscription().tier;
}

/**
 * Check if the current user has access to a specific feature.
 */
export function hasFeatureAccess(featureKey: string): boolean {
  const gate = FEATURE_GATES.find(g => g.featureKey === featureKey);
  if (!gate) return true; // Unknown features default to accessible
  return hasTierAccess(getCurrentTier(), gate.requiredTier);
}

/**
 * Get the required tier for a feature.
 */
export function getRequiredTier(featureKey: string): SubscriptionTier {
  const gate = FEATURE_GATES.find(g => g.featureKey === featureKey);
  return gate?.requiredTier || 'free';
}

/**
 * Get the feature gate info for a feature.
 */
export function getFeatureGate(featureKey: string): FeatureGate | undefined {
  return FEATURE_GATES.find(g => g.featureKey === featureKey);
}

/**
 * Update subscription (called after successful Stripe checkout or webhook).
 */
export function updateSubscription(update: Partial<SubscriptionState>): void {
  const current = getSubscription();
  const updated = { ...current, ...update };
  setUserData('subscription' as any, updated);
}

/**
 * Upgrade to a tier (for demo/testing purposes).
 */
export function upgradeTier(tier: SubscriptionTier): void {
  updateSubscription({
    tier,
    subscribedAt: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Cancel subscription (reverts to free at period end).
 */
export function cancelSubscription(): void {
  updateSubscription({ cancelAtPeriodEnd: true });
}

// ─── Stripe Integration ──────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session URL.
 * In production, this would call your backend API which creates the session.
 * For demo, we simulate the upgrade directly.
 */
export async function createCheckoutSession(
  tier: SubscriptionTier,
  interval: 'monthly' | 'yearly',
): Promise<{ url: string } | { error: string }> {
  const config = TIER_CONFIGS.find(t => t.id === tier);
  if (!config) return { error: 'Invalid tier' };

  const priceId = interval === 'monthly'
    ? config.stripePriceIdMonthly
    : config.stripePriceIdYearly;

  // In production: POST to /api/stripe/checkout with priceId
  // For demo: simulate instant upgrade
  if (typeof window !== 'undefined') {
    // Check if Stripe key is configured
    const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (stripeKey) {
      // Real Stripe Checkout (requires backend)
      try {
        const res = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, tier, interval }),
        });
        const data = await res.json();
        if (data.url) return { url: data.url };
        return { error: data.error || 'Failed to create checkout session' };
      } catch {
        return { error: 'Payment service unavailable' };
      }
    } else {
      // Demo mode: instant upgrade
      upgradeTier(tier);
      return { url: '/pricing?upgraded=true' };
    }
  }

  return { error: 'Cannot process payment in this environment' };
}

/**
 * Get the tier label for display.
 */
export function getTierLabel(tier: SubscriptionTier): string {
  return TIER_CONFIGS.find(t => t.id === tier)?.name || 'Free';
}

/**
 * Get tier badge color.
 */
export function getTierColor(tier: SubscriptionTier): string {
  switch (tier) {
    case 'institutional': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'pro': return 'text-[var(--primary)] bg-[var(--primary)]/10 border-[var(--primary)]/30';
    default: return 'text-[var(--muted)] bg-[var(--muted)]/10 border-[var(--card-border)]';
  }
}
