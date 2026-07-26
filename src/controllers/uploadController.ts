import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { generateMatricNumbersBatch } from '../services/matricService';

interface StudentExcelRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  jamb_reg_no?: string;
  gender?: string;
  date_of_birth?: string | number;
  phone_number?: string;
  matric_number?: string;
  [key: string]: any;
}

export async function uploadStudents(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No Excel file uploaded.' });
    }

    const { departmentId, programId, admissionYear, level } = req.body;
    if (!departmentId || !programId || !admissionYear || !level) {
      return res.status(400).json({
        error: 'Missing required metadata: departmentId, programId, admissionYear, level are required.'
      });
    }

    // Verify department and program exist
    const deptExists = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!deptExists) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    const progExists = await prisma.program.findUnique({ where: { id: programId } });
    if (!progExists) {
      return res.status(404).json({ error: 'Program not found.' });
    }

    const year = parseInt(admissionYear);
    const parsedLevel = parseInt(level);

    if (isNaN(year) || isNaN(parsedLevel)) {
      return res.status(400).json({ error: 'admissionYear and level must be valid integers.' });
    }

    // Parse Excel workbook
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<StudentExcelRow>(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded Excel sheet contains no student rows.' });
    }

    const validationErrors: string[] = [];
    const validRows: { rowData: StudentExcelRow; parsedDob: Date; metadata: Record<string, any> }[] = [];

    const seenEmails = new Set<string>();
    const seenJambs = new Set<string>();
    const seenMatrics = new Set<string>();

    const standardFields = ['first_name', 'last_name', 'email', 'jamb_reg_no', 'gender', 'date_of_birth', 'phone_number', 'matric_number'];

    // Step 1: File-level validation
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Row 1 is header

      const first_name = row.first_name?.toString().trim();
      const last_name = row.last_name?.toString().trim();
      const email = row.email?.toString().trim().toLowerCase();
      const jamb_reg_no = row.jamb_reg_no?.toString().trim().toUpperCase();
      const gender = row.gender?.toString().trim().toUpperCase();
      const date_of_birth = row.date_of_birth;
      const phone_number = row.phone_number?.toString().trim() || null;
      const matric_number = row.matric_number?.toString().trim() || null;

      if (!first_name || !last_name || !email || !jamb_reg_no || !gender || !date_of_birth) {
        validationErrors.push(`Row ${rowNum}: Missing one or more required fields (first_name, last_name, email, jamb_reg_no, gender, date_of_birth).`);
        continue;
      }

      // Validate Email Format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push(`Row ${rowNum}: Invalid email format (${email}).`);
        continue;
      }

      // Check for duplicates in same Excel file
      if (seenEmails.has(email)) {
        validationErrors.push(`Row ${rowNum}: Duplicate email inside Excel sheet (${email}).`);
      } else {
        seenEmails.add(email);
      }

      if (seenJambs.has(jamb_reg_no)) {
        validationErrors.push(`Row ${rowNum}: Duplicate JAMB registration number inside Excel sheet (${jamb_reg_no}).`);
      } else {
        seenJambs.add(jamb_reg_no);
      }

      if (matric_number) {
        if (seenMatrics.has(matric_number)) {
          validationErrors.push(`Row ${rowNum}: Duplicate Matric Number inside Excel sheet (${matric_number}).`);
        } else {
          seenMatrics.add(matric_number);
        }
      }

      // Validate and parse Date of Birth
      let parsedDob: Date;
      if (typeof date_of_birth === 'number') {
        // Excel date format (number of days since 1900-01-01)
        parsedDob = new Date((date_of_birth - 25569) * 86400 * 1000);
      } else {
        parsedDob = new Date(date_of_birth);
      }

      if (isNaN(parsedDob.getTime())) {
        validationErrors.push(`Row ${rowNum}: Invalid date format for date_of_birth (${date_of_birth}). Use YYYY-MM-DD.`);
        continue;
      }

      // Extract custom metadata fields
      const metadata: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (!standardFields.includes(key) && val !== undefined) {
          metadata[key] = val;
        }
      }

      validRows.push({
        rowData: {
          first_name,
          last_name,
          email,
          jamb_reg_no,
          gender,
          date_of_birth: date_of_birth.toString(),
          phone_number: phone_number || '',
          matric_number: matric_number || undefined
        },
        parsedDob,
        metadata
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation errors found in Excel sheet. No data has been imported.',
        details: validationErrors
      });
    }

    // Step 2: Database-level duplicate verification
    const emailList = Array.from(seenEmails);
    const jambList = Array.from(seenJambs);
    const matricList = Array.from(seenMatrics);

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { in: emailList } },
          { username: { in: matricList } }
        ]
      },
      select: { email: true, username: true }
    });

    const existingStudents = await prisma.studentProfile.findMany({
      where: {
        OR: [
          { jambRegNo: { in: jambList } },
          { matricNumber: { in: matricList } }
        ]
      },
      select: { jambRegNo: true, matricNumber: true }
    });

    if (existingUsers.length > 0) {
      existingUsers.forEach((u) => {
        if (emailList.includes(u.email)) {
          validationErrors.push(`Database Duplicate: A user with email ${u.email} already exists.`);
        }
        if (matricList.includes(u.username)) {
          validationErrors.push(`Database Duplicate: A user with username/matric ${u.username} already exists.`);
        }
      });
    }

    if (existingStudents.length > 0) {
      existingStudents.forEach((s) => {
        if (s.jambRegNo && jambList.includes(s.jambRegNo)) {
          validationErrors.push(`Database Duplicate: A student with JAMB number ${s.jambRegNo} already exists.`);
        }
        if (matricList.includes(s.matricNumber)) {
          validationErrors.push(`Database Duplicate: A student with Matric number ${s.matricNumber} already exists.`);
        }
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Database duplicate records found. No data has been imported.',
        details: validationErrors
      });
    }

    // Step 3: Distribute Matric Numbers (Generate only what is missing)
    const missingMatricsCount = validRows.filter(r => !r.rowData.matric_number).length;
    const generatedMatrics = missingMatricsCount > 0
      ? await generateMatricNumbersBatch(departmentId, year, missingMatricsCount)
      : [];

    let genIdx = 0;
    const defaultPassword = 'Password123'; // Standard temporary password
    const hashedDefaultPassword = bcrypt.hashSync(defaultPassword, 10);

    // Step 4: Atomic database insertion
    const createdRecords = await prisma.$transaction(async (tx: any) => {
      const records = [];

      for (let i = 0; i < validRows.length; i++) {
        const { rowData, parsedDob, metadata } = validRows[i];
        const matricNumber = rowData.matric_number || generatedMatrics[genIdx++];

        // 1. Create User account
        const user = await tx.user.create({
          data: {
            email: rowData.email,
            username: matricNumber,
            password: hashedDefaultPassword,
            role: 'STUDENT',
            roles: ['STUDENT'],
            isEmailVerified: false,
            isClaimed: false
          }
        });

        // 2. Create Student Profile
        await tx.studentProfile.create({
          data: {
            matricNumber,
            userId: user.id,
            firstName: rowData.first_name,
            lastName: rowData.last_name,
            phoneNumber: rowData.phone_number || null,
            jambRegNo: rowData.jamb_reg_no,
            gender: rowData.gender,
            dateOfBirth: parsedDob,
            level: parsedLevel,
            departmentId,
            programId,
            metadata: metadata || {}
          }
        });

        records.push({
          name: `${rowData.first_name} ${rowData.last_name}`,
          email: rowData.email,
          matricNumber,
          jambNumber: rowData.jamb_reg_no
        });
      }

      return records;
    });

    return res.status(201).json({
      message: `Successfully imported ${createdRecords.length} students.`,
      defaultPassword,
      students: createdRecords
    });

  } catch (error: any) {
    console.error('Error in bulk student upload:', error);
    return res.status(500).json({
      error: 'An internal server error occurred while processing the upload.',
      details: error.message
    });
  }
}
