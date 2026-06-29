/**
 * Frontend data cache — prevents redundant API calls within a session.
 *
 * Caches API responses in memory with a short TTL.
 * If you searched for "AAPL" and then visit the watchlist, the profile
 * data is already available without re-fetching.
 */

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const DEFAULT_TTL = 60_000; // 1 minute

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttl: number = DEFAULT_TTL): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/**
 * Cached fetch wrapper — fetches from cache first, then API.
 */
export async function cachedFetch<T>(url: string, options?: RequestInit, ttl?: number): Promise<T | null> {
  const cacheKey = `${options?.method || 'GET'}:${url}`;
  const cached = getCached<T>(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const data = await res.json();
    setCached(cacheKey, data, ttl || DEFAULT_TTL);
    return data as T;
  } catch {
    return null;
  }
}
