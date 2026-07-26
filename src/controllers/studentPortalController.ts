import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';
import { initializeTransaction, verifyTransaction } from '../services/paystackService';

// Helper to get active session/semester
async function getActiveAcademicPeriod() {
  const session = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    include: { semesters: { where: { isCurrent: true } } }
  });
  return {
    session,
    semester: session?.semesters[0] || null
  };
}

// ─── STUDENT DASHBOARD STATS ──────────────────────────────────────────────────
export async function getStudentDashboardStats(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      include: { department: { include: { faculty: true } }, program: true }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const { session, semester } = await getActiveAcademicPeriod();

    // Fetch payments totals
    const payments = await prisma.payment.findMany({
      where: { studentId: student.id }
    });

    const totalDue = payments.reduce((sum, p) => sum + p.amountDue, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const outstanding = totalDue - totalPaid;

    // Check course registration status for active period
    let courseRegStatus = 'NOT_REGISTERED';
    if (session && semester) {
      const reg = await prisma.courseRegistration.findUnique({
        where: {
          studentId_sessionId_semesterId: {
            studentId: student.id,
            sessionId: session.id,
            semesterId: semester.id
          }
        }
      });
      if (reg) {
        courseRegStatus = reg.isApproved ? 'APPROVED' : 'PENDING_APPROVAL';
      }
    }

    // Check hostel allocation status
    let hostelStatus = 'NONE';
    let allocatedHostelName = null;
    if (session) {
      const allocation = await prisma.hostelAllocation.findUnique({
        where: {
          studentId_sessionId: {
            studentId: student.id,
            sessionId: session.id
          }
        },
        include: { hostel: true }
      });
      if (allocation) {
        hostelStatus = allocation.status; // PENDING, APPROVED, REJECTED
        allocatedHostelName = allocation.status === 'APPROVED' ? allocation.hostel.name : null;
      }
    }

    return res.json({
      profile: student,
      activeSession: session?.name || 'N/A',
      activeSemester: semester?.name || 'N/A',
      financials: {
        totalDue,
        totalPaid,
        outstanding
      },
      academic: {
        courseRegStatus,
        hostelStatus,
        allocatedHostelName
      }
    });
  } catch (error: any) {
    console.error('getStudentDashboardStats error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST STUDENT PAYMENTS ────────────────────────────────────────────────────
export async function listStudentPayments(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const payments = await prisma.payment.findMany({
      where: { studentId: student.id },
      include: {
        session: true,
        semester: true,
        items: { include: { feeCategory: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ data: payments });
  } catch (error: any) {
    console.error('listStudentPayments error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── INITIALIZE PAYMENT TRANSACTION ───────────────────────────────────────────
export async function initializeStudentPayment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { paymentId, amount, callbackUrl } = req.body;

    if (!paymentId || !amount) {
      return res.status(400).json({ error: 'paymentId and amount are required.' });
    }

    const amountToPay = parseFloat(amount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number.' });
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment || payment.studentId !== student.id) {
      return res.status(404).json({ error: 'Payment invoice not found.' });
    }

    if (payment.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This invoice has already been fully paid.' });
    }

    const remainingBalance = payment.amountDue - payment.amountPaid;
    if (amountToPay > remainingBalance) {
      return res.status(400).json({ error: `Amount exceeds outstanding balance of ₦${remainingBalance}.` });
    }

    // Installment check: First payment must be at least 50% of amountDue
    if (payment.amountPaid === 0 && amountToPay < (payment.amountDue * 0.5)) {
      return res.status(400).json({ error: 'First payment must be at least 50% of the total fee.' });
    }

    // Construct callback url if not provided
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const targetCallbackUrl = callbackUrl || `${origin}/payments`;

    // Initialize Paystack transaction
    const response = await initializeTransaction(student.user.email, amountToPay, {
      paymentId: payment.id,
      studentId: student.id,
      paymentType: 'student_fee'
    }, targetCallbackUrl);

    if (!response.status || !response.data) {
      return res.status(400).json({ error: response.message });
    }

    // Save temporary reference
    await prisma.payment.update({
      where: { id: payment.id },
      data: { txReference: response.data.reference }
    });

    return res.json({ data: response.data });
  } catch (error: any) {
    console.error('initializeStudentPayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── VERIFY PAYMENT TRANSACTION ───────────────────────────────────────────────
export async function verifyStudentPayment(req: AuthRequest, res: Response) {
  try {
    const { reference, simulate } = req.body;
    if (!reference) return res.status(400).json({ error: 'Transaction reference is required.' });

    // Find payment record
    const payment = await prisma.payment.findFirst({
      where: { txReference: reference },
      include: { items: { include: { feeCategory: true } } }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found for this transaction reference.' });
    }

    // If already verified previously, prevent double-counting and return current payment record
    if (payment.paystackRef === reference) {
      return res.json({
        message: 'Payment already verified successfully.',
        data: payment
      });
    }

    let verifiedAmount = 0;

    if (simulate && process.env.NODE_ENV !== 'production') {
      verifiedAmount = payment.amountDue - payment.amountPaid;
    } else {
      const verification = await verifyTransaction(reference);
      if (!verification.status || !verification.data || verification.data.status !== 'success') {
        return res.status(400).json({ error: 'Payment verification failed or transaction not completed.' });
      }
      verifiedAmount = verification.data.amount / 100; // convert to Naira
    }

    const newAmountPaid = payment.amountPaid + verifiedAmount;
    const newStatus = newAmountPaid >= payment.amountDue ? 'COMPLETED' : 'PARTIAL';

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
        paymentDate: new Date(),
        paystackRef: reference // mark this reference as successfully processed/verified
      }
    });

    // Check if Accommodation fee was paid. If so, automatically approve hostel allocation.
    const isAccommodationFee = payment.items.some(
      item => item.feeCategory.name.toLowerCase().includes('accommodation') ||
              item.feeCategory.name.toLowerCase().includes('hostel')
    );

    if (isAccommodationFee && newStatus === 'COMPLETED') {
      await prisma.hostelAllocation.updateMany({
        where: {
          studentId: payment.studentId!,
          sessionId: payment.sessionId,
          status: 'PENDING'
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date()
        }
      });
      console.log(`[Hostels] Auto-approved hostel allocation for student ${payment.studentId} after fee completion`);
    }

    return res.json({
      message: 'Payment verified successfully.',
      data: updatedPayment
    });
  } catch (error: any) {
    console.error('verifyStudentPayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST AVAILABLE COURSES FOR REGISTRATION ──────────────────────────────────
export async function listAvailableCourses(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        department: {
          include: { faculty: true }
        }
      }
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const { session, semester } = await getActiveAcademicPeriod();
    if (!session || !semester) {
      return res.status(400).json({ error: 'No active academic session or semester.' });
    }

    const activeSemesterNumber = semester.name.toLowerCase().includes('first') ? 1 : 2;

    // Fetch all courses in the student's department along with their prerequisites
    const courses = await prisma.course.findMany({
      where: {
        departmentId: student.departmentId,
        level: student.level,
        semester: activeSemesterNumber,
        OR: [
          { programId: null },
          { programId: student.programId }
        ]
      },
      include: {
        lecturer: true,
        prerequisites: {
          include: {
            prerequisite: true
          }
        }
      }
    });

    // Fetch student's academic history (past registered courses with grades)
    const pastRegistrations = await prisma.registeredCourse.findMany({
      where: {
        registration: {
          studentId: student.id,
          OR: [
            { sessionId: { not: session.id } },
            { semesterId: { not: semester.id } }
          ]
        }
      },
      include: {
        course: true,
        registration: true
      }
    });

    // Helper to check prerequisite status
    const evaluatedCourses = courses.map(course => {
      const prereqs = course.prerequisites.map(p => {
        const prereqCourse = p.prerequisite;
        const registrations = pastRegistrations.filter(r => r.courseId === prereqCourse.id);
        
        let status: 'MISSING' | 'FAILED' | 'PASSED' = 'MISSING';
        
        if (registrations.length > 0) {
          const hasPassed = registrations.some(r => r.grade && r.grade !== 'F' && r.gradePoint !== 0.0);
          const hasFailed = registrations.some(r => r.grade === 'F' || r.gradePoint === 0.0);
          
          if (hasPassed) {
            status = 'PASSED';
          } else if (hasFailed) {
            status = 'FAILED';
          } else {
            status = 'MISSING';
          }
        }

        return {
          id: prereqCourse.id,
          code: prereqCourse.code,
          title: prereqCourse.title,
          status
        };
      });

      const failedPrereqs = prereqs.filter(p => p.status === 'FAILED');
      const missingPrereqs = prereqs.filter(p => p.status === 'MISSING');
      
      let enrollmentStatus: 'AVAILABLE' | 'PREREQUISITE_FAILED' | 'PREREQUISITE_MISSING' = 'AVAILABLE';
      let reason = '';

      if (failedPrereqs.length > 0) {
        enrollmentStatus = 'PREREQUISITE_FAILED';
        reason = `You failed prerequisite course(s): ${failedPrereqs.map(p => p.code).join(', ')}`;
      } else if (missingPrereqs.length > 0) {
        enrollmentStatus = 'PREREQUISITE_MISSING';
        reason = `You have not registered or passed prerequisite course(s): ${missingPrereqs.map(p => p.code).join(', ')}`;
      }

      return {
        ...course,
        prerequisites: prereqs,
        enrollmentStatus,
        enrollmentReason: reason
      };
    });

    // Fetch dynamic max units config
    const maxUnitsConfig = await prisma.departmentMaxUnits.findUnique({
      where: {
        departmentId_sessionId_semesterId: {
          departmentId: student.departmentId,
          sessionId: session.id,
          semesterId: semester.id
        }
      }
    });

    const maxUnits = maxUnitsConfig ? maxUnitsConfig.maxUnits : student.department.faculty.maxUnits;

    const requirement = await prisma.programRequirement.findFirst({
      where: {
        programId: student.programId,
        level: student.level,
        semester: activeSemesterNumber
      }
    });
    const minElectives = requirement ? requirement.minElectives : 0;

    return res.json({
      data: evaluatedCourses,
      maxUnits,
      minElectives
    });
  } catch (error: any) {
    console.error('listAvailableCourses error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── SUBMIT COURSE REGISTRATION ───────────────────────────────────────────────
export async function submitCourseRegistration(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { courseIds } = req.body;

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: 'courseIds must be a non-empty array.' });
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        department: {
          include: { faculty: true }
        }
      }
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const { session, semester } = await getActiveAcademicPeriod();
    if (!session || !semester) {
      return res.status(400).json({ error: 'There is no active academic session or semester.' });
    }

    // 1. ENFORCE HOSTEL SELECTION RULE
    const hostelAlloc = await prisma.hostelAllocation.findFirst({
      where: { studentId: student.id, sessionId: session.id }
    });
    const offCampusAlloc = await prisma.offCampusApplication.findFirst({
      where: { studentId: student.id, sessionId: session.id }
    });
    if (!hostelAlloc && !offCampusAlloc) {
      return res.status(400).json({
        error: 'Course registration blocked. You must first select an available hostel block or apply for off-campus accommodation.'
      });
    }

    // 2. ENFORCE FEE PAYMENT THRESHOLD (At least 50% paid for current session/semester)
    const tuitionPayment = await prisma.payment.findFirst({
      where: {
        studentId: student.id,
        sessionId: session.id,
        semesterId: semester.id,
        items: {
          some: {
            feeCategory: {
              name: { contains: 'Tuition', mode: 'insensitive' }
            }
          }
        }
      }
    });

    if (tuitionPayment) {
      const percentagePaid = tuitionPayment.amountPaid / tuitionPayment.amountDue;
      if (percentagePaid < 0.5) {
        return res.status(403).json({
          error: 'Course registration blocked. You must pay at least 50% of your tuition fees for this semester.'
        });
      }
    }

    // Fetch the courses to register
    const coursesToRegister = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      include: {
        prerequisites: {
          include: { prerequisite: true }
        }
      }
    });

    // 3. ENFORCE PREREQUISITE CHECK
    const pastRegistrations = await prisma.registeredCourse.findMany({
      where: {
        registration: {
          studentId: student.id,
          OR: [
            { sessionId: { not: session.id } },
            { semesterId: { not: semester.id } }
          ]
        }
      },
      include: {
        course: true
      }
    });

    for (const course of coursesToRegister) {
      for (const p of course.prerequisites) {
        const prereqCourse = p.prerequisite;
        const registrations = pastRegistrations.filter(r => r.courseId === prereqCourse.id);
        
        const hasPassed = registrations.some(r => r.grade && r.grade !== 'F' && r.gradePoint !== 0.0);
        
        if (!hasPassed) {
          const hasFailed = registrations.some(r => r.grade === 'F' || r.gradePoint === 0.0);
          if (hasFailed) {
            return res.status(400).json({
              error: `Registration blocked. You failed the prerequisite course: ${prereqCourse.code} (${prereqCourse.title}) required for ${course.code}.`
            });
          } else {
            return res.status(400).json({
              error: `Registration blocked. You have not registered or passed the prerequisite course: ${prereqCourse.code} (${prereqCourse.title}) required for ${course.code}.`
            });
          }
        }
      }
    }

    // 3b. ENFORCE CORE AND ELECTIVE RULES
    const activeSemesterNumber = semester.name.toLowerCase().includes('first') ? 1 : 2;

    const departmentCourses = await prisma.course.findMany({
      where: {
        departmentId: student.departmentId,
        level: student.level,
        semester: activeSemesterNumber,
        OR: [
          { programId: null },
          { programId: student.programId }
        ]
      }
    });

    // 1) Ensure all Core courses are selected
    const coreCourses = departmentCourses.filter(c => c.isCore);
    const selectedCourseIdsSet = new Set(courseIds);
    const missingCoreCourses = coreCourses.filter(c => !selectedCourseIdsSet.has(c.id));

    if (missingCoreCourses.length > 0) {
      return res.status(400).json({
        error: `Registration blocked. You must select all core courses: ${missingCoreCourses.map(c => c.code).join(', ')}.`
      });
    }

    // 2) Check minimum electives rule
    const requirement = await prisma.programRequirement.findUnique({
      where: {
        programId_level_semester: {
          programId: student.programId,
          level: student.level,
          semester: activeSemesterNumber
        }
      }
    });

    const minElectives = requirement ? requirement.minElectives : 0;
    if (minElectives > 0) {
      const selectedElectives = coursesToRegister.filter(c => !c.isCore);
      if (selectedElectives.length < minElectives) {
        return res.status(400).json({
          error: `Registration blocked. You must select at least ${minElectives} elective course(s) from the available electives.`
        });
      }
    }

    // 4. ENFORCE MAXIMUM CREDIT UNITS
    const totalUnits = coursesToRegister.reduce((sum, c) => sum + c.creditUnits, 0);
    const maxUnitsConfig = await prisma.departmentMaxUnits.findUnique({
      where: {
        departmentId_sessionId_semesterId: {
          departmentId: student.departmentId,
          sessionId: session.id,
          semesterId: semester.id
        }
      }
    });
    const maxUnitsAllowed = maxUnitsConfig ? maxUnitsConfig.maxUnits : student.department.faculty.maxUnits;
    
    if (totalUnits > maxUnitsAllowed) {
      return res.status(400).json({
        error: `Registration blocked. Total selected credit units (${totalUnits} Units) exceeds the maximum allowed limit of ${maxUnitsAllowed} Units set by the faculty for this semester.`
      });
    }

    // Create course registration
    const registration = await prisma.courseRegistration.create({
      data: {
        studentId: student.id,
        sessionId: session.id,
        semesterId: semester.id,
        level: student.level,
        isApproved: false, // requires admin approval
        courses: {
          create: courseIds.map((courseId: string) => ({
            courseId
          }))
        }
      },
      include: { courses: true }
    });

    return res.status(201).json({
      message: 'Course registration submitted successfully. Awaiting approval.',
      data: registration
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'You have already registered for courses in this semester.' });
    }
    console.error('submitCourseRegistration error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST HOSTELS ─────────────────────────────────────────────────────────────
export async function listHostelsForStudent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const gender = student.gender.toUpperCase() as any;

    const hostels = await prisma.hostel.findMany({
      where: {
        gender: { in: [gender, 'MIXED'] },
        isActive: true
      },
      include: {
        _count: {
          select: {
            allocations: {
              where: { status: { in: ['PENDING', 'APPROVED'] } },
            },
          },
        },
      },
    });

    return res.json({ data: hostels });
  } catch (error: any) {
    console.error('listHostelsForStudent error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── REQUEST HOSTEL ALLOCATION ────────────────────────────────────────────────
export async function requestHostelAllocation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { hostelId } = req.body;

    if (!hostelId) return res.status(400).json({ error: 'hostelId is required.' });

    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const { session } = await getActiveAcademicPeriod();
    if (!session) return res.status(400).json({ error: 'No active academic session.' });

    const hostel = await prisma.hostel.findUnique({
      where: { id: hostelId },
      include: {
        _count: {
          select: {
            allocations: {
              where: { status: { in: ['PENDING', 'APPROVED'] } },
            },
          },
        },
      },
    });

    if (!hostel || !hostel.isActive) {
      return res.status(404).json({ error: 'Hostel is not available.' });
    }

    if (hostel.gender !== 'MIXED' && hostel.gender !== student.gender.toUpperCase()) {
      return res.status(400).json({ error: `This hostel block is gender-restricted to ${hostel.gender}s.` });
    }

    if (hostel._count.allocations >= hostel.totalCapacity || hostel.isLocked) {
      return res.status(400).json({ error: 'Hostel block is fully booked.' });
    }

    // Allocate hostel (marked PENDING; will auto-approve once they complete accommodation fee payment)
    const allocation = await prisma.hostelAllocation.create({
      data: {
        studentId: student.id,
        hostelId: hostel.id,
        sessionId: session.id,
        status: 'PENDING'
      }
    });

    // Check if accommodation fee has already been paid in full
    const accommodationPayment = await prisma.payment.findFirst({
      where: {
        studentId: student.id,
        sessionId: session.id,
        status: 'COMPLETED',
        items: {
          some: {
            feeCategory: {
              name: { contains: 'accommodation', mode: 'insensitive' }
            }
          }
        }
      }
    });

    if (accommodationPayment) {
      // If already paid, auto-approve immediately
      const approvedAllocation = await prisma.hostelAllocation.update({
        where: { id: allocation.id },
        data: { status: 'APPROVED', approvedAt: new Date() }
      });
      return res.status(201).json({
        message: 'Hostel allocation request approved instantly (Accommodation fee already paid).',
        data: approvedAllocation
      });
    }

    return res.status(201).json({
      message: 'Hostel requested successfully. Allocation will approve automatically upon Accommodation fee payment.',
      data: allocation
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'You have already requested a hostel allocation for this academic session.' });
    }
    console.error('requestHostelAllocation error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET STUDENT RESULTS ──────────────────────────────────────────────────────
export async function getStudentResults(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        department: true,
        program: true
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const registrations = await prisma.courseRegistration.findMany({
      where: {
        studentId: student.id,
        isApproved: true
      },
      include: {
        session: true,
        semester: true,
        courses: {
          include: {
            course: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ data: registrations, student });
  } catch (error: any) {
    console.error('getStudentResults error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── SUBMIT OFF-CAMPUS APPLICATION ─────────────────────────────────────────────
export async function submitOffCampusApplication(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { reason, address, landlordName, landlordPhone } = req.body;

    if (!reason || !address) {
      return res.status(400).json({ error: 'Reason and address are required.' });
    }

    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const { session } = await getActiveAcademicPeriod();
    if (!session) return res.status(400).json({ error: 'No active academic session.' });

    const application = await prisma.offCampusApplication.create({
      data: {
        studentId: student.id,
        sessionId: session.id,
        reason,
        address,
        landlordName,
        landlordPhone,
        status: 'PENDING'
      }
    });

    return res.status(201).json({
      message: 'Off-campus accommodation application submitted successfully.',
      data: application
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'You have already submitted an off-campus accommodation application for this academic session.' });
    }
    console.error('submitOffCampusApplication error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
