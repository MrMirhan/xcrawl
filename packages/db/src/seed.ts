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
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      settings: { create: {} },
    },
  });
  console.log(`User created: ${adminEmail}`);

  // 2. Create API key linked to the user
  const key = `xc_${crypto.randomBytes(24).toString('hex')}`;
  await prisma.apiKey.create({
    data: {
      name: 'Default API Key',
      key,
      hashedKey: await bcrypt.hash(key, 10),
      active: true,
      userId: user.id,
    },
  });

  console.log('\n--- Seed complete ---');
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: (from your ADMIN_PASSWORD env var)`);
  console.log(`API Key:  ${key}`);
  console.log('\nLogin at http://localhost:3000/login');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
