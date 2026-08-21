import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import adminRoutes from './routes/adminRoutes';
import authRoutes from './routes/authRoutes';
import studentRoutes from './routes/studentRoutes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Protective HTTP headers
app.use(helmet());

// Restrict CORS origins
const allowedOrigins = [
  process.env.APPLICANT_PORTAL_URL || 'http://localhost:5173',
  process.env.ADMIN_PORTAL_URL || 'http://localhost:5174',
  process.env.STUDENT_PORTAL_URL || 'http://localhost:5175',
  process.env.LECTURER_PORTAL_URL || 'http://localhost:5176'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('CORS policy error: Origin not allowed.'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Rate Limiting for Auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 requests per 15 minutes
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Mount routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/student', studentRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
