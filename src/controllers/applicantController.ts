import { Response } from 'express';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/auth';

// ─── LIST APPLICANTS ──────────────────────────────────────────────────────────
export async function listApplicants(req: AuthRequest, res: Response) {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      programId,
      admissionStatus,
      gender,
      admissionYear
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { applicationNo: { contains: search, mode: 'insensitive' } },
        { jambRegNo: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (programId) where.programId = programId;
    if (admissionStatus) where.admissionStatus = admissionStatus;
    if (gender) where.gender = gender.toUpperCase();
    if (admissionYear) where.admissionYear = parseInt(admissionYear);

    const [applicants, total] = await Promise.all([
      prisma.applicantProfile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, id: true, isEmailVerified: true } },
          program: { include: { department: { include: { faculty: true } } } }
        }
      }),
      prisma.applicantProfile.count({ where })
    ]);

    return res.json({
      data: applicants,
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (error: any) {
    console.error('listApplicants error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET APPLICANT BY ID ──────────────────────────────────────────────────────
export async function getApplicant(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const applicant = await prisma.applicantProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, id: true, isEmailVerified: true } },
        program: { include: { department: { include: { faculty: true } } } }
      }
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Applicant not found.' });
    }

    return res.json({ data: applicant });
  } catch (error: any) {
    console.error('getApplicant error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE APPLICANT ADMISSION STATUS ────────────────────────────────────────
export async function updateApplicantStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { admissionStatus } = req.body;

    if (!admissionStatus || !['PENDING', 'ADMITTED', 'REJECTED', 'WITHDRAWN'].includes(admissionStatus)) {
      return res.status(400).json({ error: 'Valid admissionStatus is required.' });
    }

    const applicant = await prisma.applicantProfile.findUnique({
      where: { id }
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Applicant not found.' });
    }

    const updated = await prisma.applicantProfile.update({
      where: { id },
      data: { admissionStatus },
      include: { program: true }
    });

    return res.json({ message: 'Applicant admission status updated.', data: updated });
  } catch (error: any) {
    console.error('updateApplicantStatus error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── UPDATE APPLICANT ─────────────────────────────────────────────────────────
export async function updateApplicant(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      phoneNumber,
      gender,
      dateOfBirth,
      programId,
      passportPhotoUrl,
      residentialAddress,
      country,
      state,
      lga,
      oLevelResultUrl,
      birthCertificateUrl,
      utmeResultUrl,
      jambAdmissionLetterUrl,
      stateOfOriginCertUrl,
      medicalCertUrl,
      guarantorFormUrl,
      docVerificationStatus,
    } = req.body;

    const applicant = await prisma.applicantProfile.findUnique({ where: { id } });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found.' });

    const updated = await prisma.applicantProfile.update({
      where: { id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(gender && { gender: gender.toUpperCase() }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(programId !== undefined && { programId }),
        ...(passportPhotoUrl !== undefined && { passportPhotoUrl }),
        ...(residentialAddress !== undefined && { residentialAddress }),
        ...(country !== undefined && { country }),
        ...(state !== undefined && { state }),
        ...(lga !== undefined && { lga }),
        ...(oLevelResultUrl !== undefined && { oLevelResultUrl }),
        ...(birthCertificateUrl !== undefined && { birthCertificateUrl }),
        ...(utmeResultUrl !== undefined && { utmeResultUrl }),
        ...(jambAdmissionLetterUrl !== undefined && { jambAdmissionLetterUrl }),
        ...(stateOfOriginCertUrl !== undefined && { stateOfOriginCertUrl }),
        ...(medicalCertUrl !== undefined && { medicalCertUrl }),
        ...(guarantorFormUrl !== undefined && { guarantorFormUrl }),
        ...(docVerificationStatus !== undefined && { docVerificationStatus }),
      },
      include: {
        program: true,
        user: { select: { email: true } },
      },
    });

    return res.json({ message: 'Applicant updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateApplicant error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── APPLICANT ACCEPTANCE FEE PAYMENT ─────────────────────────────────────────

import { initializeTransaction, verifyTransaction } from '../services/paystackService';
import { matriculateApplicant } from '../services/matricService';

export async function updateApplicantSelf(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const applicant = await prisma.applicantProfile.findUnique({ where: { userId } });
    if (!applicant) return res.status(404).json({ error: 'Applicant profile not found.' });

    const {
      firstName,
      lastName,
      phoneNumber,
      gender,
      dateOfBirth,
      programId,
      passportPhotoUrl,
      residentialAddress,
      country,
      state,
      lga,
      oLevelResultUrl,
      birthCertificateUrl,
      utmeResultUrl,
      jambAdmissionLetterUrl,
      stateOfOriginCertUrl,
      medicalCertUrl,
      guarantorFormUrl
    } = req.body;

    const updated = await prisma.applicantProfile.update({
      where: { id: applicant.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(gender && { gender: gender.toUpperCase() }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(programId !== undefined && { programId }),
        ...(passportPhotoUrl !== undefined && { passportPhotoUrl }),
        ...(residentialAddress !== undefined && { residentialAddress }),
        ...(country !== undefined && { country }),
        ...(state !== undefined && { state }),
        ...(lga !== undefined && { lga }),
        ...(oLevelResultUrl !== undefined && { oLevelResultUrl }),
        ...(birthCertificateUrl !== undefined && { birthCertificateUrl }),
        ...(utmeResultUrl !== undefined && { utmeResultUrl }),
        ...(jambAdmissionLetterUrl !== undefined && { jambAdmissionLetterUrl }),
        ...(stateOfOriginCertUrl !== undefined && { stateOfOriginCertUrl }),
        ...(medicalCertUrl !== undefined && { medicalCertUrl }),
        ...(guarantorFormUrl !== undefined && { guarantorFormUrl })
      },
      include: {
        program: true,
        user: { select: { email: true } }
      }
    });

    return res.json({ message: 'Profile updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateApplicantSelf error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function initializeApplicationFeePayment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { callbackUrl } = req.body;
    const applicant = await prisma.applicantProfile.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Applicant profile not found.' });
    }

    // Find or create 'Application Fee' FeeCategory
    let category = await prisma.feeCategory.findUnique({
      where: { name: 'Application Fee' }
    });
    if (!category) {
      category = await prisma.feeCategory.create({
        data: { name: 'Application Fee', description: 'Application fee for prospective students' }
      });
    }

    // Check if already paid
    const completedPayment = await prisma.payment.findFirst({
      where: {
        applicantId: applicant.id,
        status: 'COMPLETED',
        items: {
          some: {
            feeCategoryId: category.id
          }
        }
      }
    });

    if (completedPayment) {
      return res.status(400).json({ error: 'Your Application Fee has already been successfully paid.' });
    }

    // Get dynamic application fee from settings, default to 10000
    const appFeeSetting = await prisma.systemSetting.findUnique({
      where: { key: 'application_fee' }
    });
    const amount = appFeeSetting ? Number(appFeeSetting.value) : 10000;

    // Get active academic period
    const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) return res.status(400).json({ error: 'No active academic session found.' });

    const semester = await prisma.semester.findFirst({ where: { sessionId: session.id, isCurrent: true } });
    if (!semester) return res.status(400).json({ error: 'No active semester found.' });

    // Look for existing pending application fee payment or create new
    let payment = await prisma.payment.findFirst({
      where: {
        applicantId: applicant.id,
        status: 'PENDING',
        items: {
          some: {
            feeCategoryId: category.id
          }
        }
      }
    });

    if (!payment) {
      payment = await prisma.payment.create({
        data: {
          applicantId: applicant.id,
          sessionId: session.id,
          semesterId: semester.id,
          amountDue: amount,
          amountPaid: 0,
          status: 'PENDING',
          items: {
            create: [
              {
                feeCategoryId: category.id,
                amountDue: amount,
                amountPaid: 0
              }
            ]
          }
        }
      });
    }

    // Construct callback url if not provided
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const targetCallbackUrl = callbackUrl || `${origin}/dashboard`;

    // Initialize Paystack transaction
    const response = await initializeTransaction(applicant.user.email, amount, {
      paymentId: payment.id,
      applicantId: applicant.id,
      paymentType: 'application_fee'
    }, targetCallbackUrl);

    if (!response.status || !response.data) {
      return res.status(400).json({ error: response.message });
    }

    // Save temporary reference
    await prisma.payment.update({
      where: { id: payment.id },
      data: { txReference: response.data.reference }
    });

    return res.json({ data: response.data });
  } catch (error: any) {
    console.error('initializeApplicationFeePayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function verifyApplicationFeePayment(req: AuthRequest, res: Response) {
  try {
    const { reference, simulate } = req.body;
    if (!reference) return res.status(400).json({ error: 'Transaction reference is required.' });

    let verifiedAmount = 0;

    if (simulate && process.env.NODE_ENV !== 'production') {
      const payment = await prisma.payment.findFirst({
        where: { txReference: reference }
      });
      if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
      verifiedAmount = payment.amountDue;
    } else {
      const verification = await verifyTransaction(reference);
      if (!verification.status || !verification.data || verification.data.status !== 'success') {
        return res.status(400).json({ error: 'Payment verification failed.' });
      }
      verifiedAmount = verification.data.amount / 100;
    }

    // Find applicant payment record
    const payment = await prisma.payment.findFirst({
      where: { txReference: reference },
      include: { applicant: true }
    });

    if (!payment || !payment.applicantId || !payment.applicant) {
      return res.status(404).json({ error: 'Application fee payment record or applicant details not found.' });
    }

    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Application Fee verified successfully.' });
    }

    // Update payment record
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountPaid: verifiedAmount,
        status: 'COMPLETED',
        paymentDate: new Date(),
        items: {
          updateMany: {
            where: { paymentId: payment.id },
            data: { amountPaid: verifiedAmount }
          }
        }
      }
    });

    return res.json({
      message: 'Application fee successfully verified.'
    });
  } catch (error: any) {
    console.error('verifyApplicationFeePayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function initializeApplicantPayment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { callbackUrl } = req.body;
    const applicant = await prisma.applicantProfile.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Applicant profile not found.' });
    }

    if (applicant.admissionStatus !== 'ADMITTED') {
      return res.status(403).json({ error: 'You must be offered admission before you can pay the acceptance fee.' });
    }

    // Find or create 'Acceptance Fee' FeeCategory
    let category = await prisma.feeCategory.findUnique({
      where: { name: 'Acceptance Fee' }
    });
    if (!category) {
      category = await prisma.feeCategory.create({
        data: { name: 'Acceptance Fee', description: 'Acceptance fee for admitted students' }
      });
    }

    // Check if already paid
    const completedPayment = await prisma.payment.findFirst({
      where: {
        applicantId: applicant.id,
        status: 'COMPLETED',
        items: {
          some: {
            feeCategoryId: category.id
          }
        }
      }
    });

    if (completedPayment) {
      return res.status(400).json({ error: 'Your Acceptance Fee has already been successfully paid.' });
    }

    // Get active academic period
    const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) return res.status(400).json({ error: 'No active academic session found.' });

    const semester = await prisma.semester.findFirst({ where: { sessionId: session.id, isCurrent: true } });
    if (!semester) return res.status(400).json({ error: 'No active semester found.' });

    // Get dynamic admission fee from settings, default to 50000
    const admissionFeeSetting = await prisma.systemSetting.findUnique({
      where: { key: 'admission_fee' }
    });
    const amount = admissionFeeSetting ? Number(admissionFeeSetting.value) : 50000;

    // Look for existing pending payment or create new
    let payment = await prisma.payment.findFirst({
      where: {
        applicantId: applicant.id,
        status: 'PENDING',
        items: {
          some: {
            feeCategoryId: category.id
          }
        }
      }
    });

    if (!payment) {
      payment = await prisma.payment.create({
        data: {
          applicantId: applicant.id,
          sessionId: session.id,
          semesterId: semester.id,
          amountDue: amount,
          amountPaid: 0,
          status: 'PENDING',
          items: {
            create: [
              {
                feeCategoryId: category.id,
                amountDue: amount,
                amountPaid: 0
              }
            ]
          }
        }
      });
    }

    // Construct callback url if not provided
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const targetCallbackUrl = callbackUrl || `${origin}/dashboard`;

    // Initialize Paystack transaction
    const response = await initializeTransaction(applicant.user.email, amount, {
      paymentId: payment.id,
      applicantId: applicant.id,
      paymentType: 'acceptance_fee'
    }, targetCallbackUrl);

    if (!response.status || !response.data) {
      return res.status(400).json({ error: response.message });
    }

    // Save temporary reference
    await prisma.payment.update({
      where: { id: payment.id },
      data: { txReference: response.data.reference }
    });

    return res.json({ data: response.data });
  } catch (error: any) {
    console.error('initializeApplicantPayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function verifyApplicantPayment(req: AuthRequest, res: Response) {
  try {
    const { reference, simulate } = req.body;
    if (!reference) return res.status(400).json({ error: 'Transaction reference is required.' });

    let verifiedAmount = 0;

    if (simulate && process.env.NODE_ENV !== 'production') {
      const payment = await prisma.payment.findFirst({
        where: { txReference: reference }
      });
      if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
      verifiedAmount = payment.amountDue;
    } else {
      const verification = await verifyTransaction(reference);
      if (!verification.status || !verification.data || verification.data.status !== 'success') {
        return res.status(400).json({ error: 'Payment verification failed.' });
      }
      verifiedAmount = verification.data.amount / 100;
    }

    // Find applicant payment record
    const payment = await prisma.payment.findFirst({
      where: { txReference: reference },
      include: { applicant: true }
    });

    if (!payment || !payment.applicantId || !payment.applicant) {
      return res.status(404).json({ error: 'Acceptance fee payment record or applicant details not found.' });
    }

    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Acceptance Fee verified and matriculation completed already.' });
    }

    // Update payment record
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountPaid: verifiedAmount,
        status: 'COMPLETED',
        paymentDate: new Date(),
        items: {
          updateMany: {
            where: { paymentId: payment.id },
            data: { amountPaid: verifiedAmount }
          }
        }
      }
    });

    // TRIGGER MATRICULATION CONVERSION
    const studentProfile = await matriculateApplicant(payment.applicant.userId);

    // Link this payment to the student ID as well since they are now a student!
    await prisma.payment.update({
      where: { id: payment.id },
      data: { studentId: studentProfile.id }
    });

    return res.json({
      message: 'Acceptance fee successfully verified. You have been matriculated!',
      matricNumber: studentProfile.matricNumber,
      // Pass the student credentials inside data for frontend visualization
      studentCredentials: studentProfile.metadata
    });
  } catch (error: any) {
    console.error('verifyApplicantPayment error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

