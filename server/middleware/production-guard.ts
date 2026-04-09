/**
 * Production Guard Middleware
 * Prevents access to development-only resources in production environment
 */

import { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { secureLogger } from '../utils/secure-logger';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Paths that should be blocked in production
const DEVELOPMENT_ONLY_PATHS = [
  '/dev/',
  '/tests/',
  '/temp/',
  '/.test.',
  '/.spec.',
  '/test-',
  '/debug',
  '/development',
];

/**
 * Check if a path is development-only
 */
function isDevelopmentOnlyPath(requestPath: string): boolean {
  const normalizedPath = path.normalize(requestPath).toLowerCase();
  return DEVELOPMENT_ONLY_PATHS.some(devPath =>
    normalizedPath.includes(devPath)
  );
}

/**
 * Middleware to block development paths in production
 */
export function productionGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip checks in development
  if (isDevelopment) {
    return next();
  }

  // In production, check for development-only paths
  if (isProduction) {
    const requestPath = req.path || req.url || '';

    if (isDevelopmentOnlyPath(requestPath)) {
      secureLogger.warn(`[Production Guard] Blocked access to development path: ${requestPath}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This resource is not available in production environment',
        environment: 'production',
      });
    }
  }

  next();
}

/**
 * File access validator for imports and requires
 */
export function validateFileAccess(filePath: string): boolean {
  if (isProduction && isDevelopmentOnlyPath(filePath)) {
    secureLogger.error(`[Production Guard] Attempted to access development file in production: ${filePath}`);
    return false;
  }
  return true;
}

/**
 * Environment configuration getter
 */
export function getEnvironmentConfig() {
  return {
    environment: process.env.NODE_ENV || 'development',
    isDevelopment,
    isProduction,
    features: {
      devTools: isDevelopment,
      testData: isDevelopment,
      debugLogging: isDevelopment,
      performanceMonitoring: isProduction,
      errorReporting: isProduction,
      caching: isProduction,
      compression: isProduction,
    },
    security: {
      corsRestricted: isProduction,
      httpsOnly: isProduction,
      secureCookies: isProduction,
      rateLimiting: isProduction,
    },
  };
}
