/**
 * Database abstraction layer for invitation operations.
 *
 * All Prisma calls are wrapped here so tests can mock/stub this layer without
 * needing a live database. The interface is injected into route handlers.
 */

export type DbInvite = {
  id: string;
  tenantId: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

export type DbTeamMember = {
  id: string;
  email: string;
  displayName: string | null;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  createdAt: Date;
};

export type InviteDbHelpers = {
  createInvite(data: {
    tenantId: string;
    email: string;
    role: "ADMIN" | "MANAGER" | "VIEWER";
    tokenHash: string;
    expiresAt: Date;
    createdBy: string | null;
  }): Promise<DbInvite>;

  findPendingInvitesByTenant(tenantId: string): Promise<DbInvite[]>;

  findInviteById(tenantId: string, id: string): Promise<DbInvite | null>;

  findInviteByTokenHash(tokenHash: string): Promise<DbInvite | null>;

  markInviteAccepted(id: string): Promise<void>;

  revokeInvite(tenantId: string, id: string): Promise<void>;

  findUserByEmailInTenant(tenantId: string, email: string): Promise<{ id: string } | null>;

  createUserInTenant(data: {
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string;
    role: "ADMIN" | "MANAGER" | "VIEWER";
  }): Promise<{ userId: string }>;

  listTeamMembers(tenantId: string): Promise<DbTeamMember[]>;
};

/**
 * Create the real Prisma-backed invite database helpers.
 * Dynamically imports @prisma/client to keep it lazy.
 */
export async function createPrismaInviteDbHelpers(): Promise<InviteDbHelpers> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  return {
    async createInvite(data) {
      const invite = await prisma.invite.create({
        data: {
          tenantId: data.tenantId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdBy: data.createdBy,
        },
      });
      return invite as DbInvite;
    },

    async findPendingInvitesByTenant(tenantId) {
      const invites = await prisma.invite.findMany({
        where: {
          tenantId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      return invites as DbInvite[];
    },

    async findInviteById(tenantId, id) {
      const invite = await prisma.invite.findFirst({
        where: { id, tenantId },
      });
      return invite as DbInvite | null;
    },

    async findInviteByTokenHash(tokenHash) {
      const invite = await prisma.invite.findUnique({
        where: { tokenHash },
      });
      return invite as DbInvite | null;
    },

    async markInviteAccepted(id) {
      await prisma.invite.update({
        where: { id },
        data: { acceptedAt: new Date() },
      });
    },

    async revokeInvite(tenantId, id) {
      await prisma.invite.delete({
        where: { id, tenantId },
      });
    },

    async findUserByEmailInTenant(tenantId, email) {
      const user = await prisma.user.findFirst({
        where: { tenantId, email, deletedAt: null },
        select: { id: true },
      });
      return user;
    },

    async createUserInTenant(data) {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: data.tenantId,
            email: data.email,
            passwordHash: data.passwordHash,
            displayName: data.displayName,
          },
        });
        await tx.membership.create({
          data: {
            tenantId: data.tenantId,
            userId: user.id,
            role: data.role,
          },
        });
        return { userId: user.id };
      });
      return result;
    },

    async listTeamMembers(tenantId) {
      const memberships = await prisma.membership.findMany({
        where: { tenantId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      return memberships.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        role: m.role as "OWNER" | "ADMIN" | "MANAGER" | "VIEWER",
        createdAt: m.user.createdAt,
      }));
    },
  };
}
