import type { FastifyRequest, FastifyReply } from "fastify";
import { hashToken, SESSION_COOKIE_NAME } from "./session.js";
import type { AuthDbHelpers, DbUser, DbMembership } from "./db-helpers.js";

/**
 * Auth middleware for Fastify.
 *
 * Provides:
 *  - requireAuth: preHandler that validates session and attaches user to request
 *  - requireRole: preHandler factory that enforces minimum RBAC role
 */

/** Role hierarchy (higher index = more privileged) */
const ROLE_HIERARCHY: readonly string[] = ["VIEWER", "MANAGER", "ADMIN", "OWNER"];

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  mfaEnabled: boolean;
};

export type SessionData = {
  sessionId: string;
  userId: string;
};

/**
 * Create the requireAuth preHandler hook.
 * Reads the session cookie, validates it against the DB, and attaches user info.
 */
export function createRequireAuth(db: AuthDbHelpers) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const cookies = request.cookies as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE_NAME];

    if (!token) {
      void reply.code(401).send({ error: "Authentication required" });
      return;
    }

    const tokenHash = hashToken(token);
    const session = await db.findSessionByTokenHash(tokenHash);

    if (!session) {
      void reply.code(401).send({ error: "Invalid session" });
      return;
    }

    if (session.revokedAt !== null) {
      void reply.code(401).send({ error: "Session revoked" });
      return;
    }

    if (new Date() > session.expiresAt) {
      void reply.code(401).send({ error: "Session expired" });
      return;
    }

    // Attach user and session to request
    (request as AuthenticatedRequest).user = {
      id: session.user.id,
      tenantId: session.user.tenantId,
      email: session.user.email,
      displayName: session.user.displayName,
      mfaEnabled: session.user.mfaEnabled,
    };
    (request as AuthenticatedRequest).sessionData = {
      sessionId: session.id,
      userId: session.userId,
    };
  };
}

/**
 * Create a requireRole preHandler that enforces minimum role level.
 * Must be used after requireAuth.
 */
export function createRequireRole(db: AuthDbHelpers, minRole: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER") {
  const minRoleIndex = ROLE_HIERARCHY.indexOf(minRole);

  return async function requireRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authedRequest = request as AuthenticatedRequest;
    if (!authedRequest.user) {
      void reply.code(401).send({ error: "Authentication required" });
      return;
    }

    const membership = await db.findMembershipByUserId(authedRequest.user.id);
    if (!membership) {
      void reply.code(403).send({ error: "No membership found" });
      return;
    }

    const userRoleIndex = ROLE_HIERARCHY.indexOf(membership.role);
    if (userRoleIndex < minRoleIndex) {
      void reply.code(403).send({ error: "Insufficient permissions" });
      return;
    }
  };
}

export type AuthenticatedRequest = FastifyRequest & {
  user: AuthenticatedUser;
  sessionData: SessionData;
};
