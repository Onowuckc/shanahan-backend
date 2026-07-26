import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST PAYMENTS ────────────────────────────────────────────────────────────
export async function listPayments(req: AuthRequest, res: Response) {
  try {
    const {
      page = '1',
      limit = '20',
      sessionId,
      semesterId,
      status,
      studentId,
      search,
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {};

    if (sessionId) where.sessionId = sessionId;
    if (semesterId) where.semesterId = semesterId;
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;
    if (search) {
      where.OR = [
        {
          student: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { matricNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
        {
          applicant: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { applicationNo: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              matricNumber: true,
              department: { include: { faculty: true } },
            },
          },
          applicant: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              applicationNo: true,
              program: { include: { department: { include: { faculty: true } } } },
            },
          },
          session: true,
          semester: true,
          items: { include: { feeCategory: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return res.json({
      data: payments,
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    console.error('listPayments error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET PAYMENT BY ID ────────────────────────────────────────────────────────
export async function getPayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        student: {
          include: { department: { include: { faculty: true } }, program: true },
        },
        applicant: {
          include: { program: { include: { department: { include: { faculty: true } } } } },
        },
        session: true,
        semester: true,
        items: { include: { feeCategory: true } },
      },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    return res.json({ data: payment });
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── PAYMENT DASHBOARD STATS ──────────────────────────────────────────────────
export async function paymentStats(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.query as Record<string, string>;
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;

    const [allPayments, byStatus] = await Promise.all([
      prisma.payment.aggregate({
        where,
        _sum: { amountDue: true, amountPaid: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { amountPaid: true },
      }),
    ]);

    const totalDue = allPayments._sum.amountDue || 0;
    const totalPaid = allPayments._sum.amountPaid || 0;
    const totalOutstanding = totalDue - totalPaid;

    return res.json({
      totalDue,
      totalPaid,
      totalOutstanding,
      totalRecords: allPayments._count._all,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count._all,
        totalPaid: s._sum.amountPaid || 0,
      })),
    });
  } catch (error: any) {
    console.error('paymentStats error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── MANUAL PAYMENT RECORD (admin-recorded offline payment) ──────────────────
export async function createManualPayment(req: AuthRequest, res: Response) {
  try {
    const { studentId, sessionId, semesterId, amountDue, amountPaid, txReference, items } = req.body;
    if (!studentId || !sessionId || !semesterId || !amountDue) {
      return res.status(400).json({ error: 'studentId, sessionId, semesterId, amountDue are required.' });
    }

    const status = parseFloat(amountPaid) >= parseFloat(amountDue)
      ? 'COMPLETED'
      : parseFloat(amountPaid) > 0 ? 'PARTIAL' : 'PENDING';

    const payment = await prisma.payment.create({
      data: {
        studentId,
        sessionId,
        semesterId,
        amountDue: parseFloat(amountDue),
        amountPaid: parseFloat(amountPaid) || 0,
        status: status as any,
        txReference: txReference || null,
        paymentDate: new Date(),
        items: items
          ? {
              create: items.map((item: any) => ({
                feeCategoryId: item.feeCategoryId,
                amountDue: parseFloat(item.amountDue),
                amountPaid: parseFloat(item.amountPaid) || 0,
              })),
            }
          : undefined,
      },
      include: {
        student: { select: { firstName: true, lastName: true, matricNumber: true } },
        session: true,
        semester: true,
        items: { include: { feeCategory: true } },
      },
    });

    return res.status(201).json({ message: 'Payment record created.', data: payment });
  } catch (error: any) {
    console.error('createManualPayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
