import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Field-level encryption for sensitive values stored in the database.
 *
 * Uses AES-256-GCM for authenticated encryption. The DATA_ENCRYPTION_KEY from
 * config provides the key material. A random 12-byte IV is generated per
 * encryption and prepended to the ciphertext alongside the 16-byte auth tag.
 *
 * Storage format: base64(iv[12] + authTag[16] + ciphertext)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a 32-byte key from the DATA_ENCRYPTION_KEY string.
 * If the key is a 64-character hex string, decode it directly as 32 bytes.
 * Otherwise, hash it with SHA-256 to produce a consistent 32-byte key.
 */
function getKeyBuffer(keyMaterial: string): Buffer {
  if (keyMaterial.length === KEY_LENGTH * 2 && /^[0-9a-f]+$/i.test(keyMaterial)) {
    return Buffer.from(keyMaterial, "hex");
  }
  // For non-hex keys (e.g. longer passphrases), derive via SHA-256
  return createHash("sha256").update(keyMaterial).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing iv + authTag + ciphertext.
 *
 * @param plaintext - The value to encrypt (e.g., a TOTP secret)
 * @param keyHex - The DATA_ENCRYPTION_KEY (64-char hex string recommended)
 */
export function encryptField(plaintext: string, keyHex: string): string {
  const key = getKeyBuffer(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64 string produced by encryptField.
 *
 * @param encryptedBase64 - The encrypted value (base64 of iv + authTag + ciphertext)
 * @param keyHex - The DATA_ENCRYPTION_KEY
 * @returns The original plaintext
 * @throws If decryption fails (wrong key, tampered data)
 */
export function decryptField(encryptedBase64: string, keyHex: string): string {
  const key = getKeyBuffer(keyHex);
  const combined = Buffer.from(encryptedBase64, "base64");

  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check if a value looks like it was encrypted by encryptField.
 * Useful for detecting unencrypted legacy values during migration.
 * A base32 TOTP secret is typically 32 uppercase alphanumeric chars,
 * while encrypted values are base64 with mixed case and symbols.
 */
export function isEncryptedValue(value: string): boolean {
  // Base32 TOTP secrets are uppercase alphanumeric only (A-Z, 2-7)
  if (/^[A-Z2-7]+$/.test(value)) {
    return false;
  }
  try {
    const decoded = Buffer.from(value, "base64");
    // Minimum: 12 (iv) + 16 (tag) + 1 (at least 1 byte ciphertext)
    return decoded.length >= IV_LENGTH + TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
