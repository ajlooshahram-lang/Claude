/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     WHITE-LABEL CONFIGURATION FILE                          ║
 * ║                                                                             ║
 * ║  This is the ONLY file you need to edit to create your own branded          ║
 * ║  version of this investment platform. Change the values below and           ║
 * ║  deploy — that's it.                                                        ║
 * ║                                                                             ║
 * ║  See WHITELABEL-GUIDE.md for step-by-step deployment instructions.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { WhiteLabelConfig } from './src/lib/white-label/types';

const config: WhiteLabelConfig = {

  // ─── BRANDING ────────────────────────────────────────────────────────────────
  branding: {
    appName: 'SmartVest',
    tagline: 'Your AI Stock Assistant',
    logo: {
      // Options: 'url' (image file), 'svg' (inline SVG string), or 'text' (just app name)
      type: 'text',
      // If type is 'url': provide path relative to /public, e.g. '/logo.png'
      // If type is 'svg': provide full SVG markup as a string
      // If type is 'text': the appName above is rendered with a styled icon
      value: '',
    },
    favicon: '/favicon.ico',
    // Shown in footer, emails, etc.
    companyName: 'SmartVest',
    companyUrl: 'https://smartvest.app',
    supportEmail: 'support@smartvest.app',
  },

  // ─── COLORS & THEME ─────────────────────────────────────────────────────────
  theme: {
    // All colors in hex format. These generate the full color system automatically.
    colors: {
      primary: '#3b82f6',        // Main brand color (buttons, links, active states)
      primaryHover: '#2563eb',   // Hover state for primary
      secondary: '#8b5cf6',      // Secondary accent (badges, highlights)
      background: '#0a0a0f',     // Page background (dark mode)
      backgroundLight: '#ffffff', // Page background (light mode)
      card: '#111118',           // Card/panel background (dark mode)
      cardLight: '#f8fafc',      // Card/panel background (light mode)
      cardBorder: '#1e1e2e',     // Card borders (dark mode)
      cardBorderLight: '#e2e8f0', // Card borders (light mode)
      foreground: '#f0f0f5',     // Primary text (dark mode)
      foregroundLight: '#0f172a', // Primary text (light mode)
      muted: '#6b7280',         // Secondary/muted text
      gain: '#22c55e',          // Positive values (green)
      loss: '#ef4444',          // Negative values (red)
      warning: '#f59e0b',       // Warnings, caution (amber)
    },
    // Default theme mode on first visit
    defaultMode: 'dark' as const,
    // Allow users to toggle between dark/light
    allowThemeToggle: true,
    // Border radius scale: 'sharp' (4px), 'rounded' (8px), 'pill' (16px)
    borderRadius: 'rounded' as const,
    // Font: 'system' uses system font stack, or provide a Google Font name
    fontFamily: 'system',
  },

  // ─── LOCALE & MARKET ─────────────────────────────────────────────────────────
  locale: {
    defaultCurrency: 'DKK',
    currencySymbol: 'kr',
    currencyPosition: 'after' as const,  // 'before' ($100) or 'after' (100 kr)
    defaultMarket: 'OMX Copenhagen',
    country: 'Denmark',
    language: 'en',                       // UI language: 'en', 'da', 'de', 'sv', etc.
    dateFormat: 'DD/MM/YYYY',
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },

  // ─── FEATURES ────────────────────────────────────────────────────────────────
  // Set any feature to `false` to completely hide it from navigation and UI.
  features: {
    dashboard: true,
    portfolio: true,
    search: true,
    watchlist: true,
    alerts: true,
    simulator: true,
    dcaCalculator: true,
    sectors: true,
    compare: true,
    planner: true,
    performance: true,
    orders: true,
    tax: true,
    ask: true,               // Aktiesparekonto (Danish-specific)
    smartPicks: true,
    crashSim: true,
    backtest: true,
    behavior: true,
    reportCard: true,
    patterns: true,
    moneyFlow: true,
    glossary: true,
    reports: true,
    aiChat: true,            // AI chat widget
    notifications: true,
    appLock: true,           // PIN/biometric lock
  },

  // ─── BROKER INTEGRATION ──────────────────────────────────────────────────────
  broker: {
    // Default broker for API connection. Options:
    // 'saxo' | 'nordnet' | 'interactive_brokers' | 'alpaca' | 'tradier' | 'none'
    default: 'none' as const,
    // API keys are set via environment variables (never in this file):
    //   BROKER_API_KEY, BROKER_API_SECRET, BROKER_ACCOUNT_ID
    // Whether to show the broker connection UI in settings
    showBrokerSettings: true,
    // Available brokers the user can choose from
    availableBrokers: ['saxo', 'nordnet', 'interactive_brokers', 'alpaca'] as const,
  },

  // ─── DATA SOURCES ────────────────────────────────────────────────────────────
  data: {
    // Market data provider: 'yahoo' | 'alpha_vantage' | 'polygon' | 'mock'
    marketDataProvider: 'mock' as const,
    // News source: 'newsapi' | 'finnhub' | 'mock'
    newsProvider: 'mock' as const,
    // AI model for chat/analysis: 'openai' | 'anthropic' | 'local' | 'none'
    aiProvider: 'none' as const,
    // How often to refresh market data (seconds). 0 = manual only.
    refreshInterval: 60,
  },

  // ─── DEPLOYMENT ──────────────────────────────────────────────────────────────
  deployment: {
    // Base URL of your deployment (used for OG images, canonical URLs)
    baseUrl: 'https://smartvest.app',
    // Analytics: 'vercel' | 'google' | 'plausible' | 'none'
    analytics: 'none' as const,
    // Analytics tracking ID (e.g. GA-XXXXXXXXXX)
    analyticsId: '',
    // Show "Powered by [platform]" footer badge
    showPoweredBy: false,
    poweredByName: '',
    poweredByUrl: '',
  },

  // ─── SUBSCRIPTION & PRICING ──────────────────────────────────────────────────
  subscription: {
    // Enable/disable the subscription system entirely
    enabled: true,
    // Stripe publishable key (set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY env var in production)
    // Leave empty for demo mode (instant upgrades without payment)
    stripePublishableKey: '',
    // Pricing in your configured currency (locale.defaultCurrency)
    pricing: {
      pro: {
        monthly: 99,            // ← Set your Pro monthly price here
        yearly: 899,            // ← Set your Pro yearly price here
        stripePriceIdMonthly: 'price_pro_monthly',   // From Stripe Dashboard
        stripePriceIdYearly: 'price_pro_yearly',     // From Stripe Dashboard
      },
      institutional: {
        monthly: 499,           // ← Set your Institutional monthly price here
        yearly: 4499,           // ← Set your Institutional yearly price here
        stripePriceIdMonthly: 'price_inst_monthly',  // From Stripe Dashboard
        stripePriceIdYearly: 'price_inst_yearly',    // From Stripe Dashboard
      },
    },
    // Free tier watchlist limit
    freeWatchlistLimit: 10,
    // Show the pricing page link in navigation
    showPricingInNav: true,
    // Trial days for new Pro subscriptions (0 = no trial)
    proTrialDays: 0,
  },
};

export default config;
