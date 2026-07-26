import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── FEE CATEGORIES ───────────────────────────────────────────────────────────
export async function listFeeCategories(_req: AuthRequest, res: Response) {
  try {
    const categories = await prisma.feeCategory.findMany({ orderBy: { name: 'asc' } });
    return res.json({ data: categories });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function createFeeCategory(req: AuthRequest, res: Response) {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const cat = await prisma.feeCategory.create({
      data: { name: name.trim(), description: description?.trim() },
    });
    return res.status(201).json({ message: 'Fee category created.', data: cat });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Fee category already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function updateFeeCategory(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const cat = await prisma.feeCategory.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return res.json({ message: 'Fee category updated.', data: cat });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Fee category not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── FEE STRUCTURES ───────────────────────────────────────────────────────────
export async function listFeeStructures(req: AuthRequest, res: Response) {
  try {
    const { sessionId, semesterId, departmentId, facultyId, level } = req.query as Record<string, string>;
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (semesterId) where.semesterId = semesterId;
    if (departmentId) where.departmentId = departmentId;
    if (facultyId) where.facultyId = facultyId;
    if (level) where.level = parseInt(level);

    const structures = await prisma.feeStructure.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        feeCategory: true,
        session: true,
        semester: true,
        faculty: true,
        department: true,
      },
    });
    return res.json({ data: structures });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function createFeeStructure(req: AuthRequest, res: Response) {
  try {
    const { feeCategoryId, sessionId, semesterId, level, facultyId, departmentId, amount } = req.body;
    if (!feeCategoryId || !sessionId || !semesterId || !amount) {
      return res.status(400).json({ error: 'feeCategoryId, sessionId, semesterId, amount are required.' });
    }
    const structure = await prisma.feeStructure.create({
      data: {
        feeCategoryId,
        sessionId,
        semesterId,
        level: level ? parseInt(level) : null,
        facultyId: facultyId || null,
        departmentId: departmentId || null,
        amount: parseFloat(amount),
      },
      include: { feeCategory: true, session: true, semester: true, faculty: true, department: true },
    });
    return res.status(201).json({ message: 'Fee structure created.', data: structure });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'A fee structure with this combination already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function updateFeeStructure(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { amount, isActive } = req.body;
    const structure = await prisma.feeStructure.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { feeCategory: true, session: true, semester: true },
    });
    return res.json({ message: 'Fee structure updated.', data: structure });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Fee structure not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function deleteFeeStructure(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    await prisma.feeStructure.delete({ where: { id } });
    return res.json({ message: 'Fee structure deleted.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Fee structure not found.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
