import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST STAFF ───────────────────────────────────────────────────────────────
export async function listStaff(req: AuthRequest, res: Response) {
  try {
    const { page = '1', limit = '20', search, departmentId } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (departmentId) where.departmentId = departmentId;

    const [staff, total] = await Promise.all([
      prisma.staffProfile.findMany({
        where,
        skip,
        take,
        orderBy: { lastName: 'asc' },
        include: {
          user: { select: { email: true, role: true, isEmailVerified: true } },
          courses: { select: { code: true, title: true } },
        },
      }),
      prisma.staffProfile.count({ where }),
    ]);

    return res.json({
      data: staff,
      meta: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET STAFF BY ID ──────────────────────────────────────────────────────────
export async function getStaff(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const staff = await prisma.staffProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, role: true } },
        courses: { include: { department: true } },
      },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found.' });
    return res.json({ data: staff });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE STAFF ─────────────────────────────────────────────────────────────
export async function updateStaff(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { firstName, lastName, phoneNumber, departmentId, metadata } = req.body;
    const staff = await prisma.staffProfile.update({
      where: { id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(departmentId !== undefined && { departmentId }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    return res.json({ message: 'Staff updated.', data: staff });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Staff not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST COURSES ─────────────────────────────────────────────────────────────
export async function listCourses(req: AuthRequest, res: Response) {
  try {
    const { departmentId, lecturerId, search, level, semester, programId } = req.query as Record<string, string>;
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;
    if (lecturerId) where.lecturerId = lecturerId;
    if (level) where.level = parseInt(level);
    if (semester) where.semester = parseInt(semester);
    if (programId) {
      if (programId === 'null') {
        where.programId = null;
      } else {
        where.programId = programId;
      }
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        department: { include: { faculty: true } },
        lecturer: { select: { firstName: true, lastName: true, staffId: true } },
        _count: { select: { registrations: true } },
        prerequisites: {
          include: {
            prerequisite: true
          }
        },
        program: true
      },
    });
    return res.json({ data: courses });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE COURSE ────────────────────────────────────────────────────────────
export async function createCourse(req: AuthRequest, res: Response) {
  try {
    const { code, title, creditUnits, departmentId, lecturerId, prerequisiteIds, level, semester, isCore, programId } = req.body;
    if (!code || !title || !departmentId) return res.status(400).json({ error: 'code, title, departmentId are required.' });

    const course = await prisma.course.create({
      data: {
        code: code.trim().toUpperCase(),
        title: title.trim(),
        creditUnits: parseInt(creditUnits) || 2,
        departmentId,
        lecturerId: lecturerId || null,
        level: level !== undefined ? parseInt(level) : 100,
        semester: semester !== undefined ? parseInt(semester) : 1,
        isCore: isCore !== undefined ? Boolean(isCore) : true,
        programId: programId || null,
        prerequisites: {
          create: (prerequisiteIds || []).map((pId: string) => ({
            prerequisiteId: pId
          }))
        }
      },
      include: {
        department: { include: { faculty: true } },
        prerequisites: { include: { prerequisite: true } },
        program: true
      },
    });
    return res.status(201).json({ message: 'Course created.', data: course });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Course code already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE COURSE ────────────────────────────────────────────────────────────
export async function updateCourse(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { code, title, creditUnits, lecturerId, prerequisiteIds, level, semester, isCore, programId } = req.body;

    const course = await prisma.$transaction(async (tx) => {
      const updatedCourse = await tx.course.update({
        where: { id },
        data: {
          ...(code && { code: code.trim().toUpperCase() }),
          ...(title && { title: title.trim() }),
          ...(creditUnits && { creditUnits: parseInt(creditUnits) }),
          ...(lecturerId !== undefined && { lecturerId: lecturerId || null }),
          ...(level !== undefined && { level: parseInt(level) }),
          ...(semester !== undefined && { semester: parseInt(semester) }),
          ...(isCore !== undefined && { isCore: Boolean(isCore) }),
          ...(programId !== undefined && { programId: programId || null }),
        },
      });

      if (prerequisiteIds !== undefined) {
        // Delete existing prerequisites
        await tx.coursePrerequisite.deleteMany({
          where: { courseId: id }
        });

        // Insert new ones
        if (Array.isArray(prerequisiteIds) && prerequisiteIds.length > 0) {
          await tx.coursePrerequisite.createMany({
            data: prerequisiteIds.map((pId: string) => ({
              courseId: id,
              prerequisiteId: pId
            }))
          });
        }
      }

      return updatedCourse;
    });

    return res.json({ message: 'Course updated.', data: course });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Course not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST COURSE REGISTRATIONS ────────────────────────────────────────────────
export async function listCourseRegistrations(req: AuthRequest, res: Response) {
  try {
    const { page = '1', limit = '20', sessionId, semesterId, isApproved, studentId } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {};

    if (sessionId) where.sessionId = sessionId;
    if (semesterId) where.semesterId = semesterId;
    if (studentId) where.studentId = studentId;
    if (isApproved !== undefined) where.isApproved = isApproved === 'true';

    const [regs, total] = await Promise.all([
      prisma.courseRegistration.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, matricNumber: true, department: true } },
          session: true,
          semester: true,
          courses: { include: { course: true } },
        },
      }),
      prisma.courseRegistration.count({ where }),
    ]);

    return res.json({
      data: regs,
      meta: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── APPROVE/REJECT COURSE REGISTRATION ──────────────────────────────────────
export async function approveCourseRegistration(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    const reg = await prisma.courseRegistration.update({
      where: { id },
      data: { isApproved: Boolean(isApproved) },
    });
    return res.json({ message: `Registration ${isApproved ? 'approved' : 'rejected'}.`, data: reg });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Registration not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST HOSTELS ─────────────────────────────────────────────────────────────
export async function listHostels(_req: AuthRequest, res: Response) {
  try {
    const hostels = await prisma.hostel.findMany({
      orderBy: { name: 'asc' },
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
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE HOSTEL ────────────────────────────────────────────────────────────
export async function createHostel(req: AuthRequest, res: Response) {
  try {
    const { name, gender, totalCapacity, allowedLevels, description } = req.body;
    if (!name || !gender || !totalCapacity) return res.status(400).json({ error: 'name, gender, totalCapacity required.' });

    const hostel = await prisma.hostel.create({
      data: {
        name: name.trim(),
        gender,
        totalCapacity: parseInt(totalCapacity),
        allowedLevels: allowedLevels || [],
        description: description?.trim(),
      },
    });
    return res.status(201).json({ message: 'Hostel created.', data: hostel });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Hostel name already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE HOSTEL ────────────────────────────────────────────────────────────
export async function updateHostel(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, gender, totalCapacity, allowedLevels, description, isActive } = req.body;

    if (totalCapacity !== undefined) {
      const parsedCapacity = parseInt(totalCapacity);
      if (isNaN(parsedCapacity) || parsedCapacity < 0) {
        return res.status(400).json({ error: 'Capacity must be a positive number.' });
      }

      // Check current active/pending allocations
      const activeAllocationsCount = await prisma.hostelAllocation.count({
        where: {
          hostelId: id,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      });

      if (parsedCapacity < activeAllocationsCount) {
        return res.status(400).json({
          error: `Cannot reduce capacity to ${parsedCapacity} because there are already ${activeAllocationsCount} active or pending student allocations in this block.`,
        });
      }
    }

    const hostel = await prisma.hostel.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(gender && { gender }),
        ...(totalCapacity !== undefined && { totalCapacity: parseInt(totalCapacity) }),
        ...(allowedLevels && { allowedLevels }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.json({ message: 'Hostel updated.', data: hostel });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Hostel not found.' });
    if (error.code === 'P2002') return res.status(400).json({ error: 'Hostel name already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}


// ─── LIST HOSTEL ALLOCATIONS ──────────────────────────────────────────────────
export async function listHostelAllocations(req: AuthRequest, res: Response) {
  try {
    const { sessionId, hostelId, status } = req.query as Record<string, string>;
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (hostelId) where.hostelId = hostelId;
    if (status) where.status = status;

    const allocations = await prisma.hostelAllocation.findMany({
      where,
      orderBy: { allocatedAt: 'desc' },
      include: {
        student: { select: { firstName: true, lastName: true, matricNumber: true } },
        hostel: true,
        session: true,
      },
    });
    return res.json({ data: allocations });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── APPROVE/REJECT HOSTEL ALLOCATION ────────────────────────────────────────
export async function updateHostelAllocation(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const allocation = await prisma.hostelAllocation.update({
      where: { id },
      data: {
        status,
        note: note || null,
        ...(status === 'APPROVED' && { approvedAt: new Date(), approvedById: req.user?.userId }),
      },
    });
    return res.json({ message: 'Allocation updated.', data: allocation });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Allocation not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CUSTOM FIELDS SETTINGS ──────────────────────────────────────────────────
export async function getCustomFields(req: AuthRequest, res: Response) {
  try {
    const { key } = req.query as Record<string, string>;
    if (!key || (key !== 'custom_student_fields' && key !== 'custom_staff_fields')) {
      return res.status(400).json({ error: 'Valid key (custom_student_fields or custom_staff_fields) is required.' });
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key }
    });

    return res.json({ data: setting ? setting.value : [] });
  } catch (error: any) {
    console.error('getCustomFields error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function saveCustomFields(req: AuthRequest, res: Response) {
  try {
    const { key, fields } = req.body;
    if (!key || (key !== 'custom_student_fields' && key !== 'custom_staff_fields')) {
      return res.status(400).json({ error: 'Valid key (custom_student_fields or custom_staff_fields) is required.' });
    }
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: 'fields must be an array.' });
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: fields },
      create: { key, value: fields }
    });

    return res.json({ message: 'Custom fields configuration updated.', data: setting.value });
  } catch (error: any) {
    console.error('saveCustomFields error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET SYSTEM SETTINGS (Receipt branding, defaults, etc.) ──────────────────────
export async function getSystemSettings(req: AuthRequest, res: Response) {
  try {
    const settings = await prisma.systemSetting.findMany();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
    return res.json({ data: settingsMap });
  } catch (error: any) {
    console.error('getSystemSettings error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE SYSTEM SETTINGS ──────────────────────────────────────────────────────
export async function updateSystemSettings(req: AuthRequest, res: Response) {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object is required.' });
    }

    for (const [key, value] of Object.entries(settings)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: value as any },
        create: { key, value: value as any },
      });
    }

    const updated = await prisma.systemSetting.findMany();
    const settingsMap = updated.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);

    return res.json({ message: 'System settings updated.', data: settingsMap });
  } catch (error: any) {
    console.error('updateSystemSettings error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST SCORE CONFIGURATIONS ───────────────────────────────────────────────────
export async function listScoreConfigs(_req: AuthRequest, res: Response) {
  try {
    const configs = await prisma.scoreConfig.findMany();
    return res.json({ data: configs });
  } catch (error: any) {
    console.error('listScoreConfigs error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPSERT SCORE CONFIGURATION ──────────────────────────────────────────────────
export async function upsertScoreConfig(req: AuthRequest, res: Response) {
  try {
    const { scope, scopeId, caMax, examMax } = req.body;
    if (!scope) {
      return res.status(400).json({ error: 'scope is required.' });
    }

    const actualScopeId = scope === 'SYSTEM' ? 'SYSTEM' : scopeId;
    if (!actualScopeId) {
      return res.status(400).json({ error: 'scopeId is required for non-system scopes.' });
    }

    const config = await prisma.scoreConfig.upsert({
      where: {
        scope_scopeId: {
          scope,
          scopeId: actualScopeId,
        },
      },
      update: {
        caMax: parseFloat(caMax) || 40,
        examMax: parseFloat(examMax) || 60,
      },
      create: {
        scope,
        scopeId: actualScopeId,
        caMax: parseFloat(caMax) || 40,
        examMax: parseFloat(examMax) || 60,
      },
    });

    return res.json({ message: 'Score configuration saved.', data: config });
  } catch (error: any) {
    console.error('upsertScoreConfig error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── DELETE SCORE CONFIGURATION EXCEPTION ────────────────────────────────────────
export async function deleteScoreConfig(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    await prisma.scoreConfig.delete({
      where: { id },
    });
    return res.json({ message: 'Score configuration exception deleted.' });
  } catch (error: any) {
    console.error('deleteScoreConfig error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── HELPER FOR SCORE & GRADE CALCULATION ───────────────────────────────────────
function calculateGradeAndPoints(totalScore: number) {
  if (totalScore >= 70) return { grade: 'A', gradePoint: 5.0 };
  if (totalScore >= 60) return { grade: 'B', gradePoint: 4.0 };
  if (totalScore >= 50) return { grade: 'C', gradePoint: 3.0 };
  if (totalScore >= 45) return { grade: 'D', gradePoint: 2.0 };
  if (totalScore >= 40) return { grade: 'E', gradePoint: 1.0 };
  return { grade: 'F', gradePoint: 0.0 };
}

async function getCourseScoreConfig(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { department: true }
  });
  if (!course) return { caMax: 40, examMax: 60 };

  // 1. Course scope
  const courseCfg = await prisma.scoreConfig.findFirst({
    where: { scope: 'COURSE', scopeId: course.id }
  });
  if (courseCfg) return courseCfg;

  // 2. Department scope
  const deptCfg = await prisma.scoreConfig.findFirst({
    where: { scope: 'DEPARTMENT', scopeId: course.departmentId }
  });
  if (deptCfg) return deptCfg;

  // 3. Faculty scope
  const facultyCfg = await prisma.scoreConfig.findFirst({
    where: { scope: 'FACULTY', scopeId: course.department.facultyId }
  });
  if (facultyCfg) return facultyCfg;

  // 4. System scope
  const systemCfg = await prisma.scoreConfig.findFirst({
    where: { scope: 'SYSTEM' }
  });
  if (systemCfg) return systemCfg;

  return { caMax: 40, examMax: 60 };
}

// ─── GET COURSE ENROLLMENTS ──────────────────────────────────────────────────
export async function getCourseEnrollments(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const enrollments = await prisma.registeredCourse.findMany({
      where: {
        courseId: id,
        registration: {
          isApproved: true
        }
      },
      include: {
        registration: {
          include: {
            student: {
              include: {
                department: true
              }
            }
          }
        }
      },
      orderBy: {
        registration: {
          student: {
            lastName: 'asc'
          }
        }
      }
    });

    const data = enrollments.map(e => ({
      registeredCourseId: e.id,
      studentId: e.registration.student.id,
      matricNumber: e.registration.student.matricNumber,
      firstName: e.registration.student.firstName,
      lastName: e.registration.student.lastName,
      level: e.registration.student.level,
      departmentName: e.registration.student.department.name,
      caScore: e.caScore,
      examScore: e.examScore,
      grade: e.grade,
      gradePoint: e.gradePoint
    }));

    return res.json({ data });
  } catch (error: any) {
    console.error('getCourseEnrollments error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE COURSE GRADES ───────────────────────────────────────────────────
export async function updateCourseGrades(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // courseId
    const { grades } = req.body; // array of { registeredCourseId, caScore, examScore }

    if (!Array.isArray(grades)) {
      return res.status(400).json({ error: 'grades must be an array.' });
    }

    const config = await getCourseScoreConfig(id);

    const results = [];
    for (const item of grades) {
      const { registeredCourseId, caScore, examScore } = item;
      if (!registeredCourseId) continue;

      const parsedCa = caScore !== undefined && caScore !== null && caScore !== '' ? parseFloat(caScore) : null;
      const parsedExam = examScore !== undefined && examScore !== null && examScore !== '' ? parseFloat(examScore) : null;

      // Validate scores against limits
      if (parsedCa !== null && (parsedCa < 0 || parsedCa > config.caMax)) {
        return res.status(400).json({ error: `CA score must be between 0 and ${config.caMax}.` });
      }
      if (parsedExam !== null && (parsedExam < 0 || parsedExam > config.examMax)) {
        return res.status(400).json({ error: `Exam score must be between 0 and ${config.examMax}.` });
      }

      let grade = null;
      let gradePoint = null;

      if (parsedCa !== null && parsedExam !== null) {
        const total = parsedCa + parsedExam;
        const gradeCalc = calculateGradeAndPoints(total);
        grade = gradeCalc.grade;
        gradePoint = gradeCalc.gradePoint;
      }

      const updated = await prisma.registeredCourse.update({
        where: { id: registeredCourseId },
        data: {
          caScore: parsedCa,
          examScore: parsedExam,
          grade,
          gradePoint
        }
      });
      results.push(updated);
    }

    return res.json({ message: 'Grades updated successfully.', data: results });
  } catch (error: any) {
    console.error('updateCourseGrades error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

