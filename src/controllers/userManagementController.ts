import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';
import { createAuditLog } from './reportController';

// ─── LIST ADMIN/STAFF USERS ───────────────────────────────────────────────────
export async function listAdminUsers(req: AuthRequest, res: Response) {
  try {
    const { role, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {
      user: {
        role: {
          // Exclude plain students and applicants from the admin user list
          notIn: ['STUDENT', 'APPLICANT']
        }
      }
    };

    if (role) where.user.role = role;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.staffProfile.findMany({
        where,
        skip,
        take,
        orderBy: { staffId: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              roles: true,
              isEmailVerified: true,
              isClaimed: true,
              isFirstLogin: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.staffProfile.count({ where })
    ]);

    return res.json({
      data: staff,
      meta: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) }
    });
  } catch (error: any) {
    console.error('listAdminUsers error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── CREATE NEW ADMIN USER ────────────────────────────────────────────────────
export async function createAdminUser(req: AuthRequest, res: Response) {
  try {
    const { firstName, lastName, email, staffId, role, roles, phoneNumber, departmentId } = req.body;

    if (!firstName || !lastName || !email || !staffId || (!role && !roles)) {
      return res.status(400).json({ error: 'firstName, lastName, email, staffId, and role/roles are required.' });
    }

    let finalRole = role;
    let finalRoles = roles;
    if (roles && Array.isArray(roles)) {
      if (roles.length === 0) {
        return res.status(400).json({ error: 'At least one role must be assigned.' });
      }
      finalRole = roles[0];
      finalRoles = roles;
    } else if (role) {
      finalRole = role;
      finalRoles = [role];
    }

    // Validate roles — cannot create STUDENT or APPLICANT via this endpoint
    const forbiddenRoles = ['STUDENT', 'APPLICANT'];
    if (finalRoles.some((r: any) => forbiddenRoles.includes(r))) {
      return res.status(400).json({ error: 'Cannot assign STUDENT or APPLICANT roles via this endpoint.' });
    }

    const emailClean = email.trim().toLowerCase();

    // Check duplicates
    const existingEmail = await prisma.user.findUnique({ where: { email: emailClean } });
    if (existingEmail) return res.status(400).json({ error: 'Email already in use.' });

    const existingStaffId = await prisma.staffProfile.findUnique({ where: { staffId } });
    if (existingStaffId) return res.status(400).json({ error: 'Staff ID already in use.' });

    // Use the default seed password from env
    const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe@2025!';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailClean,
          username: staffId.trim().toUpperCase(),
          password: hashedPassword,
          role: finalRole,
          roles: finalRoles,
          isEmailVerified: true,
          isClaimed: false,
          isFirstLogin: true // Must change password on first login
        }
      });

      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          staffId: staffId.trim().toUpperCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber?.trim() || null,
          departmentId: departmentId || null
        }
      });

      return { user, profile };
    });

    return res.status(201).json({
      message: 'Admin user created. They must change their password on first login.',
      data: {
        staffId: result.profile.staffId,
        email: result.user.email,
        role: result.user.role,
        roles: result.user.roles,
        firstName: result.profile.firstName,
        lastName: result.profile.lastName,
        defaultPassword: '(see SEED_DEFAULT_PASSWORD in server .env)'
      }
    });
  } catch (error: any) {
    console.error('createAdminUser error:', error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Duplicate email or staff ID.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE USER ROLE ─────────────────────────────────────────────────────────
export async function updateUserRole(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // User.id (UUID)
    const { role, roles } = req.body;

    if (!role && !roles) return res.status(400).json({ error: 'role or roles is required.' });

    let finalRole = role;
    let finalRoles = roles;
    if (roles && Array.isArray(roles)) {
      if (roles.length === 0) {
        return res.status(400).json({ error: 'At least one role must be assigned.' });
      }
      finalRole = roles[0];
      finalRoles = roles;
    } else if (role) {
      finalRole = role;
      finalRoles = [role];
    }

    const forbiddenRoles = ['STUDENT', 'APPLICANT'];
    if (finalRoles.some((r: any) => forbiddenRoles.includes(r))) {
      return res.status(400).json({ error: 'Cannot assign STUDENT or APPLICANT roles via this endpoint.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: finalRole,
        roles: finalRoles
      },
      select: { id: true, email: true, username: true, role: true, roles: true }
    });

    return res.json({ message: 'Roles updated successfully.', data: user });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found.' });
    console.error('updateUserRole error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── ADMIN FORCE-RESET PASSWORD ───────────────────────────────────────────────
export async function adminResetPassword(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // User.id
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin: true, // Force password change again on next login
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    if (req.user?.userId) {
      await createAuditLog(
        req.user.userId,
        'ADMIN_RESET_PASSWORD',
        'User',
        id,
        'Admin force-reset user password and required change on next login',
        req.ip
      );
    }

    return res.json({ message: 'Password reset. The user will be required to change it on next login.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found.' });
    console.error('adminResetPassword error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── TOGGLE USER ACTIVE STATUS ────────────────────────────────────────────────
export async function toggleUserVerified(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isEmailVerified } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { isEmailVerified: Boolean(isEmailVerified) },
      select: { id: true, email: true, username: true, role: true, isEmailVerified: true }
    });

    return res.json({ message: 'User verification status updated.', data: user });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User not found.' });
    console.error('toggleUserVerified error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE ADMIN USER ACCOUNT DETAILS ─────────────────────────────────────────
export async function updateAdminUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // User.id (UUID)
    const { firstName, lastName, email, phoneNumber, departmentId, role, roles } = req.body;

    const userToUpdate = await prisma.user.findUnique({
      where: { id },
      include: { staff: true }
    });

    if (!userToUpdate) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check duplicate email if changed
    if (email && email.trim().toLowerCase() !== userToUpdate.email) {
      const emailClean = email.trim().toLowerCase();
      const existingEmail = await prisma.user.findUnique({ where: { email: emailClean } });
      if (existingEmail) return res.status(400).json({ error: 'Email already in use.' });
    }

    let finalRole = role || userToUpdate.role;
    let finalRoles = roles || userToUpdate.roles;
    if (roles && Array.isArray(roles)) {
      if (roles.length === 0) {
        return res.status(400).json({ error: 'At least one role must be assigned.' });
      }
      finalRole = roles[0];
      finalRoles = roles;
    } else if (role) {
      finalRole = role;
      finalRoles = [role];
    }

    const forbiddenRoles = ['STUDENT', 'APPLICANT'];
    if (finalRoles.some((r: any) => forbiddenRoles.includes(r))) {
      return res.status(400).json({ error: 'Cannot assign STUDENT or APPLICANT roles via this endpoint.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: {
          email: email ? email.trim().toLowerCase() : undefined,
          role: finalRole,
          roles: finalRoles
        }
      });

      if (userToUpdate.staff) {
        await tx.staffProfile.update({
          where: { userId: id },
          data: {
            firstName: firstName !== undefined ? firstName.trim() : undefined,
            lastName: lastName !== undefined ? lastName.trim() : undefined,
            phoneNumber: phoneNumber !== undefined ? (phoneNumber?.trim() || null) : undefined,
            departmentId: departmentId !== undefined ? (departmentId || null) : undefined
          }
        });
      }

      return updatedUser;
    });

    return res.json({ message: 'User account updated successfully.', data: result });
  } catch (error: any) {
    console.error('updateAdminUser error:', error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Duplicate email.' });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── DELETE ADMIN USER ACCOUNT ────────────────────────────────────────────────
export async function deleteAdminUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params; // User.id (UUID)

    if (req.user?.userId === id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const userToDelete = await prisma.user.findUnique({
      where: { id },
      include: { staff: true }
    });

    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Unassign lecturerId from courses if applicable
    if (userToDelete.staff) {
      await prisma.course.updateMany({
        where: { lecturerId: userToDelete.staff.id },
        data: { lecturerId: null }
      });
    }

    // Delete user record (cascades to StaffProfile via onDelete: Cascade)
    await prisma.user.delete({
      where: { id }
    });

    return res.json({ message: 'User account deleted successfully.' });
  } catch (error: any) {
    console.error('deleteAdminUser error:', error);
    return res.status(500).json({ error: 'Failed to delete user account.' });
  }
}

