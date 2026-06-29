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
  Landmark, FileText,
} from 'lucide-react';
import { FeatureFlags } from './types';
import { LucideIcon } from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  featureKey: keyof FeatureFlags;
}

/**
 * Complete navigation registry.
 * Each item is tied to a feature flag key.
 */
export const NAV_REGISTRY: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, featureKey: 'dashboard' },
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase, featureKey: 'portfolio' },
  { name: 'Search', href: '/search', icon: Search, featureKey: 'search' },
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark, featureKey: 'watchlist' },
  { name: 'Alerts', href: '/alerts', icon: Bell, featureKey: 'alerts' },
  { name: 'Simulator', href: '/simulator', icon: Calculator, featureKey: 'simulator' },
  { name: 'DCA Calculator', href: '/dca', icon: Calendar, featureKey: 'dcaCalculator' },
  { name: 'Sectors', href: '/sectors', icon: BarChart3, featureKey: 'sectors' },
  { name: 'Compare', href: '/compare', icon: ArrowLeftRight, featureKey: 'compare' },
  { name: 'Planner', href: '/planner', icon: PieChart, featureKey: 'planner' },
  { name: 'Performance', href: '/performance', icon: TrendingUp, featureKey: 'performance' },
  { name: 'Orders', href: '/orders', icon: Receipt, featureKey: 'orders' },
  { name: 'Tax', href: '/tax', icon: Receipt, featureKey: 'tax' },
  { name: 'ASK', href: '/ask', icon: Landmark, featureKey: 'ask' },
  { name: 'Reports', href: '/reports', icon: FileText, featureKey: 'reports' },
  { name: 'Smart Picks', href: '/picks', icon: Sparkles, featureKey: 'smartPicks' },
  { name: 'Crash Sim', href: '/crash-sim', icon: AlertTriangle, featureKey: 'crashSim' },
  { name: 'Backtest', href: '/backtest', icon: FlaskConical, featureKey: 'backtest' },
  { name: 'Behavior', href: '/behavior', icon: Brain, featureKey: 'behavior' },
  { name: 'Report Card', href: '/report-card', icon: ClipboardCheck, featureKey: 'reportCard' },
  { name: 'Patterns', href: '/patterns', icon: Eye, featureKey: 'patterns' },
  { name: 'Money Flow', href: '/money-flow', icon: Activity, featureKey: 'moneyFlow' },
  { name: 'Glossary', href: '/glossary', icon: BookOpen, featureKey: 'glossary' },
];

/**
 * Filter navigation items based on feature flags.
 * Only returns items whose feature is enabled in the config.
 */
export function getEnabledNavItems(features: FeatureFlags): NavItem[] {
  return NAV_REGISTRY.filter(item => features[item.featureKey]);
}
