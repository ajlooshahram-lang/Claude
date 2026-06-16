import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Double-submit cookie CSRF protection.
 *
 * Pattern:
 *  1. Server sets a random CSRF token in a cookie (readable by JS).
 *  2. Client reads the cookie and sends the value in the X-CSRF-Token header.
 *  3. Server validates that the header value matches the cookie value.
 *
 * This works because a cross-origin attacker cannot read our cookie to set the
 * header, even though the browser sends the cookie automatically.
 */

export const CSRF_COOKIE_NAME = "qi_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically random CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Set the CSRF cookie on a response.
 * The cookie is NOT httpOnly so client-side JS can read it.
 */
export function setCsrfCookie(reply: FastifyReply, token: string, isProd: boolean): void {
  void reply.setCookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // JS must read this
    secure: isProd,
    sameSite: "strict",
    path: "/",
  });
}

/**
 * Validate that the CSRF header matches the CSRF cookie.
 */
export function validateCsrf(request: FastifyRequest): boolean {
  const cookieValue = (request.cookies as Record<string, string | undefined>)[CSRF_COOKIE_NAME];
  const headerValue = (request.headers as Record<string, string | undefined>)[CSRF_HEADER_NAME];

  if (!cookieValue || !headerValue) {
    return false;
  }

  // Constant-time comparison
  if (cookieValue.length !== headerValue.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    result |= (cookieValue.charCodeAt(i) ^ headerValue.charCodeAt(i));
  }
  return result === 0;
}
