import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import prisma from "../src/db.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://qi:qi@localhost:5432/qi_platform?schema=public";

const SESSION_SECRET =
  process.env["SESSION_SECRET"] ?? "test-session-secret-not-for-production";

export async function buildTestApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    CORS_ORIGINS: "http://localhost:5173",
    DATABASE_URL,
    SESSION_SECRET,
    DATA_REGION: "eu-west",
  });

  return buildApp({ config });
}

export async function registerUser(
  app: FastifyInstance,
  opts: {
    email: string;
    password: string;
    tenantName: string;
    displayName?: string;
  },
): Promise<{ cookie: string; csrfToken: string; body: Record<string, unknown> }> {
  const payload: Record<string, string> = {
    email: opts.email,
    password: opts.password,
    tenantName: opts.tenantName,
  };
  if (opts.displayName) {
    payload["displayName"] = opts.displayName;
  }

  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload,
  });

  if (res.statusCode !== 201) {
    throw new Error(
      `registerUser failed: ${res.statusCode} ${res.body}`,
    );
  }

  const cookie = res.headers["set-cookie"] as string;
  const body = res.json() as Record<string, unknown>;
  const csrfToken = extractCsrfToken(cookie);

  return { cookie, csrfToken, body };
}

/**
 * Extract the csrf_token value from set-cookie header(s).
 * The set-cookie may be a single string or an array of strings.
 */
export function extractCsrfToken(setCookieHeader: string | string[]): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const h of headers) {
    const match = h.match(/csrf_token=([^;]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  throw new Error(`Could not extract csrf_token from: ${JSON.stringify(setCookieHeader)}`);
}

/**
 * Extract the raw session token value from a set-cookie header string.
 */
export function extractSessionCookie(setCookieHeader: string | string[]): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const h of headers) {
    const match = h.match(/session=([^;]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  throw new Error(`Could not extract session cookie from: ${JSON.stringify(setCookieHeader)}`);
}

export async function cleanDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditLog", "ShareToken", "Snapshot", "RegisterRow", "Case", "Session", "Membership", "User", "Project", "Tenant" CASCADE`,
  );
}

export { prisma };
