/**
 * Database abstraction layer for auth operations.
 *
 * All Prisma calls are wrapped here so tests can mock/stub this layer without
 * needing a live database. The interface is injected into route handlers.
 */

export type DbUser = {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  /**
   * Last accepted TOTP time-step counter. Used to reject replay of a TOTP code
   * within its ±1-step validity window. Null until the first MFA login.
   */
  mfaLastUsedStep: bigint | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type DbSession = {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  user: DbUser;
};

export type DbMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
};

export type CreateAuditLogInput = {
  tenantId: string;
  actorId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
};

export type AuthDbHelpers = {
  findUserByEmail(email: string): Promise<DbUser | null>;
  findUserById(userId: string): Promise<DbUser | null>;
  createUserWithTenant(data: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<{ user: DbUser; tenantId: string; membershipId: string }>;
  createSession(data: {
    userId: string;
    tokenHash: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  findSessionByTokenHash(tokenHash: string): Promise<DbSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void>;
  findMembershipByUserId(userId: string): Promise<DbMembership | null>;
  updateUserMfa(userId: string, data: { mfaSecret: string | null; mfaEnabled: boolean }): Promise<void>;
  /**
   * Persist the last accepted TOTP time-step counter for replay protection.
   */
  updateUserMfaLastStep(userId: string, step: number): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  updateUserLastLogin(userId: string): Promise<void>;
  createAuditLog(data: CreateAuditLogInput): Promise<void>;
};

/**
 * Create the real Prisma-backed database helpers.
 * Dynamically imports @prisma/client to keep it lazy.
 */
export async function createPrismaDbHelpers(): Promise<AuthDbHelpers> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  return {
    async findUserByEmail(email: string) {
      const user = await prisma.user.findFirst({
        where: { email, deletedAt: null },
      });
      return user;
    },

    async findUserById(userId: string) {
      const user = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
      });
      return user;
    },

    async createUserWithTenant(data) {
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: `${data.displayName}'s Organization` },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: data.email,
            passwordHash: data.passwordHash,
            displayName: data.displayName,
          },
        });
        const membership = await tx.membership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role: "OWNER",
          },
        });
        return { user, tenantId: tenant.id, membershipId: membership.id };
      });
      return result;
    },

    async createSession(data) {
      const session = await prisma.session.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          ip: data.ip,
          userAgent: data.userAgent,
          expiresAt: data.expiresAt,
        },
      });
      return { id: session.id };
    },

    async findSessionByTokenHash(tokenHash: string) {
      const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!session) return null;
      return session as unknown as DbSession;
    },

    async revokeSession(sessionId: string) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
    },

    async revokeAllUserSessions(userId: string, exceptSessionId?: string) {
      await prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    },

    async findMembershipByUserId(userId: string) {
      const membership = await prisma.membership.findFirst({
        where: { userId },
      });
      return membership;
    },

    async updateUserMfa(userId: string, data) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaSecret: data.mfaSecret, mfaEnabled: data.mfaEnabled },
      });
    },

    async updateUserMfaLastStep(userId: string, step: number) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaLastUsedStep: BigInt(step) },
      });
    },

    async updateUserPassword(userId: string, passwordHash: string) {
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    },

    async updateUserLastLogin(userId: string) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },

    async createAuditLog(data) {
      await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          actorId: data.actorId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          detail: data.detail as object,
          ip: data.ip,
        },
      });
    },
  };
}
