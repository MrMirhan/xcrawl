import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...\n');

  // 1. Create default admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@xcrawl.local';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ERROR: ADMIN_PASSWORD env var is required. Set it in your .env file.');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
      settings: { create: {} },
    },
  });
  console.log(`User created: ${adminEmail}`);

  // 2. Create API key linked to the user
  const existingKey = await prisma.apiKey.findFirst({ where: { userId: user.id } });
  let key: string | undefined;
  if (!existingKey) {
    key = `xc_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.apiKey.create({
      data: {
        name: 'Default API Key',
        key,
        hashedKey: await bcrypt.hash(key, 10),
        active: true,
        userId: user.id,
      },
    });
  }

  // 3. Ensure a single default Free plan and backfill existing users
  await prisma.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });

  const freePlan = await prisma.plan.upsert({
    where: { name: 'Free' },
    update: {},
    create: {
      name: 'Free',
      description: 'Default plan for new signups.',
      dailyPageLimit: 5000,
      weeklyPageLimit: 100000,
      dailySearchLimit: 500,
      weeklySearchLimit: 3000,
      dailyExtractLimit: 500,
      weeklyExtractLimit: 3000,
      canUseOwnLlm: true,
      isDefault: true,
    },
  });

  await prisma.user.updateMany({ where: { planId: null }, data: { planId: freePlan.id } });

  console.log('\n--- Seed complete ---');
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: (from your ADMIN_PASSWORD env var)`);
  console.log(`API Key:  ${key ?? '(existing key unchanged)'}`);
  console.log('\nLogin at http://localhost:3000/login');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
