import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST FACULTIES ───────────────────────────────────────────────────────────
export async function listFaculties(_req: AuthRequest, res: Response) {
  try {
    const faculties = await prisma.faculty.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { departments: true } },
      },
    });
    return res.json({ data: faculties });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET FACULTY BY ID ────────────────────────────────────────────────────────
export async function getFaculty(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const faculty = await prisma.faculty.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
            programs: true,
            _count: { select: { students: true } },
          },
        },
      },
    });
    if (!faculty) return res.status(404).json({ error: 'Faculty not found.' });
    return res.json({ data: faculty });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE FACULTY ───────────────────────────────────────────────────────────
export async function createFaculty(req: AuthRequest, res: Response) {
  try {
    const { name, code, maxUnits } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required.' });

    const faculty = await prisma.faculty.create({
      data: { 
        name: name.trim(), 
        code: code.trim().toUpperCase(),
        maxUnits: maxUnits !== undefined ? parseInt(maxUnits) : 24
      },
    });
    return res.status(201).json({ message: 'Faculty created.', data: faculty });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Faculty name or code already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE FACULTY ───────────────────────────────────────────────────────────
export async function updateFaculty(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, code, maxUnits } = req.body;

    const faculty = await prisma.faculty.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(code && { code: code.trim().toUpperCase() }),
        ...(maxUnits !== undefined && { maxUnits: parseInt(maxUnits) }),
      },
    });
    return res.json({ message: 'Faculty updated.', data: faculty });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Faculty not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── DELETE FACULTY ───────────────────────────────────────────────────────────
export async function deleteFaculty(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const deptCount = await prisma.department.count({ where: { facultyId: id } });
    if (deptCount > 0) {
      return res.status(400).json({ error: 'Cannot delete faculty with existing departments.' });
    }
    await prisma.faculty.delete({ where: { id } });
    return res.json({ message: 'Faculty deleted.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Faculty not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST DEPARTMENTS ─────────────────────────────────────────────────────────
export async function listDepartments(req: AuthRequest, res: Response) {
  try {
    const { facultyId } = req.query as Record<string, string>;
    const where: any = {};
    if (facultyId) where.facultyId = facultyId;

    const departments = await prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        faculty: true,
        programs: true,
        _count: { select: { students: true } },
      },
    });
    return res.json({ data: departments });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET DEPARTMENT BY ID ─────────────────────────────────────────────────────
export async function getDepartment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const dept = await prisma.department.findUnique({
      where: { id },
      include: {
        faculty: true,
        programs: true,
        _count: { select: { students: true, courses: true } },
      },
    });
    if (!dept) return res.status(404).json({ error: 'Department not found.' });
    return res.json({ data: dept });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE DEPARTMENT ────────────────────────────────────────────────────────
export async function createDepartment(req: AuthRequest, res: Response) {
  try {
    const { name, code, facultyId } = req.body;
    if (!name || !code || !facultyId) {
      return res.status(400).json({ error: 'name, code, and facultyId are required.' });
    }
    const dept = await prisma.department.create({
      data: { name: name.trim(), code: code.trim(), facultyId },
      include: { faculty: true },
    });
    return res.status(201).json({ message: 'Department created.', data: dept });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Department name or code already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE DEPARTMENT ────────────────────────────────────────────────────────
export async function updateDepartment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, code, facultyId } = req.body;
    const dept = await prisma.department.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(code && { code: code.trim() }),
        ...(facultyId && { facultyId }),
      },
      include: { faculty: true },
    });
    return res.json({ message: 'Department updated.', data: dept });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Department not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST PROGRAMS ────────────────────────────────────────────────────────────
export async function listPrograms(req: AuthRequest, res: Response) {
  try {
    const { departmentId } = req.query as Record<string, string>;
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;

    const programs = await prisma.program.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        department: { include: { faculty: true } },
        _count: { select: { students: true } },
      },
    });
    return res.json({ data: programs });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE PROGRAM ───────────────────────────────────────────────────────────
export async function createProgram(req: AuthRequest, res: Response) {
  try {
    const { name, departmentId, duration } = req.body;
    if (!name || !departmentId) return res.status(400).json({ error: 'name and departmentId are required.' });

    const program = await prisma.program.create({
      data: { name: name.trim(), departmentId, duration: parseInt(duration) || 4 },
      include: { department: { include: { faculty: true } } },
    });
    return res.status(201).json({ message: 'Program created.', data: program });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Program already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE PROGRAM ───────────────────────────────────────────────────────────
export async function updateProgram(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, departmentId, duration } = req.body;
    const program = await prisma.program.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(departmentId && { departmentId }),
        ...(duration && { duration: parseInt(duration) }),
      },
      include: { department: { include: { faculty: true } } },
    });
    return res.json({ message: 'Program updated.', data: program });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Program not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── LIST PROGRAM O'LEVEL REQUIREMENTS ───────────────────────────────────────────
export async function listProgrammeOLevelReqs(_req: AuthRequest, res: Response) {
  try {
    const reqs = await prisma.programmeOLevelRequirement.findMany({
      include: {
        program: {
          include: {
            department: { include: { faculty: true } },
          },
        },
      },
    });
    return res.json({ data: reqs });
  } catch (error: any) {
    console.error('listProgrammeOLevelReqs error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPSERT PROGRAM O'LEVEL REQUIREMENT ──────────────────────────────────────────
export async function upsertProgrammeOLevelReqs(req: AuthRequest, res: Response) {
  try {
    const { programId, minCredits, requireMath, requireEnglish, notes } = req.body;
    if (!programId) {
      return res.status(400).json({ error: 'programId is required.' });
    }

    const reqs = await prisma.programmeOLevelRequirement.upsert({
      where: { programId },
      update: {
        minCredits: minCredits !== undefined ? parseInt(minCredits) : 5,
        requireMath: !!requireMath,
        requireEnglish: !!requireEnglish,
        notes: notes || null,
      },
      create: {
        programId,
        minCredits: minCredits !== undefined ? parseInt(minCredits) : 5,
        requireMath: !!requireMath,
        requireEnglish: !!requireEnglish,
        notes: notes || null,
      },
      include: {
        program: true,
      },
    });

    return res.json({ message: "O'Level requirement updated.", data: reqs });
  } catch (error: any) {
    console.error('upsertProgrammeOLevelReqs error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET DEPARTMENT MAX UNITS ────────────────────────────────────────────────
export async function getDepartmentMaxUnits(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // departmentId
    const { sessionId, semesterId } = req.query as Record<string, string>;

    if (!sessionId || !semesterId) {
      return res.status(400).json({ error: 'sessionId and semesterId are required.' });
    }

    const config = await prisma.departmentMaxUnits.findUnique({
      where: {
        departmentId_sessionId_semesterId: {
          departmentId: id,
          sessionId,
          semesterId
        }
      }
    });

    return res.json({ data: config || { departmentId: id, sessionId, semesterId, maxUnits: 24 } });
  } catch (error: any) {
    console.error('getDepartmentMaxUnits error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE DEPARTMENT MAX UNITS ─────────────────────────────────────────────
export async function updateDepartmentMaxUnits(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // departmentId
    const { sessionId, semesterId, maxUnits } = req.body;

    if (!sessionId || !semesterId || maxUnits === undefined) {
      return res.status(400).json({ error: 'sessionId, semesterId, and maxUnits are required.' });
    }

    const parsedMaxUnits = parseInt(maxUnits);
    if (isNaN(parsedMaxUnits) || parsedMaxUnits <= 0) {
      return res.status(400).json({ error: 'maxUnits must be a valid positive number.' });
    }

    const config = await prisma.departmentMaxUnits.upsert({
      where: {
        departmentId_sessionId_semesterId: {
          departmentId: id,
          sessionId,
          semesterId
        }
      },
      update: { maxUnits: parsedMaxUnits },
      create: {
        departmentId: id,
        sessionId,
        semesterId,
        maxUnits: parsedMaxUnits
      }
    });

    return res.json({ message: 'Maximum units limit updated successfully.', data: config });
  } catch (error: any) {
    console.error('updateDepartmentMaxUnits error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── PROGRAM REQUIREMENTS (ELECTIVE RULES) ──────────────────────────────────
export async function listProgramRequirements(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // programId
    const reqs = await prisma.programRequirement.findMany({
      where: { programId: id },
      orderBy: [{ level: 'asc' }, { semester: 'asc' }]
    });
    return res.json({ data: reqs });
  } catch (error: any) {
    console.error('listProgramRequirements error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function updateProgramRequirement(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // programId
    const { level, semester, minElectives } = req.body;

    if (level === undefined || semester === undefined || minElectives === undefined) {
      return res.status(400).json({ error: 'level, semester, and minElectives are required.' });
    }

    const requirement = await prisma.programRequirement.upsert({
      where: {
        programId_level_semester: {
          programId: id,
          level: parseInt(level),
          semester: parseInt(semester)
        }
      },
      update: {
        minElectives: parseInt(minElectives)
      },
      create: {
        programId: id,
        level: parseInt(level),
        semester: parseInt(semester),
        minElectives: parseInt(minElectives)
      }
    });

    return res.json({ message: 'Program requirements updated successfully.', data: requirement });
  } catch (error: any) {
    console.error('updateProgramRequirement error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

