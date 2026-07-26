import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Migrating existing user roles to multiple roles array...');
  try {
    // Copy the "role" column value to the "roles" array column for all users
    const count = await prisma.$executeRawUnsafe(`
      UPDATE "User"
      SET "roles" = ARRAY["role"]::"Role"[]
      WHERE "roles" IS NULL OR cardinality("roles") = 0;
    `);
    console.log(`Successfully migrated ${count} users' roles.`);
  } catch (error: any) {
    console.error('Error during roles array migration:', error);
  }
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
