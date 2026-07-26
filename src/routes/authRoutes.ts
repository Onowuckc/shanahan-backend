import { Router } from 'express';
import {
  login,
  getMe,
  changePassword,
  updateMyProfile,
  registerApplicant,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  claimAccountVerify,
  claimAccountActivate
} from '../controllers/authController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Public Auth & Ingestion Routes
router.post('/login', login);
router.post('/register-applicant', registerApplicant);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/claim-account/verify', claimAccountVerify);
router.post('/claim-account/activate', claimAccountActivate);

// Protected routes (any authenticated user)
router.get('/me', verifyToken, getMe);
router.put('/me', verifyToken, updateMyProfile);
router.post('/change-password', verifyToken, changePassword);

// Applicant acceptance & application fee payments
import {
  initializeApplicantPayment,
  verifyApplicantPayment,
  initializeApplicationFeePayment,
  verifyApplicationFeePayment,
  updateApplicantSelf
} from '../controllers/applicantController';

router.post('/applicant/acceptance-fee/initialize', verifyToken, initializeApplicantPayment);
router.post('/applicant/acceptance-fee/verify', verifyToken, verifyApplicantPayment);
router.post('/applicant/application-fee/initialize', verifyToken, initializeApplicationFeePayment);
router.post('/applicant/application-fee/verify', verifyToken, verifyApplicationFeePayment);
router.put('/applicant/profile', verifyToken, updateApplicantSelf);

export default router;
