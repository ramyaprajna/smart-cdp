import type { Express } from "express";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { generateToken, requireAuth } from "../jwt-utils";
import { rateLimitMiddleware } from "../performance-middleware";
import { applicationLogger } from "../services/application-logger";

export function setupAuthRoutes(app: Express): void {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        await applicationLogger.warn('authentication', 'Login attempt with missing credentials', { email: email || 'not_provided' }, req);
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        await applicationLogger.warn('authentication', 'Login attempt with invalid email', { email }, req);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        await applicationLogger.warn('authentication', 'Login attempt with inactive account', {
          userId: user.id, email, reason: 'account_not_activated'
        }, req);
        return res.status(401).json({
          error: "Account not activated",
          code: "ACCOUNT_NOT_ACTIVATED",
          message: "Please check your email and activate your account before logging in."
        });
      }

      if (!user.isEmailVerified) {
        await applicationLogger.warn('authentication', 'Login attempt with unverified email', {
          userId: user.id, email, reason: 'email_not_verified'
        }, req);
        return res.status(401).json({
          error: "Email not verified",
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address to access your account."
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        await applicationLogger.warn('authentication', 'Failed login attempt with invalid password', {
          userId: user.id, email, reason: 'invalid_password'
        }, req);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        role: user.role,
        isActive: user.isActive ?? false
      });

      try {
        await storage.updateUserLastLogin?.(user.id);
      } catch (_) {
        // Non-critical, skip silently
      }

      await applicationLogger.info('authentication', 'User logged in successfully', {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        loginMethod: 'password'
      }, req);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified
        }
      });
    } catch (error) {
      applicationLogger.error('authentication', 'Login error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Login process failed', error as Error, {
        attemptedEmail: req.body.email
      }, req);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      if (req.user) {
        await applicationLogger.info('authentication', 'User logged out', {
          userId: req.user.id, email: req.user.email, role: req.user.role
        }, req);
      } else {
        await applicationLogger.info('authentication', 'Logout attempt without valid session', {}, req);
      }
      res.clearCookie('token');
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      applicationLogger.error('authentication', 'Logout error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Logout process failed', error as Error, {}, req);
      res.clearCookie('token');
      res.json({ success: true, message: "Logged out successfully" });
    }
  });

  app.post("/api/auth/demo-credentials", rateLimitMiddleware(5, 60000), async (req, res) => {
    try {
      const isDemoEnabled = process.env.ENABLE_DEMO_LOGIN === 'true' ||
                           process.env.NODE_ENV === 'development';

      if (!isDemoEnabled) {
        await applicationLogger.warn('authentication', 'Demo credentials requested in non-demo environment', {
          environment: process.env.NODE_ENV, ip: req.ip
        }, req);
        return res.status(403).json({
          error: "Demo mode is not available in this environment",
          message: "Please use regular authentication"
        });
      }

      const { role } = req.body;

      if (!role || !['admin', 'analyst', 'viewer', 'marketing'].includes(role)) {
        return res.status(400).json({ error: "Invalid role specified" });
      }

      await applicationLogger.info('authentication', 'Demo credentials requested', {
        requestedRole: role, environment: process.env.NODE_ENV, ip: req.ip
      }, req);

      const demoEmails: Record<string, string> = {
        admin: 'admin@prambors.com',
        analyst: 'analyst@prambors.com',
        viewer: 'viewer@prambors.com',
        marketing: 'marketing@prambors.com'
      };

      res.json({
        email: demoEmails[role],
        message: "Demo email provided. Use demo login button to authenticate.",
        isDemoMode: true
      });
    } catch (error) {
      applicationLogger.error('authentication', 'Demo credentials error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Demo credentials request failed', error as Error, {}, req);
      res.status(500).json({ error: "Failed to provide demo credentials" });
    }
  });

  app.post("/api/auth/demo-login", rateLimitMiddleware(10, 60000), async (req, res) => {
    try {
      const isDemoEnabled = process.env.ENABLE_DEMO_LOGIN === 'true' ||
                           process.env.NODE_ENV === 'development';

      if (!isDemoEnabled) {
        await applicationLogger.warn('authentication', 'Demo login attempt in non-demo environment', {
          environment: process.env.NODE_ENV, ip: req.ip
        }, req);
        return res.status(403).json({
          error: "Demo login is not available in this environment"
        });
      }

      const { role } = req.body;

      if (!role || !['admin', 'analyst', 'viewer', 'marketing'].includes(role)) {
        return res.status(400).json({ error: "Invalid role for demo login" });
      }

      const demoAccounts = {
        admin: { email: 'admin@prambors.com', password: process.env.DEMO_ADMIN_PASSWORD || 'demo_admin_2024!' },
        analyst: { email: 'analyst@prambors.com', password: process.env.DEMO_ANALYST_PASSWORD || 'demo_analyst_2024!' },
        viewer: { email: 'viewer@prambors.com', password: process.env.DEMO_VIEWER_PASSWORD || 'demo_viewer_2024!' },
        marketing: { email: 'marketing@prambors.com', password: process.env.DEMO_MARKETING_PASSWORD || 'demo_marketing_2024!' }
      };

      const demoAccount = demoAccounts[role as keyof typeof demoAccounts];

      let user = await storage.getUserByEmail(demoAccount.email);

      if (!user) {
        const hashedPassword = await bcrypt.hash(demoAccount.password, 10);
        user = await storage.createUser({
          email: demoAccount.email,
          passwordHash: hashedPassword,
          firstName: 'Demo',
          lastName: role.charAt(0).toUpperCase() + role.slice(1),
          role,
          isActive: true,
          isEmailVerified: true
        });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        firstName: user.firstName || 'Demo',
        lastName: user.lastName || role,
        role: user.role,
        isActive: true,
        isDemo: true
      });

      await applicationLogger.info('authentication', 'Demo login successful', {
        userId: user.id, email: user.email, role: user.role,
        environment: process.env.NODE_ENV, ip: req.ip
      }, req);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: true,
          isEmailVerified: true,
          isDemo: true
        },
        message: "Demo login successful. Session expires in 1 hour."
      });
    } catch (error) {
      applicationLogger.error('authentication', 'Demo login error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Demo login failed', error as Error, {
        requestedRole: req.body.role
      }, req);
      res.status(500).json({ error: "Demo login failed" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);

      if (!user) {
        await applicationLogger.warn('authentication', 'Valid JWT token for non-existent user', {
          tokenUserId: req.user!.id, tokenEmail: req.user!.email
        }, req);
        res.clearCookie('token');
        return res.status(401).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
          message: "Please log in again"
        });
      }

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      await applicationLogger.error('authentication', 'Failed to get current user', error as Error, {
        userId: req.user?.id
      }, req);
      res.status(500).json({ error: "Failed to get current user" });
    }
  });

  app.get("/api/auth/activate", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        await applicationLogger.warn('authentication', 'Account activation attempt without valid token', {
          tokenProvided: !!token, tokenType: typeof token
        }, req);
        return res.status(400).json({ error: "Activation token is required" });
      }

      const user = await storage.getUserByActivationToken(token);
      if (!user) {
        await applicationLogger.warn('authentication', 'Account activation attempt with invalid token', {
          token: token.substring(0, 8) + '...', tokenLength: token.length
        }, req);
        return res.status(400).json({ error: "Invalid or expired activation token" });
      }

      if (user.activationTokenExpires && new Date() > user.activationTokenExpires) {
        await applicationLogger.warn('authentication', 'Account activation attempt with expired token', {
          userId: user.id, email: user.email,
          tokenExpired: user.activationTokenExpires, currentTime: new Date()
        }, req);
        return res.status(400).json({ error: "Activation token has expired" });
      }

      await storage.activateUser(user.id);

      await applicationLogger.info('authentication', 'User account activated successfully', {
        userId: user.id, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        role: user.role, activationMethod: 'email_token'
      }, req);

      const { sendWelcomeEmail } = await import('../services/email-service');
      const welcomeEmailSent = await sendWelcomeEmail({
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      });

      if (!welcomeEmailSent) {
        await applicationLogger.warn('email', 'Failed to send welcome email after activation', {
          userId: user.id, email: user.email
        }, req);
      }

      res.json({ success: true, message: "Account successfully activated! You can now log in." });
    } catch (error) {
      applicationLogger.error('authentication', 'Account activation error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Account activation process failed', error as Error, {
        token: req.query.token ? String(req.query.token).substring(0, 8) + '...' : 'none'
      }, req);
      res.status(500).json({ error: "Failed to activate account" });
    }
  });

  app.post("/api/auth/resend-activation", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        await applicationLogger.warn('authentication', 'Resend activation attempt without email', {
          triggeredBy: req.user?.id || 'anonymous',
          triggeredByEmail: req.user?.email
        }, req);
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        await applicationLogger.warn('authentication', 'Resend activation attempt for non-existent user', {
          email, triggeredBy: req.user?.id || 'anonymous',
          triggeredByEmail: req.user?.email
        }, req);
        return res.json({
          message: "If the email exists and is not yet activated, a new activation email will be sent."
        });
      }

      if (user.isActive && user.isEmailVerified) {
        await applicationLogger.info('authentication', 'Resend activation attempted for already activated user', {
          userId: user.id, email: user.email,
          triggeredBy: req.user?.id || 'anonymous'
        }, req);
        return res.json({ message: "Account is already activated. You can log in." });
      }

      const { sendActivationEmail, generateActivationToken, getTokenExpiration } = await import('../services/email-service');
      const activationToken = generateActivationToken();
      const activationTokenExpires = getTokenExpiration();

      await storage.updateUserActivationToken(user.id, activationToken, activationTokenExpires);

      const emailSent = await sendActivationEmail({
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        activationToken
      });

      await applicationLogger.info('authentication', 'Activation email resent', {
        userId: user.id, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        role: user.role, emailSent,
        triggeredBy: req.user?.id || 'anonymous'
      }, req);

      res.json({
        message: "If the email exists and is not yet activated, a new activation email has been sent."
      });
    } catch (error) {
      applicationLogger.error('authentication', 'Resend activation error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Resend activation process failed', error as Error, {
        email: req.body.email, triggeredBy: req.user?.id || 'anonymous'
      }, req);
      res.status(500).json({ error: "Failed to resend activation email" });
    }
  });

  app.post("/api/test/email", requireAuth, async (req, res) => {
    try {
      const { to, subject = "Test Email from Smart CDP", text = "This is a test email to verify SendGrid integration." } = req.body;

      if (!to) {
        return res.status(400).json({ error: "Recipient email is required" });
      }

      const { sendEmail } = await import('../services/email-service');

      const success = await sendEmail({
        to,
        from: process.env.SENDGRID_VERIFIED_SENDER || 'subs@think.web.id',
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #3b82f6;">SendGrid Test Email</h2>
            <p>This is a test email to verify that SendGrid integration is working properly.</p>
            <p><strong>Sent from:</strong> Smart CDP Platform</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p style="color: #10b981; font-weight: bold;">If you received this email, SendGrid is working correctly!</p>
          </div>
        `
      });

      if (success) {
        await applicationLogger.info('email', 'Test email sent successfully', {
          to, subject, testType: 'manual_test', userId: req.user?.id
        });
        res.json({ success: true, message: `Test email sent successfully to ${to}` });
      } else {
        res.status(500).json({ success: false, error: "Failed to send test email" });
      }
    } catch (error) {
      applicationLogger.error('authentication', 'Test email error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('email', 'Test email failed', error as Error, {
        testType: 'manual_test', userId: req.user?.id
      });
      res.status(500).json({ success: false, error: "Failed to send test email" });
    }
  });
}
