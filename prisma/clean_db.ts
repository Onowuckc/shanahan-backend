import { PrismaClient, Role } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Starting cleanup of seeded/dummy data from Shanahan University DB...\n');

  // 1. Delete RegisteredCourse
  const registeredCourses = await prisma.registeredCourse.deleteMany({});
  console.log(`  ❌ Deleted ${registeredCourses.count} registered course record(s).`);

  // 2. Delete CourseRegistration
  const courseRegs = await prisma.courseRegistration.deleteMany({});
  console.log(`  ❌ Deleted ${courseRegs.count} course registration record(s).`);

  // 3. Delete CoursePrerequisite
  const coursePrereqs = await prisma.coursePrerequisite.deleteMany({});
  console.log(`  ❌ Deleted ${coursePrereqs.count} course prerequisite(s).`);

  // 4. Delete Course
  const courses = await prisma.course.deleteMany({});
  console.log(`  ❌ Deleted ${courses.count} course(s).`);

  // 5. Delete PaymentItem
  const paymentItems = await prisma.paymentItem.deleteMany({});
  console.log(`  ❌ Deleted ${paymentItems.count} payment item(s).`);

  // 6. Delete Payment
  const payments = await prisma.payment.deleteMany({});
  console.log(`  ❌ Deleted ${payments.count} payment(s).`);

  // 7. Delete HostelAllocation
  const hostelAllocations = await prisma.hostelAllocation.deleteMany({});
  console.log(`  ❌ Deleted ${hostelAllocations.count} hostel allocation(s).`);

  // 8. Delete OffCampusApplication
  const offCampusApps = await prisma.offCampusApplication.deleteMany({});
  console.log(`  ❌ Deleted ${offCampusApps.count} off-campus application(s).`);

  // 9. Delete BiodataChangeRequest
  const biodataReqs = await prisma.biodataChangeRequest.deleteMany({});
  console.log(`  ❌ Deleted ${biodataReqs.count} biodata change request(s).`);

  // 10. Delete ApplicantProfile
  const applicants = await prisma.applicantProfile.deleteMany({});
  console.log(`  ❌ Deleted ${applicants.count} applicant profile(s).`);

  // 11. Delete StudentProfile
  const students = await prisma.studentProfile.deleteMany({});
  console.log(`  ❌ Deleted ${students.count} student profile(s).`);

  // 12. Delete StaffProfile for Lecturer role users
  const lecturerUsers = await prisma.user.findMany({
    where: { role: Role.LECTURER },
    select: { id: true }
  });
  const lecturerUserIds = lecturerUsers.map(u => u.id);

  if (lecturerUserIds.length > 0) {
    const staffProfiles = await prisma.staffProfile.deleteMany({
      where: { userId: { in: lecturerUserIds } }
    });
    console.log(`  ❌ Deleted ${staffProfiles.count} lecturer staff profile(s).`);
  }

  // 13. Delete Non-Admin Users (STUDENT, APPLICANT, LECTURER)
  const usersDeleted = await prisma.user.deleteMany({
    where: {
      role: {
        in: [Role.STUDENT, Role.APPLICANT, Role.LECTURER]
      }
    }
  });
  console.log(`  ❌ Deleted ${usersDeleted.count} dummy student/applicant/lecturer user account(s).`);

  console.log('\n✅ Cleanup complete! Only administrative logins and academic structures remain.');
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
