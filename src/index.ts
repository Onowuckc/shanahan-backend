import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import adminRoutes from './routes/adminRoutes';
import authRoutes from './routes/authRoutes';
import studentRoutes from './routes/studentRoutes';

import { sanitizeInputs } from './middleware/validator';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Protective HTTP headers with CSP and HSTS
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  })
);

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

app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInputs);

// Global API Rate Limiting (100 req per 15 min per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', globalLimiter);

// Auth Rate Limiting (15 req per 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many authentication attempts from this IP, please try again after 15 minutes.' },
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
