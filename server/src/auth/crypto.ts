import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Validate and parse the encryption key.
 * Accepts exactly 64 hex characters (representing 32 bytes) or exactly 32 raw bytes.
 * Throws if the key does not meet the required length.
 */
function parseKey(key: string): Buffer {
  // Try hex-encoded first: must be exactly 64 hex characters (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  // Accept raw 32-byte string (for backward compat with tests using 32-char ASCII keys)
  const raw = Buffer.from(key, "utf8");
  if (raw.length === 32) {
    return raw;
  }

  throw new Error(
    `DATA_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) or a 32-byte ASCII string. Got ${raw.length} bytes.`,
  );
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Format: iv:authTag:ciphertext (all hex-encoded).
 * If no key is provided, returns plaintext with a console warning.
 */
export function encrypt(plaintext: string, key?: string): string {
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn("DATA_ENCRYPTION_KEY not set; storing value as plaintext");
    return plaintext;
  }

  const keyBuffer = parseKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt ciphertext produced by encrypt().
 * If no key is provided, returns the ciphertext as-is (plaintext fallback).
 */
export function decrypt(ciphertext: string, key?: string): string {
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn("DATA_ENCRYPTION_KEY not set; returning value as-is");
    return ciphertext;
  }

  // Check if this looks like an encrypted value (iv:authTag:ciphertext format)
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    // Not encrypted (legacy plaintext value), return as-is
    return ciphertext;
  }

  const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
  const keyBuffer = parseKey(key);

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
