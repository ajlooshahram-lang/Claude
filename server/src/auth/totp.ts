import { randomBytes, createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP (Time-Based One-Time Password) implementation.
 *
 * Parameters:
 *  - Algorithm: HMAC-SHA1
 *  - Time step: 30 seconds
 *  - Digits: 6
 *  - Window: +/- 1 step (for clock drift tolerance)
 *
 * Uses Node.js crypto only -- no external TOTP library needed.
 */

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // seconds
const TOTP_ISSUER = "QI Platform";

/** Base32 alphabet (RFC 4648) */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encode a Buffer to base32 (RFC 4648, no padding).
 */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | (buffer[i] as number);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/**
 * Decode a base32 string to a Buffer.
 */
function base32Decode(encoded: string): Buffer {
  const cleanInput = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i] as string;
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

/**
 * Generate a random TOTP secret (20 bytes, base32-encoded).
 */
export function generateTotpSecret(): string {
  const buffer = randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Generate an otpauth:// URI for QR code enrollment.
 */
export function generateTotpUri(secret: string, email: string, issuer: string = TOTP_ISSUER): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Generate a TOTP code for a given time counter value.
 */
function generateCode(secret: string, counter: bigint): string {
  const key = base32Decode(secret);

  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  // HMAC-SHA1
  const hmac = createHmac("sha1", key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Get the current time counter.
 */
function getTimeCounter(timeMs?: number): bigint {
  const time = timeMs ?? Date.now();
  return BigInt(Math.floor(time / 1000 / TOTP_PERIOD));
}

/**
 * Result of a TOTP verification that also reports the matched time-step.
 */
export type TotpVerifyResult = {
  /** Whether the supplied code matched within the allowed window. */
  valid: boolean;
  /**
   * The absolute time-step counter that matched (only present when valid).
   * Callers persist this to reject replay of a code within its window.
   */
  step?: number;
};

/**
 * Verify a TOTP code against a secret, allowing a window of +/- steps, and
 * return the matched absolute time-step counter so the caller can persist it
 * for replay protection.
 */
export function verifyTotpWithStep(secret: string, code: string, window: number = 1): TotpVerifyResult {
  if (code.length !== TOTP_DIGITS) return { valid: false };

  const counter = getTimeCounter();

  for (let i = -window; i <= window; i++) {
    const testCounter = counter + BigInt(i);
    const expected = generateCode(secret, testCounter);
    // Constant-time comparison to prevent timing attacks
    if (timingSafeEqual(code, expected)) {
      return { valid: true, step: Number(testCounter) };
    }
  }
  return { valid: false };
}

/**
 * Verify a TOTP code against a secret, allowing a window of +/- steps.
 *
 * Backward-compatible boolean wrapper around {@link verifyTotpWithStep} for
 * callers (enroll/verify/disable) that do not need the matched step.
 */
export function verifyTotp(secret: string, code: string, window: number = 1): boolean {
  return verifyTotpWithStep(secret, code, window).valid;
}

/**
 * Generate the current TOTP code (useful for testing).
 */
export function generateCurrentTotp(secret: string): string {
  const counter = getTimeCounter();
  return generateCode(secret, counter);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return result === 0;
}
