/**
 * Enhanced Error Handling Service for Smart CDP Platform
 *
 * Comprehensive error handling system providing structured error logging,
 * correlation ID tracking, and actionable error messages for debugging and monitoring.
 * Essential for maintaining data quality and troubleshooting import operations.
 *
 * @module EnhancedErrorHandler
 * @created Initial implementation
 * @last_updated August 5, 2025
 *
 * @architecture
 * - Singleton pattern for consistent error handling across the application
 * - Correlation ID generation for request tracing and debugging
 * - Structured error context with metadata for detailed analysis
 * - Operational vs programming error classification
 * - Integration with import error tracking system
 *
 * @dependencies
 * - nanoid - Secure correlation ID generation
 * - Express types - Request/Response/NextFunction interfaces
 *
 * @capabilities
 * - Generate unique correlation IDs for request tracking
 * - Structure error context with user, session, and operation details
 * - Create actionable error messages for different error types
 * - Support for both operational and programming error classification
 * - Integration with import error service for data quality tracking
 *
 * @error_types
 * - VALIDATION_ERROR - Data validation failures during import
 * - FILE_TOO_LARGE - File size exceeded limits
 * - PROCESSING_ERROR - General processing failures
 * - DATABASE_ERROR - Database operation failures
 * - AUTHENTICATION_ERROR - User authentication issues
 *
 * @monitoring_features
 * - Structured logging with correlation IDs
 * - Error context preservation for debugging
 * - Integration with external monitoring systems
 * - Actionable error messages for user feedback
 */

import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { secureLogger } from './utils/secure-logger';

export interface ErrorContext {
  correlationId: string;
  operation: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface StructuredError {
  code: string;
  message: string;
  details?: string;
  context: ErrorContext;
  isOperational: boolean;
  statusCode: number;
}

export class EnhancedErrorHandler {
  private static instance: EnhancedErrorHandler;

  static getInstance(): EnhancedErrorHandler {
    if (!EnhancedErrorHandler.instance) {
      EnhancedErrorHandler.instance = new EnhancedErrorHandler();
    }
    return EnhancedErrorHandler.instance;
  }

  /**
   * Create correlation ID for request tracking
   */
  generateCorrelationId(): string {
    return nanoid(12);
  }

  /**
   * Enhanced error logging with structured data
   */
  logError(error: Error | StructuredError, context: Partial<ErrorContext> = {}): string {
    const correlationId = context.correlationId || this.generateCorrelationId();

    const logEntry = {
      timestamp: new Date().toISOString(),
      correlationId,
      operation: context.operation || 'unknown',
      userId: context.userId,
      sessionId: context.sessionId,
      errorType: error.constructor.name,
      message: error.message,
      stack: error instanceof Error ? error.stack : undefined,
      metadata: context.metadata,
      level: 'error'
    };

    // Enhanced logging with structured data
    secureLogger.error('Enhanced Error Handler', logEntry, 'ERROR_HANDLER');

    return correlationId;
  }

  /**
   * Create actionable error messages for users
   */
  createActionableError(
    code: string,
    userMessage: string,
    technicalDetails?: string,
    context: Partial<ErrorContext> = {}
  ): StructuredError {
    return {
      code,
      message: userMessage,
      details: technicalDetails,
      context: {
        correlationId: context.correlationId || this.generateCorrelationId(),
        operation: context.operation || 'unknown',
        userId: context.userId,
        sessionId: context.sessionId,
        metadata: context.metadata,
        timestamp: new Date()
      },
      isOperational: true,
      statusCode: this.getStatusCodeForError(code)
    };
  }

  /**
   * Map error codes to HTTP status codes
   */
  private getStatusCodeForError(code: string): number {
    const statusMap: Record<string, number> = {
      'VALIDATION_ERROR': 400,
      'FILE_TOO_LARGE': 413,
      'UNSUPPORTED_FORMAT': 415,
      'IMPORT_FAILED': 422,
      'DUPLICATE_DATA': 409,
      'AUTHENTICATION_REQUIRED': 401,
      'PERMISSION_DENIED': 403,
      'NOT_FOUND': 404,
      'RATE_LIMIT_EXCEEDED': 429,
      'INTERNAL_ERROR': 500,
      'DATABASE_ERROR': 500,
      'EXTERNAL_SERVICE_ERROR': 502
    };

    return statusMap[code] || 500;
  }

  /**
   * Express middleware for enhanced error handling
   */
  middleware() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      const correlationId = this.generateCorrelationId();

      // Add correlation ID to request for tracking
      (req as any).correlationId = correlationId;

      const context: ErrorContext = {
        correlationId,
        operation: `${req.method} ${req.path}`,
        userId: (req as any).user?.id,
        sessionId: (req as any).sessionID,
        metadata: {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          body: req.body,
          params: req.params,
          query: req.query
        },
        timestamp: new Date()
      };

      // Log the error with context
      this.logError(error, context);

      // Determine if this is an operational error
      const isOperational = (error as any).isOperational || false;

      if (isOperational && 'code' in error) {
        // Send structured error response for operational errors
        const structuredError = error as unknown as StructuredError;
        res.status(structuredError.statusCode).json({
          error: structuredError.message,
          code: structuredError.code,
          correlationId,
          details: process.env.NODE_ENV === 'development' ? structuredError.details : undefined
        });
      } else {
        // Send generic error for unexpected errors
        res.status(500).json({
          error: 'An unexpected error occurred. Please try again.',
          correlationId,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    };
  }

  /**
   * Create import-specific error messages
   */
  createImportError(type: string, details: string, rowNumber?: number): StructuredError {
    const errorMap: Record<string, { code: string; message: string }> = {
      'INVALID_EMAIL': {
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format detected. Please check the email addresses in your data.'
      },
      'MISSING_REQUIRED_FIELD': {
        code: 'VALIDATION_ERROR',
        message: 'Required fields are missing. Please ensure all required columns are present.'
      },
      'DUPLICATE_RECORD': {
        code: 'DUPLICATE_DATA',
        message: 'Duplicate records found. Use the "Skip Duplicates" option or review your data.'
      },
      'FILE_PARSING_ERROR': {
        code: 'UNSUPPORTED_FORMAT',
        message: 'Unable to parse file. Please check the file format and try again.'
      },
      'MEMORY_LIMIT_EXCEEDED': {
        code: 'FILE_TOO_LARGE',
        message: 'File is too large for current processing. Try breaking it into smaller files.'
      }
    };

    const errorInfo = errorMap[type] || {
      code: 'IMPORT_FAILED',
      message: 'Import operation failed. Please review your data and try again.'
    };

    const rowInfo = rowNumber ? ` (Row ${rowNumber})` : '';
    const userMessage = `${errorInfo.message}${rowInfo}`;

    return this.createActionableError(
      errorInfo.code,
      userMessage,
      details,
      { operation: 'data_import' }
    );
  }
}

// Export singleton instance
export const errorHandler = EnhancedErrorHandler.getInstance();

// Export specific error creation functions for convenience
export const createImportError = (type: string, details: string, rowNumber?: number) =>
  errorHandler.createImportError(type, details, rowNumber);

export const logError = (error: Error, context?: Partial<ErrorContext>) =>
  errorHandler.logError(error, context || {});
