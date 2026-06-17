import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateSessionToken,
  hashToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../src/auth/session.js";

test("session: generateSessionToken returns token and tokenHash", () => {
  const { token, tokenHash } = generateSessionToken();
  assert.ok(token, "token should be defined");
  assert.ok(tokenHash, "tokenHash should be defined");
  assert.equal(token.length, 64, "token should be 64 hex chars (32 bytes)");
  assert.equal(tokenHash.length, 64, "tokenHash should be 64 hex chars (SHA-256)");
});

test("session: token and tokenHash are different values", () => {
  const { token, tokenHash } = generateSessionToken();
  assert.notEqual(token, tokenHash);
});

test("session: tokenHash is the SHA-256 of the raw token bytes", () => {
  const { token, tokenHash } = generateSessionToken();
  const expectedHash = createHash("sha256")
    .update(Buffer.from(token, "hex"))
    .digest("hex");
  assert.equal(tokenHash, expectedHash);
});

test("session: multiple calls produce unique tokens", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const { token } = generateSessionToken();
    tokens.add(token);
  }
  assert.equal(tokens.size, 100, "All 100 tokens should be unique");
});

test("session: hashToken correctly hashes a hex token", () => {
  const { token, tokenHash } = generateSessionToken();
  const computed = hashToken(token);
  assert.equal(computed, tokenHash);
});

test("session: cookie options for production", () => {
  const opts = getSessionCookieOptions(true);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.secure, true);
  assert.equal(opts.sameSite, "strict");
  assert.equal(opts.path, "/");
});

test("session: cookie options for development", () => {
  const opts = getSessionCookieOptions(false);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.secure, false);
  assert.equal(opts.sameSite, "strict");
  assert.equal(opts.path, "/");
});

test("session: SESSION_COOKIE_NAME is defined", () => {
  assert.equal(SESSION_COOKIE_NAME, "qi_session");
});
