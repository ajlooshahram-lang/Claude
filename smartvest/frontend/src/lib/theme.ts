/**
 * Theme persistence.
 *
 * Stores dark/light preference in localStorage.
 * Applies theme by toggling classes on <html>.
 */

const STORAGE_KEY = 'smartvest_theme';

export type Theme = 'dark' | 'light';

export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark'; // Default
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
    html.classList.remove('light');
  } else {
    html.classList.add('light');
    html.classList.remove('dark');
  }
}
