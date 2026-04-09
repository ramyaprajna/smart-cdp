/**
 * Standardized response utilities to reduce repetitive code
 *
 * This module provides consistent response patterns across all API endpoints,
 * ensuring uniform error handling, logging, and response structure.
 *
 * @module ResponseUtils
 * @created August 5, 2025
 * @dependencies enhanced-error-handler - For centralized error logging and correlation IDs
 * @purpose Eliminate repetitive error handling patterns and ensure consistent API responses
 */
import { Response } from 'express';
import { errorHandler } from '../enhanced-error-handler';

/**
 * Sends a standardized success response with consistent structure
 *
 * Ensures all successful API responses follow the same format, making it easier
 * for frontend applications to handle responses predictably.
 *
 * @param res - Express Response object
 * @param data - Response data object (will be spread into response)
 * @param message - Optional success message for user feedback
 *
 * @example
 * sendSuccess(res, { customers: customerList, total: 150 }, 'Customers retrieved successfully');
 * // Results in: { success: true, message: '...', customers: [...], total: 150 }
 */
export function sendSuccess(res: Response, data: any, message?: string) {
  res.json({
    success: true,
    message,
    ...data
  });
}

/**
 * Sends a standardized error response with proper logging and correlation tracking
 *
 * Handles both operational errors (with specific status codes) and unexpected errors,
 * ensuring all errors are properly logged with correlation IDs for debugging.
 *
 * @param res - Express Response object
 * @param error - The error that occurred
 * @param operation - Operation name for logging context (e.g., 'customer_creation')
 * @param statusCode - HTTP status code (defaults to 500 for server errors)
 * @param metadata - Additional context for error logging (e.g., user ID, request details)
 *
 * @example
 * // For a database connection error
 * sendError(res, error, 'customer_fetch', 500, { userId: req.user.id });
 *
 * @note Operational errors (with isOperational=true) use their own status codes and error codes
 */
export function sendError(
  res: Response,
  error: Error,
  operation: string,
  statusCode: number = 500,
  metadata?: Record<string, any>
) {
  // Log error with correlation ID for debugging and monitoring
  const correlationId = errorHandler.logError(error, {
    operation,
    ...metadata
  });

  // Handle operational errors (business logic errors with specific status codes)
  if ((error as any).isOperational) {
    const structuredError = error as any;
    return res.status(structuredError.statusCode).json({
      error: structuredError.message,
      code: structuredError.code,
      correlationId
    });
  }

  // Handle unexpected errors (system/infrastructure errors)
  res.status(statusCode).json({
    error: error.message,
    correlationId
  });
}

/**
 * Higher-order function that wraps async route handlers with standardized error handling
 *
 * This wrapper eliminates the need for try-catch blocks in every route handler,
 * providing consistent error handling and logging across all endpoints.
 *
 * @param operation - Operation name for error logging context
 * @param handler - The async route handler function to wrap
 * @returns Wrapped handler with automatic error handling
 *
 * @example
 * router.get('/customers', asyncHandler('get_customers', async (req, res) => {
 *   const customers = await storage.getCustomers();
 *   sendSuccess(res, { customers });
 * }));
 *
 * @note Automatically handles both thrown errors and rejected promises
 */
export function asyncHandler(
  operation: string,
  handler: (req: any, res: Response) => Promise<any>
) {
  return async (req: any, res: Response) => {
    try {
      const result = await handler(req, res);
      // Check if response was already sent to avoid "Cannot set headers after they are sent" errors
      if (res.headersSent) return;
      return result;
    } catch (error) {
      // Delegate to standardized error handling
      sendError(res, error as Error, operation);
    }
  };
}

/**
 * Validates required parameters and sends standardized error response if any are missing
 *
 * Provides early validation for route handlers, automatically sending 400 responses
 * for missing required parameters before processing continues.
 *
 * @param res - Express Response object
 * @param params - Object containing parameters to validate (e.g., req.body, req.params)
 * @param required - Array of parameter names that must be present and truthy
 * @returns True if all required parameters are present, false if any are missing
 *
 * @example
 * // Validate required body parameters
 * if (!validateRequiredParams(res, req.body, ['email', 'password'])) {
 *   return; // Response already sent with error
 * }
 * // Continue with processing...
 *
 * @note When returning false, the function has already sent an HTTP response
 */
export function validateRequiredParams(
  res: Response,
  params: Record<string, any>,
  required: string[]
): boolean {
  // Check each required parameter
  for (const param of required) {
    if (!params[param]) {
      // Send standardized error response and stop validation
      res.status(400).json({
        error: `Missing required parameter: ${param}`,
        code: 'MISSING_PARAMETER'
      });
      return false;
    }
  }
  return true;
}
