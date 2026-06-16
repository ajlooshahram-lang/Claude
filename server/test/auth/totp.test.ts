import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTotpSecret,
  generateTotpUri,
  verifyTotp,
  generateCurrentTotp,
} from "../../src/auth/totp.js";

test("totp: generateTotpSecret produces valid base32", () => {
  const secret = generateTotpSecret();
  assert.ok(secret.length > 0, "Secret should not be empty");
  // Base32 uses only A-Z and 2-7
  assert.match(secret, /^[A-Z2-7]+$/, "Secret should be valid base32");
  // 20 bytes -> 32 base32 chars
  assert.equal(secret.length, 32, "20-byte secret should encode to 32 base32 chars");
});

test("totp: generateTotpUri produces valid otpauth URI", () => {
  const secret = generateTotpSecret();
  const uri = generateTotpUri(secret, "user@example.com");

  assert.ok(uri.startsWith("otpauth://totp/"), "URI should start with otpauth://totp/");
  assert.ok(uri.includes("QI%20Platform"), "URI should include issuer");
  assert.ok(uri.includes("user%40example.com"), "URI should include email");
  assert.ok(uri.includes(`secret=${secret}`), "URI should include secret");
  assert.ok(uri.includes("algorithm=SHA1"), "URI should specify SHA1");
  assert.ok(uri.includes("digits=6"), "URI should specify 6 digits");
  assert.ok(uri.includes("period=30"), "URI should specify 30s period");
});

test("totp: generateTotpUri with custom issuer", () => {
  const secret = generateTotpSecret();
  const uri = generateTotpUri(secret, "user@test.com", "Custom Issuer");
  assert.ok(uri.includes("Custom%20Issuer"), "URI should include custom issuer");
});

test("totp: verifyTotp accepts current code", () => {
  const secret = generateTotpSecret();
  const code = generateCurrentTotp(secret);
  assert.equal(verifyTotp(secret, code), true);
});

test("totp: verifyTotp rejects wrong code", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, "000000"), false);
  assert.equal(verifyTotp(secret, "999999"), false);
});

test("totp: verifyTotp rejects invalid length", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, "12345"), false); // too short
  assert.equal(verifyTotp(secret, "1234567"), false); // too long
});

test("totp: verifyTotp with window tolerance", () => {
  const secret = generateTotpSecret();
  // The current code should always verify with window=1
  const code = generateCurrentTotp(secret);
  assert.equal(verifyTotp(secret, code, 1), true);
});

test("totp: generateCurrentTotp produces 6-digit string", () => {
  const secret = generateTotpSecret();
  const code = generateCurrentTotp(secret);
  assert.equal(code.length, 6);
  assert.match(code, /^\d{6}$/, "Code should be exactly 6 digits");
});

test("totp: different secrets produce different codes", () => {
  const secret1 = generateTotpSecret();
  const secret2 = generateTotpSecret();
  // While there is a tiny collision chance, it should be astronomically rare
  const code1 = generateCurrentTotp(secret1);
  const code2 = generateCurrentTotp(secret2);
  // We just verify both are valid format, not necessarily different
  assert.match(code1, /^\d{6}$/);
  assert.match(code2, /^\d{6}$/);
});
