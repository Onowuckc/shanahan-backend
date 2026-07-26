import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST STUDENTS ────────────────────────────────────────────────────────────
export async function listStudents(req: AuthRequest, res: Response) {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      departmentId,
      facultyId,
      level,
      gender,
      admissionStatus,
      modeOfEntry,
      programType,
      sessionId,
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { matricNumber: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { jambRegNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (departmentId) where.departmentId = departmentId;
    if (level) where.level = parseInt(level);
    if (gender) where.gender = gender.toUpperCase();
    if (admissionStatus) where.admissionStatus = admissionStatus;
    if (modeOfEntry) where.modeOfEntry = modeOfEntry;
    if (programType) where.programType = programType;

    if (facultyId) {
      where.department = { facultyId };
    }

    const [students, total] = await Promise.all([
      prisma.studentProfile.findMany({
        where,
        skip,
        take,
        orderBy: { lastName: 'asc' },
        include: {
          user: { select: { email: true, id: true } },
          department: { include: { faculty: true } },
          program: true,
        },
      }),
      prisma.studentProfile.count({ where }),
    ]);

    return res.json({
      data: students,
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    console.error('listStudents error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET STUDENT BY ID ────────────────────────────────────────────────────────
export async function getStudent(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const student = await prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, id: true, createdAt: true, isEmailVerified: true } },
        department: { include: { faculty: true } },
        program: true,
        payments: {
          include: { semester: true, session: true, items: { include: { feeCategory: true } } },
          orderBy: { createdAt: 'desc' },
        },
        registrations: {
          include: {
            session: true,
            semester: true,
            courses: { include: { course: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        hostelAllocations: {
          include: { hostel: true, session: true },
          orderBy: { allocatedAt: 'desc' },
        },
      },
    });

    if (!student) return res.status(404).json({ error: 'Student not found.' });

    return res.json({ data: student });
  } catch (error: any) {
    console.error('getStudent error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE STUDENT ───────────────────────────────────────────────────────────
export async function updateStudent(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      phoneNumber,
      gender,
      dateOfBirth,
      level,
      departmentId,
      programId,
      passportPhotoUrl,
      residentialAddress,
      country,
      state,
      lga,
      admissionStatus,
      modeOfEntry,
      programType,
      oLevelResultUrl,
      birthCertificateUrl,
      utmeResultUrl,
      jambAdmissionLetterUrl,
      stateOfOriginCertUrl,
      medicalCertUrl,
      guarantorFormUrl,
      docVerificationStatus,
      metadata,
    } = req.body;

    const student = await prisma.studentProfile.findUnique({ where: { id } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const updated = await prisma.studentProfile.update({
      where: { id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(gender && { gender: gender.toUpperCase() }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(level && { level: parseInt(level) }),
        ...(departmentId && { departmentId }),
        ...(programId && { programId }),
        ...(passportPhotoUrl !== undefined && { passportPhotoUrl }),
        ...(residentialAddress !== undefined && { residentialAddress }),
        ...(country !== undefined && { country }),
        ...(state !== undefined && { state }),
        ...(lga !== undefined && { lga }),
        ...(admissionStatus && { admissionStatus }),
        ...(modeOfEntry && { modeOfEntry }),
        ...(programType !== undefined && { programType }),
        ...(oLevelResultUrl !== undefined && { oLevelResultUrl }),
        ...(birthCertificateUrl !== undefined && { birthCertificateUrl }),
        ...(utmeResultUrl !== undefined && { utmeResultUrl }),
        ...(jambAdmissionLetterUrl !== undefined && { jambAdmissionLetterUrl }),
        ...(stateOfOriginCertUrl !== undefined && { stateOfOriginCertUrl }),
        ...(medicalCertUrl !== undefined && { medicalCertUrl }),
        ...(guarantorFormUrl !== undefined && { guarantorFormUrl }),
        ...(docVerificationStatus !== undefined && { docVerificationStatus }),
        ...(metadata !== undefined && { metadata }),
      },
      include: {
        department: { include: { faculty: true } },
        program: true,
        user: { select: { email: true } },
      },
    });

    return res.json({ message: 'Student updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateStudent error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}


// ─── DELETE STUDENT ───────────────────────────────────────────────────────────
export async function deleteStudent(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const student = await prisma.studentProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Cascade delete via user (onDelete: Cascade on StudentProfile)
    await prisma.user.delete({ where: { id: student.userId } });

    return res.json({ message: 'Student deleted successfully.' });
  } catch (error: any) {
    console.error('deleteStudent error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── STUDENT STATS (for dashboard) ───────────────────────────────────────────
export async function studentStats(req: AuthRequest, res: Response) {
  try {
    const [total, byLevel, byGender, byFaculty] = await Promise.all([
      prisma.studentProfile.count(),
      prisma.studentProfile.groupBy({ by: ['level'], _count: { _all: true }, orderBy: { level: 'asc' } }),
      prisma.studentProfile.groupBy({ by: ['gender'], _count: { _all: true } }),
      prisma.department.findMany({
        include: {
          faculty: true,
          _count: { select: { students: true } },
        },
      }),
    ]);

    const facultyStats: Record<string, number> = {};
    for (const dept of byFaculty) {
      const key = dept.faculty.name;
      facultyStats[key] = (facultyStats[key] || 0) + dept._count.students;
    }

    return res.json({
      total,
      byLevel: byLevel.map((l) => ({ level: l.level, count: l._count._all })),
      byGender: byGender.map((g) => ({ gender: g.gender, count: g._count._all })),
      byFaculty: Object.entries(facultyStats).map(([name, count]) => ({ name, count })),
    });
  } catch (error: any) {
    console.error('studentStats error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
