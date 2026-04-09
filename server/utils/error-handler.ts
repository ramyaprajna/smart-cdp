/**
 * Standardized Error Handler Utility
 *
 * Provides consistent error handling patterns across the application
 * with proper logging, context tracking, and user-friendly messages.
 *
 * @module ErrorHandler
 * @created Initial implementation for comprehensive error handling
 */

import { Response } from 'express';
import { applicationLogger } from '../services/application-logger';
import { nanoid } from 'nanoid';

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  correlationId?: string;
}

export interface ErrorContext {
  operation: string;
  userId?: string;
  metadata?: Record<string, any>;
  correlationId?: string;
}

/**
 * Safe async operation wrapper for server-side functions
 * Provides consistent error handling with logging and correlation IDs
 */
export const safeAsyncOperation = async <T>(
  operation: () => Promise<T>,
  context: string,
  metadata?: Record<string, any>
): Promise<ServiceResult<T>> => {
  const correlationId = nanoid(10);
  const startTime = Date.now();

  try {
    const data = await operation();
    const duration = Date.now() - startTime;

    // Log successful operations that took longer than 1 second
    if (duration > 1000) {
      await applicationLogger.warn('system', `Slow operation: ${context}`, {
        correlationId,
        duration,
        ...metadata
      });
    }

    return {
      success: true,
      data,
      correlationId
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log the error with full context
    await applicationLogger.error('system', `Failed: ${context}`, error instanceof Error ? error : undefined, {
      correlationId,
      duration,
      errorMessage: error instanceof Error ? error.message : String(error),
      ...metadata
    });

    // Determine user-friendly error message
    const userMessage = getUserFriendlyMessage(error, context);
    const errorCode = getErrorCode(error);

    return {
      success: false,
      error: userMessage,
      errorCode,
      correlationId
    };
  }
};

/**
 * Database operation wrapper with transaction support
 */
export const safeDatabaseOperation = async <T>(
  operation: () => Promise<T>,
  context: string,
  shouldRollback?: boolean
): Promise<ServiceResult<T>> => {
  return safeAsyncOperation(
    async () => {
      try {
        return await operation();
      } catch (error) {
        // Log database-specific errors
        if (error instanceof Error && error.message.includes('duplicate key')) {
          throw new DatabaseError('A record with this information already exists', 'DUPLICATE_KEY');
        }
        if (error instanceof Error && error.message.includes('foreign key')) {
          throw new DatabaseError('Related data not found', 'FOREIGN_KEY_VIOLATION');
        }
        throw error;
      }
    },
    `DB:${context}`
  );
};

/**
 * External API call wrapper with retry logic
 */
export const safeApiCall = async <T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries: number = 3
): Promise<ServiceResult<T>> => {
  let lastError: Error | unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await safeAsyncOperation(
      operation,
      `${context} (attempt ${attempt}/${maxRetries})`
    );

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't retry on client errors (4xx)
    if (result.errorCode && result.errorCode.startsWith('4')) {
      break;
    }

    // Exponential backoff
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  return {
    success: false,
    error: typeof lastError === 'string' ? lastError : 'External API call failed after retries',
    errorCode: 'API_CALL_FAILED'
  };
};

/**
 * File operation wrapper with proper cleanup
 */
export const safeFileOperation = async <T>(
  operation: () => Promise<T>,
  context: string,
  cleanupFn?: () => Promise<void>
): Promise<ServiceResult<T>> => {
  const result = await safeAsyncOperation(operation, `File:${context}`);

  // Always run cleanup, even on error
  if (cleanupFn) {
    try {
      await cleanupFn();
    } catch (cleanupError) {
      await applicationLogger.error('system', `Cleanup failed for ${context}`, cleanupError instanceof Error ? cleanupError : undefined, {
        errorMessage: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }
  }

  return result;
};

/**
 * Express route handler wrapper
 */
export const safeRouteHandler = (
  handler: (req: any, res: Response) => Promise<void>
) => {
  return async (req: any, res: Response) => {
    const correlationId = nanoid(10);
    const startTime = Date.now();

    try {
      // Add correlation ID to request for tracking
      req.correlationId = correlationId;
      await handler(req, res);

      const duration = Date.now() - startTime;
      if (duration > 2000) {
        await applicationLogger.warn('api', `Slow request: ${req.method} ${req.path}`, {
          correlationId,
          duration,
          userId: req.user?.id
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      await applicationLogger.error('api', `Request failed: ${req.method} ${req.path}`, error instanceof Error ? error : undefined, {
        correlationId,
        duration,
        errorMessage: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      // Send appropriate error response
      if (!res.headersSent) {
        const statusCode = getHttpStatusCode(error);
        const message = getUserFriendlyMessage(error, 'Request processing');

        res.status(statusCode).json({
          success: false,
          error: message,
          correlationId
        });
      }
    }
  };
};

/**
 * Custom error classes for better error handling
 */
export class DatabaseError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ExternalApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

/**
 * Helper functions
 */
function getUserFriendlyMessage(error: unknown, context: string): string {
  if (error instanceof ValidationError) {
    return error.message;
  }
  if (error instanceof AuthenticationError) {
    return 'Please log in to continue';
  }
  if (error instanceof AuthorizationError) {
    return 'You do not have permission to perform this action';
  }
  if (error instanceof DatabaseError) {
    return error.message;
  }
  if (error instanceof ExternalApiError) {
    return 'External service temporarily unavailable. Please try again later.';
  }
  if (error instanceof Error) {
    // Don't expose internal error messages to users
    if (error.message.includes('ECONNREFUSED')) {
      return 'Service temporarily unavailable';
    }
    if (error.message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (error.message.includes('duplicate')) {
      return 'This item already exists';
    }
  }

  return `An error occurred during ${context}. Please try again.`;
}

function getErrorCode(error: unknown): string {
  if (error instanceof DatabaseError) {
    return error.code;
  }
  if (error instanceof ValidationError) {
    return 'VALIDATION_ERROR';
  }
  if (error instanceof AuthenticationError) {
    return 'AUTH_REQUIRED';
  }
  if (error instanceof AuthorizationError) {
    return 'FORBIDDEN';
  }
  if (error instanceof ExternalApiError) {
    return `EXTERNAL_API_${error.statusCode || 500}`;
  }
  return 'INTERNAL_ERROR';
}

function getHttpStatusCode(error: unknown): number {
  if (error instanceof ValidationError) {
    return 400;
  }
  if (error instanceof AuthenticationError) {
    return 401;
  }
  if (error instanceof AuthorizationError) {
    return 403;
  }
  if (error instanceof DatabaseError) {
    return error.code === 'DUPLICATE_KEY' ? 409 : 500;
  }
  if (error instanceof ExternalApiError) {
    return error.statusCode || 502;
  }
  return 500;
}

/**
 * Client-side error handler for React hooks
 */
export const handleClientError = (
  error: unknown,
  context: string,
  showToast?: (message: string, type: 'error' | 'warning') => void
): void => {
  const message = getUserFriendlyMessage(error, context);

  applicationLogger.error('system', `[${context}] Error:`, error instanceof Error ? error : new Error(String(error))).catch(() => {});

  if (showToast) {
    showToast(message, 'error');
  }
};
