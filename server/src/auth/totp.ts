import { authenticator } from "otplib";

/** Generate a new TOTP secret (base32-encoded). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Verify a 6-digit TOTP token against the stored secret. */
export function verifyTotpToken(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}
