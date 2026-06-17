import { randomBytes, createHash } from "node:crypto";

/**
 * Secure session token management.
 *
 * Tokens are 32 bytes of CSPRNG output (hex-encoded for transport).
 * Only the SHA-256 hash of the token is stored in the database, so a
 * database leak cannot be replayed as a live session.
 */

export type SessionToken = {
  /** Hex-encoded 32-byte random token (sent to client in cookie) */
  token: string;
  /** SHA-256 hash of the token (stored in the database) */
  tokenHash: string;
};

/**
 * Generate a new session token and its SHA-256 hash.
 */
export function generateSessionToken(): SessionToken {
  const buffer = randomBytes(32);
  const token = buffer.toString("hex");
  const tokenHash = createHash("sha256").update(buffer).digest("hex");
  return { token, tokenHash };
}

/**
 * Compute the SHA-256 hash of a raw token string.
 * Used when validating an incoming cookie value against stored hashes.
 */
export function hashToken(token: string): string {
  const buffer = Buffer.from(token, "hex");
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Session cookie configuration.
 */
export function getSessionCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict" as const,
    path: "/",
  };
}

/** Cookie name for the session token */
export const SESSION_COOKIE_NAME = "qi_session";
