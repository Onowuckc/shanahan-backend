import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Running database schema updates manually...');

  // 1. Alter Course table if columns don't exist
  try {
    const tableInfo: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Course' AND column_name = 'level'
    `);
    if (tableInfo.length === 0) {
      console.log('Adding columns to Course table...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Course" 
        ADD COLUMN "level" INTEGER NOT NULL DEFAULT 100,
        ADD COLUMN "semester" INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN "isCore" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN "programId" TEXT;
      `);
      // Add foreign key constraint
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Course" 
          ADD CONSTRAINT "Course_programId_fkey" 
          FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `);
      } catch (e: any) {
        console.log('Foreign key constraint might already exist:', e.message);
      }
      console.log('Course table altered successfully.');
    } else {
      console.log('Course table already has Level column. Skipping.');
    }
  } catch (err: any) {
    console.error('Error altering Course table:', err);
  }

  // 2. Create ProgramRequirement table if not exists
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProgramRequirement" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "level" INTEGER NOT NULL,
        "semester" INTEGER NOT NULL,
        "minElectives" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "ProgramRequirement_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('ProgramRequirement table checked/created.');

    // Add unique index if not exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "ProgramRequirement_programId_level_semester_key" 
        ON "ProgramRequirement"("programId", "level", "semester");
      `);
    } catch (e: any) {
      console.log('Index might already exist:', e.message);
    }

    // Add foreign key if not exists
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProgramRequirement" 
        ADD CONSTRAINT "ProgramRequirement_programId_fkey" 
        FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
    } catch (e: any) {
      console.log('Foreign key constraint might already exist:', e.message);
    }
    console.log('ProgramRequirement references set up successfully.');
  } catch (err: any) {
    console.error('Error setting up ProgramRequirement table:', err);
  }

  console.log('Done!');
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
