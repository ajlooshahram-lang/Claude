/**
 * MFA recovery (backup) codes.
 *
 * Recovery codes let a user who has lost their TOTP authenticator self-recover
 * at login instead of requiring manual admin DB surgery. Design:
 *
 *  - N=10 codes are generated with a CSPRNG (`node:crypto.randomBytes`).
 *  - Each code is human-readable: two groups of 5 base32-ish characters
 *    separated by a hyphen, e.g. `7K9QD-2MXR4`.
 *  - Codes are HASHED at rest with the same Argon2id hashing used for passwords
 *    (see `password.ts`); the plaintext is shown to the user exactly once.
 *  - User entry is forgiving: `normalizeCode` strips spaces/hyphens and
 *    uppercases before comparison, so "7k9qd 2mxr4" matches "7K9QD-2MXR4".
 */

import { randomBytes } from "node:crypto";

/** Number of recovery codes generated per set. */
export const RECOVERY_CODE_COUNT = 10;

/** Characters per group (two groups joined by a hyphen). */
const GROUP_LENGTH = 5;

/**
 * Crockford-style base32 alphabet without the ambiguous characters
 * (no I, L, O, U, 0, 1) so codes are easy to read and transcribe.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a single recovery code in `XXXXX-XXXXX` format using a CSPRNG.
 * Rejection sampling keeps the character distribution uniform across the
 * alphabet (no modulo bias).
 */
export function generateRecoveryCode(): string {
  const total = GROUP_LENGTH * 2;
  const chars: string[] = [];
  // 256 % 30 != 0, so reject bytes in the biased tail to keep it uniform.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (chars.length < total) {
    const buf = randomBytes(total);
    for (let i = 0; i < buf.length && chars.length < total; i++) {
      const b = buf[i] as number;
      if (b >= limit) continue;
      chars.push(ALPHABET[b % ALPHABET.length] as string);
    }
  }
  return chars.slice(0, GROUP_LENGTH).join("") + "-" + chars.slice(GROUP_LENGTH).join("");
}

/**
 * Generate a fresh set of recovery codes (plaintext). Caller is responsible for
 * hashing each one before storage and for returning the plaintext to the user
 * exactly once.
 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateRecoveryCode());
  }
  return codes;
}

/**
 * Normalize a user-entered recovery code for comparison: remove all whitespace
 * and hyphens and uppercase the result. Pure function — unit-testable.
 */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
