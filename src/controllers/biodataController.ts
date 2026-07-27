import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

/**
 * Student submits a request to update their name or biodata with supporting documents.
 */
export async function submitBiodataRequest(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student profile not found.' });

    const { requestedData, reason, documentUrl } = req.body;

    if (!requestedData || typeof requestedData !== 'object' || Object.keys(requestedData).length === 0) {
      return res.status(400).json({ error: 'Requested biodata changes are required.' });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for biodata change request is required.' });
    }

    // Check if there is already a pending request
    const existingPending = await prisma.biodataChangeRequest.findFirst({
      where: {
        studentId: student.id,
        status: 'PENDING'
      }
    });

    if (existingPending) {
      return res.status(400).json({
        error: 'You already have a pending biodata change request awaiting admin review.'
      });
    }

    const request = await prisma.biodataChangeRequest.create({
      data: {
        studentId: student.id,
        requestedData,
        reason: reason.trim(),
        documentUrl: documentUrl || null,
        status: 'PENDING'
      }
    });

    return res.status(201).json({
      message: 'Biodata change request submitted successfully. It will be reviewed by Registry/Admin.',
      request
    });
  } catch (error: any) {
    console.error('submitBiodataRequest error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

/**
 * Student fetches their own biodata change request history.
 */
export async function getMyBiodataRequests(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student profile not found.' });

    const requests = await prisma.biodataChangeRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ requests });
  } catch (error: any) {
    console.error('getMyBiodataRequests error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

/**
 * Admin / Registry fetches all biodata change requests across students.
 */
export async function getAdminBiodataRequests(req: AuthRequest, res: Response) {
  try {
    const { status } = req.query;

    const where: any = {};
    if (status && (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED')) {
      where.status = status;
    }

    const requests = await prisma.biodataChangeRequest.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { email: true, username: true } },
            department: { select: { name: true, code: true } },
            program: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ requests });
  } catch (error: any) {
    console.error('getAdminBiodataRequests error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

/**
 * Admin / Registry approves a student's biodata change request.
 */
export async function approveBiodataRequest(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const adminUserId = req.user?.userId;

    const request = await prisma.biodataChangeRequest.findUnique({
      where: { id },
      include: { student: true }
    });

    if (!request) {
      return res.status(404).json({ error: 'Biodata change request not found.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request has already been processed (${request.status}).` });
    }

    const requestedData = request.requestedData as Record<string, any>;
    if (!requestedData) {
      return res.status(400).json({ error: 'Invalid requested data.' });
    }

    // Extract allowed fields to update
    const studentUpdateData: any = {};
    const userUpdateData: any = {};

    if (requestedData.firstName) {
      studentUpdateData.firstName = String(requestedData.firstName).trim();
      userUpdateData.firstName = String(requestedData.firstName).trim();
    }
    if (requestedData.lastName) {
      studentUpdateData.lastName = String(requestedData.lastName).trim();
      userUpdateData.lastName = String(requestedData.lastName).trim();
    }
    if (requestedData.gender) {
      studentUpdateData.gender = String(requestedData.gender).toUpperCase();
    }
    if (requestedData.dateOfBirth) {
      studentUpdateData.dateOfBirth = new Date(requestedData.dateOfBirth);
    }
    if (requestedData.phoneNumber) {
      studentUpdateData.phoneNumber = String(requestedData.phoneNumber).trim();
    }
    if (requestedData.state) {
      studentUpdateData.state = String(requestedData.state).trim();
    }
    if (requestedData.lga) {
      studentUpdateData.lga = String(requestedData.lga).trim();
    }
    if (requestedData.residentialAddress) {
      studentUpdateData.residentialAddress = String(requestedData.residentialAddress).trim();
    }

    // Perform atomic transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update Student Profile
      await tx.studentProfile.update({
        where: { id: request.studentId },
        data: studentUpdateData
      });

      // 2. Update User if name fields changed
      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: request.student.userId },
          data: userUpdateData
        });
      }

      // 3. Mark Biodata Request as APPROVED
      await tx.biodataChangeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          adminNote: adminNote || 'Approved by Registry.',
          reviewedById: adminUserId || null
        }
      });

      // 4. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: adminUserId || request.student.userId,
          action: 'APPROVE_BIODATA_CHANGE',
          entityType: 'BiodataChangeRequest',
          entityId: id,
          details: JSON.stringify({ studentId: request.studentId, changes: requestedData })
        }
      });
    });

    return res.status(200).json({ message: 'Biodata change request approved and student profile updated.' });
  } catch (error: any) {
    console.error('approveBiodataRequest error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

/**
 * Admin / Registry rejects a student's biodata change request.
 */
export async function rejectBiodataRequest(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const adminUserId = req.user?.userId;

    const request = await prisma.biodataChangeRequest.findUnique({ where: { id } });
    if (!request) {
      return res.status(404).json({ error: 'Biodata change request not found.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request has already been processed (${request.status}).` });
    }

    await prisma.biodataChangeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote: adminNote || 'Rejected by Registry.',
        reviewedById: adminUserId || null
      }
    });

    return res.status(200).json({ message: 'Biodata change request rejected.' });
  } catch (error: any) {
    console.error('rejectBiodataRequest error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}
