import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { EnvironmentSecurity } from './utils/environment-security';

// Secure JWT_SECRET access - no fallback to insecure defaults
const getJwtSecret = (): string => {
  const result = EnvironmentSecurity.safeGet('JWT_SECRET', { 
    required: true, 
    logAccess: false 
  });
  
  if (!result.exists || !result.value) {
    throw new Error('JWT_SECRET environment variable is required for authentication. Set a secure 32+ character string.');
  }
  
  return result.value;
};
const JWT_EXPIRES_IN = '24h';

export interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isDemo?: boolean; // Optional demo account flag
}

export function generateToken(payload: JWTPayload): string {
  const jwtSecret = getJwtSecret();
  return jwt.sign(payload, jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'smart-cdp-platform',
    audience: 'smart-cdp-users'
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: 'smart-cdp-platform',
      audience: 'smart-cdp-users'
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function extractTokenFromRequest(req: Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies as fallback
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Add user info to request
  req.user = {
    id: payload.userId,
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: payload.role,
    isActive: payload.isActive
  };

  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
