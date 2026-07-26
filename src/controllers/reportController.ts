import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── DASHBOARD OVERVIEW ───────────────────────────────────────────────────────
export async function getDashboardStats(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.query as Record<string, string>;

    const paymentWhere: any = {};
    if (sessionId) paymentWhere.sessionId = sessionId;

    const [
      totalStudents,
      totalStaff,
      totalFaculties,
      totalDepartments,
      paymentAgg,
      pendingRegistrations,
      pendingHostelAllocations,
      recentPayments,
      studentsByLevel,
      paymentsByStatus,
    ] = await Promise.all([
      prisma.studentProfile.count(),
      prisma.staffProfile.count(),
      prisma.faculty.count(),
      prisma.department.count(),
      prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amountDue: true, amountPaid: true },
        _count: { _all: true },
      }),
      prisma.courseRegistration.count({ where: { isApproved: false } }),
      prisma.hostelAllocation.count({ where: { status: 'PENDING' } }),
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          student: { select: { firstName: true, lastName: true, matricNumber: true } },
          session: true,
          semester: true,
        },
      }),
      prisma.studentProfile.groupBy({ by: ['level'], _count: { _all: true }, orderBy: { level: 'asc' } }),
      prisma.payment.groupBy({
        by: ['status'],
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amountPaid: true },
      }),
    ]);

    const totalDue = paymentAgg._sum.amountDue || 0;
    const totalPaid = paymentAgg._sum.amountPaid || 0;

    return res.json({
      overview: {
        totalStudents,
        totalStaff,
        totalFaculties,
        totalDepartments,
        totalPaymentRecords: paymentAgg._count._all,
        pendingRegistrations,
        pendingHostelAllocations,
      },
      financials: {
        totalDue,
        totalPaid,
        totalOutstanding: totalDue - totalPaid,
        collectionRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
      },
      charts: {
        studentsByLevel: studentsByLevel.map((l) => ({ level: `${l.level}L`, count: l._count._all })),
        paymentsByStatus: paymentsByStatus.map((s) => ({
          status: s.status,
          count: s._count._all,
          amount: s._sum.amountPaid || 0,
        })),
      },
      recentPayments,
    });
  } catch (error: any) {
    console.error('getDashboardStats error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
export async function listAuditLogs(req: AuthRequest, res: Response) {
  try {
    const { page = '1', limit = '50', userId, action, entityType } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, username: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      data: logs,
      meta: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE AUDIT LOG (internal utility) ─────────────────────────────────────
export async function createAuditLog(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: string,
  ipAddress?: string
) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, details, ipAddress },
    });
  } catch (_) {
    // Non-blocking — audit log failure should not break core operations
  }
}
