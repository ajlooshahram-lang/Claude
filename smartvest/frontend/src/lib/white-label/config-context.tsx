'use client';

/**
 * White-Label Configuration Context
 *
 * Provides the entire white-label config to all components via React context.
 * Components use the `useConfig()` hook to access branding, theme, features, etc.
 *
 * Architecture:
 *   smartvest.config.ts → ConfigProvider (wraps app) → useConfig() in components
 *
 * This ensures business logic is completely decoupled from presentation.
 * Changing the config file changes the entire app appearance and behavior
 * without touching any component code.
 */

import { createContext, useContext, ReactNode } from 'react';
import { WhiteLabelConfig, FeatureFlags } from './types';
import appConfig from '../../../smartvest.config';

// ─── Context ─────────────────────────────────────────────────────────────────

const ConfigContext = createContext<WhiteLabelConfig>(appConfig);

// ─── Provider ────────────────────────────────────────────────────────────────

interface ConfigProviderProps {
  children: ReactNode;
  overrides?: Partial<WhiteLabelConfig>;
}

/**
 * Wraps the application to provide white-label config to all children.
 * Optional `overrides` prop allows runtime config changes (e.g., for previews).
 */
export function ConfigProvider({ children, overrides }: ConfigProviderProps) {
  const mergedConfig = overrides
    ? deepMerge(appConfig, overrides) as WhiteLabelConfig
    : appConfig;

  return (
    <ConfigContext.Provider value={mergedConfig}>
      {children}
    </ConfigContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Access the full white-label configuration.
 * Use this hook in any component that needs config values.
 *
 * @example
 * const { branding, theme, features } = useConfig();
 * return <h1>{branding.appName}</h1>;
 */
export function useConfig(): WhiteLabelConfig {
  return useContext(ConfigContext);
}

/**
 * Check if a specific feature is enabled.
 *
 * @example
 * const isEnabled = useFeatureEnabled('ask');
 * if (!isEnabled) return null;
 */
export function useFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const config = useContext(ConfigContext);
  return config.features[feature] ?? false;
}

/**
 * Get branding config directly.
 *
 * @example
 * const { appName, logo } = useBranding();
 */
export function useBranding() {
  const config = useContext(ConfigContext);
  return config.branding;
}

/**
 * Get theme config directly.
 *
 * @example
 * const { colors, defaultMode } = useThemeConfig();
 */
export function useThemeConfig() {
  const config = useContext(ConfigContext);
  return config.theme;
}

/**
 * Get locale config directly.
 *
 * @example
 * const { defaultCurrency, currencySymbol } = useLocale();
 */
export function useLocale() {
  const config = useContext(ConfigContext);
  return config.locale;
}

/**
 * Format a monetary value using the configured locale settings.
 *
 * @example
 * const format = useCurrencyFormatter();
 * format(12500); // "12.500 kr" or "$12,500" depending on config
 */
export function useCurrencyFormatter() {
  const locale = useLocale();

  return (value: number): string => {
    const parts = Math.abs(value).toFixed(2).split('.');
    const intPart = parts[0].replace(
      /\B(?=(\d{3})+(?!\d))/g,
      locale.thousandsSeparator
    );
    const formatted = `${intPart}`;
    const sign = value < 0 ? '-' : '';

    if (locale.currencyPosition === 'before') {
      return `${sign}${locale.currencySymbol}${formatted}`;
    }
    return `${sign}${formatted} ${locale.currencySymbol}`;
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Deep merge two objects (config + overrides).
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      output[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
