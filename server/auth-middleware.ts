/**
 * Authentication and Authorization Middleware
 *
 * Comprehensive middleware system for authentication and role-based access control.
 * Provides secure access management for the Smart CDP Platform with session handling
 * and detailed logging for security monitoring.
 *
 * @module AuthMiddleware
 * @created Initial implementation
 * @last_updated August 5, 2025
 *
 * @security_features
 * - User session validation with database lookup
 * - Role-based access control (admin, analyst, viewer, marketing)
 * - Development-friendly fallback to admin user for testing
 * - Request user context injection for downstream middleware
 * - Secure header-based user identification
 *
 * @dependencies
 * - storage - Database access for user validation and session management
 *
 * @middleware_functions
 * - authMiddleware - Main authentication layer with fallback for development
 * - requireAuth - Validates user authentication (referenced in other modules)
 * - requireAdmin - Restricts access to admin users only (referenced in other modules)
 *
 * @development_notes
 * - Uses x-user-id header for session identification
 * - Automatically falls back to admin@deltafm.com for development
 * - Extends Express Request type to include user context
 * - All authenticated users get consistent user object structure
 */
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { secureLogger } from './utils/secure-logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        isActive: boolean;
      };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // For demo purposes, we'll simulate a logged-in admin user
    // In a real app, this would check session tokens or JWT
    const sessionUserId = req.headers['x-user-id'] as string;

    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      if (user && user.isActive) {
        req.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role,
          isActive: user.isActive ?? false
        };
      }
    } else {
      // For development, default to the admin user
      const adminUser = await storage.getUserByEmail('admin@deltafm.com');
      if (adminUser) {
        req.user = {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName || '',
          lastName: adminUser.lastName || '',
          role: adminUser.role,
          isActive: adminUser.isActive ?? false
        };
      }
    }

    next();
  } catch (error) {
    secureLogger.error('Auth middleware error', { error: error instanceof Error ? error.message : String(error) }, 'AUTH_MIDDLEWARE');
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
