import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Generate a cryptographically random session token (32 bytes, hex-encoded). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash of a session token (hex-encoded). Only this hash is stored in DB. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a new session row. Stores only the hashed token. */
export async function createSession(
  prisma: PrismaClient,
  userId: string,
  token: string,
  userAgent?: string,
  ip?: string,
) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  return prisma.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
      expiresAt,
    },
  });
}

/** Validate a session by its token hash. Returns session + user if valid, null otherwise. */
export async function validateSession(
  prisma: PrismaClient,
  tokenHash: string,
) {
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  return session;
}

/** Revoke a session by setting revokedAt. */
export async function revokeSession(
  prisma: PrismaClient,
  tokenHash: string,
) {
  await prisma.session.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}

/** Delete expired or revoked sessions (actual DELETE, not soft-delete).
 * TODO: This hard-deletes revoked sessions, which means session audit history
 * (who was logged in when) is lost 15 minutes after revocation. If a security audit
 * requires historical session data, consider archiving to a separate audit_sessions table
 * or switching to soft-delete with a longer retention period before implementing compliance features.
 */
export async function cleanExpiredSessions(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });
}

/** Revoke all sessions for a user, optionally excluding one (e.g. the current session). */
export async function revokeAllUserSessions(
  prisma: PrismaClient,
  userId: string,
  exceptTokenHash?: string,
): Promise<void> {
  const where: Record<string, unknown> = {
    userId,
    revokedAt: null,
  };
  if (exceptTokenHash) {
    where["tokenHash"] = { not: exceptTokenHash };
  }
  await prisma.session.updateMany({
    where: where as never,
    data: { revokedAt: new Date() },
  });
}
