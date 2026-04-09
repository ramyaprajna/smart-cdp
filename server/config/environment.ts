import { secureLogger } from '../utils/secure-logger';
/**
 * Environment Configuration
 * Manages environment-specific settings and access control
 */

export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

export const environmentConfig = {
  // Current environment
  environment: process.env.NODE_ENV || 'development',

  // Feature flags
  features: {
    devTools: isDevelopment,
    testData: isDevelopment || isTest,
    debugLogging: isDevelopment,
    performanceMonitoring: isProduction,
    errorReporting: isProduction,
    caching: isProduction,
  },

  // Directory access control
  directoryAccess: {
    dev: isDevelopment,
    tests: isDevelopment || isTest,
    temp: isDevelopment,
    production: isProduction,
  },

  // API rate limiting
  rateLimits: {
    windowMs: isProduction ? 15 * 60 * 1000 : 0, // 15 minutes in production, disabled in dev
    max: isProduction ? 100 : 0, // 100 requests per window in production
  },

  // Cache settings
  cache: {
    enabled: isProduction,
    ttl: isProduction ? 3600 : 0, // 1 hour in production, no cache in dev
  },

  // Security settings
  security: {
    corsOrigin: isProduction
      ? process.env.CORS_ORIGIN || 'https://yourdomain.com'
      : '*',
    secureCookies: isProduction,
    httpsOnly: isProduction,
  },
};

/**
 * Check if a path should be accessible in the current environment
 */
export function isPathAccessible(path: string): boolean {
  // Block dev directory access in production
  if (isProduction && path.includes('/dev/')) {
    secureLogger.warn(`Access denied to development path in production: ${path}`);
    return false;
  }

  // Block test directory access in production
  if (isProduction && path.includes('/tests/')) {
    secureLogger.warn(`Access denied to test path in production: ${path}`);
    return false;
  }

  return true;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig() {
  return {
    ...environmentConfig,
    isDevelopment,
    isProduction,
    isTest,
  };
}

/**
 * Middleware to check environment access
 */
export function environmentAccessMiddleware(req: any, res: any, next: any) {
  const path = req.path || req.url;

  if (!isPathAccessible(path)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This resource is not available in the production environment',
    });
  }

  next();
}
