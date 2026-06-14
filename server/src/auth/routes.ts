import type { FastifyInstance } from "fastify";
import prisma from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateSessionToken, createSession, hashToken, revokeSession, revokeAllUserSessions } from "./session.js";
import { generateTotpSecret, verifyTotpToken } from "./totp.js";
import { encrypt, decrypt } from "./crypto.js";
import { authenticate } from "../middleware/rbac.js";
import { rotateCsrfToken } from "../middleware/csrf.js";
import { loadConfig } from "../config.js";
import { authenticator } from "otplib";
import { RegisterBody, LoginBody, MfaVerifyBody, ChangePasswordBody } from "../validation/schemas.js";
import { logAuthEvent, logger } from "../logging.js";

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SEVEN_DAYS_SEC,
  };
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const isProd = process.env["NODE_ENV"] === "production";
  const config = loadConfig();

  // POST /auth/register
  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = RegisterBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }
      const { email, password, displayName, tenantName } = parsed.data;

      const passwordHash = await hashPassword(password);

      // Transaction: create tenant, user, membership
      let result: { tenant: { id: string; name: string }; user: { id: string; email: string } };
      try {
        result = await prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: { name: tenantName },
          });

          const user = await tx.user.create({
            data: {
              tenantId: tenant.id,
              email: email.toLowerCase(),
              passwordHash,
              displayName: displayName ?? null,
            },
          });

          await tx.membership.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              role: "OWNER",
            },
          });

          return { tenant, user };
        });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return reply.code(409).send({ error: "Registration failed" });
        }
        return reply.code(500).send({ error: "Internal server error" });
      }

      const token = generateSessionToken();
      await createSession(
        prisma,
        result.user.id,
        token,
        request.headers["user-agent"],
        request.ip,
      );

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: result.tenant.id,
          actorId: result.user.id,
          action: "auth.register",
          entity: "User",
          entityId: result.user.id,
          detail: { email: result.user.email },
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "register", { userId: result.user.id, email: result.user.email });

      return reply
        .setCookie("session", token, cookieOptions(isProd))
        .code(201)
        .send({
          id: result.user.id,
          email: result.user.email,
          tenantId: result.tenant.id,
          tenantName: result.tenant.name,
        });
    },
  );

  // POST /auth/login
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = LoginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }
      const { email, password, tenantId, mfaToken } = parsed.data;

      // Find user scoped to tenant
      const user = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
      });

      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        logAuthEvent(request, "login.failed", { email, tenantId });
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // MFA check
      if (user.mfaEnabled && user.mfaSecret) {
        if (!mfaToken) {
          return reply.code(200).send({ mfaRequired: true });
        }
        const decryptedSecret = decrypt(user.mfaSecret, config.dataEncryptionKey);
        const mfaValid = verifyTotpToken(decryptedSecret, mfaToken);
        if (!mfaValid) {
          logAuthEvent(request, "login.mfa_failed", { userId: user.id });
          return reply.code(401).send({ error: "Invalid credentials" });
        }
      }

      // Update lastLoginAt
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const token = generateSessionToken();
      await createSession(
        prisma,
        user.id,
        token,
        request.headers["user-agent"],
        request.ip,
      );

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          action: "auth.login",
          entity: "User",
          entityId: user.id,
          detail: {},
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "login.success", { userId: user.id });

      return reply
        .setCookie("session", token, cookieOptions(isProd))
        .code(200)
        .send({
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
        });
    },
  );

  // POST /auth/logout
  app.post(
    "/auth/logout",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const token = request.cookies?.["session"];
      if (token) {
        const tokenHash = hashToken(token);
        await revokeSession(prisma, tokenHash);
      }

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "auth.logout",
          entity: "User",
          entityId: request.user.id,
          detail: {},
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "logout", { userId: request.user.id });

      return reply
        .clearCookie("session", { path: "/" })
        .code(200)
        .send({ ok: true });
    },
  );

  // GET /auth/me
  app.get(
    "/auth/me",
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const { user, membership } = request;
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tenantId: user.tenantId,
        role: membership.role,
        mfaEnabled: user.mfaEnabled,
      };
    },
  );

  // POST /auth/mfa/enroll
  app.post(
    "/auth/mfa/enroll",
    { preHandler: [authenticate] },
    async (request, _reply) => {
      const secret = generateTotpSecret();
      const encryptedSecret = encrypt(secret, config.dataEncryptionKey);

      await prisma.user.update({
        where: { id: request.user.id },
        data: { mfaSecret: encryptedSecret },
      });

      const otpauthUrl = authenticator.keyuri(
        request.user.email,
        "QI Platform",
        secret,
      );

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "auth.mfa_enroll",
          entity: "User",
          entityId: request.user.id,
          detail: {},
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "mfa.enroll", { userId: request.user.id });

      return { secret, otpauthUrl };
    },
  );

  // POST /auth/mfa/verify
  app.post(
    "/auth/mfa/verify",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = MfaVerifyBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }
      const { token } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
      });

      if (!user?.mfaSecret) {
        return reply.code(400).send({ error: "MFA not enrolled" });
      }

      const decryptedSecret = decrypt(user.mfaSecret, config.dataEncryptionKey);
      const valid = verifyTotpToken(decryptedSecret, token);
      if (!valid) {
        return reply.code(400).send({ error: "Invalid TOTP token" });
      }

      await prisma.user.update({
        where: { id: request.user.id },
        data: { mfaEnabled: true },
      });

      // Revoke all sessions except current after MFA enrollment verification
      const sessionToken = request.cookies?.["session"];
      if (sessionToken) {
        const currentHash = hashToken(sessionToken);
        await revokeAllUserSessions(prisma, request.user.id, currentHash);
      }

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "auth.mfa_verify",
          entity: "User",
          entityId: request.user.id,
          detail: {},
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "mfa.verify", { userId: request.user.id });

      // Rotate CSRF token on MFA verification to limit token exfiltration window
      rotateCsrfToken(reply);

      return { ok: true };
    },
  );

  // POST /auth/change-password
  app.post(
    "/auth/change-password",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = ChangePasswordBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }
      const { currentPassword, newPassword } = parsed.data;

      // Fetch the current user with password hash
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
      });

      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      // Verify current password
      const valid = await verifyPassword(user.passwordHash, currentPassword);
      if (!valid) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Hash new password and update
      const newHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });

      // Revoke all sessions except current
      const sessionToken = request.cookies?.["session"];
      if (sessionToken) {
        const currentHash = hashToken(sessionToken);
        await revokeAllUserSessions(prisma, user.id, currentHash);
      }

      // Audit log
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: request.user.id,
          action: "auth.change_password",
          entity: "User",
          entityId: request.user.id,
          detail: {},
          ip: request.ip,
        },
      }).catch((err: unknown) => { logger.warn({ event: 'audit_log_failure', error: err instanceof Error ? err.message : String(err) }); });

      logAuthEvent(request, "password.change", { userId: request.user.id });

      // Rotate CSRF token on password change to limit token exfiltration window
      rotateCsrfToken(reply);

      return { ok: true };
    },
  );
}
