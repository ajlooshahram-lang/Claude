import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePasswordStrength } from "../../src/auth/password.js";

test("password-complexity: rejects all-lowercase 12+ char password", () => {
  const result = validatePasswordStrength("abcdefghijkl");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("character classes"));
});

test("password-complexity: rejects all-uppercase 12+ char password", () => {
  const result = validatePasswordStrength("ABCDEFGHIJKL");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("character classes"));
});

test("password-complexity: rejects all-digit 12+ char password", () => {
  const result = validatePasswordStrength("123456789012");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("character classes"));
});

test("password-complexity: rejects all-symbol 12+ char password", () => {
  const result = validatePasswordStrength("!@#$%^&*()!@");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("character classes"));
});

test("password-complexity: accepts lowercase + uppercase (2 classes)", () => {
  const result = validatePasswordStrength("abcdefGHIJKL");
  assert.equal(result.valid, true);
});

test("password-complexity: accepts lowercase + digits (2 classes)", () => {
  const result = validatePasswordStrength("abcdefgh1234");
  assert.equal(result.valid, true);
});

test("password-complexity: accepts uppercase + symbols (2 classes)", () => {
  const result = validatePasswordStrength("ABCDEFGH!@#$");
  assert.equal(result.valid, true);
});

test("password-complexity: accepts 3 classes (lower + upper + digit)", () => {
  const result = validatePasswordStrength("abcdEFGH1234");
  assert.equal(result.valid, true);
});

test("password-complexity: accepts 4 classes (lower + upper + digit + symbol)", () => {
  const result = validatePasswordStrength("aB3$efghijkl");
  assert.equal(result.valid, true);
});

test("password-complexity: length check still takes priority", () => {
  // Short but has 4 classes
  const result = validatePasswordStrength("aB3$");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("12 characters"));
});
