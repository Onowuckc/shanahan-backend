import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import {
  getStudentDashboardStats,
  listStudentPayments,
  initializeStudentPayment,
  verifyStudentPayment,
  listAvailableCourses,
  submitCourseRegistration,
  listHostelsForStudent,
  requestHostelAllocation,
  getStudentResults,
  submitOffCampusApplication
} from '../controllers/studentPortalController';
import {
  submitBiodataRequest,
  getMyBiodataRequests
} from '../controllers/biodataController';

const router = Router();

// Enforce that only logged-in students can access these endpoints
router.use(verifyToken, requireRoles('STUDENT'));

router.get('/dashboard-stats', getStudentDashboardStats);
router.get('/payments', listStudentPayments);
router.post('/payments/initialize', initializeStudentPayment);
router.post('/payments/verify', verifyStudentPayment);
router.get('/courses/available', listAvailableCourses);
router.post('/courses/register', submitCourseRegistration);
router.get('/hostels', listHostelsForStudent);
router.post('/hostels/allocate', requestHostelAllocation);
router.post('/hostels/off-campus', submitOffCampusApplication);
router.get('/results', getStudentResults);
router.post('/biodata-request', submitBiodataRequest);
router.get('/biodata-requests', getMyBiodataRequests);

export default router;
