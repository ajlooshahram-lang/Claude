import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password.js";
import { generateSessionToken, hashToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "./session.js";
import { generateTotpSecret, generateTotpUri, verifyTotp, verifyTotpWithStep } from "./totp.js";
import { generateCsrfToken, setCsrfCookie } from "./csrf.js";
import { encryptField, decryptField, isEncryptedValue } from "./crypto.js";
import { isLocked, recordFailedAttempt, resetAttempts } from "./lockout.js";
import { logAuditEvent } from "./audit.js";
import { generateRecoveryCodes, normalizeCode, RECOVERY_CODE_COUNT } from "./recovery.js";
import { createRequireAuth, createRequireRole, type AuthenticatedRequest } from "./middleware.js";
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

const MfaRecoveryLoginSchema = z.object({
  pendingToken: z.string().min(1),
  recoveryCode: z.string().min(1).max(100),
});

const MfaVerifySchema = z.object({
  totpCode: z.string().length(6),
});

const MfaDisableSchema = z.object({
  password: z.string().min(1),
  totpCode: z.string().length(6),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const AdminResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(1),
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
  const requireAdmin = createRequireRole(db, "ADMIN");
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

    // MFA brute-force is bounded by the same account-lockout policy as password
    // login, keyed by user id so it cannot be bypassed by varying the email.
    const lockoutKey = "mfa:" + mfaUser.id;
    if (isLocked(lockoutKey)) {
      return reply.code(423).send({ error: "Account temporarily locked due to too many failed attempts" });
    }

    // Decrypt the stored MFA secret before verification
    const mfaSecret = decryptMfaSecret(mfaUser.mfaSecret, config.dataEncryptionKey);

    // Verify TOTP and capture the matched time-step for replay protection.
    const totpResult = verifyTotpWithStep(mfaSecret, totpCode);
    if (!totpResult.valid) {
      const lockResult = recordFailedAttempt(lockoutKey);
      await logAuditEvent(db, {
        tenantId: mfaUser.tenantId,
        actorId: mfaUser.id,
        action: "auth.login.mfa.failed",
        detail: { reason: "invalid_totp", locked: lockResult.locked },
        ip: request.ip,
      });
      return reply.code(401).send({ error: "Invalid TOTP code" });
    }

    // Replay protection: reject a code whose time-step has already been used.
    // mfaLastUsedStep persists the highest accepted step; any step <= it is a
    // replay (or an older code within the window) and must be rejected.
    const matchedStep = totpResult.step as number;
    if (mfaUser.mfaLastUsedStep !== null && BigInt(matchedStep) <= mfaUser.mfaLastUsedStep) {
      const lockResult = recordFailedAttempt(lockoutKey);
      await logAuditEvent(db, {
        tenantId: mfaUser.tenantId,
        actorId: mfaUser.id,
        action: "auth.login.mfa.failed",
        detail: { reason: "totp_replay", locked: lockResult.locked },
        ip: request.ip,
      });
      return reply.code(401).send({ error: "Invalid TOTP code" });
    }

    // Successful MFA: clear the lockout counter and persist the accepted step.
    resetAttempts(lockoutKey);
    await db.updateUserMfaLastStep(mfaUser.id, matchedStep);

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
   * POST /auth/login/mfa/recovery
   * Complete MFA login using a one-time recovery (backup) code instead of TOTP.
   *
   * This is the self-service escape hatch for a user who has lost their TOTP
   * authenticator. It mirrors /auth/login/mfa: it consumes the same single-use
   * pending token, applies the SAME per-user lockout (`mfa:<userId>`), and on
   * success mints a fresh session. The supplied code is normalized (forgiving of
   * spaces/hyphens/case) and verified against the user's UNUSED recovery code
   * hashes with Argon2 verify; the matched code is then marked used so it cannot
   * be replayed.
   */
  app.post(
    "/auth/login/mfa/recovery",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = MfaRecoveryLoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Validation failed" });
      }

      const { pendingToken, recoveryCode } = parseResult.data;

      // Validate pending token (single-use, same store as the TOTP path).
      const pending = pendingMfaTokens.get(pendingToken);
      if (!pending || Date.now() > pending.expiresAt) {
        pendingMfaTokens.delete(pendingToken);
        return reply.code(401).send({ error: "Invalid or expired pending token" });
      }

      pendingMfaTokens.delete(pendingToken);

      const mfaUser = await db.findUserById(pending.userId);
      if (!mfaUser || !mfaUser.mfaEnabled) {
        return reply.code(401).send({ error: "MFA not configured" });
      }

      // Bound brute-force with the same per-user lockout as the TOTP path.
      const lockoutKey = "mfa:" + mfaUser.id;
      if (isLocked(lockoutKey)) {
        return reply.code(423).send({ error: "Account temporarily locked due to too many failed attempts" });
      }

      // Verify the normalized code against the user's UNUSED recovery codes.
      const normalized = normalizeCode(recoveryCode);
      const codes = await db.listRecoveryCodes(mfaUser.id);
      let matchedId: string | null = null;
      for (const code of codes) {
        if (code.usedAt !== null) continue;
        // Argon2 verify is constant-time per comparison; loop over all unused
        // codes so a wrong code costs the same regardless of position.
        const ok = await verifyPassword(normalized, code.codeHash);
        if (ok) {
          matchedId = code.id;
          break;
        }
      }

      if (!matchedId) {
        const lockResult = recordFailedAttempt(lockoutKey);
        await logAuditEvent(db, {
          tenantId: mfaUser.tenantId,
          actorId: mfaUser.id,
          action: "auth.login.mfa.failed",
          detail: { reason: "invalid_recovery_code", locked: lockResult.locked },
          ip: request.ip,
        });
        return reply.code(401).send({ error: "Invalid recovery code" });
      }

      // Consume the code and clear the lockout counter.
      await db.markRecoveryCodeUsed(matchedId);
      resetAttempts(lockoutKey);

      // Create session.
      const { token, tokenHash } = generateSessionToken();
      const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);
      await db.createSession({
        userId: mfaUser.id,
        tokenHash,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        expiresAt,
      });

      await db.updateUserLastLogin(mfaUser.id);

      // Set cookies.
      const cookieOpts = getSessionCookieOptions(config.isProd);
      void reply.setCookie(SESSION_COOKIE_NAME, token, {
        ...cookieOpts,
        maxAge: sessionExpiryDays * 24 * 60 * 60,
      });
      const csrfToken = generateCsrfToken();
      setCsrfCookie(reply, csrfToken, config.isProd);

      // Audit log: recovery-code login.
      const remaining = await db.countUnusedRecoveryCodes(mfaUser.id);
      await logAuditEvent(db, {
        tenantId: mfaUser.tenantId,
        actorId: mfaUser.id,
        action: "auth.login.mfa.recovery",
        detail: { remainingRecoveryCodes: remaining },
        ip: request.ip,
      });

      return reply.code(200).send({
        user: {
          id: mfaUser.id,
          email: mfaUser.email,
          displayName: mfaUser.displayName,
          mfaEnabled: mfaUser.mfaEnabled,
        },
        remainingRecoveryCodes: remaining,
      });
    },
  );

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

      return reply.code(200).send({
        success: true,
        mfaEnabled: true,
        recoveryCodesHint: "MFA is enabled. Generate recovery codes now so you can still sign in if you lose your authenticator.",
      });
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

      // Same per-user MFA lockout as the login flow bounds brute-force of the
      // TOTP confirmation required to disable MFA.
      const lockoutKey = "mfa:" + user.id;
      if (isLocked(lockoutKey)) {
        return reply.code(423).send({ error: "Account temporarily locked due to too many failed attempts" });
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        return reply.code(401).send({ error: "Invalid password" });
      }

      // Decrypt and verify TOTP
      const mfaSecret = decryptMfaSecret(user.mfaSecret, config.dataEncryptionKey);
      if (!verifyTotp(mfaSecret, totpCode)) {
        const lockResult = recordFailedAttempt(lockoutKey);
        await logAuditEvent(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          action: "auth.login.mfa.failed",
          detail: { reason: "invalid_totp", context: "disable", locked: lockResult.locked },
          ip: request.ip,
        });
        return reply.code(401).send({ error: "Invalid TOTP code" });
      }

      // TOTP confirmed - clear any accumulated MFA failures.
      resetAttempts(lockoutKey);

      // Disable MFA
      await db.updateUserMfa(user.id, { mfaSecret: null, mfaEnabled: false });

      // Clear any recovery codes: they are meaningless once MFA is off and must
      // not linger to be used against a re-enabled account.
      await db.replaceRecoveryCodes(user.id, []);

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

  /**
   * POST /auth/mfa/recovery-codes/generate
   * Generate a fresh set of one-time recovery codes (MFA must be enabled).
   * Replaces any existing set and returns the plaintext codes ONCE — they are
   * stored hashed and cannot be retrieved again.
   */
  app.post(
    "/auth/mfa/recovery-codes/generate",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;

      // MFA must be enabled to have recovery codes.
      const user = await db.findUserById(authed.user.id);
      if (!user || !user.mfaEnabled) {
        return reply.code(400).send({ error: "MFA is not enabled" });
      }

      // Generate plaintext codes, hash each one, and replace the stored set.
      const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
      const hashes = await Promise.all(codes.map((c) => hashPassword(normalizeCode(c))));
      await db.replaceRecoveryCodes(user.id, hashes);

      // Audit log.
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.mfa.recovery.generate",
        detail: { count: codes.length },
        ip: request.ip,
      });

      return reply.code(200).send({
        codes,
        count: codes.length,
        note: "Save these recovery codes now. Each can be used once and they will not be shown again.",
      });
    },
  );

  /**
   * GET /auth/mfa/recovery-codes/status
   * Return whether MFA is enabled and how many recovery codes remain. Never
   * returns the codes themselves.
   */
  app.get(
    "/auth/mfa/recovery-codes/status",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const remaining = await db.countUnusedRecoveryCodes(authed.user.id);
      return reply.code(200).send({
        enabled: authed.user.mfaEnabled,
        remaining,
      });
    },
  );

  /**
   * POST /auth/change-password
   * Self-service password change for the authenticated user.
   *
   * Requires the current password (so a hijacked-but-unlocked browser tab cannot
   * silently rotate credentials) and revokes every OTHER session on success, so
   * any attacker who had stolen a session is forced out. The caller's current
   * session is intentionally kept alive so the user stays logged in.
   *
   * Per-route rate limit (defence in depth) caps how fast the current-password
   * check can be brute-forced from an already-authenticated context.
   */
  app.post(
    "/auth/change-password",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = ChangePasswordSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Validation failed" });
      }

      const { currentPassword, newPassword } = parseResult.data;

      // Load the full user record (need the password hash).
      const user = await db.findUserById(authed.user.id);
      if (!user) {
        return reply.code(401).send({ error: "Invalid password" });
      }

      // Verify the current password.
      const currentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!currentValid) {
        await logAuditEvent(db, {
          tenantId: user.tenantId,
          actorId: user.id,
          action: "auth.password.change.failed",
          ip: request.ip,
        });
        return reply.code(401).send({ error: "Invalid password" });
      }

      // Enforce password strength on the new password.
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return reply.code(400).send({ error: strength.reason });
      }

      // Reject reusing the current password.
      const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
      if (sameAsCurrent) {
        return reply.code(400).send({ error: "New password must be different from the current password" });
      }

      // Hash and persist the new password.
      const passwordHash = await hashPassword(newPassword);
      await db.updateUserPassword(user.id, passwordHash);

      // Revoke all OTHER sessions; keep the current one so the user stays logged in.
      await db.revokeAllUserSessions(user.id, authed.sessionData.sessionId);

      // Audit log.
      await logAuditEvent(db, {
        tenantId: user.tenantId,
        actorId: user.id,
        action: "auth.password.change",
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
    },
  );

  /**
   * POST /auth/admin/reset-password
   * Admin-initiated password reset (OWNER/ADMIN only).
   *
   * For this 11-user private deployment there is no transactional mailer, so an
   * admin sets the new password directly. The reset is tenant-scoped (no
   * cross-tenant resets, no user enumeration) and revokes ALL of the target
   * user's sessions to force a full re-login.
   */
  app.post(
    "/auth/admin/reset-password",
    {
      preHandler: [requireAuth, requireAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authed = request as AuthenticatedRequest;
      const parseResult = AdminResetPasswordSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Validation failed" });
      }

      const { userId, newPassword } = parseResult.data;

      // Tenant scoping: the target must exist and belong to the admin's tenant.
      // A mismatch returns 404 (same as "not found") to avoid cross-tenant
      // enumeration.
      const target = await db.findUserById(userId);
      if (!target || target.tenantId !== authed.user.tenantId) {
        return reply.code(404).send({ error: "User not found" });
      }

      // Enforce password strength.
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return reply.code(400).send({ error: strength.reason });
      }

      // Hash and persist the new password.
      const passwordHash = await hashPassword(newPassword);
      await db.updateUserPassword(target.id, passwordHash);

      // Revoke ALL of the target user's sessions (no exception) - force re-login.
      await db.revokeAllUserSessions(target.id);

      // Audit log (actor is the admin).
      await logAuditEvent(db, {
        tenantId: authed.user.tenantId,
        actorId: authed.user.id,
        action: "auth.password.admin-reset",
        entity: "User",
        entityId: target.id,
        detail: { targetUserId: target.id },
        ip: request.ip,
      });

      return reply.code(200).send({ success: true });
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
