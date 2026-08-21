import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Shanahan University Portals <noreply@shanahanuni.edu.ng>';
const APPLICANT_PORTAL_URL = process.env.APPLICANT_PORTAL_URL || 'http://localhost:5173';

function createTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[Email Service Warning] SMTP_USER or SMTP_PASS not set in environment. Email sending will log to console.');
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

export async function sendVerificationEmail(toEmail: string, token: string, baseUrl?: string): Promise<boolean> {
  const portalUrl = baseUrl || process.env.APPLICANT_PORTAL_URL || 'http://localhost:5173';
  const verifyLink = `${portalUrl.replace(/\/+$/, '')}/verify-email?token=${token}`;
  const subject = 'Shanahan University - Verify Your Email Address';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
      <div style="background-color: #800000; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Shanahan University</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Digital Portals Verification</p>
      </div>
      <div style="padding: 20px;">
        <p>Dear User,</p>
        <p>Thank you for registering on the Shanahan University Digital Portal. Please verify your email address to complete your activation.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #800000; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="font-size: 13px; color: #666666;">Or copy and paste this link into your browser:<br><a href="${verifyLink}">${verifyLink}</a></p>
        <p style="margin-top: 30px;">If you did not initiate this request, please ignore this email.</p>
      </div>
      <div style="border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center; font-size: 12px; color: #999999;">
        &copy; ${new Date().getFullYear()} Shanahan University. All rights reserved.
      </div>
    </div>
  `;

  return sendEmail(toEmail, subject, htmlContent, `Verify email link: ${verifyLink}`);
}

export async function sendPasswordResetEmail(toEmail: string, token: string, baseUrl?: string): Promise<boolean> {
  const portalUrl = baseUrl || process.env.APPLICANT_PORTAL_URL || 'http://localhost:5173';
  const resetLink = `${portalUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;
  const subject = 'Shanahan University - Password Reset Request';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
      <div style="background-color: #800000; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Shanahan University</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Account Password Reset</p>
      </div>
      <div style="padding: 20px;">
        <p>Hello,</p>
        <p>A password reset was requested for your Shanahan University account. Click the button below to reset your password. This link is valid for 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #800000; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #666666;">Or copy and paste this link into your browser:<br><a href="${resetLink}">${resetLink}</a></p>
        <p style="margin-top: 30px;">If you did not request a password reset, please ignore this email or contact ICT support immediately if you have concerns.</p>
      </div>
      <div style="border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center; font-size: 12px; color: #999999;">
        &copy; ${new Date().getFullYear()} Shanahan University. All rights reserved.
      </div>
    </div>
  `;

  return sendEmail(toEmail, subject, htmlContent, `Password reset link: ${resetLink}`);
}

async function sendEmail(toEmail: string, subject: string, htmlContent: string, fallbackLogText: string): Promise<boolean> {
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[Email Dispatch Logged] To: ${toEmail} | Subject: ${subject} | Details: ${fallbackLogText}`);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      html: htmlContent
    });
    console.log(`[Email Sent] Message ID: ${info.messageId} to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`[Email Dispatch Failed] Failed to send email to ${toEmail}:`, error);
    // Log token to console in dev fallback if dispatch fails
    console.log(`[Email Dispatch Fallback Log] To: ${toEmail} | Details: ${fallbackLogText}`);
    return false;
  }
}
