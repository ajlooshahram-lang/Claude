import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCsrfToken,
  validateCsrf,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from "../../src/auth/csrf.js";

test("csrf: generateCsrfToken produces a random token", () => {
  const token = generateCsrfToken();
  assert.ok(token.length > 0);
  assert.equal(token.length, 64, "32-byte token = 64 hex chars");
  assert.match(token, /^[a-f0-9]+$/, "Token should be hex-encoded");
});

test("csrf: multiple tokens are unique", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 50; i++) {
    tokens.add(generateCsrfToken());
  }
  assert.equal(tokens.size, 50);
});

test("csrf: validateCsrf passes with matching header and cookie", () => {
  const token = generateCsrfToken();
  const mockRequest = {
    cookies: { [CSRF_COOKIE_NAME]: token },
    headers: { [CSRF_HEADER_NAME]: token },
  } as unknown as import("fastify").FastifyRequest;

  assert.equal(validateCsrf(mockRequest), true);
});

test("csrf: validateCsrf fails with mismatched header and cookie", () => {
  const token1 = generateCsrfToken();
  const token2 = generateCsrfToken();
  const mockRequest = {
    cookies: { [CSRF_COOKIE_NAME]: token1 },
    headers: { [CSRF_HEADER_NAME]: token2 },
  } as unknown as import("fastify").FastifyRequest;

  assert.equal(validateCsrf(mockRequest), false);
});

test("csrf: validateCsrf fails with missing header", () => {
  const token = generateCsrfToken();
  const mockRequest = {
    cookies: { [CSRF_COOKIE_NAME]: token },
    headers: {},
  } as unknown as import("fastify").FastifyRequest;

  assert.equal(validateCsrf(mockRequest), false);
});

test("csrf: validateCsrf fails with missing cookie", () => {
  const token = generateCsrfToken();
  const mockRequest = {
    cookies: {},
    headers: { [CSRF_HEADER_NAME]: token },
  } as unknown as import("fastify").FastifyRequest;

  assert.equal(validateCsrf(mockRequest), false);
});

test("csrf: validateCsrf fails when both are missing", () => {
  const mockRequest = {
    cookies: {},
    headers: {},
  } as unknown as import("fastify").FastifyRequest;

  assert.equal(validateCsrf(mockRequest), false);
});

test("csrf: cookie and header names are correct", () => {
  assert.equal(CSRF_COOKIE_NAME, "qi_csrf");
  assert.equal(CSRF_HEADER_NAME, "x-csrf-token");
});
