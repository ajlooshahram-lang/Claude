/**
 * White-Label Configuration Type Definitions
 *
 * These types define the complete configuration schema for white-labeling
 * the investment platform. Every visual, functional, and integration
 * aspect is configurable through a single file.
 */

// ─── Branding ────────────────────────────────────────────────────────────────

export type LogoType = 'url' | 'svg' | 'text';

export interface LogoConfig {
  type: LogoType;
  value: string;  // URL path, SVG string, or empty for text mode
}

export interface BrandingConfig {
  appName: string;
  tagline: string;
  logo: LogoConfig;
  favicon: string;
  companyName: string;
  companyUrl: string;
  supportEmail: string;
}

// ─── Theme & Colors ──────────────────────────────────────────────────────────

export interface ColorScheme {
  primary: string;
  primaryHover: string;
  secondary: string;
  background: string;
  backgroundLight: string;
  card: string;
  cardLight: string;
  cardBorder: string;
  cardBorderLight: string;
  foreground: string;
  foregroundLight: string;
  muted: string;
  gain: string;
  loss: string;
  warning: string;
}

export type ThemeMode = 'dark' | 'light';
export type BorderRadius = 'sharp' | 'rounded' | 'pill';

export interface ThemeConfig {
  colors: ColorScheme;
  defaultMode: ThemeMode;
  allowThemeToggle: boolean;
  borderRadius: BorderRadius;
  fontFamily: string;  // 'system' or Google Font name
}

// ─── Locale & Market ─────────────────────────────────────────────────────────

export type CurrencyPosition = 'before' | 'after';

export interface LocaleConfig {
  defaultCurrency: string;
  currencySymbol: string;
  currencyPosition: CurrencyPosition;
  defaultMarket: string;
  country: string;
  language: string;
  dateFormat: string;
  thousandsSeparator: string;
  decimalSeparator: string;
}

// ─── Feature Flags ───────────────────────────────────────────────────────────

export interface FeatureFlags {
  dashboard: boolean;
  portfolio: boolean;
  search: boolean;
  watchlist: boolean;
  alerts: boolean;
  simulator: boolean;
  dcaCalculator: boolean;
  sectors: boolean;
  compare: boolean;
  planner: boolean;
  performance: boolean;
  orders: boolean;
  tax: boolean;
  ask: boolean;
  smartPicks: boolean;
  crashSim: boolean;
  backtest: boolean;
  behavior: boolean;
  reportCard: boolean;
  patterns: boolean;
  moneyFlow: boolean;
  glossary: boolean;
  reports: boolean;
  aiChat: boolean;
  notifications: boolean;
  appLock: boolean;
}

// ─── Broker Integration ──────────────────────────────────────────────────────

export type BrokerType =
  | 'saxo'
  | 'nordnet'
  | 'interactive_brokers'
  | 'alpaca'
  | 'tradier'
  | 'none';

export interface BrokerConfig {
  default: BrokerType;
  showBrokerSettings: boolean;
  availableBrokers: readonly BrokerType[];
}

// ─── Data Sources ────────────────────────────────────────────────────────────

export type MarketDataProvider = 'yahoo' | 'alpha_vantage' | 'polygon' | 'mock';
export type NewsProvider = 'newsapi' | 'finnhub' | 'mock';
export type AIProvider = 'openai' | 'anthropic' | 'local' | 'none';

export interface DataConfig {
  marketDataProvider: MarketDataProvider;
  newsProvider: NewsProvider;
  aiProvider: AIProvider;
  refreshInterval: number;
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export type AnalyticsProvider = 'vercel' | 'google' | 'plausible' | 'none';

export interface DeploymentConfig {
  baseUrl: string;
  analytics: AnalyticsProvider;
  analyticsId: string;
  showPoweredBy: boolean;
  poweredByName: string;
  poweredByUrl: string;
}

// ─── Subscription & Pricing ──────────────────────────────────────────────────

export interface TierPricingConfig {
  monthly: number;
  yearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
}

export interface SubscriptionConfig {
  enabled: boolean;
  stripePublishableKey: string;
  pricing: {
    pro: TierPricingConfig;
    institutional: TierPricingConfig;
  };
  freeWatchlistLimit: number;
  showPricingInNav: boolean;
  proTrialDays: number;
}

// ─── Complete Config ─────────────────────────────────────────────────────────

export interface WhiteLabelConfig {
  branding: BrandingConfig;
  theme: ThemeConfig;
  locale: LocaleConfig;
  features: FeatureFlags;
  broker: BrokerConfig;
  data: DataConfig;
  deployment: DeploymentConfig;
  subscription: SubscriptionConfig;
}
