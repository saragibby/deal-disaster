import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { createEmailTemplate } from './emailTemplates.js';

// Create reusable transporter
const createTransporter = () => {
  // Use SMTP settings from environment variables
  // For production, use a service like SendGrid, AWS SES, or similar
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  
  // For development, log emails to console instead of sending
  console.warn('⚠️  SMTP not configured. Emails will be logged to console only.');
  return null;
};

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string
): Promise<void> {
  const transporter = createTransporter();
  const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

  const bodyHtml = `
    <p>Hi ${name || 'there'},</p>
    <p>Thank you for signing up for <strong>Deal or Disaster</strong>! Please verify your email address to complete your registration and start playing.</p>
    
    <div class="text-center">
      <a href="${verificationUrl}" class="email-button">✅ Verify Email Address</a>
    </div>
    
    <div class="info-box">
      <p style="margin: 0;"><strong>Or copy and paste this link:</strong></p>
      <p class="link-primary" style="margin: 8px 0 0 0;">${verificationUrl}</p>
    </div>
    
    <p class="text-muted">This verification link will expire in 24 hours.</p>
    <p class="text-muted">If you didn't create an account with Deal or Disaster, you can safely ignore this email.</p>
  `;

  const htmlContent = createEmailTemplate({
    title: 'Verify Your Email - Deal or Disaster',
    preheader: 'Click to verify your email and start playing!',
    heroText: '🎉 Welcome to Deal or Disaster!',
    bodyHtml
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@dealdisaster.com',
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM || 'support@moneymanmyers.com',
    to: email,
    subject: 'Verify Your Email - Deal or Disaster',
    html: htmlContent,
    text: `
🎉 Welcome to Deal or Disaster!

Hi ${name || 'there'},

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} Deal or Disaster by Money Man Myers
    `,
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  } else {
    // Development mode - log email details
    console.log('\n📧 ========== EMAIL (Development Mode) ==========');
    console.log('To:', email);
    console.log('Subject:', mailOptions.subject);
    console.log('Verification URL:', verificationUrl);
    console.log('================================================\n');
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name?: string
): Promise<void> {
  const transporter = createTransporter();
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  const bodyHtml = `
    <p>Hi ${name || 'there'},</p>
    <p>We received a request to reset your password for your <strong>Deal or Disaster</strong> account.</p>
    
    <div class="text-center">
      <a href="${resetUrl}" class="email-button">🔐 Reset Password</a>
    </div>
    
    <div class="info-box">
      <p style="margin: 0;"><strong>Or copy and paste this link:</strong></p>
      <p class="link-primary" style="margin: 8px 0 0 0;">${resetUrl}</p>
    </div>
    
    <p class="text-muted">This password reset link will expire in 1 hour.</p>
    
    <div class="warning-box">
      <strong>⚠️ Security Notice:</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged. Your account is secure.
    </div>
  `;

  const htmlContent = createEmailTemplate({
    title: 'Password Reset Request - Deal or Disaster',
    preheader: 'Reset your password to regain access to your account',
    heroText: '🔐 Password Reset Request',
    bodyHtml
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@dealdisaster.com',
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM || 'support@moneymanmyers.com',
    to: email,
    subject: 'Password Reset Request - Deal or Disaster',
    html: htmlContent,
    text: `
Password Reset Request

Hi ${name || 'there'},

We received a request to reset your password for your Deal or Disaster account.

Click the link below to reset your password:

${resetUrl}

This link will expire in 1 hour.

⚠️ Security Notice: If you didn't request a password reset, please ignore this email and your password will remain unchanged.

© ${new Date().getFullYear()} Deal or Disaster by Money Man Myers
    `,
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  } else {
    // Development mode - log email details
    console.log('\n📧 ========== EMAIL (Development Mode) ==========');
    console.log('To:', email);
    console.log('Subject:', mailOptions.subject);
    console.log('Reset URL:', resetUrl);
    console.log('================================================\n');
  }
}
