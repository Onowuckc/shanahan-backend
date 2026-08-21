import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRoles, checkAccess } from '../middleware/rbac';
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  studentStats,
} from '../controllers/studentController';
import {
  listFaculties,
  getFaculty,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  listPrograms,
  createProgram,
  updateProgram,
  listProgrammeOLevelReqs,
  upsertProgrammeOLevelReqs,
  getDepartmentMaxUnits,
  updateDepartmentMaxUnits,
  listProgramRequirements,
  updateProgramRequirement,
} from '../controllers/academicController';
import {
  listSessions,
  createSession,
  setCurrentSession,
  setCurrentSemester,
  getCurrentSession,
} from '../controllers/sessionController';
import {
  listFeeCategories,
  createFeeCategory,
  updateFeeCategory,
  listFeeStructures,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
} from '../controllers/feeController';
import {
  listPayments,
  getPayment,
  paymentStats,
  createManualPayment,
} from '../controllers/paymentController';
import {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  listCourses,
  createCourse,
  updateCourse,
  listCourseRegistrations,
  approveCourseRegistration,
  listHostels,
  createHostel,
  updateHostel,
  listHostelAllocations,
  updateHostelAllocation,
  getCustomFields,
  saveCustomFields,
  getSystemSettings,
  updateSystemSettings,
  listScoreConfigs,
  upsertScoreConfig,
  deleteScoreConfig,
  getCourseEnrollments,
  updateCourseGrades,
} from '../controllers/operationsController';
import { getDashboardStats, listAuditLogs } from '../controllers/reportController';
import multer from 'multer';
import { uploadStudents } from '../controllers/uploadController';
import { uploadStaff } from '../controllers/staffUploadController';
import {
  listApplicants,
  getApplicant,
  updateApplicantStatus,
  updateApplicant,
  enrolApplicantAsStudent,
  deleteApplicant,
} from '../controllers/applicantController';
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  updateUserRole,
  adminResetPassword,
  toggleUserVerified,
  deleteAdminUser,
} from '../controllers/userManagementController';
import {
  getAdminBiodataRequests,
  approveBiodataRequest,
  rejectBiodataRequest
} from '../controllers/biodataController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const READ_ROLES = ['SUPER_ADMIN', 'ICT_ADMIN', 'REGISTRY_STAFF', 'BURSARY_STAFF', 'EXAMS_RECORDS_STAFF',
  'FACULTY_OFFICER', 'DEPARTMENT_OFFICER', 'STUDENT_AFFAIRS_STAFF', 'HOSTEL_ADMIN', 'UNIVERSITY_MANAGEMENT'];

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', verifyToken, requireRoles(...READ_ROLES), getDashboardStats);

// ─── STUDENTS ────────────────────────────────────────────────────────────────
router.get('/students', verifyToken, checkAccess('students', 'read'), listStudents);
router.get('/students/stats', verifyToken, checkAccess('students', 'read'), studentStats);
router.get('/students/:id', verifyToken, checkAccess('students', 'read'), getStudent);
router.post('/students', verifyToken, checkAccess('students', 'write'), createStudent);
router.put('/students/:id', verifyToken, checkAccess('students', 'write'), updateStudent);
router.delete('/students/:id', verifyToken, checkAccess('students', 'delete'), deleteStudent);

// Bulk upload
router.post('/upload-students', verifyToken, checkAccess('students', 'write'), upload.single('file'), uploadStudents);
router.post('/upload-staff', verifyToken, checkAccess('staff', 'write'), upload.single('file'), uploadStaff);

// ─── APPLICANTS ──────────────────────────────────────────────────────────────
router.get('/applicants', verifyToken, checkAccess('admissions', 'read'), listApplicants);
router.get('/applicants/:id', verifyToken, checkAccess('admissions', 'read'), getApplicant);
router.put('/applicants/:id', verifyToken, checkAccess('admissions', 'write'), updateApplicant);
router.put('/applicants/:id/admission-status', verifyToken, checkAccess('admissions', 'write'), updateApplicantStatus);
router.post('/applicants/:id/enrol', verifyToken, checkAccess('admissions', 'write'), enrolApplicantAsStudent);
router.delete('/applicants/:id', verifyToken, checkAccess('admissions', 'delete'), deleteApplicant);

// ─── STAFF ───────────────────────────────────────────────────────────────────
router.get('/staff', verifyToken, checkAccess('staff', 'read'), listStaff);
router.get('/staff/:id', verifyToken, checkAccess('staff', 'read'), getStaff);
router.post('/staff', verifyToken, checkAccess('staff', 'write'), createStaff);
router.put('/staff/:id', verifyToken, checkAccess('staff', 'write'), updateStaff);
router.delete('/staff/:id', verifyToken, checkAccess('staff', 'delete'), deleteStaff);

// ─── FACULTIES ───────────────────────────────────────────────────────────────
router.get('/faculties', verifyToken, listFaculties);
router.get('/faculties/:id', verifyToken, getFaculty);
router.post('/faculties', verifyToken, checkAccess('academic_setup', 'write'), createFaculty);
router.put('/faculties/:id', verifyToken, checkAccess('academic_setup', 'write'), updateFaculty);
router.delete('/faculties/:id', verifyToken, checkAccess('academic_setup', 'delete'), deleteFaculty);

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────
router.get('/departments', verifyToken, listDepartments);
router.get('/departments/:id', verifyToken, getDepartment);
router.post('/departments', verifyToken, checkAccess('academic_setup', 'write'), createDepartment);
router.put('/departments/:id', verifyToken, checkAccess('academic_setup', 'write'), updateDepartment);
router.get('/departments/:id/max-units', verifyToken, getDepartmentMaxUnits);
router.post('/departments/:id/max-units', verifyToken, checkAccess('academic_setup', 'write'), updateDepartmentMaxUnits);

// ─── PROGRAMS ────────────────────────────────────────────────────────────────
router.get('/programs', listPrograms);
router.post('/programs', verifyToken, checkAccess('academic_setup', 'write'), createProgram);
router.put('/programs/:id', verifyToken, checkAccess('academic_setup', 'write'), updateProgram);
router.get('/programs/:id/requirements', verifyToken, checkAccess('academic_setup', 'read'), listProgramRequirements);
router.post('/programs/:id/requirements', verifyToken, checkAccess('academic_setup', 'write'), updateProgramRequirement);
router.get('/programs-olevel', verifyToken, checkAccess('admissions', 'read'), listProgrammeOLevelReqs);
router.post('/programs-olevel', verifyToken, checkAccess('admissions', 'write'), upsertProgrammeOLevelReqs);

// ─── ACADEMIC SESSIONS ───────────────────────────────────────────────────────
router.get('/sessions', verifyToken, listSessions);
router.get('/sessions/current', verifyToken, getCurrentSession);
router.post('/sessions', verifyToken, checkAccess('academic_setup', 'write'), createSession);
router.put('/sessions/:id/set-current', verifyToken, checkAccess('academic_setup', 'write'), setCurrentSession);
router.put('/sessions/semesters/:semesterId/set-current', verifyToken, checkAccess('academic_setup', 'write'), setCurrentSemester);

// ─── FEE CATEGORIES ──────────────────────────────────────────────────────────
router.get('/fee-categories', verifyToken, checkAccess('finance', 'read'), listFeeCategories);
router.post('/fee-categories', verifyToken, checkAccess('finance', 'write'), createFeeCategory);
router.put('/fee-categories/:id', verifyToken, checkAccess('finance', 'write'), updateFeeCategory);

// ─── FEE STRUCTURES ──────────────────────────────────────────────────────────
router.get('/fee-structures', verifyToken, checkAccess('finance', 'read'), listFeeStructures);
router.post('/fee-structures', verifyToken, checkAccess('finance', 'write'), createFeeStructure);
router.put('/fee-structures/:id', verifyToken, checkAccess('finance', 'write'), updateFeeStructure);
router.delete('/fee-structures/:id', verifyToken, checkAccess('finance', 'delete'), deleteFeeStructure);

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
router.get('/payments', verifyToken, checkAccess('finance', 'read'), listPayments);
router.get('/payments/stats', verifyToken, checkAccess('finance', 'read'), paymentStats);
router.get('/payments/:id', verifyToken, checkAccess('finance', 'read'), getPayment);
router.post('/payments/manual', verifyToken, checkAccess('finance', 'write'), createManualPayment);

// ─── COURSES ─────────────────────────────────────────────────────────────────
router.get('/courses', verifyToken, listCourses);
router.post('/courses', verifyToken, checkAccess('academic_records', 'write'), createCourse);
router.put('/courses/:id', verifyToken, checkAccess('academic_records', 'write'), updateCourse);
router.get('/courses/:id/enrollments', verifyToken, requireRoles('SUPER_ADMIN', 'LECTURER', 'EXAMS_RECORDS_STAFF', 'DEPARTMENT_OFFICER', 'FACULTY_OFFICER', 'REGISTRY_STAFF'), getCourseEnrollments);
router.post('/courses/:id/grades', verifyToken, requireRoles('SUPER_ADMIN', 'LECTURER', 'EXAMS_RECORDS_STAFF', 'DEPARTMENT_OFFICER', 'FACULTY_OFFICER'), updateCourseGrades);

// ─── COURSE REGISTRATIONS ────────────────────────────────────────────────────
router.get('/course-registrations', verifyToken, checkAccess('academic_records', 'read'), listCourseRegistrations);
router.put('/course-registrations/:id/approve', verifyToken, checkAccess('academic_records', 'write'), approveCourseRegistration);

// ─── HOSTELS ─────────────────────────────────────────────────────────────────
router.get('/hostels', verifyToken, checkAccess('hostels', 'read'), listHostels);
router.post('/hostels', verifyToken, checkAccess('hostels', 'write'), createHostel);
router.put('/hostels/:id', verifyToken, checkAccess('hostels', 'write'), updateHostel);
router.get('/hostel-allocations', verifyToken, checkAccess('hostels', 'read'), listHostelAllocations);
router.put('/hostel-allocations/:id', verifyToken, checkAccess('hostels', 'write'), updateHostelAllocation);

// ─── USER MANAGEMENT (Admin/ICT only) ──────────────────────────────────────────────
router.get('/users', verifyToken, checkAccess('user_management', 'read'), listAdminUsers);
router.post('/users', verifyToken, checkAccess('user_management', 'write'), createAdminUser);
router.put('/users/:id', verifyToken, checkAccess('user_management', 'write'), updateAdminUser);
router.put('/users/:id/role', verifyToken, checkAccess('user_management', 'write'), updateUserRole);
router.put('/users/:id/reset-password', verifyToken, checkAccess('user_management', 'write'), adminResetPassword);
router.put('/users/:id/toggle-verified', verifyToken, checkAccess('user_management', 'write'), toggleUserVerified);
router.delete('/users/:id', verifyToken, checkAccess('user_management', 'delete'), deleteAdminUser);

// ─── AUDIT LOGS ─────────────────────────────────────────────────────────────────
router.get('/audit-logs', verifyToken, checkAccess('audit_logs', 'read'), listAuditLogs);

// ─── SETTINGS & CUSTOM FIELDS ────────────────────────────────────────────────
router.get('/settings/custom-fields', verifyToken, checkAccess('settings', 'read'), getCustomFields);
router.post('/settings/custom-fields', verifyToken, checkAccess('settings', 'write'), saveCustomFields);
router.get('/settings/system', verifyToken, checkAccess('settings', 'read'), getSystemSettings);
router.post('/settings/system', verifyToken, checkAccess('settings', 'write'), updateSystemSettings);
router.get('/settings/score-configs', verifyToken, checkAccess('academic_records', 'read'), listScoreConfigs);
router.post('/settings/score-configs', verifyToken, checkAccess('academic_records', 'write'), upsertScoreConfig);
router.delete('/settings/score-configs/:id', verifyToken, checkAccess('academic_records', 'delete'), deleteScoreConfig);

// ─── BIODATA CHANGE REQUESTS (Registry / Admin) ─────────────────────────────────
router.get('/biodata-requests', verifyToken, checkAccess('students', 'read'), getAdminBiodataRequests);
router.put('/biodata-requests/:id/approve', verifyToken, checkAccess('students', 'write'), approveBiodataRequest);
router.put('/biodata-requests/:id/reject', verifyToken, checkAccess('students', 'write'), rejectBiodataRequest);

export default router;
