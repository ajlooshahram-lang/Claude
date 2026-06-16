import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password.js";
import { generateSessionToken, hashToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "./session.js";
import { generateTotpSecret, generateTotpUri, verifyTotp } from "./totp.js";
import { generateCsrfToken, setCsrfCookie } from "./csrf.js";
import { encryptField, decryptField, isEncryptedValue } from "./crypto.js";
import { isLocked, recordFailedAttempt, resetAttempts } from "./lockout.js";
import { logAuditEvent } from "./audit.js";
import { createRequireAuth, type AuthenticatedRequest } from "./middleware.js";
import type { AuthDbHelpers } from "./db-helpers.js";
import type { AppConfig } from "../config.js";
import { randomBytes } from "node:crypto";

/**
 * Auth route schemas (Zod for validation).
 */
const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1),
  displayName: z.string().min(1).max(100),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MfaLoginSchema = z.object({
  pendingToken: z.string().min(1),
  totpCode: z.string().length(6),
});

const MfaVerifySchema = z.object({
  totpCode: z.string().length(6),
});

const MfaDisableSchema = z.object({
  password: z.string().min(1),
  totpCode: z.string().length(6),
});

/** In-memory store for pending MFA tokens (token -> {userId, tenantId, expiresAt}) */
const pendingMfaTokens = new Map<string, { userId: string; tenantId: string; expiresAt: number }>();

/** Default session expiry in days */
const DEFAULT_SESSION_EXPIRY_DAYS = 7;

/**
 * Register all auth routes on a Fastify instance.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  db: AuthDbHelpers,
  config: AppConfig,
): void {
  const requireAuth = createRequireAuth(db);
  const sessionExpiryDays = config.sessionExpiryDays ?? DEFAULT_SESSION_EXPIRY_DAYS;

  /**
   * POST /auth/register
   * Create a new user, tenant, and owner membership.
   */
  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = RegisterSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { email, password, displayName } = parseResult.data;

      // Validate password strength
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return reply.code(400).send({ error: strength.reason });
      }

      // Check if user already exists
      // NOTE: Returning 409 for existing emails reveals email registration status (enumeration).
      // This is an acceptable trade-off for an 11-user private deployment where all users
      // are known project owners. A "check your email" pattern would add UX complexity with
      // minimal security benefit given the fixed, known user base.
      const existing = await db.findUserByEmail(email);
      if (existing) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      // Hash password and create user+tenant
      const passwordHash = await hashPassword(password);
      const { user, tenantId } = await db.createUserWithTenant({
        email,
        passwordHash,
        displayName,
      });

      // Create session
      const { token, tokenHash } = generateSessionToken();
      const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);
      await db.createSession({
        userId: user.id,
        tokenHash,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        expiresAt,
      });

      // Set session cookie
      const cookieOpts = getSessionCookieOptions(config.isProd);
      void reply.setCookie(SESSION_COOKIE_NAME, token, {
        ...cookieOpts,
        maxAge: sessionExpiryDays * 24 * 60 * 60,
      });

      // Set CSRF cookie
      const csrfToken = generateCsrfToken();
      setCsrfCookie(reply, csrfToken, config.isProd);

      // Audit log
      await logAuditEvent(db, {
        tenantId,
        actorId: user.id,
        action: "auth.register",
        entity: "User",
        entityId: user.id,
        ip: request.ip,
      });

      return reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          tenantId,
        },
      });
    },
  );

  /**
   * POST /auth/login
   * Authenticate with email + password. If MFA is enabled, return a pending token.
   *
   * Per-route rate limit (defence in depth on top of the per-email account
   * lockout and the nginx edge limit) to blunt credential-stuffing and to cap
   * how fast an attacker who already knows a password can request fresh pending
   * MFA tokens to brute-force the second factor.
   */
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed" });
    }

    const { email, password } = parseResult.data;

    // Check lockout
    if (isLocked(email)) {
      return reply.code(423).send({ error: "Account temporarily locked due to too many failed attempts" });
    }

    // Find user
    const user = await db.findUserByEmail(email);
    if (!user) {
      // Record failed attempt even for non-existent users (prevent enumeration timing)
      recordFailedAttempt(email);
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const lockResult = recordFailedAttempt(email);

      // Audit failed login
      await logAuditEvent(db, {
        tenantId: user.tenantId,
        actorId: user.id,
        action: "auth.login.failed",
        detail: { reason: "invalid_password", locked: lockResult.locked },
        ip: request.ip,
      });

      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // Password valid - reset lockout
    resetAttempts(email);

    // If MFA is enabled, issue a pending token
    if (user.mfaEnabled) {
      const pendingToken = randomBytes(32).toString("hex");
      pendingMfaTokens.set(pendingToken, {
        userId: user.id,
        tenantId: user.tenantId,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
      });
      return reply.code(200).send({ mfaRequired: true, pendingToken });
    }

    // Create session
    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);
    await db.createSession({
      userId: user.id,
      tokenHash,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      expiresAt,
    });

    // Update last login
    await db.updateUserLastLogin(user.id);

    // Set cookies
    const cookieOpts = getSessionCookieOptions(config.isProd);
    void reply.setCookie(SESSION_COOKIE_NAME, token, {
      ...cookieOpts,
      maxAge: sessionExpiryDays * 24 * 60 * 60,
    });
    const csrfToken = generateCsrfToken();
    setCsrfCookie(reply, csrfToken, config.isProd);

    // Audit log
    await logAuditEvent(db, {
      tenantId: user.tenantId,
      actorId: user.id,
      action: "auth.login",
      ip: request.ip,
    });

    return reply.code(200).send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        mfaEnabled: user.mfaEnabled,
      },
    });
  });

  /**
   * POST /auth/login/mfa
   * Complete MFA login with a pending token and TOTP code.
   *
   * Per-route rate limit caps brute-force attempts against the 6-digit TOTP
   * second factor. Pending tokens are also single-use (consumed before
   * verification), so each guess additionally costs a fresh password login.
   */
  app.post(
    "/auth/login/mfa",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = MfaLoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed" });
    }

    const { pendingToken, totpCode } = parseResult.data;

    // Validate pending token
    const pending = pendingMfaTokens.get(pendingToken);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingMfaTokens.delete(pendingToken);
      return reply.code(401).send({ error: "Invalid or expired pending token" });
    }

    pendingMfaTokens.delete(pendingToken);

    const mfaUser = await db.findUserById(pending.userId);
    if (!mfaUser || !mfaUser.mfaSecret) {
      return reply.code(401).send({ error: "MFA not configured" });
    }

    // Decrypt the stored MFA secret before verification
    const mfaSecret = decryptMfaSecret(mfaUser.mfaSecret, config.dataEncryptionKey);

    // Verify TOTP
    if (!verifyTotp(mfaSecret, totpCode)) {
      return reply.code(401).send({ error: "Invalid TOTP code" });
    }

    // Create session
    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);
    await db.createSession({
      userId: mfaUser.id,
      tokenHash,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      expiresAt,
    });

    // Update last login
    await db.updateUserLastLogin(mfaUser.id);

    // Set cookies
    const cookieOpts = getSessionCookieOptions(config.isProd);
    void reply.setCookie(SESSION_COOKIE_NAME, token, {
      ...cookieOpts,
      maxAge: sessionExpiryDays * 24 * 60 * 60,
    });
    const csrfToken = generateCsrfToken();
    setCsrfCookie(reply, csrfToken, config.isProd);

    // Audit log
    await logAuditEvent(db, {
      tenantId: mfaUser.tenantId,
      actorId: mfaUser.id,
      action: "auth.login",
      detail: { mfa: true },
      ip: request.ip,
    });

    return reply.code(200).send({
      user: {
        id: mfaUser.id,
        email: mfaUser.email,
        displayName: mfaUser.displayName,
        mfaEnabled: mfaUser.mfaEnabled,
      },
    });
  });

  /**
   * POST /auth/logout
   * Revoke current session and clear the session cookie.
   */
  app.post(
    "/auth/logout",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;

      await db.revokeSession(authed.sessionData.sessionId);

      // Audit log
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.logout",
        ip: request.ip,
      });

      // Clear cookies
      void reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });

      return reply.code(200).send({ success: true });
    },
  );

  /**
   * GET /auth/me
   * Return the authenticated user's profile.
   */
  app.get(
    "/auth/me",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      return reply.code(200).send({
        user: {
          id: authed.user.id,
          email: authed.user.email,
          displayName: authed.user.displayName,
          tenantId: authed.user.tenantId,
          mfaEnabled: authed.user.mfaEnabled,
        },
      });
    },
  );

  /**
   * POST /auth/mfa/enroll
   * Generate a TOTP secret and return the otpauth URI for QR scanning.
   */
  app.post(
    "/auth/mfa/enroll",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;

      if (authed.user.mfaEnabled) {
        return reply.code(400).send({ error: "MFA is already enabled" });
      }

      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, authed.user.email);

      // Encrypt the secret before storing in the database
      const encryptedSecret = encryptMfaSecret(secret, config.dataEncryptionKey);
      await db.updateUserMfa(authed.user.id, { mfaSecret: encryptedSecret, mfaEnabled: false });

      // Audit log
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.mfa.enroll",
        ip: request.ip,
      });

      return reply.code(200).send({ secret, uri });
    },
  );

  /**
   * POST /auth/mfa/verify
   * Verify TOTP code and enable MFA for the user.
   */
  app.post(
    "/auth/mfa/verify",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = MfaVerifySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Validation failed" });
      }

      const { totpCode } = parseResult.data;

      // Get user's pending MFA secret
      const user = await db.findUserById(authed.user.id);
      if (!user || !user.mfaSecret) {
        return reply.code(400).send({ error: "MFA not enrolled. Call /auth/mfa/enroll first" });
      }

      // Decrypt the MFA secret for verification
      const mfaSecret = decryptMfaSecret(user.mfaSecret, config.dataEncryptionKey);

      // Verify the code
      if (!verifyTotp(mfaSecret, totpCode)) {
        return reply.code(400).send({ error: "Invalid TOTP code" });
      }

      // Enable MFA (keep the encrypted secret as-is)
      await db.updateUserMfa(user.id, { mfaSecret: user.mfaSecret, mfaEnabled: true });

      // Audit log
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.mfa.verify",
        ip: request.ip,
      });

      return reply.code(200).send({ success: true, mfaEnabled: true });
    },
  );

  /**
   * POST /auth/mfa/disable
   * Disable MFA (requires password + TOTP code confirmation).
   */
  app.post(
    "/auth/mfa/disable",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = MfaDisableSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Validation failed" });
      }

      const { password, totpCode } = parseResult.data;

      // Get full user record
      const user = await db.findUserById(authed.user.id);
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        return reply.code(400).send({ error: "MFA is not enabled" });
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        return reply.code(401).send({ error: "Invalid password" });
      }

      // Decrypt and verify TOTP
      const mfaSecret = decryptMfaSecret(user.mfaSecret, config.dataEncryptionKey);
      if (!verifyTotp(mfaSecret, totpCode)) {
        return reply.code(401).send({ error: "Invalid TOTP code" });
      }

      // Disable MFA
      await db.updateUserMfa(user.id, { mfaSecret: null, mfaEnabled: false });

      // Audit log
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.mfa.disable",
        ip: request.ip,
      });

      return reply.code(200).send({ success: true, mfaEnabled: false });
    },
  );
}

/**
 * Clear the pending MFA token store (for testing).
 */
export function clearPendingMfaTokens(): void {
  pendingMfaTokens.clear();
}

/**
 * Sweep expired entries from the pending MFA token store.
 * Called periodically to prevent unbounded memory growth.
 */
export function sweepExpiredMfaTokens(): number {
  const now = Date.now();
  let swept = 0;
  for (const [token, entry] of pendingMfaTokens) {
    if (now > entry.expiresAt) {
      pendingMfaTokens.delete(token);
      swept++;
    }
  }
  return swept;
}

/** GC interval handle (exported for test cleanup) */
let gcInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic garbage collection for expired pending MFA tokens.
 * Sweeps every 60 seconds. Safe for the 11-user deployment -- this is a
 * defensive measure to ensure expired entries do not accumulate indefinitely.
 */
export function startMfaTokenGc(): void {
  if (gcInterval) return; // already running
  gcInterval = setInterval(sweepExpiredMfaTokens, 60_000);
  // Allow the process to exit without waiting for this timer
  gcInterval.unref();
}

/**
 * Stop the periodic garbage collection (for testing / graceful shutdown).
 */
export function stopMfaTokenGc(): void {
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}

/**
 * Encrypt an MFA secret before storing in the database.
 * If no encryption key is available (test/dev without key), stores plaintext.
 */
function encryptMfaSecret(secret: string, key: string | undefined): string {
  if (!key) return secret;
  return encryptField(secret, key);
}

/**
 * Decrypt an MFA secret read from the database.
 * Handles both encrypted values and legacy plaintext (for migration).
 */
function decryptMfaSecret(storedValue: string, key: string | undefined): string {
  if (!key) return storedValue;
  // If the value is a plain base32 TOTP secret (legacy), return as-is
  if (!isEncryptedValue(storedValue)) return storedValue;
  return decryptField(storedValue, key);
}
