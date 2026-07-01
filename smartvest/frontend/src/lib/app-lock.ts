/**
 * App Lock — biometric authentication + PIN fallback.
 *
 * Protects the app from unauthorized access on shared/stolen devices.
 * - Uses Web Authentication API (WebAuthn) for fingerprint/face on supported devices
 * - Falls back to a 4-digit PIN
 * - Auto-locks after 5 minutes of inactivity
 */

const PIN_KEY = 'smartvest_pin';
const LOCK_ENABLED_KEY = 'smartvest_lock_enabled';
const LAST_ACTIVITY_KEY = 'smartvest_last_activity';
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── PIN Management ──────────────────────────────────────────────────────────

export function isPINSet(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(PIN_KEY);
}

export function setPIN(pin: string): void {
  // Store as a simple hash (not cryptographic, but prevents plaintext exposure)
  const hash = hashPIN(pin);
  localStorage.setItem(PIN_KEY, hash);
  localStorage.setItem(LOCK_ENABLED_KEY, 'true');
}

export function verifyPIN(pin: string): boolean {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) return false;
  return hashPIN(pin) === stored;
}

/** Simple hash — not cryptographic, but prevents plaintext PIN in localStorage */
function hashPIN(pin: string): string {
  let h = 0;
  const salt = 'smartvest_pin_2026';
  const input = salt + pin + salt;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h = ((h << 5) - h + c) | 0;
  }
  return 'h:' + Math.abs(h).toString(36);
}

export function removePIN(): void {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCK_ENABLED_KEY);
}

export function isLockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LOCK_ENABLED_KEY) === 'true';
}

// ─── Activity Tracking ───────────────────────────────────────────────────────

export function recordActivity(): void {
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
}

export function shouldLock(): boolean {
  if (!isLockEnabled()) return false;
  const last = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!last) return true; // Never used → lock
  const elapsed = Date.now() - parseInt(last, 10);
  return elapsed > LOCK_TIMEOUT_MS;
}

// ─── Biometric Support ───────────────────────────────────────────────────────

export function isBiometricSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.PublicKeyCredential && navigator.credentials);
}

/**
 * Attempt biometric authentication using WebAuthn.
 * On Android PWA, this triggers the fingerprint/face scanner.
 * Returns true if successful, false if user cancels or not supported.
 */
export async function authenticateWithBiometric(): Promise<boolean> {
  if (!isBiometricSupported()) return false;

  try {
    // Use a simple challenge-response flow
    // In a real production app, the challenge would come from the server
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required', // This triggers biometric
        rpId: window.location.hostname,
      },
    });

    return !!credential;
  } catch {
    // User cancelled, not supported, or error
    return false;
  }
}
