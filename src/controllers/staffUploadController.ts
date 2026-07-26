import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { generateStaffIdsBatch } from '../services/staffService';

type StaffRole = 'LECTURER' | 'REGISTRY_STAFF' | 'BURSARY_STAFF' | 'SUPER_ADMIN';

const ALLOWED_ROLES: string[] = ['LECTURER', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'SUPER_ADMIN'];

interface StaffExcelRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  gender?: string;
  date_of_birth?: string | number;
  phone_number?: string;
  department_code?: string;
  role?: string;
  staff_id?: string;
  [key: string]: any;
}

export async function uploadStaff(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    const { admissionYear } = req.body;
    const year = parseInt(admissionYear || String(new Date().getFullYear()));
    if (isNaN(year)) {
      return res.status(400).json({ error: 'admissionYear must be a valid integer.' });
    }

    // Parse Excel
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<StaffExcelRow>(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded Excel sheet contains no rows.' });
    }

    const validationErrors: string[] = [];
    type ValidRow = {
      first_name: string; last_name: string; email: string;
      gender: string; parsedDob: Date; phone_number: string | null;
      departmentId: string | null; role: StaffRole; staffId: string | null;
      metadata: Record<string, any>;
    };
    const validRows: ValidRow[] = [];
    const seenEmails = new Set<string>();
    const seenStaffIds = new Set<string>();

    const standardFields = ['first_name', 'last_name', 'email', 'gender', 'date_of_birth', 'phone_number', 'department_code', 'role', 'staff_id'];

    // ── Step 1: File-level validation ────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const first_name     = row.first_name?.toString().trim();
      const last_name      = row.last_name?.toString().trim();
      const email          = row.email?.toString().trim().toLowerCase();
      const gender         = row.gender?.toString().trim().toUpperCase();
      const date_of_birth  = row.date_of_birth;
      const phone_number   = row.phone_number?.toString().trim() || null;
      const dept_code      = row.department_code?.toString().trim().toUpperCase() || null;
      const role           = row.role?.toString().trim().toUpperCase();
      const staff_id       = row.staff_id?.toString().trim() || null;

      // Required field check
      if (!first_name || !last_name || !email || !gender || !date_of_birth || !role) {
        validationErrors.push(
          `Row ${rowNum}: Missing required fields (first_name, last_name, email, gender, date_of_birth, role).`
        );
        continue;
      }

      // Email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push(`Row ${rowNum}: Invalid email format (${email}).`);
        continue;
      }

      // Duplicate email within sheet
      if (seenEmails.has(email)) {
        validationErrors.push(`Row ${rowNum}: Duplicate email in sheet (${email}).`);
      } else {
        seenEmails.add(email);
      }

      if (staff_id) {
        if (seenStaffIds.has(staff_id)) {
          validationErrors.push(`Row ${rowNum}: Duplicate Staff ID in sheet (${staff_id}).`);
        } else {
          seenStaffIds.add(staff_id);
        }
      }

      // Role validation
      if (!ALLOWED_ROLES.includes(role)) {
        validationErrors.push(
          `Row ${rowNum}: Invalid role "${role}". Allowed: ${ALLOWED_ROLES.join(', ')}.`
        );
        continue;
      }

      // Date of birth parsing
      let parsedDob: Date;
      if (typeof date_of_birth === 'number') {
        parsedDob = new Date((date_of_birth - 25569) * 86400 * 1000);
      } else {
        parsedDob = new Date(date_of_birth);
      }
      if (isNaN(parsedDob.getTime())) {
        validationErrors.push(`Row ${rowNum}: Invalid date_of_birth format. Use YYYY-MM-DD.`);
        continue;
      }

      // Resolve department_code → ID (optional for staff)
      let departmentId: string | null = null;
      if (dept_code) {
        const dept = await prisma.department.findUnique({ where: { code: dept_code } });
        if (!dept) {
          validationErrors.push(`Row ${rowNum}: Department code "${dept_code}" not found in the system.`);
          continue;
        }
        departmentId = dept.id;
      }

      // Extract dynamic metadata fields
      const metadata: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (!standardFields.includes(key) && val !== undefined) {
          metadata[key] = val;
        }
      }
      // Since StaffProfile does not have a dateOfBirth column, save it inside metadata
      metadata.dateOfBirth = parsedDob.toISOString();

      validRows.push({
        first_name, last_name, email, gender, parsedDob,
        phone_number, departmentId, role: role as StaffRole, staffId: staff_id,
        metadata
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation errors found. No data has been imported.',
        details: validationErrors
      });
    }

    // ── Step 2: Database-level duplicate check ────────────────────────────
    const emailList = Array.from(seenEmails);
    const staffIdList = Array.from(seenStaffIds);

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { in: emailList } },
          { username: { in: staffIdList } }
        ]
      },
      select: { email: true, username: true }
    });

    const existingStaff = await prisma.staffProfile.findMany({
      where: { staffId: { in: staffIdList } },
      select: { staffId: true }
    });

    if (existingUsers.length > 0) {
      existingUsers.forEach((u) => {
        if (emailList.includes(u.email)) {
          validationErrors.push(`Database Duplicate: Email ${u.email} already exists.`);
        }
        if (staffIdList.includes(u.username)) {
          validationErrors.push(`Database Duplicate: Staff ID / username ${u.username} already exists.`);
        }
      });
    }

    if (existingStaff.length > 0) {
      existingStaff.forEach((s) => {
        validationErrors.push(`Database Duplicate: Staff record with ID ${s.staffId} already exists.`);
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Duplicate records found in database. No data has been imported.',
        details: validationErrors
      });
    }

    // ── Step 3: Distribute Staff IDs (Generate only what is missing) ──────
    const missingStaffCount = validRows.filter(r => !r.staffId).length;
    const generatedStaffIds = missingStaffCount > 0
      ? await generateStaffIdsBatch(year, missingStaffCount)
      : [];

    let genIdx = 0;
    const defaultPassword = 'StaffPass123';
    const hashedPassword  = bcrypt.hashSync(defaultPassword, 10);

    // ── Step 4: Atomic insertion ──────────────────────────────────────────
    const createdRecords = await prisma.$transaction(async (tx: any) => {
      const records = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const staffId = row.staffId || generatedStaffIds[genIdx++];

        const user = await tx.user.create({
          data: {
            email:    row.email,
            username: staffId,
            password: hashedPassword,
            role:     row.role as StaffRole,
            roles:    [row.role as StaffRole],
            isEmailVerified: false,
            isClaimed: false
          }
        });

        await tx.staffProfile.create({
          data: {
            staffId,
            userId:       user.id,
            firstName:    row.first_name,
            lastName:     row.last_name,
            phoneNumber:  row.phone_number,
            departmentId: row.departmentId,
            metadata:     row.metadata
          }
        });

        records.push({
          name:       `${row.first_name} ${row.last_name}`,
          email:      row.email,
          staffId,
          role:       row.role,
          department: row.departmentId ?? 'N/A'
        });
      }

      return records;
    });

    return res.status(201).json({
      message:         `Successfully imported ${createdRecords.length} staff members.`,
      defaultPassword,
      staff:           createdRecords
    });

  } catch (error: any) {
    console.error('Staff upload error:', error);
    return res.status(500).json({
      error:   'An internal server error occurred.',
      details: error.message
    });
  }
}
