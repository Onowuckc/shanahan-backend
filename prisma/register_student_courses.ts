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

  const session = await prisma.academicSession.findFirst({
    where: { isCurrent: true }
  });

  const semester = await prisma.semester.findFirst({
    where: { isCurrent: true }
  });

  if (!session || !semester) {
    console.error('No active session or semester.');
    return;
  }

  const cmp101 = await prisma.course.findUnique({ where: { code: 'CMP 101' } });
  const cmp102 = await prisma.course.findUnique({ where: { code: 'CMP 102' } });

  if (!cmp101 || !cmp102) {
    console.error('Courses CMP 101 or CMP 102 not found.');
    return;
  }

  // Create course registration
  const registration = await prisma.courseRegistration.upsert({
    where: {
      studentId_sessionId_semesterId: {
        studentId: student.id,
        sessionId: session.id,
        semesterId: semester.id
      }
    },
    update: {
      isApproved: true
    },
    create: {
      studentId: student.id,
      sessionId: session.id,
      semesterId: semester.id,
      level: student.level,
      isApproved: true,
      courses: {
        create: [
          { courseId: cmp101.id },
          { courseId: cmp102.id }
        ]
      }
    }
  });

  console.log(`Registered and Approved CMP 101 & CMP 102 for John Doe:`, registration);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
