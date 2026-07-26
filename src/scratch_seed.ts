import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Scratch Seed ---');

  // 1. Get demo student John Doe
  const student = await prisma.studentProfile.findFirst({
    where: { matricNumber: 'SU/CMP/26/1001' },
    include: { user: true }
  });

  if (!student) {
    console.error('Demo student SU/CMP/26/1001 not found. Please run core seeds first.');
    return;
  }
  console.log(`Found Student: ${student.firstName} ${student.lastName} (${student.matricNumber})`);

  // 2. Get lecturer
  const staff = await prisma.staffProfile.findFirst({
    where: { staffId: 'SU/LEC/001' }
  });

  if (!staff) {
    console.error('Lecturer SU/LEC/001 not found. Please run core seeds first.');
    return;
  }
  console.log(`Found Lecturer: ${staff.firstName} ${staff.lastName} (${staff.staffId})`);

  // 3. Mark all student payments as COMPLETED to unblock results/registrations
  const paymentUpdate = await prisma.payment.updateMany({
    where: { studentId: student.id },
    data: {
      amountPaid: 150000,
      status: 'COMPLETED'
    }
  });
  console.log(`Updated ${paymentUpdate.count} payment invoice(s) to COMPLETED status.`);

  // 4. Find active session and semester
  const activeSession = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    include: { semesters: true }
  });

  if (!activeSession || activeSession.semesters.length === 0) {
    console.error('No active academic session/semester found.');
    return;
  }

  const activeSemester = activeSession.semesters.find(s => s.isCurrent) || activeSession.semesters[0];
  console.log(`Active Period: ${activeSession.name} session, ${activeSemester.name} semester`);

  // 5. Find or create test courses and assign to lecturer
  const courseCodes = ['CMP 101', 'CMP 102', 'GST 111'];
  const courseTitles = ['Introduction to Computer Science', 'Algorithmic & Structured Programming', 'Communication in English I'];
  const units = [3, 4, 2];
  const courses = [];

  for (let i = 0; i < courseCodes.length; i++) {
    let course = await prisma.course.findUnique({
      where: { code: courseCodes[i] }
    });

    if (course) {
      course = await prisma.course.update({
        where: { id: course.id },
        data: { lecturerId: staff.id }
      });
      console.log(`Assigned existing course ${course.code} to lecturer.`);
    } else {
      course = await prisma.course.create({
        data: {
          code: courseCodes[i],
          title: courseTitles[i],
          creditUnits: units[i],
          departmentId: student.departmentId,
          lecturerId: staff.id
        }
      });
      console.log(`Created and assigned new course ${course.code} to lecturer.`);
    }
    courses.push(course);
  }

  // 6. Create approved course registration for student
  // Delete existing registration if any to avoid unique constraint violations
  await prisma.courseRegistration.deleteMany({
    where: {
      studentId: student.id,
      sessionId: activeSession.id,
      semesterId: activeSemester.id
    }
  });

  const reg = await prisma.courseRegistration.create({
    data: {
      studentId: student.id,
      sessionId: activeSession.id,
      semesterId: activeSemester.id,
      level: student.level,
      isApproved: true,
      courses: {
        create: courses.map(c => ({
          courseId: c.id,
          caScore: null,
          examScore: null,
          grade: null,
          gradePoint: null
        }))
      }
    },
    include: { courses: { include: { course: true } } }
  });

  console.log(`Created approved course registration for student with ${reg.courses.length} courses.`);
  console.log('--- Scratch Seed Completed Successfully ---');
}

main()
  .catch(e => {
    console.error('Error running scratch seed:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
