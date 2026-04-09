/**
 * Vector Search Security Middleware
 * 
 * Enterprise-grade security middleware for vector search endpoints providing
 * comprehensive protection against DoS attacks, abuse, and malicious inputs.
 * 
 * @module VectorSecurityMiddleware
 * @security_features
 * - Specialized rate limiting for computationally expensive vector operations
 * - Request size limits for large embedding vectors
 * - Timeout controls for long-running vector queries
 * - Request validation and sanitization
 * - Security event logging and monitoring
 * 
 * @created September 18, 2025
 * @last_updated September 18, 2025
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { secureLogger } from '../utils/secure-logger';
import { VECTOR_SECURITY_LIMITS } from '../validation/vector-search-validation';

/**
 * Security Event Types for Vector Operations
 */
export enum VectorSecurityEvent {
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
  MALICIOUS_PATTERN = 'MALICIOUS_PATTERN',
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  OPERATION_AUDIT = 'OPERATION_AUDIT'
}

/**
 * Vector Security Configuration
 */
interface VectorSecurityConfig {
  rateLimits: {
    search: { windowMs: number; max: number };
    similarity: { windowMs: number; max: number };
    cluster: { windowMs: number; max: number };
    segment: { windowMs: number; max: number };
  };
  requestLimits: {
    maxBodySize: number;
    maxEmbeddingSize: number;
    maxQueryLength: number;
  };
  timeouts: {
    searchTimeout: number;
    similarityTimeout: number;
    clusterTimeout: number;
  };
}

/**
 * Default security configuration for vector operations
 */
export const DEFAULT_VECTOR_SECURITY_CONFIG: VectorSecurityConfig = {
  rateLimits: {
    // Vector similarity search - moderate rate limit (computationally expensive)
    search: { windowMs: 60 * 1000, max: 20 }, // 20 searches per minute
    
    // Find similar customers - strict rate limit (very expensive)
    similarity: { windowMs: 60 * 1000, max: 10 }, // 10 similarity searches per minute
    
    // Cluster analysis - very strict rate limit (extremely expensive)
    cluster: { windowMs: 300 * 1000, max: 3 }, // 3 cluster analyses per 5 minutes
    
    // Segment analysis - moderate rate limit
    segment: { windowMs: 60 * 1000, max: 15 } // 15 segment analyses per minute
  },
  requestLimits: {
    maxBodySize: 50 * 1024, // 50KB max request body
    maxEmbeddingSize: VECTOR_SECURITY_LIMITS.EMBEDDING_DIMENSIONS * 8, // ~12KB for 1536 float64s
    maxQueryLength: VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MAX_LENGTH
  },
  timeouts: {
    searchTimeout: VECTOR_SECURITY_LIMITS.VECTOR_OPERATION_TIMEOUT,
    similarityTimeout: VECTOR_SECURITY_LIMITS.VECTOR_OPERATION_TIMEOUT,
    clusterTimeout: 60000 // 1 minute for cluster analysis
  }
};

/**
 * Security Event Logger for Vector Operations
 */
class VectorSecurityLogger {
  
  /**
   * Log security event with context
   */
  static logSecurityEvent(
    event: VectorSecurityEvent,
    details: Record<string, any>,
    req: Request,
    severity: 'info' | 'warn' | 'error' = 'warn'
  ): void {
    const logData = {
      event,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      userId: (req as any).user?.userId || 'anonymous',
      requestId: (req as any).requestId || 'unknown',
      ...details
    };
    
    secureLogger[severity](`Vector Security Event: ${event}`, logData, 'VECTOR_SECURITY');
    
    // Additional monitoring for critical events
    if (severity === 'error' || event === VectorSecurityEvent.MALICIOUS_PATTERN) {
      // In a production environment, this could trigger alerts
      secureLogger.error(`🚨 CRITICAL VECTOR SECURITY EVENT: ${event}`, {
        ip: req.ip,
        endpoint: req.path,
        userId: logData.userId
      }, 'VECTOR_SECURITY_CRITICAL');
    }
  }
  
  /**
   * Log rate limiting event
   */
  static logRateLimitExceeded(
    endpoint: string,
    limit: number,
    windowMs: number,
    req: Request
  ): void {
    this.logSecurityEvent(
      VectorSecurityEvent.RATE_LIMIT_EXCEEDED,
      {
        endpoint,
        limit,
        windowMs,
        rateLimitType: 'vector_operation'
      },
      req,
      'warn'
    );
  }
  
  /**
   * Log malicious input detection
   */
  static logMaliciousInput(
    inputType: string,
    issues: string[],
    req: Request
  ): void {
    this.logSecurityEvent(
      VectorSecurityEvent.MALICIOUS_PATTERN,
      {
        inputType,
        issues,
        detectionMethod: 'input_validation'
      },
      req,
      'error'
    );
  }
}

/**
 * Create specialized rate limiting middleware for vector operations
 */
export function createVectorRateLimiter(
  type: keyof VectorSecurityConfig['rateLimits'],
  config: VectorSecurityConfig = DEFAULT_VECTOR_SECURITY_CONFIG
) {
  const { windowMs, max } = config.rateLimits[type];
  
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Rate limit exceeded for vector operations',
      code: 'VECTOR_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(windowMs / 1000),
      type: 'rate_limit',
      operation: type
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks and admin operations in development
      return process.env.NODE_ENV === 'development' && 
             (req.path.includes('/health') || (req as any).user?.role === 'admin');
    },
    // Custom handler to replace deprecated onLimitReached
    handler: (req, res, next) => {
      // Log rate limit exceeded event
      VectorSecurityLogger.logRateLimitExceeded(req.path, max, windowMs, req);
      
      // Send rate limit response
      res.status(429).json({
        error: 'Rate limit exceeded for vector operations',
        code: 'VECTOR_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000),
        type: 'rate_limit',
        operation: type
      });
    },
    // Use default IPv6-safe key generator from express-rate-limit
    // No custom keyGenerator needed - default handles IPv4/IPv6 properly
  });
}

/**
 * Request size validation middleware
 */
export function validateRequestSize(
  config: VectorSecurityConfig = DEFAULT_VECTOR_SECURITY_CONFIG
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    
    if (contentLength > config.requestLimits.maxBodySize) {
      VectorSecurityLogger.logSecurityEvent(
        VectorSecurityEvent.REQUEST_TOO_LARGE,
        {
          contentLength,
          maxAllowed: config.requestLimits.maxBodySize,
          endpoint: req.path
        },
        req,
        'warn'
      );
      
      return res.status(413).json({
        error: 'Request too large',
        code: 'REQUEST_TOO_LARGE',
        maxSize: config.requestLimits.maxBodySize,
        type: 'validation_error'
      });
    }
    
    next();
  };
}

/**
 * Input validation middleware with security logging
 */
export function validateVectorInput<T>(
  schema: z.ZodSchema<T>,
  inputLocation: 'body' | 'params' | 'query' = 'body'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = inputLocation === 'body' ? req.body : 
                    inputLocation === 'params' ? req.params : req.query;
      
      // Perform validation with security logging
      const validatedInput = schema.parse(input);
      
      // Attach validated input to request
      (req as any).validatedInput = validatedInput;
      
      // Log successful validation for audit trail
      VectorSecurityLogger.logSecurityEvent(
        VectorSecurityEvent.INVALID_INPUT,
        {
          inputLocation,
          validationResult: 'success',
          endpoint: req.path
        },
        req,
        'info'
      );
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Log validation failure with security context
        VectorSecurityLogger.logMaliciousInput(
          inputLocation,
          error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          req
        );
        
        return res.status(400).json({
          error: 'Invalid input parameters',
          code: 'VALIDATION_ERROR',
          type: 'client_error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      // Log unexpected validation errors
      VectorSecurityLogger.logSecurityEvent(
        VectorSecurityEvent.INVALID_INPUT,
        {
          inputLocation,
          validationResult: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          endpoint: req.path
        },
        req,
        'error'
      );
      
      return res.status(500).json({
        error: 'Input validation failed',
        code: 'VALIDATION_SYSTEM_ERROR',
        type: 'server_error'
      });
    }
  };
}

/**
 * Operation timeout middleware for long-running vector operations
 */
export function withOperationTimeout(
  timeoutMs: number,
  operationType: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        VectorSecurityLogger.logSecurityEvent(
          VectorSecurityEvent.TIMEOUT_EXCEEDED,
          {
            operationType,
            timeoutMs,
            endpoint: req.path
          },
          req,
          'warn'
        );
        
        res.status(408).json({
          error: 'Operation timeout exceeded',
          code: 'OPERATION_TIMEOUT',
          timeout: timeoutMs,
          operation: operationType,
          type: 'timeout_error'
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
}

/**
 * Authentication and authorization middleware for vector operations
 */
export function requireVectorAccess(
  requiredRole: string[] = ['admin', 'analyst', 'viewer', 'marketing']
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      VectorSecurityLogger.logSecurityEvent(
        VectorSecurityEvent.UNAUTHORIZED_ACCESS,
        {
          reason: 'no_user_context',
          endpoint: req.path
        },
        req,
        'warn'
      );
      
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        type: 'auth_error'
      });
    }
    
    if (!requiredRole.includes(user.role)) {
      VectorSecurityLogger.logSecurityEvent(
        VectorSecurityEvent.UNAUTHORIZED_ACCESS,
        {
          reason: 'insufficient_role',
          userRole: user.role,
          requiredRoles: requiredRole,
          endpoint: req.path
        },
        req,
        'warn'
      );
      
      return res.status(403).json({
        error: 'Insufficient permissions for vector operations',
        code: 'INSUFFICIENT_PERMISSIONS',
        type: 'auth_error'
      });
    }
    
    // Log successful authorization for audit trail
    VectorSecurityLogger.logSecurityEvent(
      VectorSecurityEvent.OPERATION_AUDIT,
      {
        reason: 'authorized',
        userRole: user.role,
        endpoint: req.path
      },
      req,
      'info'
    );
    
    next();
  };
}

/**
 * Comprehensive vector security middleware stack
 */
export function createVectorSecurityStack(
  operationType: keyof VectorSecurityConfig['rateLimits'],
  schema?: z.ZodSchema<any>,
  config: VectorSecurityConfig = DEFAULT_VECTOR_SECURITY_CONFIG
) {
  const middleware = [
    // 1. Request size validation
    validateRequestSize(config),
    
    // 2. Rate limiting
    createVectorRateLimiter(operationType, config),
    
    // 3. Authentication and authorization
    requireVectorAccess(),
    
    // 4. Operation timeout
    withOperationTimeout(
      config.timeouts[`${operationType}Timeout` as keyof typeof config.timeouts] || 
      config.timeouts.searchTimeout,
      operationType
    )
  ];
  
  // 5. Input validation (if schema provided)
  if (schema) {
    middleware.push(validateVectorInput(schema));
  }
  
  return middleware;
}

/**
 * Export rate limiter instances for common vector operations
 */
export const vectorRateLimiters = {
  search: createVectorRateLimiter('search'),
  similarity: createVectorRateLimiter('similarity'),
  cluster: createVectorRateLimiter('cluster'),
  segment: createVectorRateLimiter('segment')
};

/**
 * Export middleware components
 */
export {
  VectorSecurityLogger
};