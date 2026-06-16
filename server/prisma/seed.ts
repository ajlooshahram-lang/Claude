/**
 * STP Platform — Database seed script
 *
 * Creates the initial tenant, admin user, and OWNER membership.
 * Run with: npx tsx prisma/seed.ts
 *
 * Environment variables:
 *   ADMIN_EMAIL    — Admin email (default: admin@stp.local)
 *   ADMIN_PASSWORD — Admin password (REQUIRED, no default)
 */

import { PrismaClient, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@stp.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_PASSWORD environment variable is required.');
  console.error('Set it in your .env file or pass it directly:');
  console.error('  ADMIN_PASSWORD=your-secure-password npx tsx prisma/seed.ts');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 12) {
  console.error('ERROR: ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

async function main() {
  console.log(`Seeding database with admin: ${ADMIN_EMAIL}`);

  // Hash password with Argon2id (same params as auth system)
  const passwordHash = await hash(ADMIN_PASSWORD, {
    memoryCost: 65536,   // 64 MB
    timeCost: 3,
    parallelism: 4,
    algorithm: 2,        // Argon2id
  });

  // Upsert the STP tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'stp-tenant-001' },
    update: { name: 'STP' },
    create: {
      id: 'stp-tenant-001',
      name: 'STP',
      region: 'eu-west',
    },
  });

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // Upsert the admin user
  const user = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: ADMIN_EMAIL,
      },
    },
    update: { passwordHash },
    create: {
      tenantId: tenant.id,
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: 'Admin',
    },
  });

  console.log(`User: ${user.email} (${user.id})`);

  // Upsert the OWNER membership
  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: { role: Role.OWNER },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: Role.OWNER,
    },
  });

  console.log(`Membership: ${membership.role} (${membership.id})`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
