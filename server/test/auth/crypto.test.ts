import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptField, decryptField, isEncryptedValue } from "../../src/auth/crypto.js";

/** A 64-char hex string representing a 32-byte AES-256 key */
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("crypto: encryptField and decryptField round-trip", () => {
  const plaintext = "JBSWY3DPEHPK3PXP"; // typical base32 TOTP secret
  const encrypted = encryptField(plaintext, TEST_KEY);
  const decrypted = decryptField(encrypted, TEST_KEY);
  assert.equal(decrypted, plaintext);
});

test("crypto: encrypted output differs from plaintext", () => {
  const plaintext = "MYSECRETBASE32VALUE";
  const encrypted = encryptField(plaintext, TEST_KEY);
  assert.notEqual(encrypted, plaintext);
});

test("crypto: different encryptions of same plaintext produce different ciphertext", () => {
  const plaintext = "JBSWY3DPEHPK3PXP";
  const enc1 = encryptField(plaintext, TEST_KEY);
  const enc2 = encryptField(plaintext, TEST_KEY);
  // Each call uses a random IV, so outputs differ
  assert.notEqual(enc1, enc2);
  // But both decrypt to the same value
  assert.equal(decryptField(enc1, TEST_KEY), plaintext);
  assert.equal(decryptField(enc2, TEST_KEY), plaintext);
});

test("crypto: decryption fails with wrong key", () => {
  const plaintext = "SENSITIVE_SECRET";
  const encrypted = encryptField(plaintext, TEST_KEY);
  const wrongKey = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(() => decryptField(encrypted, wrongKey));
});

test("crypto: decryption fails with tampered data", () => {
  const plaintext = "TOTP_SECRET_HERE";
  const encrypted = encryptField(plaintext, TEST_KEY);
  // Flip a character in the middle of the base64
  const tampered = encrypted.slice(0, 10) + "X" + encrypted.slice(11);
  assert.throws(() => decryptField(tampered, TEST_KEY));
});

test("crypto: decryptField throws on too-short input", () => {
  assert.throws(() => decryptField("dG9vc2hvcnQ=", TEST_KEY), /too short/);
});

test("crypto: isEncryptedValue returns false for base32 TOTP secret", () => {
  // A typical unencrypted TOTP secret (base32, uppercase + digits 2-7 only)
  assert.equal(isEncryptedValue("JBSWY3DPEHPK3PXP"), false);
  assert.equal(isEncryptedValue("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), false);
});

test("crypto: isEncryptedValue returns true for encrypted value", () => {
  const encrypted = encryptField("JBSWY3DPEHPK3PXP", TEST_KEY);
  assert.equal(isEncryptedValue(encrypted), true);
});

test("crypto: works with non-hex key (shorter passphrase hashed via SHA-256)", () => {
  const shortKey = "my-secret-passphrase-for-testing";
  const plaintext = "TOTP_SECRET_VALUE";
  const encrypted = encryptField(plaintext, shortKey);
  const decrypted = decryptField(encrypted, shortKey);
  assert.equal(decrypted, plaintext);
});
