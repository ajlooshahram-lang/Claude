/**
 * Navigation Configuration
 *
 * Maps feature flags to navigation items. Items are only shown
 * if their corresponding feature is enabled in smartvest.config.ts.
 *
 * This keeps the sidebar completely driven by the config file —
 * disable a feature and it vanishes from the nav automatically.
 */

import {
  LayoutDashboard, TrendingUp, Search,
  BookOpen, Bell, Briefcase, Bookmark, Calculator,
  Calendar, BarChart3, Sparkles, ArrowLeftRight, PieChart, Receipt,
  AlertTriangle, Brain, FlaskConical, ClipboardCheck, Eye, Activity,
  Landmark, FileText, Crown,
} from 'lucide-react';
import { FeatureFlags } from './types';
import { LucideIcon } from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  featureKey: keyof FeatureFlags;
  /** Subscription feature key for gating. If set, a lock badge appears for users without access. */
  subscriptionGate?: string;
}

/**
 * Complete navigation registry.
 * Each item is tied to a feature flag key.
 */
export const NAV_REGISTRY: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, featureKey: 'dashboard', subscriptionGate: 'dashboard_basic' },
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase, featureKey: 'portfolio', subscriptionGate: 'portfolio' },
  { name: 'Search', href: '/search', icon: Search, featureKey: 'search', subscriptionGate: 'search' },
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark, featureKey: 'watchlist', subscriptionGate: 'watchlist_basic' },
  { name: 'Alerts', href: '/alerts', icon: Bell, featureKey: 'alerts', subscriptionGate: 'alerts' },
  { name: 'Simulator', href: '/simulator', icon: Calculator, featureKey: 'simulator', subscriptionGate: 'simulator' },
  { name: 'DCA Calculator', href: '/dca', icon: Calendar, featureKey: 'dcaCalculator', subscriptionGate: 'dca' },
  { name: 'Sectors', href: '/sectors', icon: BarChart3, featureKey: 'sectors', subscriptionGate: 'sectors' },
  { name: 'Compare', href: '/compare', icon: ArrowLeftRight, featureKey: 'compare', subscriptionGate: 'compare' },
  { name: 'Planner', href: '/planner', icon: PieChart, featureKey: 'planner', subscriptionGate: 'planner' },
  { name: 'Performance', href: '/performance', icon: TrendingUp, featureKey: 'performance', subscriptionGate: 'performance' },
  { name: 'Orders', href: '/orders', icon: Receipt, featureKey: 'orders', subscriptionGate: 'orders' },
  { name: 'Tax', href: '/tax', icon: Receipt, featureKey: 'tax', subscriptionGate: 'tax' },
  { name: 'ASK', href: '/ask', icon: Landmark, featureKey: 'ask', subscriptionGate: 'ask' },
  { name: 'Reports', href: '/reports', icon: FileText, featureKey: 'reports', subscriptionGate: 'reports' },
  { name: 'Smart Picks', href: '/picks', icon: Sparkles, featureKey: 'smartPicks', subscriptionGate: 'smart_picks' },
  { name: 'Crash Sim', href: '/crash-sim', icon: AlertTriangle, featureKey: 'crashSim', subscriptionGate: 'crash_sim' },
  { name: 'Backtest', href: '/backtest', icon: FlaskConical, featureKey: 'backtest', subscriptionGate: 'backtest' },
  { name: 'Behavior', href: '/behavior', icon: Brain, featureKey: 'behavior', subscriptionGate: 'behavior' },
  { name: 'Report Card', href: '/report-card', icon: ClipboardCheck, featureKey: 'reportCard', subscriptionGate: 'report_card' },
  { name: 'Patterns', href: '/patterns', icon: Eye, featureKey: 'patterns', subscriptionGate: 'patterns' },
  { name: 'Money Flow', href: '/money-flow', icon: Activity, featureKey: 'moneyFlow', subscriptionGate: 'money_flow' },
  { name: 'Glossary', href: '/glossary', icon: BookOpen, featureKey: 'glossary', subscriptionGate: 'glossary' },
  { name: 'Pricing', href: '/pricing', icon: Crown, featureKey: 'dashboard' },
];

/**
 * Filter navigation items based on feature flags.
 * Only returns items whose feature is enabled in the config.
 */
export function getEnabledNavItems(features: FeatureFlags): NavItem[] {
  return NAV_REGISTRY.filter(item => features[item.featureKey]);
}
