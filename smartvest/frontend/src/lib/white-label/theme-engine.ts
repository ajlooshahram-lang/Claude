/**
 * Theme Engine
 *
 * Generates CSS custom properties from the config color scheme.
 * This is the bridge between the config file and the CSS variables
 * used throughout all components.
 *
 * Architecture:
 *   smartvest.config.ts → theme-engine → CSS custom properties → components
 *
 * The engine also handles:
 *   - Dark/light mode switching
 *   - Border radius scaling
 *   - Font family injection
 *   - Runtime theme updates (for previews)
 */

import { ThemeConfig, ThemeMode, ColorScheme } from './types';

// ─── CSS Variable Generation ─────────────────────────────────────────────────

/**
 * Generate the full CSS custom property string for a given theme mode.
 * This is injected into <html> style attribute or a <style> tag.
 */
export function generateCSSVariables(theme: ThemeConfig, mode: ThemeMode): string {
  const colors = getColorsForMode(theme.colors, mode);
  const radius = getBorderRadius(theme.borderRadius);

  return `
    --primary: ${colors.primary};
    --primary-hover: ${colors.primaryHover};
    --secondary: ${colors.secondary};
    --background: ${colors.background};
    --card: ${colors.card};
    --card-border: ${colors.cardBorder};
    --foreground: ${colors.foreground};
    --muted: ${colors.muted};
    --gain: ${colors.gain};
    --loss: ${colors.loss};
    --warning: ${colors.warning};
    --radius-sm: ${radius.sm};
    --radius-md: ${radius.md};
    --radius-lg: ${radius.lg};
    --radius-xl: ${radius.xl};
  `.trim();
}

/**
 * Get the appropriate color set for the current mode.
 */
function getColorsForMode(
  colors: ColorScheme,
  mode: ThemeMode
): {
  primary: string;
  primaryHover: string;
  secondary: string;
  background: string;
  card: string;
  cardBorder: string;
  foreground: string;
  muted: string;
  gain: string;
  loss: string;
  warning: string;
} {
  if (mode === 'light') {
    return {
      primary: colors.primary,
      primaryHover: colors.primaryHover,
      secondary: colors.secondary,
      background: colors.backgroundLight,
      card: colors.cardLight,
      cardBorder: colors.cardBorderLight,
      foreground: colors.foregroundLight,
      muted: colors.muted,
      gain: colors.gain,
      loss: colors.loss,
      warning: colors.warning,
    };
  }
  // Dark mode (default)
  return {
    primary: colors.primary,
    primaryHover: colors.primaryHover,
    secondary: colors.secondary,
    background: colors.background,
    card: colors.card,
    cardBorder: colors.cardBorder,
    foreground: colors.foreground,
    muted: colors.muted,
    gain: colors.gain,
    loss: colors.loss,
    warning: colors.warning,
  };
}

/**
 * Map border radius preset to pixel values.
 */
function getBorderRadius(preset: 'sharp' | 'rounded' | 'pill'): {
  sm: string; md: string; lg: string; xl: string;
} {
  switch (preset) {
    case 'sharp':
      return { sm: '2px', md: '4px', lg: '6px', xl: '8px' };
    case 'pill':
      return { sm: '8px', md: '12px', lg: '16px', xl: '24px' };
    case 'rounded':
    default:
      return { sm: '4px', md: '8px', lg: '12px', xl: '16px' };
  }
}

// ─── Runtime Theme Application ───────────────────────────────────────────────

/**
 * Apply theme CSS variables to the document root at runtime.
 * Called on initial load and when the user toggles dark/light mode.
 */
export function applyThemeToDocument(theme: ThemeConfig, mode: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const cssVars = generateCSSVariables(theme, mode);

  // Parse and apply each variable
  cssVars.split('\n').forEach(line => {
    const match = line.trim().match(/^(--[\w-]+):\s*(.+);?$/);
    if (match) {
      root.style.setProperty(match[1], match[2].replace(';', '').trim());
    }
  });

  // Apply font family
  if (theme.fontFamily && theme.fontFamily !== 'system') {
    root.style.setProperty('--font-family', `"${theme.fontFamily}", sans-serif`);
  }

  // Toggle dark/light class
  if (mode === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

/**
 * Get the initial theme mode based on config and user preference.
 */
export function getInitialThemeMode(theme: ThemeConfig): ThemeMode {
  if (typeof window === 'undefined') return theme.defaultMode;

  // Check localStorage for user preference
  try {
    const saved = localStorage.getItem('smartvest_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }

  return theme.defaultMode;
}

/**
 * Save theme mode preference to localStorage.
 */
export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('smartvest_theme', mode);
  } catch { /* ignore */ }
}

// ─── Server-Side Style Tag ───────────────────────────────────────────────────

/**
 * Generate inline style content for the <head> to prevent flash of unstyled content.
 * Used in layout.tsx for SSR.
 */
export function getSSRThemeScript(theme: ThemeConfig): string {
  const darkVars = generateCSSVariables(theme, 'dark');
  const lightVars = generateCSSVariables(theme, 'light');

  return `
    :root, .dark {
      ${darkVars}
    }
    .light {
      ${lightVars}
    }
    :root {
      --font-family: ${theme.fontFamily === 'system' ? 'var(--font-geist-sans), system-ui, sans-serif' : `"${theme.fontFamily}", sans-serif`};
    }
  `;
}
