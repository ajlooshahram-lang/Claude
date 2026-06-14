import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateSessionToken, createSession, hashToken, revokeSession, revokeAllUserSessions } from "./session.js";
import { generateTotpSecret, verifyTotpToken } from "./totp.js";
import { encrypt, decrypt } from "./crypto.js";
import { authenticate } from "../middleware/rbac.js";
import { loadConfig } from "../config.js";
import { authenticator } from "otplib";

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

const RegisterBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().max(200).optional(),
  tenantName: z.string().min(1).max(200),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
  tenantId: z.string().min(1),
  mfaToken: z.string().length(6).optional(),
});

const MfaVerifyBody = z.object({
  token: z.string().length(6),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

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

      void reply
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

      void reply
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

      void reply
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

      return { ok: true };
    },
  );
}
