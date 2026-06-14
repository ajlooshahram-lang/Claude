import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

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

  const keyBuffer = Buffer.from(key, "utf8").subarray(0, 32);
  if (keyBuffer.length < 32) {
    // Pad to 32 bytes if shorter (should not happen with validated config)
    const padded = Buffer.alloc(32);
    keyBuffer.copy(padded);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, padded, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

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

  const keyBuffer = Buffer.from(key, "utf8").subarray(0, 32);
  const finalKey = keyBuffer.length < 32 ? Buffer.alloc(32) : keyBuffer;
  if (keyBuffer.length < 32) {
    keyBuffer.copy(finalKey);
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, finalKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
