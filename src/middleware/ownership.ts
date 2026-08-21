import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../prisma';

/**
 * Middleware to enforce Indirect Object Reference (IDOR) protection.
 * Ensures student portal users can only access/modify their own student profile data.
 * Staff and Admin roles bypass this check based on RBAC permissions.
 */
export async function verifyStudentOwnership(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const userRoles = req.user.roles || [req.user.role];

    // Staff and Admin roles are granted access subject to RBAC checks
    const isStaffOrAdmin = userRoles.some(r =>
      ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'].includes(r)
    );

    if (isStaffOrAdmin) {
      return next();
    }

    // For STUDENT role, verify target student ID matches logged-in user's profile
    const targetStudentId = req.params.id || req.body.studentId;

    if (!targetStudentId) {
      return next();
    }

    const currentStudentProfile = await prisma.studentProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true }
    });

    if (!currentStudentProfile || currentStudentProfile.id !== targetStudentId) {
      return res.status(403).json({
        error: 'Forbidden. Access denied: You do not have permission to access another student profile.'
      });
    }

    next();
  } catch (error) {
    console.error('verifyStudentOwnership middleware error:', error);
    return res.status(500).json({ error: 'Internal server error verifying data ownership.' });
  }
}
