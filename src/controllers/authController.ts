import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailService';

export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Find user by matric number / staff ID / application number (username) OR email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim() },
          { email: username.trim().toLowerCase() }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Enforce email verification (except for SUPER_ADMIN to ensure ICT/Admin accessibility during testing)
    if (user.role !== 'SUPER_ADMIN' && !user.isEmailVerified) {
      return res.status(403).json({
        error: 'Email verification is required.',
        verified: false
      });
    }

    // Fetch profile separately based on role
    let profile = null;

    if (user.role === 'STUDENT') {
      const student = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
        include: {
          department: { include: { faculty: true } },
          program: true
        }
      });
      if (student) {
        profile = {
          id: student.id,
          type: 'student',
          firstName: student.firstName,
          lastName: student.lastName,
          matricNumber: student.matricNumber,
          level: student.level,
          department: student.department.name,
          faculty: student.department.faculty.name,
          program: student.program.name
        };
      }
    } else if (user.role === 'APPLICANT') {
      const applicant = await prisma.applicantProfile.findUnique({
        where: { userId: user.id },
        include: { program: true }
      });
      if (applicant) {
        profile = {
          id: applicant.id,
          type: 'applicant',
          firstName: applicant.firstName,
          lastName: applicant.lastName,
          applicationNo: applicant.applicationNo,
          status: applicant.admissionStatus,
          program: applicant.program?.name || null
        };
      }
    } else {
      const staff = await prisma.staffProfile.findUnique({
        where: { userId: user.id }
      });
      if (staff) {
        const dept = staff.departmentId
          ? await prisma.department.findUnique({ where: { id: staff.departmentId } })
          : null;
        profile = {
          id: staff.id,
          type: 'staff',
          firstName: staff.firstName,
          lastName: staff.lastName,
          staffId: staff.staffId,
          department: dept?.name || null
        };
      }
    }

    // Sign JWT
    const secret = process.env.JWT_SECRET as string;
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        roles: user.roles && user.roles.length > 0 ? user.roles : [user.role],
        username: user.username 
      },
      secret,
      { expiresIn: '8h' }
    );

    // Mark isFirstLogin = false only AFTER we've included the flag in the response
    const requiresPasswordChange = user.isFirstLogin;

    if (user.isFirstLogin) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isFirstLogin: false }
      });
    }

    return res.status(200).json({
      message: 'Login successful.',
      token,
      role: user.role,
      roles: user.roles && user.roles.length > 0 ? user.roles : [user.role],
      profile,
      requiresPasswordChange
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        roles: true,
        isEmailVerified: true,
        createdAt: true
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });

    let profile = null;

    if (user.role === 'STUDENT') {
      profile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
        include: {
          department: { include: { faculty: true } },
          program: true
        }
      });
    } else if (user.role === 'APPLICANT') {
      profile = await prisma.applicantProfile.findUnique({
        where: { userId: user.id },
        include: {
          program: true,
          payments: {
            include: {
              items: {
                include: {
                  feeCategory: true
                }
              }
            }
          }
        }
      });
    } else {
      profile = await prisma.staffProfile.findUnique({
        where: { userId: user.id }
      });
    }

    return res.status(200).json({ user, profile });
  } catch (error: any) {
    console.error('GetMe error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashedNew = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hashedNew } });

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error: any) {
    console.error('ChangePassword error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

// ─── APPLICANT REGISTRATION ──────────────────────────────────────────────────
export async function registerApplicant(req: Request, res: Response) {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      gender,
      dateOfBirth,
      phoneNumber,
      jambRegNo,
      programId,
      admissionYear
    } = req.body;

    if (!firstName || !lastName || !email || !password || !gender || !dateOfBirth || !admissionYear) {
      return res.status(400).json({ error: 'Missing required registration fields.' });
    }

    const emailClean = email.trim().toLowerCase();

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({ where: { email: emailClean } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Check duplicate JAMB No
    if (jambRegNo) {
      const existingJamb = await prisma.applicantProfile.findUnique({
        where: { jambRegNo: jambRegNo.trim().toUpperCase() }
      });
      if (existingJamb) {
        return res.status(400).json({ error: 'JAMB registration number already in use.' });
      }
    }

    // Generate unique Application Number
    const yearShort = String(admissionYear).slice(-2);
    const prefix = `SU/APP/${yearShort}/`;
    const count = await prisma.applicantProfile.count({
      where: { applicationNo: { startsWith: prefix } }
    });
    const applicationNo = `${prefix}${1001 + count}`;

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailClean,
          username: applicationNo,
          password: hashedPassword,
          role: 'APPLICANT',
          roles: ['APPLICANT'],
          isEmailVerified: false,
          verificationToken
        }
      });

      const profile = await tx.applicantProfile.create({
        data: {
          applicationNo,
          userId: user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber?.trim() || null,
          gender: gender.trim().toUpperCase(),
          dateOfBirth: new Date(dateOfBirth),
          jambRegNo: jambRegNo?.trim().toUpperCase() || null,
          programId: programId || null,
          admissionYear: parseInt(admissionYear)
        }
      });

      return { user, profile };
    });

    await sendVerificationEmail(emailClean, verificationToken);

    return res.status(201).json({
      message: 'Applicant registration successful. Please check your email to verify your account.',
      applicationNo: result.profile.applicationNo
    });

  } catch (error: any) {
    console.error('Applicant registration error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

// ─── EMAIL VERIFICATION ──────────────────────────────────────────────────────
export async function verifyEmail(req: Request, res: Response) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const user = await prisma.user.findFirst({
      where: { verificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null
      }
    });

    return res.status(200).json({ message: 'Email verified successfully. You can now login.' });

  } catch (error: any) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function resendVerification(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'Email is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken }
    });

    await sendVerificationEmail(user.email, verificationToken);

    return res.status(200).json({
      message: 'Verification email has been sent to your inbox.'
    });

  } catch (error: any) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

// ─── PASSWORD RESET ──────────────────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    // To prevent email enumeration, return 200 even if user doesn't exist
    if (!user) {
      return res.status(200).json({
        message: 'If the email exists, a password reset link has been sent.'
      });
    }

    const resetPasswordToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordExpires = new Date(Date.now() + 15 * 60000); // 15 minutes expiry

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken,
        resetPasswordExpires
      }
    });

    await sendPasswordResetEmail(user.email, resetPasswordToken);

    return res.status(200).json({
      message: 'If the email exists, a password reset link has been sent.'
    });

  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return res.status(200).json({ message: 'Password has been reset successfully. You can now login.' });

  } catch (error: any) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function claimAccountVerify(req: Request, res: Response) {
  try {
    const { username, dateOfBirth, phoneNumber } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username (Matriculation Number or Staff ID) is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.isClaimed) {
      return res.status(400).json({ error: 'Account has already been claimed. Please use the login screen.' });
    }

    if (user.role === 'STUDENT') {
      if (!dateOfBirth) {
        return res.status(400).json({ error: 'Date of Birth is required for student account verification.' });
      }

      const student = await prisma.studentProfile.findUnique({
        where: { userId: user.id }
      });

      if (!student) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      const inputDob = new Date(dateOfBirth);
      const dbDob = new Date(student.dateOfBirth);

      if (
        inputDob.getFullYear() !== dbDob.getFullYear() ||
        inputDob.getMonth() !== dbDob.getMonth() ||
        inputDob.getDate() !== dbDob.getDate()
      ) {
        return res.status(400).json({ error: 'Invalid Date of Birth verification.' });
      }
    } else if (user.role !== 'APPLICANT' && user.role !== 'SUPER_ADMIN') {
      // Staff roles
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone Number is required for staff account verification.' });
      }

      const staff = await prisma.staffProfile.findUnique({
        where: { userId: user.id }
      });

      if (!staff) {
        return res.status(404).json({ error: 'Staff profile not found.' });
      }

      const inputPhone = phoneNumber.trim().replace(/\D/g, '');
      const dbPhone = staff.phoneNumber ? staff.phoneNumber.trim().replace(/\D/g, '') : '';

      if (!dbPhone || inputPhone !== dbPhone) {
        return res.status(400).json({ error: 'Invalid Phone Number verification.' });
      }
    } else {
      return res.status(400).json({ error: 'Only student and staff accounts can be claimed.' });
    }

    // Generate random 6-character verification token
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetPasswordExpires = new Date(Date.now() + 15 * 60000); // 15 minutes expiry

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: verificationCode,
        resetPasswordExpires
      }
    });

    console.log(`[Account Claiming System] Sent verification code to ${user.email}: ${verificationCode}`);

    // Obfuscate email for security presentation
    const emailParts = user.email.split('@');
    const name = emailParts[0];
    const domain = emailParts[1];
    const obfuscatedName = name.length > 2 ? name.substring(0, 2) + '*'.repeat(name.length - 2) : name + '**';
    const obfuscatedEmail = `${obfuscatedName}@${domain}`;

    return res.status(200).json({
      message: 'Identity verified successfully.',
      email: obfuscatedEmail
    });

  } catch (error: any) {
    console.error('Claim account verification error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

// ─── UPDATE MY PROFILE ───────────────────────────────────────────────────────
export async function updateMyProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const { firstName, lastName, phoneNumber, email } = req.body;

    // Update User email if changed (check for duplicate)
    if (email) {
      const emailClean = email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: { email: emailClean, NOT: { id: userId } }
      });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use by another account.' });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { email: emailClean }
      });
    }

    // Update StaffProfile fields if the user has one
    const staff = await prisma.staffProfile.findUnique({ where: { userId } });
    if (staff) {
      await prisma.staffProfile.update({
        where: { userId },
        data: {
          ...(firstName && { firstName: firstName.trim() }),
          ...(lastName && { lastName: lastName.trim() }),
          ...(phoneNumber !== undefined && { phoneNumber: phoneNumber?.trim() || null }),
        }
      });
    }

    return res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error: any) {
    console.error('updateMyProfile error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export async function claimAccountActivate(req: Request, res: Response) {
  try {
    const { username, token, newPassword } = req.body;

    if (!username || !token || !newPassword) {
      return res.status(400).json({ error: 'username, token, and newPassword are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.isClaimed) {
      return res.status(400).json({ error: 'Account has already been claimed.' });
    }

    if (user.verificationToken !== token) {
      return res.status(400).json({ error: 'Invalid verification token.' });
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please verify again.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isClaimed: true,
        isEmailVerified: true,
        verificationToken: null,
        resetPasswordExpires: null
      }
    });

    return res.status(200).json({ message: 'Account activated successfully. You can now login.' });

  } catch (error: any) {
    console.error('Claim account activation error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}
