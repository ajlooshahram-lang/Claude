import type { FastifyRequest, FastifyReply } from "fastify";
import type { Membership, User } from "@prisma/client";
import prisma from "../db.js";
import { hashToken, validateSession } from "../auth/session.js";

// Role hierarchy: higher index = more privilege
const ROLE_HIERARCHY = ["VIEWER", "MANAGER", "ADMIN", "OWNER"] as const;
type Role = (typeof ROLE_HIERARCHY)[number];

function roleIndex(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as Role);
  return idx === -1 ? -1 : idx;
}

declare module "fastify" {
  interface FastifyRequest {
    user: User;
    membership: Membership;
    tenantId: string;
  }
}

/**
 * Fastify preHandler: validates session cookie, loads user + membership,
 * decorates the request. Returns 401 if session is missing or invalid.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies?.["session"];
  if (!token) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const tokenHash = hashToken(token);
  const session = await validateSession(prisma, tokenHash);
  if (!session) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
  });

  if (!membership) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  request.user = session.user;
  request.membership = membership;
  request.tenantId = session.user.tenantId;
}

/**
 * Factory that returns a preHandler checking the user's role is at least
 * `minimumRole` in the hierarchy (OWNER > ADMIN > MANAGER > VIEWER).
 */
export function requireRole(minimumRole: Role) {
  return async function checkRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userRole = request.membership.role;
    if (roleIndex(userRole) < roleIndex(minimumRole)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}
