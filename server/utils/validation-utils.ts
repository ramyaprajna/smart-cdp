/**
 * Common validation utilities to reduce code duplication
 *
 * This module centralizes validation logic that was previously duplicated
 * across multiple route handlers, improving maintainability and consistency.
 *
 * @module ValidationUtils
 * @created August 5, 2025
 * @purpose Eliminate UUID validation duplication and standardize query parsing
 */

/**
 * RFC 4122 compliant UUID v4 validation regex
 * Matches standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a properly formatted UUID v4
 *
 * Used throughout the application for validating customer IDs, import session IDs,
 * and other UUID-based identifiers before database operations.
 *
 * @param uuid - The string to validate as UUID
 * @returns True if the string matches UUID v4 format, false otherwise
 *
 * @example
 * isValidUUID('123e4567-e89b-12d3-a456-426614174000') // true
 * isValidUUID('invalid-uuid') // false
 */
export function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Validates and parses query parameters with type-safe defaults
 *
 * This function handles common query parameter parsing patterns used across
 * multiple API endpoints, providing consistent type conversion and fallback values.
 *
 * @param query - The query object from Express request (req.query)
 * @param defaults - Object defining expected parameters with their default values and types
 * @returns Parsed parameters object with proper types applied
 *
 * @example
 * // For URL: /api/customers?limit=25&includeArchived=true&status=active
 * const params = parseQueryParams(req.query, {
 *   limit: 50,        // number - will parse to 25
 *   offset: 0,        // number - will use default 0
 *   includeArchived: false, // boolean - will parse to true
 *   status: undefined       // string - will be 'active'
 * });
 */
export function parseQueryParams(query: any, defaults: Record<string, any> = {}) {
  const params: Record<string, any> = { ...defaults };

  // Iterate through expected parameters and apply type conversions
  Object.keys(defaults).forEach(key => {
    if (query[key] !== undefined) {
      const value = query[key];

      // Parse numbers with fallback to default if invalid
      if (typeof defaults[key] === 'number') {
        const parsed = parseInt(value as string);
        params[key] = isNaN(parsed) ? defaults[key] : parsed;
      }
      // Parse booleans (supports 'true'/'false' strings)
      else if (typeof defaults[key] === 'boolean') {
        params[key] = value === 'true';
      }
      // Keep strings as-is (no conversion needed)
      else {
        params[key] = value;
      }
    }
  });

  return params;
}

/**
 * Creates standardized validation error response object
 *
 * Provides consistent error structure across all API endpoints for validation failures.
 * This ensures frontend applications can reliably parse and display validation errors.
 *
 * @param message - Human-readable error description
 * @param field - Optional field name that caused the validation error
 * @returns Standardized error object with consistent structure
 *
 * @example
 * // For a missing required field
 * return res.status(400).json(createValidationError('Email is required', 'email'));
 *
 * // For general validation error
 * return res.status(400).json(createValidationError('Invalid UUID format'));
 */
export function createValidationError(message: string, field?: string) {
  return {
    error: message,
    field,
    code: 'VALIDATION_ERROR'
  };
}
