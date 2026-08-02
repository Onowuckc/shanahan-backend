import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// ─── All admin/staff role accounts to seed ────────────────────────────────────
// Passwords come from SEED_DEFAULT_PASSWORD in .env — never hard-coded.
// Staff should NOT be forced to change password on first login.
const ROLE_ACCOUNTS: {
  email: string;
  username: string; // Staff ID
  role: Role;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}[] = [
  // ── System & ICT ──────────────────────────────────────────────────────────
  {
    email: process.env.SEED_ICT_EMAIL || 'ict@shanahanuni.edu.ng',
    username: process.env.SEED_ICT_STAFF_ID || 'SU/ICT/001',
    role: Role.SUPER_ADMIN,
    firstName: 'Super',
    lastName: 'Admin',
    phoneNumber: '08000000001',
  },
  {
    email: process.env.SEED_ICT_ADMIN_EMAIL || 'ictadmin@shanahanuni.edu.ng',
    username: process.env.SEED_ICT_ADMIN_STAFF_ID || 'SU/ICT/002',
    role: Role.ICT_ADMIN,
    firstName: 'ICT',
    lastName: 'Administrator',
    phoneNumber: '08000000002',
  },
  {
    email: process.env.SEED_DEV_SUPER_ADMIN_EMAIL || 'temporary.admin@shanahanuni.edu.ng',
    username: process.env.SEED_DEV_SUPER_ADMIN_STAFF_ID || 'DEV-SUPER-ADMIN',
    role: Role.SUPER_ADMIN,
    firstName: 'Dev Temporary',
    lastName: 'Super Admin',
    phoneNumber: '08000000012',
  },
  // ── Bursary / Finance ─────────────────────────────────────────────────────
  {
    email: process.env.SEED_BURSARY_EMAIL || 'bursary@shanahanuni.edu.ng',
    username: process.env.SEED_BURSARY_STAFF_ID || 'SU/BRS/001',
    role: Role.BURSARY_STAFF,
    firstName: 'Bursary',
    lastName: 'Officer',
    phoneNumber: '08000000003',
  },
  // ── Admissions ────────────────────────────────────────────────────────────
  {
    email: process.env.SEED_ADMISSIONS_EMAIL || 'admissions@shanahanuni.edu.ng',
    username: process.env.SEED_ADMISSIONS_STAFF_ID || 'SU/ADM/001',
    role: Role.ADMISSIONS_STAFF,
    firstName: 'Admissions',
    lastName: 'Officer',
    phoneNumber: '08000000004',
  },
  // ── Registry ──────────────────────────────────────────────────────────────
  {
    email: process.env.SEED_REGISTRY_EMAIL || 'registry@shanahanuni.edu.ng',
    username: process.env.SEED_REGISTRY_STAFF_ID || 'SU/REG/001',
    role: Role.REGISTRY_STAFF,
    firstName: 'Registry',
    lastName: 'Officer',
    phoneNumber: '08000000005',
  },
  // ── Hostel Admin ──────────────────────────────────────────────────────────
  {
    email: process.env.SEED_HOSTEL_ADMIN_EMAIL || 'hostel@shanahanuni.edu.ng',
    username: process.env.SEED_HOSTEL_ADMIN_STAFF_ID || 'SU/HOS/001',
    role: Role.HOSTEL_ADMIN,
    firstName: 'Hostel',
    lastName: 'Administrator',
    phoneNumber: '08000000006',
  },
  // ── Exams & Records ───────────────────────────────────────────────────────
  {
    email: process.env.SEED_EXAMS_EMAIL || 'exams@shanahanuni.edu.ng',
    username: process.env.SEED_EXAMS_STAFF_ID || 'SU/EXM/001',
    role: Role.EXAMS_RECORDS_STAFF,
    firstName: 'Exams',
    lastName: 'Records Officer',
    phoneNumber: '08000000007',
  },
  // ── Student Affairs ───────────────────────────────────────────────────────
  {
    email: process.env.SEED_STUDENT_AFFAIRS_EMAIL || 'studentaffairs@shanahanuni.edu.ng',
    username: process.env.SEED_STUDENT_AFFAIRS_STAFF_ID || 'SU/SAS/001',
    role: Role.STUDENT_AFFAIRS_STAFF,
    firstName: 'Student Affairs',
    lastName: 'Officer',
    phoneNumber: '08000000008',
  },
  // ── VC / Management ───────────────────────────────────────────────────────
  {
    email: process.env.SEED_MANAGEMENT_EMAIL || 'vc@shanahanuni.edu.ng',
    username: process.env.SEED_MANAGEMENT_STAFF_ID || 'SU/MGT/001',
    role: Role.UNIVERSITY_MANAGEMENT,
    firstName: 'University',
    lastName: 'Management',
    phoneNumber: '08000000009',
  },
  // ── Faculty Officer ───────────────────────────────────────────────────────
  {
    email: process.env.SEED_FACULTY_OFFICER_EMAIL || 'facultyofficer@shanahanuni.edu.ng',
    username: process.env.SEED_FACULTY_OFFICER_STAFF_ID || 'SU/FAC/001',
    role: Role.FACULTY_OFFICER,
    firstName: 'Faculty',
    lastName: 'Officer',
    phoneNumber: '08000000010',
  },
];

async function main() {
  console.log('🌱 Seeding Shanahan University UMIS database...');

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!defaultPassword) {
    throw new Error(
      '❌  SEED_DEFAULT_PASSWORD is not set in .env. Aborting seed to prevent insecure defaults.'
    );
  }

  // ─── 1. SEED ROLE ACCOUNTS ────────────────────────────────────────────────
  console.log('\n📋 Seeding admin role accounts...');
  for (const account of ROLE_ACCOUNTS) {
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);

    // Find existing user by email OR username to avoid duplicate key conflicts
    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: account.email },
          { username: account.username },
        ]
      }
    });

    let user;
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: account.email,
          username: account.username,
          role: account.role,
          roles: [account.role],
          isEmailVerified: true,
          isFirstLogin: false, // staff not forced to change password
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: account.email,
          username: account.username,
          password: passwordHash,
          role: account.role,
          roles: [account.role],
          isEmailVerified: true,
          isClaimed: false,
          isFirstLogin: false, // staff not forced to change password
        },
      });
    }

    // Ensure StaffProfile exists for this user
    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: {
        firstName: account.firstName,
        lastName: account.lastName,
        phoneNumber: account.phoneNumber,
        staffId: account.username,
      },
      create: {
        userId: user.id,
        staffId: account.username,
        firstName: account.firstName,
        lastName: account.lastName,
        phoneNumber: account.phoneNumber,
      },
    });

    console.log(`  ✅  [${account.role.padEnd(24)}] ${account.username.padEnd(15)} → ${account.email}`);
  }

  // ─── 2. ACADEMIC SESSION & SEMESTERS ──────────────────────────────────────
  console.log('\n📅 Seeding academic session...');
  const session = await prisma.academicSession.upsert({
    where: { name: '2025/2026' },
    update: {},
    create: {
      name: '2025/2026',
      isCurrent: true,
      semesters: {
        create: [
          { name: 'First', isCurrent: true },
          { name: 'Second', isCurrent: false },
        ],
      },
    },
  });
  console.log(`  ✅  Academic session: ${session.name}`);

  // ─── 3. FACULTIES ─────────────────────────────────────────────────────────
  console.log('\n🏛️  Seeding faculties...');
  const faculties: { name: string; code: string }[] = [
    { name: 'Faculty of Arts', code: 'ARTS' },
    { name: 'Faculty of Basic Medical and Allied Sciences', code: 'BMAS' },
    { name: 'Faculty of Law', code: 'FLAW' },
    { name: 'College of Medicine', code: 'CMED' },
    { name: 'Faculty of Natural Sciences and Computing', code: 'NAS' },
    { name: 'Faculty of Arts, Social and Management Sciences', code: 'FSMS' },
    { name: 'General Studies', code: 'GS' },
    { name: 'Faculty of Pharmacy', code: 'PHARM' },
  ];

  const facultyMap: Record<string, string> = {};
  for (const f of faculties) {
    const faculty = await prisma.faculty.upsert({
      where: { code: f.code },
      update: { name: f.name },
      create: f,
    });
    facultyMap[f.code] = faculty.id;
  }
  console.log(`  ✅  ${faculties.length} faculties seeded`);

  // ─── 4. DEPARTMENTS & PROGRAMS ────────────────────────────────────────────
  console.log('\n🎓 Seeding departments & programs...');
  const departments: { name: string; code: string; facultyCode: string; programName: string; duration: number }[] = [
    // College of Medicine (CMED)
    { name: 'Medicine and Surgery', code: '300', facultyCode: 'CMED', programName: 'MBBS (Medicine and Surgery)', duration: 6 },
    { name: 'Anatomy', code: '465', facultyCode: 'CMED', programName: 'B.Sc. Anatomy', duration: 4 },
    { name: 'Physiology', code: '470', facultyCode: 'CMED', programName: 'B.Sc. Physiology', duration: 4 },

    // Faculty of Natural Sciences and Computing (NAS)
    { name: 'Cyber Security', code: '305', facultyCode: 'NAS', programName: 'B.Sc. Cyber Security', duration: 4 },
    { name: 'Software Engineering', code: '310', facultyCode: 'NAS', programName: 'B.Eng. Software Engineering', duration: 4 },
    { name: 'Biochemistry', code: '315', facultyCode: 'NAS', programName: 'B.Sc. Biochemistry', duration: 4 },
    { name: 'Microbiology', code: '320', facultyCode: 'NAS', programName: 'B.Sc. Microbiology', duration: 4 },
    { name: 'Physics with Electronics', code: '325', facultyCode: 'NAS', programName: 'B.Sc. Physics with Electronics', duration: 4 },
    { name: 'Information and Communication Technology', code: '330', facultyCode: 'NAS', programName: 'B.Sc. Information and Communication Technology', duration: 4 },
    { name: 'Computer Science', code: '335', facultyCode: 'NAS', programName: 'B.Sc. Computer Science', duration: 4 },
    { name: 'Artificial Intelligence', code: '340', facultyCode: 'NAS', programName: 'B.Sc. Artificial Intelligence', duration: 4 },

    // Faculty of Basic Medical and Allied Sciences (BMAS)
    { name: 'Nursing', code: '215', facultyCode: 'BMAS', programName: 'B.Sc. Nursing Science', duration: 5 },
    { name: 'Doctor of Physiotherapy', code: '220', facultyCode: 'BMAS', programName: 'Doctor of Physiotherapy (DPT)', duration: 5 },
    { name: 'Environmental Health Science', code: '225', facultyCode: 'BMAS', programName: 'B.Sc. Environmental Health Science', duration: 4 },
    { name: 'Radiography', code: '230', facultyCode: 'BMAS', programName: 'B.Sc. Radiography', duration: 5 },
    { name: 'Medical Laboratory Science', code: '235', facultyCode: 'BMAS', programName: 'B.Sc. Medical Laboratory Science', duration: 4 },

    // Faculty of Arts, Social and Management Sciences (FSMS)
    { name: 'Economics', code: '420', facultyCode: 'FSMS', programName: 'B.Sc. Economics', duration: 4 },
    { name: 'Accountancy', code: '425', facultyCode: 'FSMS', programName: 'B.Sc. Accountancy', duration: 4 },
    { name: 'Business Administration', code: '430', facultyCode: 'FSMS', programName: 'B.Sc. Business Administration', duration: 4 },
    { name: 'Entrepreneurship', code: '435', facultyCode: 'FSMS', programName: 'B.Sc. Entrepreneurship', duration: 4 },
    { name: 'International Relations', code: '440', facultyCode: 'FSMS', programName: 'B.Sc. International Relations', duration: 4 },
    { name: 'Mass Communication', code: '445', facultyCode: 'FSMS', programName: 'B.Sc. Mass Communication', duration: 4 },
    { name: 'Taxation', code: '450', facultyCode: 'FSMS', programName: 'B.Sc. Taxation', duration: 4 },
    { name: 'English Language', code: '455', facultyCode: 'FSMS', programName: 'B.A. English Language', duration: 4 },

    // Faculty of Pharmacy (PHARM)
    { name: 'Doctor of Pharmacy', code: '500', facultyCode: 'PHARM', programName: 'Doctor of Pharmacy (Pharm.D)', duration: 5 },

    // Faculty of Law (FLAW)
    { name: 'Law', code: '550', facultyCode: 'FLAW', programName: 'LL.B (Law)', duration: 5 },
  ];

  let deptCount = 0;
  for (const dept of departments) {
    const facultyId = facultyMap[dept.facultyCode];
    if (!facultyId) {
      console.warn(`  ⚠️  Faculty code ${dept.facultyCode} not found for department ${dept.name}`);
      continue;
    }

    const department = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, facultyId },
      create: { name: dept.name, code: dept.code, facultyId },
    });

    await prisma.program.upsert({
      where: { name: dept.programName },
      update: { duration: dept.duration },
      create: {
        name: dept.programName,
        duration: dept.duration,
        departmentId: department.id,
      },
    });

    deptCount++;
  }
  console.log(`  ✅  ${deptCount} departments & programs seeded`);

  // ─── 5. FEE CATEGORIES ────────────────────────────────────────────────────
  console.log('\n💰 Seeding fee categories...');
  const feeCategories = [
    { name: 'Tuition Fee', description: 'Main academic tuition fee — supports installment payment' },
    { name: 'Acceptance Fee', description: 'One-time acceptance/admission fee — no installment by default' },
    { name: 'Accommodation Fee', description: 'On-campus hostel/accommodation fee' },
    { name: 'Medical Fee', description: 'University health services fee' },
    { name: 'Laboratory Fee', description: 'Laboratory usage and consumables fee — programme-specific' },
    { name: 'Library Fee', description: 'Library access and resources fee' },
    { name: 'ICT Fee', description: 'Information technology services fee' },
    { name: 'Sports & Recreation Fee', description: 'Sports facilities and recreation fee' },
    { name: 'Student Union Fee', description: 'Student union and association fee' },
    { name: 'Development Levy', description: 'University development and infrastructure levy' },
  ];

  for (const fc of feeCategories) {
    await prisma.feeCategory.upsert({
      where: { name: fc.name },
      update: {},
      create: fc,
    });
  }
  console.log(`  ✅  ${feeCategories.length} fee categories seeded`);

  // ─── 6. SEED HOSTELS ──────────────────────────────────────────────────────
  console.log('\n🏢 Seeding hostels...');
  const hostels = [
    { name: 'Female Hostel A', gender: 'FEMALE', totalCapacity: 120, allowedLevels: [] },
    { name: 'Female Hostel B', gender: 'FEMALE', totalCapacity: 120, allowedLevels: [] },
    { name: 'Hostel C', gender: 'MIXED', totalCapacity: 150, allowedLevels: [] },
    { name: 'Hostel D', gender: 'MIXED', totalCapacity: 150, allowedLevels: [] },
    { name: 'Hostel E', gender: 'MIXED', totalCapacity: 150, allowedLevels: [] },
  ];

  for (const h of hostels) {
    await prisma.hostel.upsert({
      where: { name: h.name },
      update: {
        gender: h.gender as any,
        totalCapacity: h.totalCapacity,
        allowedLevels: h.allowedLevels,
      },
      create: {
        name: h.name,
        gender: h.gender as any,
        totalCapacity: h.totalCapacity,
        allowedLevels: h.allowedLevels,
      },
    });
  }
  console.log(`  ✅  ${hostels.length} hostels seeded`);

  // ─── 7. SEED SYSTEM SETTINGS (RECEIPT BRANDING ETC) ───────────────────────
  console.log('\n⚙️ Seeding system settings...');
  const systemSettings = [
    { key: 'receipt_university_name', value: 'Shanahan University Onitsha' },
    { key: 'receipt_permanent_address', value: 'Shanahan University Avenue, Trans-Nkisi Layout, Onitsha' },
    {
      key: 'receipt_temporary_address',
      value: 'Basilica of the Most Holy Trinity, No. 1 Mission Road, GRA, P.O. Box 411, Onitsha',
    },
    {
      key: 'receipt_footer',
      value: 'This is a computer-generated receipt. For enquiries, contact the Bursary Office or the University through official channels.',
    },
    { key: 'receipt_contact_email', value: 'info@shanahanuni.edu.ng' },
    { key: 'receipt_contact_phones', value: '+2348134800030, +2349077228877, +2349075112111' },
    { key: 'score_config_default', value: { caMax: 40, examMax: 60 } },
    { key: 'hostel_allow_offcampus', value: true },
    { key: 'paystack_charge_bearer', value: process.env.PAYSTACK_CHARGE_BEARER || 'account' },
    {
      key: 'rbac_permissions',
      value: {
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
      }
    }
  ];

  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log(`  ✅  ${systemSettings.length} system settings seeded`);

  // Also seed a default SYSTEM score config in ScoreConfig table
  await prisma.scoreConfig.upsert({
    where: { scope_scopeId: { scope: 'SYSTEM', scopeId: 'SYSTEM' } },
    update: { caMax: 40, examMax: 60 },
    create: { scope: 'SYSTEM', scopeId: 'SYSTEM', caMax: 40, examMax: 60 },
  });
  console.log(`  ✅  Default system score config seeded`);



  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('🎉  Seeding complete! Shanahan University UMIS is ready.');
  console.log('─'.repeat(60));
  console.log('\n📋  Admin Role Account Credentials');
  console.log('    Default password is in SEED_DEFAULT_PASSWORD (.env)');
  console.log('    All accounts require a password change on first login.\n');

  for (const acc of ROLE_ACCOUNTS) {
    console.log(`    [${acc.role}]`);
    console.log(`      Username : ${acc.username}`);
    console.log(`      Email    : ${acc.email}`);
    console.log(`      Password : (see SEED_DEFAULT_PASSWORD in .env)\n`);
  }

  console.log('⚠️   IMPORTANT: Run this seed only in development/staging.');
  console.log('    Update .env SEED_DEFAULT_PASSWORD before seeding production.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

