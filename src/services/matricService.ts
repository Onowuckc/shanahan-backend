import prisma from '../prisma';
import bcrypt from 'bcryptjs';

/**
 * Generates a unique institutional school email.
 * Pattern: firstname.lastname@shanahanuni.edu.ng
 */
async function generateSchoolEmail(firstName: string, lastName: string): Promise<string> {
  const base = `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}`;
  let email = `${base}@shanahanuni.edu.ng`;
  let count = 0;
  
  while (true) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) break;
    count++;
    email = `${base}${count}@shanahanuni.edu.ng`;
  }
  return email;
}

/**
 * Generates a unique matriculation number for a student.
 * Pattern: SU/{DEPT_CODE}/{YEAR_SHORT}/{SEQUENTIAL_NUMBER}
 * Example: SU/CMP/26/1001
 * 
 * @param departmentId The ID of the department the student is enrolling in
 * @param admissionYear The 4-digit admission year (e.g. 2026)
 * @returns The generated matriculation number string
 */
export async function generateMatricNumber(departmentId: string, admissionYear: number): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId }
  });
  
  if (!dept) {
    throw new Error('Department not found');
  }
  
  const deptCode = dept.code.toUpperCase();
  const yearCode = String(admissionYear).slice(-2);
  const prefix = `SU/${deptCode}/${yearCode}/`;
  
  const count = await prisma.studentProfile.count({
    where: {
      matricNumber: {
        startsWith: prefix
      }
    }
  });
  
  const sequentialNum = 1001 + count;
  return `${prefix}${sequentialNum}`;
}

/**
 * Generates a sequential batch of unique matriculation numbers.
 * Ensures consecutive numbers are assigned without database race conditions.
 * 
 * @param departmentId The ID of the department
 * @param admissionYear The 4-digit admission year
 * @param size The number of matriculation numbers to generate
 */
export async function generateMatricNumbersBatch(departmentId: string, admissionYear: number, size: number): Promise<string[]> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId }
  });
  
  if (!dept) {
    throw new Error('Department not found');
  }
  
  const deptCode = dept.code.toUpperCase();
  const yearCode = String(admissionYear).slice(-2);
  const prefix = `SU/${deptCode}/${yearCode}/`;
  
  const currentCount = await prisma.studentProfile.count({
    where: {
      matricNumber: {
        startsWith: prefix
      }
    }
  });
  
  const matrics: string[] = [];
  for (let i = 0; i < size; i++) {
    const sequentialNum = 1001 + currentCount + i;
    matrics.push(`${prefix}${sequentialNum}`);
  }
  return matrics;
}

/**
 * Transitions an applicant to a matriculated student after paying acceptance fees.
 * @param userId The ID of the applicant user
 */
export async function matriculateApplicant(userId: string): Promise<any> {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch applicant profile
    const applicant = await tx.applicantProfile.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!applicant) {
      throw new Error('Applicant profile not found');
    }

    if (!applicant.programId) {
      throw new Error('Applicant program is not defined');
    }

    const program = await tx.program.findUnique({
      where: { id: applicant.programId }
    });

    if (!program) {
      throw new Error('Selected program not found');
    }

    // 2. Generate Matric Number
    const matricNumber = await generateMatricNumber(program.departmentId, applicant.admissionYear);

    // 2b. Generate School Email & Temporary Password
    const schoolEmail = await generateSchoolEmail(applicant.firstName, applicant.lastName);
    const tempPassword = `SU-Pass-${Math.floor(100000 + Math.random() * 900000)}`;
    const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

    // 3. Create Student Profile
    const student = await tx.studentProfile.create({
      data: {
        matricNumber,
        userId: applicant.userId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        phoneNumber: applicant.phoneNumber,
        jambRegNo: applicant.jambRegNo,
        gender: applicant.gender,
        dateOfBirth: applicant.dateOfBirth,
        level: 100,
        departmentId: program.departmentId,
        programId: applicant.programId,
        admissionStatus: 'ADMITTED',
        modeOfEntry: applicant.modeOfEntry,
        programType: applicant.programType || 'Full-Time',
        passportPhotoUrl: applicant.passportPhotoUrl,
        oLevelResultUrl: applicant.oLevelResultUrl,
        birthCertificateUrl: applicant.birthCertificateUrl,
        utmeResultUrl: applicant.utmeResultUrl,
        jambAdmissionLetterUrl: applicant.jambAdmissionLetterUrl,
        // Store login details in metadata so they can be shown to the applicant in the portal
        metadata: {
          generatedEmail: schoolEmail,
          temporaryPassword: tempPassword
        }
      }
    });

    // 4. Update User record (role to STUDENT, username to matricNumber, email to schoolEmail, password to hashedTempPassword, isFirstLogin to true)
    await tx.user.update({
      where: { id: userId },
      data: {
        role: 'STUDENT',
        username: matricNumber,
        email: schoolEmail,
        password: hashedTempPassword,
        isFirstLogin: true
      }
    });

    // 5. Delete applicant profile
    await tx.applicantProfile.delete({
      where: { id: applicant.id }
    });

    console.log(`[Admissions System] Matriculated applicant ${applicant.applicationNo} to student ${matricNumber}`);
    console.log(`[Admissions System] Credentials generated: Email: ${schoolEmail}, Temp Password: ${tempPassword}`);
    return student;
  }, { maxWait: 15000, timeout: 30000 });
}

