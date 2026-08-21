import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Shanahan University <no-reply@shanahanuni.edu.ng>';

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

function getLogoAttachment() {
  const logoPath = path.join(__dirname, '../assets/SHANAHAN-UNI-LOGO.png');
  if (fs.existsSync(logoPath)) {
    return [
      {
        filename: 'SHANAHAN-UNI-LOGO.png',
        path: logoPath,
        cid: 'shanahan-logo'
      }
    ];
  }
  return [];
}

export async function sendVerificationEmail(toEmail: string, token: string, baseUrl?: string): Promise<boolean> {
  const portalUrl = baseUrl || process.env.APPLICANT_PORTAL_URL || 'http://localhost:5173';
  const verifyLink = `${portalUrl.replace(/\/+$/, '')}/verify-email?token=${token}`;
  const subject = 'Shanahan University - Verify Your Email Address';
  
  const htmlContent = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #800020; color: #ffffff; padding: 28px 20px; text-align: center;">
        <img src="cid:shanahan-logo" alt="Shanahan University Logo" style="width: 76px; height: 76px; object-fit: contain; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;" />
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff;">Shanahan University</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #ffccd5; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Digital Portals Verification</p>
      </div>
      <div style="padding: 32px 28px; color: #334155; line-height: 1.6;">
        <p style="font-size: 16px; font-weight: 600; margin-top: 0; color: #0f172a;">Dear Applicant / Student,</p>
        <p style="font-size: 14px; margin-bottom: 24px;">Thank you for registering on the Shanahan University Digital Portal. Please verify your email address to complete your account activation.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verifyLink}" style="background-color: #800020; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 2px 6px rgba(128, 0, 32, 0.3);">Verify Email Address</a>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If the button above does not work, copy and paste the link below into your browser:<br><a href="${verifyLink}" style="color: #800020; word-break: break-all;">${verifyLink}</a></p>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you did not create an account on Shanahan University portal, please disregard this email.</p>
      </div>
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #64748b;">Shanahan University Admissions & Portal Administration</p>
        <p style="margin: 0 0 8px 0; font-style: italic; color: #94a3b8;">This is an automated system email from no-reply@shanahanuni.edu.ng. Please do not reply to this address.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} Shanahan University. All rights reserved.</p>
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
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #800020; color: #ffffff; padding: 28px 20px; text-align: center;">
        <img src="cid:shanahan-logo" alt="Shanahan University Logo" style="width: 76px; height: 76px; object-fit: contain; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;" />
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff;">Shanahan University</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #ffccd5; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Account Security Service</p>
      </div>
      <div style="padding: 32px 28px; color: #334155; line-height: 1.6;">
        <p style="font-size: 16px; font-weight: 600; margin-top: 0; color: #0f172a;">Hello,</p>
        <p style="font-size: 14px; margin-bottom: 24px;">A password reset request was initiated for your Shanahan University account. Click the button below to reset your password. This link is valid for 15 minutes.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" style="background-color: #800020; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 2px 6px rgba(128, 0, 32, 0.3);">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If the button above does not work, copy and paste the link below into your browser:<br><a href="${resetLink}" style="color: #800020; word-break: break-all;">${resetLink}</a></p>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you did not request a password reset, please ignore this email or contact ICT Support immediately.</p>
      </div>
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #64748b;">Shanahan University ICT Support & Security</p>
        <p style="margin: 0 0 8px 0; font-style: italic; color: #94a3b8;">This is an automated system email from no-reply@shanahanuni.edu.ng. Please do not reply to this address.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} Shanahan University. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail(toEmail, subject, htmlContent, `Password reset link: ${resetLink}`);
}

async function sendEmail(toEmail: string, subject: string, htmlContent: string, fallbackLogText: string): Promise<boolean> {
  const transporter = createTransporter();
  const attachments = getLogoAttachment();

  if (!transporter) {
    console.log(`[Email Dispatch Logged] From: ${SMTP_FROM} | To: ${toEmail} | Subject: ${subject} | Details: ${fallbackLogText}`);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      html: htmlContent,
      attachments
    });
    console.log(`[Email Sent] Message ID: ${info.messageId} to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`[Email Dispatch Failed] Failed to send email to ${toEmail}:`, error);
    console.log(`[Email Dispatch Fallback Log] To: ${toEmail} | Details: ${fallbackLogText}`);
    return false;
  }
}
