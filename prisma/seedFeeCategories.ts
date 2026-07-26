import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FEE_CATEGORIES = [
  { name: 'Tuition Fee',                  description: 'Main semester tuition charge per academic session' },
  { name: 'Acceptance Fee',               description: 'One-time fee paid upon admission acceptance' },
  { name: 'Accommodation/Hostel Fee',     description: 'Semester hostel and accommodation charges' },
  { name: 'Medical Fee',                  description: 'University health centre and medical services levy' },
  { name: 'Laboratory Fee',               description: 'Practical laboratory usage fee for science-based departments' },
  { name: 'Library Fee',                  description: 'Library access and resource levy' },
  { name: 'ICT Fee',                      description: 'Information and communication technology infrastructure levy' },
  { name: 'Faculty/Department Fee',       description: 'Faculty or departmental-specific charges and dues' },
  { name: 'Other University Charges',     description: 'Other university-approved miscellaneous fees' },
];

async function seedFeeCategories() {
  console.log('Seeding fee categories...');

  for (const cat of FEE_CATEGORIES) {
    await prisma.feeCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
    console.log(`  Created: ${cat.name}`);
  }

  console.log('Fee categories seeded successfully!');
}

seedFeeCategories()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
