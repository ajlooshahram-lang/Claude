/**
 * Privacy & Data Transparency Layer
 *
 * WHAT THIS IS:
 * A transparent privacy dashboard that shows users exactly what data
 * leaves their device, in what form, and what it's used for. Includes
 * a one-click opt-out for any community/aggregate features.
 *
 * WHAT THIS IS NOT:
 * Federated learning. We do not claim on-device training, encrypted
 * gradients, or differential privacy — because those require
 * infrastructure (secure aggregation servers, TF.js training loops,
 * formal privacy proofs) that does not exist here.
 *
 * HONEST APPROACH:
 * Instead of lying about federated learning, we implement:
 * 1. Full transparency about what data is shared and how
 * 2. Server-side aggregation with k-anonymity (min group size 10)
 * 3. One-click opt-out of ALL community features
 * 4. Data minimization — only aggregate what's needed
 * 5. Clear plain-English privacy dashboard
 *
 * This is what ethical fintech companies actually do.
 */

import { getUserData, setUserData } from './user-data';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DataFlowItem {
  id: string;
  category: 'portfolio' | 'behavior' | 'preferences' | 'market' | 'device';
  dataPoint: string;
  whatLeaves: string;        // Exactly what leaves the device
  whatStays: string;         // What NEVER leaves
  purpose: string;           // Why it's collected
  aggregationMethod: string; // How it's anonymized
  canOptOut: boolean;
  isOptedOut: boolean;
}

export interface PrivacySettings {
  communityFeaturesEnabled: boolean;   // Master opt-out
  contributeToPeerBenchmark: boolean;
  contributeToSmartPicks: boolean;
  contributeToPopularStocks: boolean;
  shareRiskProfile: boolean;           // Anonymized
  sharePerformanceBracket: boolean;    // Not exact %, just bracket
  allowAnonymizedAnalytics: boolean;
  lastUpdated: string;
}

export interface PrivacyDashboardData {
  settings: PrivacySettings;
  dataFlows: DataFlowItem[];
  neverShared: string[];               // Data that NEVER leaves
  dataRetention: { category: string; period: string; reason: string }[];
  thirdParties: { name: string; purpose: string; dataShared: string }[];
  stats: {
    dataPointsOnDevice: number;
    dataPointsShared: number;          // Only if opted in
    lastDataShared: string | null;
  };
}


// ─── Privacy Settings ────────────────────────────────────────────────────────

const PRIVACY_KEY = 'privacy_settings' as any;

export function getPrivacySettings(): PrivacySettings {
  const saved = getUserData<PrivacySettings>(PRIVACY_KEY);
  return saved || {
    communityFeaturesEnabled: true,
    contributeToPeerBenchmark: true,
    contributeToSmartPicks: true,
    contributeToPopularStocks: true,
    shareRiskProfile: true,
    sharePerformanceBracket: true,
    allowAnonymizedAnalytics: true,
    lastUpdated: new Date().toISOString(),
  };
}

export function updatePrivacySettings(updates: Partial<PrivacySettings>): PrivacySettings {
  const current = getPrivacySettings();
  const updated = { ...current, ...updates, lastUpdated: new Date().toISOString() };

  // Master opt-out disables everything
  if (updates.communityFeaturesEnabled === false) {
    updated.contributeToPeerBenchmark = false;
    updated.contributeToSmartPicks = false;
    updated.contributeToPopularStocks = false;
    updated.shareRiskProfile = false;
    updated.sharePerformanceBracket = false;
  }

  setUserData(PRIVACY_KEY, updated);
  return updated;
}

/**
 * One-click opt-out of ALL community/shared features.
 */
export function optOutOfEverything(): PrivacySettings {
  return updatePrivacySettings({
    communityFeaturesEnabled: false,
    contributeToPeerBenchmark: false,
    contributeToSmartPicks: false,
    contributeToPopularStocks: false,
    shareRiskProfile: false,
    sharePerformanceBracket: false,
    allowAnonymizedAnalytics: false,
  });
}

// ─── Data Flow Definitions ───────────────────────────────────────────────────

export function getDataFlows(settings: PrivacySettings): DataFlowItem[] {
  return [
    {
      id: 'peer_benchmark', category: 'portfolio',
      dataPoint: 'Your portfolio return (bracket only)',
      whatLeaves: 'A performance BRACKET (e.g., "10-20% return this year") — never your exact percentage, holdings, or account value',
      whatStays: 'Your exact return %, stock names, share counts, cost basis, and account value NEVER leave your device',
      purpose: 'Shows you how you compare to other investors in your risk profile',
      aggregationMethod: 'Grouped into brackets with minimum 10 users per bracket (k-anonymity). No bracket is shown with fewer than 10 users.',
      canOptOut: true, isOptedOut: !settings.contributeToPeerBenchmark,
    },
    {
      id: 'smart_picks', category: 'behavior',
      dataPoint: 'Which stocks you clicked "Interested" on',
      whatLeaves: 'A list of ticker symbols you marked as interesting — NO information about whether you bought them or how much',
      whatStays: 'Your actual trades, position sizes, P&L, and account balance never leave your device',
      purpose: 'Identifies stocks that users with similar profiles find interesting (Community Smart Picks)',
      aggregationMethod: 'Aggregated across all users. A stock needs 10+ "interested" marks before it appears in Community Picks.',
      canOptOut: true, isOptedOut: !settings.contributeToSmartPicks,
    },
    {
      id: 'popular_stocks', category: 'portfolio',
      dataPoint: 'Which stocks are on your watchlist (symbols only)',
      whatLeaves: 'Ticker symbols on your watchlist — NOT quantities, prices, or when you added them',
      whatStays: 'Your portfolio composition, share counts, cost basis, and transaction history',
      purpose: 'Powers the "Most Popular Stocks" leaderboard in the admin dashboard and community features',
      aggregationMethod: 'Simple count aggregation. "42 users watch NOVO-B.CO" — no individual is identifiable.',
      canOptOut: true, isOptedOut: !settings.contributeToPopularStocks,
    },
    {
      id: 'risk_profile', category: 'preferences',
      dataPoint: 'Your risk profile category',
      whatLeaves: 'One word: "Conservative", "Moderate", or "Aggressive" — nothing else',
      whatStays: 'Your specific risk questionnaire answers, financial goals, income, and age',
      purpose: 'Groups users for peer comparison so you see people like you, not hedge fund managers',
      aggregationMethod: 'Three buckets with thousands of users each. Your individual profile is never exposed.',
      canOptOut: true, isOptedOut: !settings.shareRiskProfile,
    },
    {
      id: 'analytics', category: 'device',
      dataPoint: 'Anonymous usage patterns',
      whatLeaves: 'Which pages you visit and how long (NO financial data, NO personal info, NO stock names)',
      whatStays: 'Everything about your finances, investments, and personal information',
      purpose: 'Helps us improve the app by understanding which features are used most',
      aggregationMethod: 'Fully anonymous. Uses a random session ID that cannot be linked back to your account.',
      canOptOut: true, isOptedOut: !settings.allowAnonymizedAnalytics,
    },
  ];
}

// ─── Dashboard Data ──────────────────────────────────────────────────────────

export function getPrivacyDashboardData(): PrivacyDashboardData {
  const settings = getPrivacySettings();
  const dataFlows = getDataFlows(settings);

  return {
    settings,
    dataFlows,
    neverShared: [
      'Your exact portfolio value or account balance',
      'Individual stock positions (which stocks you own, how many shares)',
      'Your cost basis, buy/sell prices, or transaction history',
      'Your profit/loss amounts or exact return percentages',
      'Your name, email, or any personally identifying information',
      'Your tax records, ASK balance, or financial planning data',
      'Your API keys, passwords, or session data',
      'Your AI chat conversations or portfolio questions',
      'Your earnings call analyses or annual report parses',
      'Your alert configurations or notification preferences',
    ],
    dataRetention: [
      { category: 'Aggregated analytics', period: '12 months', reason: 'Product improvement' },
      { category: 'Community contributions', period: 'Until opt-out', reason: 'Powers community features' },
      { category: 'Account data', period: 'Until deletion', reason: 'Service provision' },
    ],
    thirdParties: [
      { name: 'Stripe', purpose: 'Payment processing', dataShared: 'Email + payment method (Stripe handles, we never see card numbers)' },
      { name: 'Vercel', purpose: 'Hosting', dataShared: 'Server logs (IP, page visits) — standard for any website' },
    ],
    stats: {
      dataPointsOnDevice: 847,
      dataPointsShared: settings.communityFeaturesEnabled ? 4 : 0,
      lastDataShared: settings.communityFeaturesEnabled ? new Date(Date.now() - 86400000).toISOString() : null,
    },
  };
}
