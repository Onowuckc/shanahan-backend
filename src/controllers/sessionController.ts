import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST SESSIONS ────────────────────────────────────────────────────────────
export async function listSessions(_req: AuthRequest, res: Response) {
  try {
    const sessions = await prisma.academicSession.findMany({
      orderBy: { name: 'desc' },
      include: { semesters: { orderBy: { name: 'asc' } } },
    });
    return res.json({ data: sessions });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE SESSION ───────────────────────────────────────────────────────────
export async function createSession(req: AuthRequest, res: Response) {
  try {
    const { name, semesters } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name is required.' });

    const session = await prisma.academicSession.create({
      data: {
        name: name.trim(),
        isCurrent: false,
        semesters: semesters
          ? {
              create: semesters.map((s: { name: string }) => ({
                name: s.name,
                isCurrent: false,
              })),
            }
          : {
              create: [
                { name: 'First', isCurrent: false },
                { name: 'Second', isCurrent: false },
              ],
            },
      },
      include: { semesters: true },
    });
    return res.status(201).json({ message: 'Session created.', data: session });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Session already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── SET CURRENT SESSION ─────────────────────────────────────────────────────
export async function setCurrentSession(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    await prisma.$transaction([
      prisma.academicSession.updateMany({ data: { isCurrent: false } }),
      prisma.academicSession.update({ where: { id }, data: { isCurrent: true } }),
    ]);

    const session = await prisma.academicSession.findUnique({
      where: { id },
      include: { semesters: true },
    });
    return res.json({ message: 'Current session updated.', data: session });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Session not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── SET CURRENT SEMESTER ─────────────────────────────────────────────────────
export async function setCurrentSemester(req: AuthRequest, res: Response) {
  try {
    const { semesterId } = req.params;

    const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) return res.status(404).json({ error: 'Semester not found.' });

    await prisma.$transaction([
      prisma.semester.updateMany({ where: { sessionId: semester.sessionId }, data: { isCurrent: false } }),
      prisma.semester.update({ where: { id: semesterId }, data: { isCurrent: true } }),
    ]);

    return res.json({ message: 'Current semester updated.' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET CURRENT SESSION ──────────────────────────────────────────────────────
export async function getCurrentSession(_req: AuthRequest, res: Response) {
  try {
    const session = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      include: { semesters: true },
    });
    return res.json({ data: session });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
