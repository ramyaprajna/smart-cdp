import type { Express } from "express";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { applicationLogger } from "../services/application-logger";

export function setupUserRoutes(app: Express): void {
  app.get("/api/users", async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await storage.getUsers(offset, limit);

      const sanitizedUsers = result.users.map(user => {
        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      res.json({ ...result, users: sanitizedUsers });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        await applicationLogger.warn('system', 'User profile access attempt - user not found', {
          targetUserId: req.params.id,
          accessedBy: req.user?.id,
          accessedByEmail: req.user?.email
        }, req);
        return res.status(404).json({ error: "User not found" });
      }

      await applicationLogger.info('system', 'User profile accessed', {
        targetUserId: req.params.id,
        targetUserEmail: user.email,
        targetUserRole: user.role,
        accessedBy: req.user?.id,
        accessedByEmail: req.user?.email,
        accessedByRole: req.user?.role
      }, req);

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      await applicationLogger.error('system', 'User profile access failed', error as Error, {
        targetUserId: req.params.id, accessedBy: req.user?.id
      }, req);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const signupSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(["admin", "analyst", "viewer", "marketing"])
      });

      const { password, ...userData } = signupSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        await applicationLogger.warn('authentication', 'Registration attempt with existing email', {
          email: userData.email, attemptedRole: userData.role
        }, req);
        return res.status(400).json({ error: "User with this email already exists" });
      }

      const { sendActivationEmail, generateActivationToken, getTokenExpiration } = await import('../services/email-service');
      const activationToken = generateActivationToken();
      const activationTokenExpires = getTokenExpiration();
      const passwordHash = await bcrypt.hash(password, 12);
      const isDevelopment = process.env.NODE_ENV === 'development';

      const user = await storage.createUser({
        ...userData,
        passwordHash,
        isActive: isDevelopment ? true : false,
        isEmailVerified: isDevelopment ? true : false,
        activationToken: isDevelopment ? null : activationToken,
        activationTokenExpires: isDevelopment ? null : activationTokenExpires
      });

      let emailSent = false;
      if (!isDevelopment) {
        emailSent = await sendActivationEmail({
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          activationToken
        });

        if (!emailSent) {
          applicationLogger.warn('api', `Failed to send activation email to ${user.email}`);
          await applicationLogger.warn('email', 'Failed to send activation email during registration', {
            userId: user.id, email: user.email, registrationCompleted: true
          }, req);
        }
      }

      await applicationLogger.info('authentication', 'New user registered successfully', {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        activationEmailSent: emailSent,
        createdBy: req.user?.id || 'self_registration'
      }, req);

      const { passwordHash: _, activationToken: __, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        message: isDevelopment
          ? "Registration successful! Your account is ready, you can log in now."
          : "Registration successful! Please check your email to activate your account."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await applicationLogger.warn('authentication', 'Registration failed due to validation errors', {
          email: req.body.email, validationErrors: error.errors
        }, req);
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      applicationLogger.error('api', 'User creation error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('authentication', 'Registration process failed', error as Error, {
        email: req.body.email, attemptedRole: req.body.role
      }, req);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const userData = insertUserSchema.partial().parse(req.body);

      await applicationLogger.info('system', 'User profile update initiated', {
        targetUserId: req.params.id,
        updatedBy: req.user?.id,
        updatedByEmail: req.user?.email,
        fieldsUpdated: Object.keys(userData)
      }, req);

      const user = await storage.updateUser(req.params.id, userData);

      await applicationLogger.info('system', 'User profile updated successfully', {
        targetUserId: req.params.id,
        updatedBy: req.user?.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }, req);

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        await applicationLogger.warn('system', 'User update failed due to validation errors', {
          targetUserId: req.params.id,
          updatedBy: req.user?.id,
          validationErrors: error.errors
        }, req);
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      await applicationLogger.error('system', 'User update process failed', error as Error, {
        targetUserId: req.params.id, updatedBy: req.user?.id
      }, req);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userToDelete = await storage.getUser(req.params.id);
      const success = await storage.deleteUser(req.params.id);

      if (!success) {
        await applicationLogger.warn('system', 'User deletion failed - user not found', {
          targetUserId: req.params.id,
          deletedBy: req.user?.id,
          deletedByEmail: req.user?.email
        }, req);
        return res.status(404).json({ error: "User not found" });
      }

      await applicationLogger.info('system', 'User account deleted', {
        deletedUserId: req.params.id,
        deletedUserEmail: userToDelete?.email,
        deletedUserRole: userToDelete?.role,
        deletedBy: req.user?.id,
        deletedByEmail: req.user?.email
      }, req);

      res.json({ success: true });
    } catch (error) {
      await applicationLogger.error('system', 'User deletion process failed', error as Error, {
        targetUserId: req.params.id, deletedBy: req.user?.id
      }, req);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
}
