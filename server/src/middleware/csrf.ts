import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

const EXEMPT_PATHS = new Set(["/auth/register", "/auth/login"]);
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isExempt(method: string, url: string): boolean {
  if (!MUTATING_METHODS.has(method)) return true;
  // Exempt registration and login (they issue the CSRF token)
  if (EXEMPT_PATHS.has(url)) return true;
  return false;
}

function buildCsrfCookieString(token: string, isProd: boolean): string {
  let cookie = `csrf_token=${token}; Path=/; SameSite=Strict`;
  if (isProd) {
    cookie += "; Secure";
  }
  return cookie;
}

async function csrfPlugin(app: FastifyInstance): Promise<void> {
  const isProd = process.env["NODE_ENV"] === "production";

  // Issue csrf_token cookie on successful login/register response
  app.addHook("onSend", async (request, reply, payload) => {
    const url = request.routeOptions?.url ?? request.url;
    const method = request.method;

    // Only set CSRF cookie on successful register/login
    if (
      method === "POST" &&
      (url === "/auth/register" || url === "/auth/login")
    ) {
      const statusCode = reply.statusCode;
      // Only set on successful auth responses (200 or 201)
      if (statusCode === 200 || statusCode === 201) {
        // Check this is a real login (not an mfaRequired response)
        if (typeof payload === "string") {
          try {
            const body = JSON.parse(payload) as Record<string, unknown>;
            if (body["mfaRequired"]) {
              return payload;
            }
          } catch {
            // Not JSON, skip
          }
        }

        const csrfToken = randomUUID();
        const cookieStr = buildCsrfCookieString(csrfToken, isProd);

        // Append csrf_token cookie (Fastify auto-appends for set-cookie)
        void reply.header("set-cookie", cookieStr);
      }
    }
    return payload;
  });

  // Validate CSRF token on mutating requests
  app.addHook("onRequest", async (request, reply) => {
    const method = request.method;
    const url = request.url.split("?")[0] ?? request.url;

    if (isExempt(method, url)) return;

    // Skip CSRF check if there is no session cookie (unauthenticated requests
    // will be rejected by the authenticate preHandler anyway)
    const sessionCookie = request.cookies?.["session"];
    if (!sessionCookie) return;

    const csrfCookie = request.cookies?.["csrf_token"];
    const csrfHeader = request.headers["x-csrf-token"];

    if (!csrfHeader) {
      return reply.code(403).send({ error: "CSRF token missing" });
    }

    if (!csrfCookie) {
      return reply.code(403).send({ error: "CSRF token missing" });
    }

    if (csrfHeader !== csrfCookie) {
      return reply.code(403).send({ error: "CSRF token mismatch" });
    }
  });
}

export default fp(csrfPlugin, { name: "csrf", dependencies: ["@fastify/cookie"] });
