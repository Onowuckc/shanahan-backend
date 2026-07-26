import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../prisma';

/**
 * Static Role-Based Access Control middleware for backward compatibility.
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const userRoles = req.user.roles || [req.user.role];
    const hasRole = userRoles.some(r => allowedRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        error: `Forbidden. This action requires one of the following roles: ${allowedRoles.join(', ')}.`
      });
    }

    next();
  };
}

/**
 * Dynamic Access Control middleware that checks the dynamic `rbac_permissions` setting.
 * Supports action parameters: 'read' | 'write' | 'delete'
 * Allows the Super Admin to restrict specific user logins (usernames or emails) from features.
 */
export function checkAccess(feature: string, requiredAction: 'read' | 'write' | 'delete' = 'read') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
      }

      const userRoles = req.user.roles || [req.user.role];
      const userLogin = req.user.username; // Staff ID / username

      // Fetch user's email from DB to compare
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { email: true }
      });
      const userEmail = dbUser?.email || '';

      // SUPER_ADMIN has access to everything and cannot be restricted
      if (userRoles.includes('SUPER_ADMIN')) {
        return next();
      }

      // Load permissions config from SystemSetting table
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'rbac_permissions' }
      });

      let permissions = setting ? (setting.value as any) : null;
      if (!permissions || !permissions.features) {
        // Dynamic fallback logic matching Section 7 spec if DB isn't seeded/reachable yet
        permissions = {
          features: {
            students: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            admissions: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'ADMISSIONS_STAFF', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'ADMISSIONS_STAFF'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            staff: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            finance: {
              readRoles: ['SUPER_ADMIN', 'BURSARY_STAFF', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'BURSARY_STAFF'],
              deleteRoles: ['SUPER_ADMIN', 'BURSARY_STAFF'],
              deniedLogins: []
            },
            academic_setup: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            academic_records: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'EXAMS_RECORDS_STAFF'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            hostels: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF', 'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN', 'HOSTEL_ADMIN', 'STUDENT_AFFAIRS_STAFF'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            user_management: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            settings: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            },
            audit_logs: {
              readRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              writeRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deleteRoles: ['SUPER_ADMIN', 'ICT_ADMIN'],
              deniedLogins: []
            }
          }
        };
      }

      const featureConfig = permissions.features[feature];
      if (!featureConfig) {
        // Fallback safety restriction
        if (userRoles.some(r => ['SUPER_ADMIN', 'ICT_ADMIN'].includes(r))) {
          return next();
        }
        return res.status(403).json({ error: 'Forbidden. Dynamic access restriction applies.' });
      }

      // Determine which roles are authorized based on action
      let allowedRoles: string[] = featureConfig.readRoles || [];
      if (requiredAction === 'write') allowedRoles = featureConfig.writeRoles || [];
      if (requiredAction === 'delete') allowedRoles = featureConfig.deleteRoles || [];

      const isRoleAllowed = userRoles.some(r => allowedRoles.includes(r));

      // Check if user login (email or staff ID) is explicitly restricted (denied)
      const isLoginDenied = (featureConfig.deniedLogins || []).some(
        (login: string) =>
          login.toLowerCase() === userLogin.toLowerCase() ||
          login.toLowerCase() === userEmail.toLowerCase()
      );

      if (isRoleAllowed && !isLoginDenied) {
        return next();
      }

      return res.status(403).json({
        error: `Forbidden. Your roles (${userRoles.join(', ')}) or specific account login is restricted from accessing this feature (${feature}:${requiredAction}).`
      });
    } catch (error) {
      console.error('checkAccess middleware error:', error);
      return res.status(500).json({ error: 'Internal server error during authorization verification.' });
    }
  };
}
