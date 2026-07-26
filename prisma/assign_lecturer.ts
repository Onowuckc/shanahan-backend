import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staffProfile.findFirst({
    where: { staffId: 'SU/LEC/001' }
  });

  if (!staff) {
    console.error('Lecturer SU/LEC/001 not found.');
    return;
  }

  console.log(`Found lecturer: ${staff.firstName} ${staff.lastName} with ID ${staff.id}`);

  // Update courses to assign lecturer
  const cmp101 = await prisma.course.update({
    where: { code: 'CMP 101' },
    data: { lecturerId: staff.id }
  });
  console.log(`Assigned CMP 101 to ${staff.lastName}`);

  const cmp102 = await prisma.course.update({
    where: { code: 'CMP 102' },
    data: { lecturerId: staff.id }
  });
  console.log(`Assigned CMP 102 to ${staff.lastName}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
