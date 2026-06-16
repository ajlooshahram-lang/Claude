/**
 * Invitation system routes.
 *
 * Endpoints:
 *  - POST /api/invites       (OWNER/ADMIN) Create an invite, return one-time token.
 *  - GET  /api/invites       (OWNER/ADMIN) List pending invites for tenant.
 *  - DELETE /api/invites/:id  (OWNER/ADMIN) Revoke an invite.
 *  - POST /auth/accept-invite (public)     Accept invite, create user + session.
 *  - GET  /api/team          (authenticated) List team members for tenant.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { createRequireAuth, createRequireRole, type AuthenticatedRequest } from "../auth/middleware.js";
import { generateSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "../auth/session.js";
import { generateCsrfToken, setCsrfCookie } from "../auth/csrf.js";
import { hashPassword, validatePasswordStrength } from "../auth/password.js";
import { CreateInviteSchema, AcceptInviteSchema } from "./schemas.js";
import type { InviteDbHelpers } from "./db-helpers.js";
import type { AuthDbHelpers } from "../auth/db-helpers.js";
import type { AppConfig } from "../config.js";

/** Role hierarchy for privilege checks. Higher index = more privileged. */
const ROLE_HIERARCHY: readonly string[] = ["VIEWER", "MANAGER", "ADMIN", "OWNER"];

/** Invite token expiry: 7 days. */
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Default session expiry in days. */
const DEFAULT_SESSION_EXPIRY_DAYS = 7;

export type InviteRouteDeps = {
  authDb: AuthDbHelpers;
  inviteDb: InviteDbHelpers;
};

export function registerInviteRoutes(
  app: FastifyInstance,
  deps: InviteRouteDeps,
  config: AppConfig,
): void {
  const requireAuth = createRequireAuth(deps.authDb);
  const requireAdmin = createRequireRole(deps.authDb, "ADMIN");
  const sessionExpiryDays = config.sessionExpiryDays ?? DEFAULT_SESSION_EXPIRY_DAYS;
  const db = deps.inviteDb;
  const authDb = deps.authDb;

  /**
   * POST /api/invites
   * Create an invite. OWNER/ADMIN only. Returns the raw invite token once.
   */
  app.post(
    "/api/invites",
    {
      preHandler: [requireAuth, requireAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = CreateInviteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { email, role } = parseResult.data;
      const tenantId = authed.user.tenantId;

      // Cannot invite with role higher than or equal to your own
      const membership = await authDb.findMembershipByUserId(authed.user.id);
      if (!membership) {
        return reply.code(403).send({ error: "No membership found" });
      }
      const inviterRoleIndex = ROLE_HIERARCHY.indexOf(membership.role);
      const inviteeRoleIndex = ROLE_HIERARCHY.indexOf(role);
      if (inviteeRoleIndex >= inviterRoleIndex) {
        return reply.code(403).send({ error: "Cannot invite with a role equal to or higher than your own" });
      }

      // Check if user already exists in tenant
      const existingUser = await db.findUserByEmailInTenant(tenantId, email);
      if (existingUser) {
        return reply.code(409).send({ error: "User already exists in this tenant" });
      }

      // Generate invite token (32 bytes CSPRNG, same pattern as sessions)
      const tokenBuffer = randomBytes(32);
      const token = tokenBuffer.toString("hex");
      const tokenHash = createHash("sha256").update(tokenBuffer).digest("hex");

      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

      const invite = await db.createInvite({
        tenantId,
        email,
        role,
        tokenHash,
        expiresAt,
        createdBy: authed.user.id,
      });

      // Audit log
      await authDb.createAuditLog({
        tenantId,
        actorId: authed.user.id,
        action: "invite.create",
        entity: "Invite",
        entityId: invite.id,
        detail: { email, role },
        ip: request.ip,
      });

      return reply.code(201).send({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
        },
        token,
      });
    },
  );

  /**
   * GET /api/invites
   * List pending invites for the tenant. OWNER/ADMIN only.
   */
  app.get(
    "/api/invites",
    { preHandler: [requireAuth, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const invites = await db.findPendingInvitesByTenant(authed.user.tenantId);
      return reply.code(200).send({
        invites: invites.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
        })),
      });
    },
  );

  /**
   * DELETE /api/invites/:id
   * Revoke a pending invite. OWNER/ADMIN only.
   */
  app.delete(
    "/api/invites/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      const tenantId = authed.user.tenantId;

      const invite = await db.findInviteById(tenantId, id);
      if (!invite) {
        return reply.code(404).send({ error: "Invite not found" });
      }

      await db.revokeInvite(tenantId, id);

      // Audit log
      await authDb.createAuditLog({
        tenantId,
        actorId: authed.user.id,
        action: "invite.revoke",
        entity: "Invite",
        entityId: id,
        detail: { email: invite.email },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  /**
   * POST /auth/accept-invite
   * Public endpoint. Validates invite token, creates user in the inviter's tenant
   * with the specified role, creates session.
   */
  app.post(
    "/auth/accept-invite",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = AcceptInviteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { token, password, displayName } = parseResult.data;

      // Validate password strength
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return reply.code(400).send({ error: strength.reason });
      }

      // Hash the provided token and look up the invite
      const tokenBuffer = Buffer.from(token, "hex");
      const tokenHash = createHash("sha256").update(tokenBuffer).digest("hex");

      const invite = await db.findInviteByTokenHash(tokenHash);
      if (!invite) {
        return reply.code(401).send({ error: "Invalid invite token" });
      }

      // Check if expired
      if (new Date() > invite.expiresAt) {
        return reply.code(401).send({ error: "Invite has expired" });
      }

      // Check if already accepted
      if (invite.acceptedAt !== null) {
        return reply.code(401).send({ error: "Invite has already been used" });
      }

      // Create user in the inviter's tenant
      const passwordHash = await hashPassword(password);
      const { userId } = await db.createUserInTenant({
        tenantId: invite.tenantId,
        email: invite.email,
        passwordHash,
        displayName,
        role: invite.role as "ADMIN" | "MANAGER" | "VIEWER",
      });

      // Mark invite as accepted
      await db.markInviteAccepted(invite.id);

      // Create session for the new user
      const { token: sessionToken, tokenHash: sessionTokenHash } = generateSessionToken();
      const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);
      await authDb.createSession({
        userId,
        tokenHash: sessionTokenHash,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        expiresAt,
      });

      // Set session cookie
      const cookieOpts = getSessionCookieOptions(config.isProd);
      void reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
        ...cookieOpts,
        maxAge: sessionExpiryDays * 24 * 60 * 60,
      });

      // Set CSRF cookie
      const csrfToken = generateCsrfToken();
      setCsrfCookie(reply, csrfToken, config.isProd);

      // Audit log
      await authDb.createAuditLog({
        tenantId: invite.tenantId,
        actorId: userId,
        action: "invite.accept",
        entity: "Invite",
        entityId: invite.id,
        detail: { email: invite.email, role: invite.role },
        ip: request.ip,
      });

      return reply.code(201).send({
        user: {
          id: userId,
          email: invite.email,
          displayName,
          tenantId: invite.tenantId,
          role: invite.role,
        },
      });
    },
  );

  /**
   * GET /api/team
   * List team members for the authenticated user's tenant.
   */
  app.get(
    "/api/team",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const members = await db.listTeamMembers(authed.user.tenantId);
      return reply.code(200).send({
        members: members.map((m) => ({
          id: m.id,
          email: m.email,
          displayName: m.displayName,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    },
  );
}
