import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
} from "../../src/auth/password.js";

test("password: hashPassword produces a hash with version prefix", async () => {
  const hash = await hashPassword("SecureP@ss2024!");
  assert.ok(hash.startsWith("$qi$v1$"), `Expected version prefix, got: ${hash.slice(0, 20)}`);
  assert.ok(hash.includes("$argon2id$"), "Expected argon2id in hash");
});

test("password: verifyPassword succeeds with correct password", async () => {
  const password = "MyStr0ngP@ssword!";
  const hash = await hashPassword(password);
  const result = await verifyPassword(password, hash);
  assert.equal(result, true);
});

test("password: verifyPassword fails with wrong password", async () => {
  const hash = await hashPassword("CorrectHorse99!");
  const result = await verifyPassword("WrongPassword123", hash);
  assert.equal(result, false);
});

test("password: needsRehash returns false for current params", async () => {
  const hash = await hashPassword("TestPassword123!");
  assert.equal(needsRehash(hash), false);
});

test("password: needsRehash returns true for hash without version prefix", () => {
  const rawHash = "$argon2id$v=19$m=65536,t=3,p=4$salt$hash";
  assert.equal(needsRehash(rawHash), true);
});

test("password: needsRehash returns true for hash with different params", () => {
  // Old params: lower memory
  const oldHash = "$qi$v1$$argon2id$v=19$m=32768,t=3,p=4$salt$hash";
  assert.equal(needsRehash(oldHash), true);
});

test("password: validatePasswordStrength rejects short passwords", () => {
  const result = validatePasswordStrength("short");
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("12 characters"));
});

test("password: validatePasswordStrength rejects common passwords", () => {
  const result = validatePasswordStrength("password1234");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Password is too common");
});

test("password: validatePasswordStrength accepts strong passwords", () => {
  const result = validatePasswordStrength("X9$kL2mN7pQ4rS");
  assert.equal(result.valid, true);
  assert.equal(result.reason, undefined);
});

test("password: hash output contains correct argon2id params", async () => {
  const hash = await hashPassword("ParamCheckPass12!");
  // Should contain m=65536,t=3,p=4
  assert.ok(hash.includes("m=65536"), "Expected m=65536 in hash");
  assert.ok(hash.includes("t=3"), "Expected t=3 in hash");
  assert.ok(hash.includes("p=4"), "Expected p=4 in hash");
});
