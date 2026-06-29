/**
 * Offline Data Cache
 *
 * Stores API responses in localStorage so the app can show data
 * even when there's no internet connection.
 *
 * Strategy:
 *   - Every successful API response is cached with a timestamp
 *   - When offline, we serve cached data and show an "outdated" banner
 *   - Cache has no expiry (stale data is better than no data)
 *   - Keys are prefixed to avoid collision with other localStorage data
 */

const PREFIX = 'smartvest_offline_';

export interface CachedResponse {
  data: unknown;
  cachedAt: string;   // ISO timestamp
  url: string;
}

export function cacheResponse(url: string, data: unknown): void {
  try {
    const entry: CachedResponse = {
      data,
      cachedAt: new Date().toISOString(),
      url,
    };
    localStorage.setItem(PREFIX + url, JSON.stringify(entry));
  } catch {
    // localStorage might be full — silently fail
  }
}

export function getCachedResponse(url: string): CachedResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getCacheAge(url: string): string | null {
  const cached = getCachedResponse(url);
  if (!cached) return null;

  const age = Date.now() - new Date(cached.cachedAt).getTime();
  const minutes = Math.floor(age / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Fetch with offline fallback.
 * 
 * 1. Tries the network first
 * 2. If successful, caches the response
 * 3. If network fails (offline), returns cached data
 * 4. Returns { data, fromCache, cacheAge } so the UI can show a banner
 */
export async function fetchWithOffline<T>(
  url: string,
  options?: RequestInit,
): Promise<{ data: T | null; fromCache: boolean; cacheAge: string | null; error: string | null }> {
  // Try network first
  try {
    const res = await fetch(url, {
      ...options,
      signal: options?.signal || AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      cacheResponse(url, data);
      return { data, fromCache: false, cacheAge: null, error: null };
    }

    // Non-OK response — try cache
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // Network failed — try cache
    const cached = getCachedResponse(url);
    if (cached) {
      return {
        data: cached.data as T,
        fromCache: true,
        cacheAge: getCacheAge(url),
        error: null,
      };
    }

    // No cache either
    return {
      data: null,
      fromCache: false,
      cacheAge: null,
      error: 'No internet connection and no cached data available.',
    };
  }
}

/**
 * Check if the device is currently online.
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}
