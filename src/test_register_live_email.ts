import dotenv from 'dotenv';
dotenv.config();

import prisma from './prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from './utils/emailService';

async function main() {
  const email = 'ijomahchinazaaugustine@gmail.com';
  console.log(`[Live Email Verification Test] Registering ${email}...`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Cleaning up existing test user...');
    await prisma.applicantProfile.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const program = await prisma.program.findFirst();
  if (!program) throw new Error('No program found');

  const applicationNo = `SU/APP/26/1999`;
  const hashedPassword = await bcrypt.hash('Shanahan@2026!', 10);
  const verificationToken = crypto.randomBytes(32).toString('hex');

  const result = await prisma.$transaction(async (tx: any) => {
    const user = await tx.user.create({
      data: {
        email,
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
        firstName: 'Chinaza',
        lastName: 'Ijomah',
        phoneNumber: '08123456789',
        gender: 'MALE',
        dateOfBirth: new Date('2002-05-15'),
        programId: program.id,
        admissionYear: 2026
      }
    });

    return { user, profile };
  });

  console.log(`Applicant profile created: ${result.profile.applicationNo}`);
  console.log(`Sending verification email link via Titan SMTP (dev@shanahanuni.edu.ng)...`);

  const sent = await sendVerificationEmail(email, verificationToken);
  console.log('[Email Dispatch Status]:', sent ? 'SUCCESS - Check your inbox (ijomahchinazaaugustine@gmail.com)!' : 'FAILED');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
