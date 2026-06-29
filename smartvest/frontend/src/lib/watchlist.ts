/**
 * Watchlist persistence layer.
 *
 * Stores saved stock symbols in localStorage so they survive page refresh.
 * Simple and reliable — no database needed for a personal app.
 */

const STORAGE_KEY = 'smartvest_watchlist';

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;  // ISO timestamp
}

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addToWatchlist(symbol: string, name: string): void {
  const list = getWatchlist();
  // Don't add duplicates
  if (list.some(item => item.symbol === symbol)) return;
  list.push({ symbol, name, addedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function removeFromWatchlist(symbol: string): void {
  const list = getWatchlist().filter(item => item.symbol !== symbol);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isInWatchlist(symbol: string): boolean {
  return getWatchlist().some(item => item.symbol === symbol);
}
