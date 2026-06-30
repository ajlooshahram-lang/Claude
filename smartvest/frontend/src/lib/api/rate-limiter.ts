/**
 * API Rate Limiter
 *
 * Enforces per-key daily request limits:
 *   - Free API keys: 100 requests/day
 *   - Paid API keys: 10,000 requests/day
 *
 * Rate limit state is stored in localStorage (demo) or Redis (production).
 * Headers returned on every response:
 *   X-RateLimit-Limit: max requests per day
 *   X-RateLimit-Remaining: requests remaining
 *   X-RateLimit-Reset: Unix timestamp when limit resets
 */

import { ApiKeyTier, RateLimitInfo } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const RATE_LIMITS: Record<ApiKeyTier, number> = {
  free: 100,
  paid: 10000,
};

const RATE_LIMIT_STORAGE_PREFIX = 'smartvest_api_ratelimit_';

// ─── Rate Limit State ────────────────────────────────────────────────────────

interface RateLimitState {
  count: number;
  resetAt: number;  // Unix timestamp (ms)
}

/**
 * Get the rate limit state for an API key.
 */
function getRateLimitState(apiKey: string): RateLimitState {
  if (typeof window === 'undefined') {
    return { count: 0, resetAt: getNextResetTime() };
  }

  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_PREFIX + apiKey);
    if (!raw) return { count: 0, resetAt: getNextResetTime() };

    const state: RateLimitState = JSON.parse(raw);

    // Check if reset time has passed
    if (Date.now() > state.resetAt) {
      // New day — reset counter
      return { count: 0, resetAt: getNextResetTime() };
    }

    return state;
  } catch {
    return { count: 0, resetAt: getNextResetTime() };
  }
}

/**
 * Increment the request counter for an API key.
 */
function incrementCounter(apiKey: string): RateLimitState {
  const state = getRateLimitState(apiKey);
  state.count++;

  if (typeof window !== 'undefined') {
    localStorage.setItem(
      RATE_LIMIT_STORAGE_PREFIX + apiKey,
      JSON.stringify(state)
    );
  }

  return state;
}

/**
 * Get the next midnight UTC as the reset time.
 */
function getNextResetTime(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
}

/**
 * Check and consume a rate limit token.
 * Returns whether the request is allowed and current limit info.
 */
export function checkRateLimit(apiKey: string, tier: ApiKeyTier): RateLimitResult {
  const limit = RATE_LIMITS[tier];
  const state = getRateLimitState(apiKey);

  if (state.count >= limit) {
    return {
      allowed: false,
      info: {
        limit,
        remaining: 0,
        reset: Math.floor(state.resetAt / 1000),
      },
    };
  }

  // Consume a token
  const updated = incrementCounter(apiKey);

  return {
    allowed: true,
    info: {
      limit,
      remaining: Math.max(0, limit - updated.count),
      reset: Math.floor(updated.resetAt / 1000),
    },
  };
}

/**
 * Get rate limit info without consuming a token (for headers).
 */
export function getRateLimitInfo(apiKey: string, tier: ApiKeyTier): RateLimitInfo {
  const limit = RATE_LIMITS[tier];
  const state = getRateLimitState(apiKey);

  return {
    limit,
    remaining: Math.max(0, limit - state.count),
    reset: Math.floor(state.resetAt / 1000),
  };
}

/**
 * Reset rate limit for an API key (admin function).
 */
export function resetRateLimit(apiKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(RATE_LIMIT_STORAGE_PREFIX + apiKey);
}
