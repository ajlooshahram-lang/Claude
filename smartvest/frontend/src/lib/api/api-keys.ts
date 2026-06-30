/**
 * API Key Management
 *
 * Handles creation, validation, and management of API keys.
 * Keys are stored per-user and validated on every request.
 *
 * Key format: sv_live_{tier}_{random32chars}
 *   - sv_live_free_a1b2c3d4...
 *   - sv_live_paid_x9y8z7w6...
 *
 * In production, keys would be stored in a database with proper hashing.
 * This demo uses localStorage with the user-data service.
 */

import { ApiKey, ApiKeyTier } from './types';
import { getUserData, setUserData } from '../user-data';
import { getCurrentUserId } from '../auth';

const API_KEYS_DATA_KEY = 'api_keys' as any;

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a new API key with the specified tier.
 */
export function generateApiKey(name: string, tier: ApiKeyTier): ApiKey {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Must be authenticated to create API keys');

  const randomPart = generateRandomString(32);
  const key = `sv_live_${tier}_${randomPart}`;

  const apiKey: ApiKey = {
    key,
    userId,
    tier,
    name,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    requestsToday: 0,
    totalRequests: 0,
    isActive: true,
  };

  // Save to user's key list
  const keys = getUserApiKeys();
  keys.push(apiKey);
  setUserData(API_KEYS_DATA_KEY, keys);

  return apiKey;
}

/**
 * Get all API keys for the current user.
 */
export function getUserApiKeys(): ApiKey[] {
  return getUserData<ApiKey[]>(API_KEYS_DATA_KEY) || [];
}

/**
 * Validate an API key and return its metadata.
 * Returns null if the key is invalid or inactive.
 */
export function validateApiKey(key: string): ApiKey | null {
  if (!key || !key.startsWith('sv_live_')) return null;

  // In demo mode, search all users' keys in localStorage
  if (typeof window === 'undefined') return null;

  // Search through all stored keys
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (storageKey && storageKey.includes('_api_keys')) {
      try {
        const keys: ApiKey[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const found = keys.find(k => k.key === key && k.isActive);
        if (found) return found;
      } catch { continue; }
    }
  }

  return null;
}

/**
 * Record a request against an API key.
 */
export function recordApiKeyUsage(key: string): void {
  if (typeof window === 'undefined') return;

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (storageKey && storageKey.includes('_api_keys')) {
      try {
        const keys: ApiKey[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const idx = keys.findIndex(k => k.key === key);
        if (idx >= 0) {
          keys[idx].lastUsedAt = new Date().toISOString();
          keys[idx].requestsToday++;
          keys[idx].totalRequests++;
          localStorage.setItem(storageKey, JSON.stringify(keys));
          return;
        }
      } catch { continue; }
    }
  }
}

/**
 * Revoke (deactivate) an API key.
 */
export function revokeApiKey(key: string): void {
  const keys = getUserApiKeys();
  const idx = keys.findIndex(k => k.key === key);
  if (idx >= 0) {
    keys[idx].isActive = false;
    setUserData(API_KEYS_DATA_KEY, keys);
  }
}

/**
 * Delete an API key permanently.
 */
export function deleteApiKey(key: string): void {
  const keys = getUserApiKeys().filter(k => k.key !== key);
  setUserData(API_KEYS_DATA_KEY, keys);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join('');
}

/**
 * Mask an API key for display (show first 12 and last 4 chars).
 */
export function maskApiKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.slice(0, 12)}${'•'.repeat(key.length - 16)}${key.slice(-4)}`;
}

/**
 * Get the tier from a key string without validation.
 */
export function getTierFromKey(key: string): ApiKeyTier {
  if (key.includes('_paid_')) return 'paid';
  return 'free';
}
