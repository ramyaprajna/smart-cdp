/**
 * Vector Search Secure Error Handler
 * 
 * Enterprise-grade error handling for vector search operations with security-focused
 * error messages, unique tracking IDs, and comprehensive audit logging.
 * 
 * @module VectorErrorHandler
 * @security_features
 * - Generic error messages to prevent information disclosure
 * - Unique error IDs for internal tracking without exposing system details
 * - Comprehensive audit logging without PII exposure
 * - Error classification for proper response codes
 * - Security event correlation and monitoring
 * 
 * @created September 18, 2025
 * @last_updated September 18, 2025
 */

import { Request, Response } from 'express';
import { secureLogger } from './secure-logger';
import { z } from 'zod';

/**
 * Vector Error Categories
 */
export enum VectorErrorCategory {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  VECTOR_ENGINE_ERROR = 'VECTOR_ENGINE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION'
}

/**
 * Vector Error Severity Levels
 */
export enum VectorErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Standardized Error Response Structure
 */
interface VectorErrorResponse {
  error: string;                    // Generic user-facing error message
  code: string;                     // Error code for client handling
  type: string;                     // Error type classification
  errorId: string;                  // Unique error ID for tracking
  timestamp: string;                // ISO 8601 timestamp
  requestId?: string;               // Request correlation ID
  retryAfter?: number;              // Retry delay for rate limiting
  supportInfo?: {                   // Optional support information
    contactSupport: boolean;
    errorId: string;
  };
}

/**
 * Internal Error Details for Logging
 */
interface VectorErrorDetails {
  category: VectorErrorCategory;
  severity: VectorErrorSeverity;
  originalError: Error | unknown;
  context: Record<string, any>;
  userId?: string;
  endpoint: string;
  userAgent?: string;
  ip?: string;
  stack?: string;
  securityEvent?: boolean;
}

/**
 * Vector Error Handler Class
 */
export class VectorErrorHandler {
  
  /**
   * Generate unique error ID for tracking
   */
  private static generateErrorId(category: VectorErrorCategory): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `VEC_${category}_${timestamp}_${randomSuffix}`;
  }
  
  /**
   * Determine error severity based on category and details
   */
  private static determineErrorSeverity(
    category: VectorErrorCategory,
    error: Error | unknown
  ): VectorErrorSeverity {
    // Critical security violations
    if (category === VectorErrorCategory.SECURITY_VIOLATION) {
      return VectorErrorSeverity.CRITICAL;
    }
    
    // High severity for authentication/authorization issues
    if (category === VectorErrorCategory.AUTHENTICATION_ERROR ||
        category === VectorErrorCategory.AUTHORIZATION_ERROR) {
      return VectorErrorSeverity.HIGH;
    }
    
    // Medium severity for rate limiting and timeouts
    if (category === VectorErrorCategory.RATE_LIMIT_ERROR ||
        category === VectorErrorCategory.TIMEOUT_ERROR) {
      return VectorErrorSeverity.MEDIUM;
    }
    
    // High severity for system errors
    if (category === VectorErrorCategory.SYSTEM_ERROR ||
        category === VectorErrorCategory.DATABASE_ERROR) {
      return VectorErrorSeverity.HIGH;
    }
    
    // Default to medium severity
    return VectorErrorSeverity.MEDIUM;
  }
  
  /**
   * Create generic user-facing error message
   */
  private static createGenericErrorMessage(category: VectorErrorCategory): string {
    const messages: Record<VectorErrorCategory, string> = {
      [VectorErrorCategory.VALIDATION_ERROR]: 'Invalid input parameters provided',
      [VectorErrorCategory.AUTHENTICATION_ERROR]: 'Authentication required',
      [VectorErrorCategory.AUTHORIZATION_ERROR]: 'Access denied',
      [VectorErrorCategory.RATE_LIMIT_ERROR]: 'Rate limit exceeded. Please try again later',
      [VectorErrorCategory.TIMEOUT_ERROR]: 'Request timeout. Please try again',
      [VectorErrorCategory.VECTOR_ENGINE_ERROR]: 'Vector search operation failed',
      [VectorErrorCategory.DATABASE_ERROR]: 'Data retrieval error occurred',
      [VectorErrorCategory.EXTERNAL_API_ERROR]: 'External service unavailable',
      [VectorErrorCategory.SYSTEM_ERROR]: 'System temporarily unavailable',
      [VectorErrorCategory.SECURITY_VIOLATION]: 'Security policy violation detected'
    };
    
    return messages[category] || 'An unexpected error occurred';
  }
  
  /**
   * Create error code for client handling
   */
  private static createErrorCode(category: VectorErrorCategory): string {
    const codes: Record<VectorErrorCategory, string> = {
      [VectorErrorCategory.VALIDATION_ERROR]: 'INVALID_INPUT',
      [VectorErrorCategory.AUTHENTICATION_ERROR]: 'AUTH_REQUIRED',
      [VectorErrorCategory.AUTHORIZATION_ERROR]: 'ACCESS_DENIED',
      [VectorErrorCategory.RATE_LIMIT_ERROR]: 'RATE_LIMITED',
      [VectorErrorCategory.TIMEOUT_ERROR]: 'TIMEOUT',
      [VectorErrorCategory.VECTOR_ENGINE_ERROR]: 'VECTOR_ERROR',
      [VectorErrorCategory.DATABASE_ERROR]: 'DATA_ERROR',
      [VectorErrorCategory.EXTERNAL_API_ERROR]: 'SERVICE_ERROR',
      [VectorErrorCategory.SYSTEM_ERROR]: 'SYSTEM_ERROR',
      [VectorErrorCategory.SECURITY_VIOLATION]: 'SECURITY_ERROR'
    };
    
    return codes[category] || 'UNKNOWN_ERROR';
  }
  
  /**
   * Determine HTTP status code based on error category
   */
  private static getHttpStatusCode(category: VectorErrorCategory): number {
    const statusCodes: Record<VectorErrorCategory, number> = {
      [VectorErrorCategory.VALIDATION_ERROR]: 400,
      [VectorErrorCategory.AUTHENTICATION_ERROR]: 401,
      [VectorErrorCategory.AUTHORIZATION_ERROR]: 403,
      [VectorErrorCategory.RATE_LIMIT_ERROR]: 429,
      [VectorErrorCategory.TIMEOUT_ERROR]: 408,
      [VectorErrorCategory.VECTOR_ENGINE_ERROR]: 422,
      [VectorErrorCategory.DATABASE_ERROR]: 503,
      [VectorErrorCategory.EXTERNAL_API_ERROR]: 502,
      [VectorErrorCategory.SYSTEM_ERROR]: 500,
      [VectorErrorCategory.SECURITY_VIOLATION]: 403
    };
    
    return statusCodes[category] || 500;
  }
  
  /**
   * Sanitize context data for logging (remove PII)
   */
  private static sanitizeContextForLogging(context: Record<string, any>): Record<string, any> {
    const sanitized = { ...context };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'sessionId',
      'email', 'phoneNumber', 'firstName', 'lastName',
      'address', 'personalInfo', 'bankAccount', 'creditCard'
    ];
    
    const removeSensitiveData = (obj: any, depth = 0): any => {
      if (depth > 5) return '[MAX_DEPTH_REACHED]'; // Prevent infinite recursion
      
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        // Mask email-like patterns
        if (obj.includes('@') && obj.includes('.')) {
          return obj.replace(/(.{2})[^@]*@([^.]*).(.*)/, '$1***@$2***.$3');
        }
        // Mask long strings that might contain sensitive data
        if (obj.length > 50) {
          return obj.substring(0, 20) + '...[TRUNCATED]';
        }
        return obj;
      }
      
      if (typeof obj === 'number') {
        // Mask large numbers that might be sensitive IDs
        if (obj > 1000000000) { // Larger than 1 billion
          return '[LARGE_NUMBER_MASKED]';
        }
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.slice(0, 10).map(item => removeSensitiveData(item, depth + 1));
      }
      
      if (typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          if (sensitiveFields.some(field => lowerKey.includes(field))) {
            cleaned[key] = '[REDACTED]';
          } else {
            cleaned[key] = removeSensitiveData(value, depth + 1);
          }
        }
        return cleaned;
      }
      
      return obj;
    };
    
    return removeSensitiveData(sanitized);
  }
  
  /**
   * Log error with security-focused audit trail
   */
  private static logError(errorDetails: VectorErrorDetails, errorId: string): void {
    const logData = {
      errorId,
      category: errorDetails.category,
      severity: errorDetails.severity,
      endpoint: errorDetails.endpoint,
      userId: errorDetails.userId || 'anonymous',
      ip: errorDetails.ip || 'unknown',
      userAgent: errorDetails.userAgent || 'unknown',
      timestamp: new Date().toISOString(),
      context: this.sanitizeContextForLogging(errorDetails.context),
      errorMessage: errorDetails.originalError instanceof Error 
        ? errorDetails.originalError.message 
        : String(errorDetails.originalError),
      stack: errorDetails.originalError instanceof Error 
        ? errorDetails.originalError.stack?.split('\n').slice(0, 5).join('\n') // Limit stack trace
        : undefined,
      securityEvent: errorDetails.securityEvent || false
    };
    
    // Choose appropriate log level based on severity
    const logLevel = errorDetails.severity === VectorErrorSeverity.CRITICAL ? 'error' :
                     errorDetails.severity === VectorErrorSeverity.HIGH ? 'error' :
                     errorDetails.severity === VectorErrorSeverity.MEDIUM ? 'warn' : 'info';
    
    secureLogger[logLevel]('Vector operation error', logData, 'VECTOR_ERROR');
    
    // Additional alerting for critical and security violations
    if (errorDetails.severity === VectorErrorSeverity.CRITICAL || 
        errorDetails.securityEvent) {
      secureLogger.error(`🚨 CRITICAL VECTOR ERROR: ${errorId}`, {
        category: errorDetails.category,
        endpoint: errorDetails.endpoint,
        ip: errorDetails.ip,
        userId: errorDetails.userId
      });
    }
  }
  
  /**
   * Handle vector operation errors with comprehensive security measures
   */
  static handleError(
    error: Error | unknown,
    category: VectorErrorCategory,
    context: Record<string, any>,
    req: Request,
    res: Response,
    securityEvent: boolean = false
  ): void {
    const errorId = this.generateErrorId(category);
    const severity = this.determineErrorSeverity(category, error);
    
    // Create detailed error information for logging
    const errorDetails: VectorErrorDetails = {
      category,
      severity,
      originalError: error,
      context,
      userId: (req as any).user?.userId,
      endpoint: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      stack: error instanceof Error ? error.stack : undefined,
      securityEvent
    };
    
    // Log error with security audit trail
    this.logError(errorDetails, errorId);
    
    // Create secure response for client
    const response: VectorErrorResponse = {
      error: this.createGenericErrorMessage(category),
      code: this.createErrorCode(category),
      type: category === VectorErrorCategory.VALIDATION_ERROR ? 'client_error' :
            category === VectorErrorCategory.AUTHENTICATION_ERROR || 
            category === VectorErrorCategory.AUTHORIZATION_ERROR ? 'auth_error' :
            category === VectorErrorCategory.RATE_LIMIT_ERROR ? 'rate_limit' :
            'server_error',
      errorId,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    };
    
    // Add retry information for rate limiting
    if (category === VectorErrorCategory.RATE_LIMIT_ERROR) {
      response.retryAfter = context.retryAfter || 60;
    }
    
    // Add support information for system errors
    if (severity === VectorErrorSeverity.HIGH || severity === VectorErrorSeverity.CRITICAL) {
      response.supportInfo = {
        contactSupport: true,
        errorId
      };
    }
    
    // Send response with appropriate status code
    const statusCode = this.getHttpStatusCode(category);
    res.status(statusCode).json(response);
  }
  
  /**
   * Handle validation errors specifically
   */
  static handleValidationError(
    error: z.ZodError,
    req: Request,
    res: Response,
    context: Record<string, any> = {}
  ): void {
    const detailedContext = {
      ...context,
      validationErrors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code
      }))
    };
    
    this.handleError(error, VectorErrorCategory.VALIDATION_ERROR, detailedContext, req, res);
  }
  
  /**
   * Handle security violations
   */
  static handleSecurityViolation(
    violation: string,
    details: Record<string, any>,
    req: Request,
    res: Response
  ): void {
    const securityContext = {
      violation,
      ...details,
      timestamp: new Date().toISOString()
    };
    
    this.handleError(
      new Error(`Security violation: ${violation}`),
      VectorErrorCategory.SECURITY_VIOLATION,
      securityContext,
      req,
      res,
      true // Mark as security event
    );
  }
  
  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(
    limit: number,
    windowMs: number,
    retryAfter: number,
    req: Request,
    res: Response
  ): void {
    const rateLimitContext = {
      limit,
      windowMs,
      retryAfter,
      endpoint: req.path
    };
    
    this.handleError(
      new Error('Rate limit exceeded'),
      VectorErrorCategory.RATE_LIMIT_ERROR,
      rateLimitContext,
      req,
      res
    );
  }
}

/**
 * Convenience methods for common error scenarios
 */
export const vectorErrorHandlers = {
  validation: (error: z.ZodError, req: Request, res: Response, context?: Record<string, any>) =>
    VectorErrorHandler.handleValidationError(error, req, res, context),
    
  authentication: (req: Request, res: Response) =>
    VectorErrorHandler.handleError(
      new Error('Authentication required'),
      VectorErrorCategory.AUTHENTICATION_ERROR,
      {},
      req,
      res
    ),
    
  authorization: (requiredRole: string[], userRole: string, req: Request, res: Response) =>
    VectorErrorHandler.handleError(
      new Error('Insufficient permissions'),
      VectorErrorCategory.AUTHORIZATION_ERROR,
      { requiredRole, userRole },
      req,
      res
    ),
    
  vectorEngine: (error: Error, operation: string, req: Request, res: Response) =>
    VectorErrorHandler.handleError(
      error,
      VectorErrorCategory.VECTOR_ENGINE_ERROR,
      { operation },
      req,
      res
    ),
    
  database: (error: Error, query: string, req: Request, res: Response) =>
    VectorErrorHandler.handleError(
      error,
      VectorErrorCategory.DATABASE_ERROR,
      { operation: 'database_query' },
      req,
      res
    ),
    
  timeout: (operation: string, timeoutMs: number, req: Request, res: Response) =>
    VectorErrorHandler.handleError(
      new Error('Operation timeout'),
      VectorErrorCategory.TIMEOUT_ERROR,
      { operation, timeoutMs },
      req,
      res
    ),
    
  security: (violation: string, details: Record<string, any>, req: Request, res: Response) =>
    VectorErrorHandler.handleSecurityViolation(violation, details, req, res)
};