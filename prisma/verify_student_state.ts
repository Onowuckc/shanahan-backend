import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.studentProfile.findFirst({
    where: { matricNumber: 'SU/CMP/26/1001' },
    include: {
      registrations: {
        include: {
          courses: {
            include: {
              course: true
            }
          }
        }
      },
      hostelAllocations: {
        include: {
          hostel: true
        }
      },
      payments: true
    }
  });

  if (!student) {
    console.error('Student SU/CMP/26/1001 not found.');
    return;
  }

  console.log(`Student: ${student.firstName} ${student.lastName}`);
  console.log(`Matric: ${student.matricNumber}`);
  console.log(`Level: ${student.level}`);
  console.log(`Hostel allocations:`, student.hostelAllocations.map(a => ({ hostel: a.hostel.name, status: a.status })));
  console.log(`Payments:`, student.payments.map(p => ({ amountDue: p.amountDue, amountPaid: p.amountPaid, status: p.status })));
  console.log(`Registrations:`, student.registrations.map(r => ({
    session: r.sessionId,
    semester: r.semesterId,
    isApproved: r.isApproved,
    courses: r.courses.map(c => c.course.code)
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
