/**
 * White-Label Module — Public API
 *
 * Import everything you need from '@/lib/white-label':
 *
 *   import { useConfig, useFeatureEnabled, useBranding } from '@/lib/white-label';
 */

export type {
  WhiteLabelConfig,
  BrandingConfig,
  ThemeConfig,
  ColorScheme,
  LocaleConfig,
  FeatureFlags,
  BrokerConfig,
  DataConfig,
  DeploymentConfig,
  LogoConfig,
  LogoType,
  ThemeMode,
  BorderRadius,
  CurrencyPosition,
  BrokerType,
  MarketDataProvider,
  NewsProvider,
  AIProvider,
  AnalyticsProvider,
} from './types';

export {
  ConfigProvider,
  useConfig,
  useFeatureEnabled,
  useBranding,
  useThemeConfig,
  useLocale,
  useCurrencyFormatter,
} from './config-context';

export {
  generateCSSVariables,
  applyThemeToDocument,
  getInitialThemeMode,
  saveThemeMode,
  getSSRThemeScript,
} from './theme-engine';

export {
  NAV_REGISTRY,
  getEnabledNavItems,
} from './nav-config';

export type { NavItem } from './nav-config';
