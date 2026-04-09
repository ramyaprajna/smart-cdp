/**
 * Email Service Module
 *
 * Purpose: Email functionality for user communications and notifications
 *
 * Key Features:
 * - User activation email with secure tokens
 * - Welcome and notification emails
 * - HTML and plain text templates
 * - SendGrid integration with error handling
 * - Comprehensive logging of email events
 *
 * Design Decisions:
 * - Uses SendGrid for reliable email delivery
 * - Fallback handling when API key not configured
 * - HTML templates with responsive design
 * - Detailed logging for audit trail
 *
 * @module EmailService
 * @created Initial implementation
 * @updated August 13, 2025 - Refactored for better error handling and logging
 */

import { MailService } from '@sendgrid/mail';
import { nanoid } from 'nanoid';
import { applicationLogger } from './application-logger';
import {
  ServiceOperation,
  ResponseFormatter
} from '../utils/service-utilities';
import { secureLogger } from '../utils/secure-logger';

if (!process.env.SENDGRID_API_KEY) {
  secureLogger.warn('SENDGRID_API_KEY environment variable not set, email functionality disabled', {}, 'EMAIL_SERVICE');
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

interface ActivationEmailParams {
  email: string;
  firstName: string;
  lastName: string;
  activationToken: string;
}

interface WelcomeEmailParams {
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Send activation email to new users with proper error handling
 *
 * @param params - Activation email parameters
 * @returns Promise<boolean> - Success status
 */
export async function sendActivationEmail(params: ActivationEmailParams): Promise<boolean> {
  const result = await ServiceOperation.execute(
    'sendActivationEmail',
    async () => {
      if (!process.env.SENDGRID_API_KEY) {
        secureLogger.warn('⚠️ SendGrid not configured. Activation email not sent.');
        await applicationLogger.warn('email', 'SendGrid API key not configured', {
          emailAttempt: params.email,
          reason: 'missing_api_key'
        });
        return false;
      }

      const activationLink = `${getBaseUrl()}/activate?token=${params.activationToken}`;

      await applicationLogger.info('email', 'Attempting to send activation email', {
        to: params.email,
        firstName: params.firstName,
        tokenLength: params.activationToken.length
      });

  const emailContent = {
    to: params.email,
    from: process.env.SENDGRID_VERIFIED_SENDER || 'subs@think.web.id', // Default sender email
    subject: '🎉 Activate Your Smart CDP Account',
    text: `
Hello ${params.firstName} ${params.lastName},

Welcome to Smart CDP Platform! Please activate your account by clicking the link below:

${activationLink}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Best regards,
Smart CDP Team
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Activate Your Account</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6, #1e40af); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 30px 20px; }
    .footer { background: #e5e7eb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .button:hover { background: #059669; }
    .warning { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Smart CDP!</h1>
      <p>Your Customer Data Platform awaits</p>
    </div>

    <div class="content">
      <h2>Hello ${params.firstName} ${params.lastName},</h2>

      <p>Thank you for joining Smart CDP Platform! We're excited to have you on board.</p>

      <p>To get started with advanced customer analytics and vector-powered insights, please activate your account:</p>

      <div style="text-align: center;">
        <a href="${activationLink}" class="button">Activate My Account</a>
      </div>

      <div class="warning">
        <strong>⏰ Important:</strong> This activation link will expire in 24 hours. Please activate your account soon to avoid having to request a new link.
      </div>

      <p>Once activated, you'll have access to:</p>
      <ul>
        <li>📊 Advanced customer analytics dashboard</li>
        <li>🔍 Vector-powered similarity search</li>
        <li>🎯 Dynamic customer segmentation</li>
        <li>📈 Real-time performance insights</li>
        <li>🤖 AI-powered data analysis chatbot</li>
      </ul>

      <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: #e5e7eb; padding: 10px; font-family: monospace;">${activationLink}</p>
    </div>

    <div class="footer">
      <p>If you didn't create this account, please ignore this email.</p>
      <p>Need help? Contact our support team.</p>
      <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
        © 2025 Smart CDP Platform. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `
  };

  try {
    await mailService.send(emailContent);
    await applicationLogger.info('email', 'Activation email sent successfully', {
      to: params.email,
      firstName: params.firstName,
      activationLink: activationLink.replace(params.activationToken, '[REDACTED]')
    });
    return true;
  } catch (error) {
    secureLogger.error('❌ Failed to send activation email:', { error: String(error) });
    await applicationLogger.error('email', 'Failed to send activation email', error as Error, {
      to: params.email,
      firstName: params.firstName,
      errorType: 'sendgrid_error'
    });
    return false;
  }
    },
    undefined,
    { email: params.email }
  );
  return result.data || false;
}

/**
 * Send welcome email after successful activation
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    secureLogger.warn('⚠️ SendGrid not configured. Welcome email not sent.');
    return false;
  }

  const emailContent = {
    to: params.email,
    from: process.env.SENDGRID_VERIFIED_SENDER || 'subs@think.web.id', // Default sender email
    subject: '🚀 Welcome to Smart CDP - Your Account is Now Active!',
    text: `
Hello ${params.firstName} ${params.lastName},

Great news! Your Smart CDP account has been successfully activated.

You can now log in and start exploring your Customer Data Platform:
${getBaseUrl()}/login

Get started with:
- Import and analyze your customer data
- Create dynamic customer segments
- Use AI-powered similarity search
- Generate insights with our analytics chatbot

We're here to help you unlock the full potential of your customer data!

Best regards,
Smart CDP Team
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Smart CDP</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 30px 20px; }
    .footer { background: #e5e7eb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .button:hover { background: #2563eb; }
    .feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .feature { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Welcome to Smart CDP!</h1>
      <p>Your account is now active and ready to use</p>
    </div>

    <div class="content">
      <h2>Hello ${params.firstName} ${params.lastName},</h2>

      <p><strong>Congratulations!</strong> Your Smart CDP account has been successfully activated.</p>

      <div style="text-align: center;">
        <a href="${getBaseUrl()}/login" class="button">Start Exploring Your Dashboard</a>
      </div>

      <h3>🎯 What you can do now:</h3>

      <div class="feature-grid">
        <div class="feature">
          <strong>📊 Analytics Dashboard</strong><br>
          View comprehensive customer insights and performance metrics
        </div>
        <div class="feature">
          <strong>🔍 Vector Search</strong><br>
          Find similar customers using AI-powered similarity matching
        </div>
        <div class="feature">
          <strong>📁 Data Import</strong><br>
          Import customer data from Excel, CSV, or JSON files
        </div>
        <div class="feature">
          <strong>🎯 Segmentation</strong><br>
          Create dynamic customer segments for targeted campaigns
        </div>
      </div>

      <h3>🤖 AI-Powered Features:</h3>
      <ul>
        <li><strong>Smart Column Mapping:</strong> AI automatically maps your data columns</li>
        <li><strong>Analytics Chatbot:</strong> Ask questions about your data in natural language</li>
        <li><strong>Customer Similarity:</strong> Find customers with similar characteristics</li>
        <li><strong>Behavioral Insights:</strong> Discover patterns in customer behavior</li>
      </ul>

      <p>Ready to transform your customer data into actionable insights? Log in now and start your journey!</p>
    </div>

    <div class="footer">
      <p>Need help getting started? Check out our documentation or contact support.</p>
      <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
        © 2025 Smart CDP Platform. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `
  };

  try {
    await mailService.send(emailContent);
    return true;
  } catch (error) {
    secureLogger.error('❌ Failed to send welcome email:', { error: String(error) });
    return false;
  }
}

/**
 * Generate a secure activation token
 */
export function generateActivationToken(): string {
  return nanoid(32); // 32-character random string
}

/**
 * Get token expiration date (24 hours from now)
 */
export function getTokenExpiration(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
}

/**
 * Get base URL for the application
 */
export function getBaseUrl(): string {
  // In development
  if (process.env.NODE_ENV === 'development') {
    return process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
  }

  // In production
  return process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'https://your-app.replit.app'; // fallback
}

/**
 * Generic email sender function
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    secureLogger.warn('⚠️ SendGrid not configured. Email not sent.');
    return false;
  }

  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    return true;
  } catch (error) {
    secureLogger.error('❌ Failed to send email:', { error: String(error) });
    return false;
  }
}
