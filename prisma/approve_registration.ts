import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.studentProfile.findFirst({
    where: { matricNumber: 'SU/CMP/26/1001' }
  });

  if (!student) {
    console.error('Student SU/CMP/26/1001 not found.');
    return;
  }

  const registration = await prisma.courseRegistration.findFirst({
    where: { studentId: student.id, isApproved: false }
  });

  if (!registration) {
    console.log('No pending registrations found for student SU/CMP/26/1001.');
    return;
  }

  await prisma.courseRegistration.update({
    where: { id: registration.id },
    data: { isApproved: true }
  });

  console.log(`Successfully approved course registration for student ${student.firstName} ${student.lastName}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
