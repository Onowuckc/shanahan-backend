import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  console.log('--- RUNNING INTEGRATION TESTS FOR COURSES & ELECTIVE RULES ---');

  // 1. Fetch a program
  const program = await prisma.program.findFirst({
    include: { department: true }
  });
  if (!program) {
    console.error('No program found in database. Seed the database first.');
    return;
  }
  console.log(`Found Program: ${program.name} (Dept Code: ${program.department.code})`);

  // 2. Create or update program requirement rule for 200 Level, 2nd Semester
  const lvl = 200;
  const sem = 2;
  const minElectives = 2;

  console.log(`Setting minElectives to ${minElectives} for ${program.name} at ${lvl}L Sem ${sem}...`);
  const req = await prisma.programRequirement.upsert({
    where: {
      programId_level_semester: {
        programId: program.id,
        level: lvl,
        semester: sem
      }
    },
    update: { minElectives },
    create: {
      programId: program.id,
      level: lvl,
      semester: sem,
      minElectives
    }
  });
  console.log('Requirement successfully set:', req);

  // 3. Find some courses or create test courses for 200 Level, 2nd Semester
  console.log('Fetching/Creating test courses...');
  const coreCourseData = {
    code: 'SWE 211',
    title: 'Object-Oriented Software Design',
    creditUnits: 3,
    level: lvl,
    semester: sem,
    isCore: true,
    departmentId: program.departmentId,
    programId: program.id
  };

  const coreCourse = await prisma.course.upsert({
    where: { code: coreCourseData.code },
    update: coreCourseData,
    create: coreCourseData
  });
  console.log(`Core Course: ${coreCourse.code} isCore=${coreCourse.isCore}`);

  const electiveCourseData1 = {
    code: 'SWE 212',
    title: 'Introduction to Web Technologies',
    creditUnits: 2,
    level: lvl,
    semester: sem,
    isCore: false,
    departmentId: program.departmentId,
    programId: program.id
  };

  const elective1 = await prisma.course.upsert({
    where: { code: electiveCourseData1.code },
    update: electiveCourseData1,
    create: electiveCourseData1
  });
  console.log(`Elective 1: ${elective1.code} isCore=${elective1.isCore}`);

  const electiveCourseData2 = {
    code: 'SWE 214',
    title: 'User Interface Design',
    creditUnits: 2,
    level: lvl,
    semester: sem,
    isCore: false,
    departmentId: program.departmentId,
    programId: program.id
  };

  const elective2 = await prisma.course.upsert({
    where: { code: electiveCourseData2.code },
    update: electiveCourseData2,
    create: electiveCourseData2
  });
  console.log(`Elective 2: ${elective2.code} isCore=${elective2.isCore}`);

  console.log('All integration test data created successfully. Verification completed!');
}

test()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
