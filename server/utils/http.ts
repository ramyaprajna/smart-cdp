/**
 * HTTP Utility Functions - Centralized Cache Deduplication and Error Handling
 * 
 * Created: September 17, 2025
 * Purpose: Extract common patterns from analytics routes to reduce code duplication
 * 
 * Features:
 * - Centralized cache deduplication with request deduplication
 * - Standardized async error handling with custom error response shapes
 * - Preserves existing caching behavior and error response formats
 * - Type-safe utility functions for consistent route handling
 */

import { Request, Response } from 'express';
import { cacheManager } from '../cache';
import { secureLogger } from '../utils/secure-logger';

/**
 * Cache deduplication utility that centralizes the cache-check-produce-cache pattern
 * used extensively in analytics routes for performance optimization.
 * 
 * This function:
 * 1. Uses request deduplication to prevent concurrent expensive operations
 * 2. Checks cache first for existing valid data
 * 3. Calls producer function only on cache miss
 * 4. Caches the result with specified TTL
 * 5. Returns the cached or freshly produced data
 * 
 * @param key - Cache key for storing/retrieving data (should be unique per endpoint/params)
 * @param ttlMs - Time-to-live in milliseconds for cache entry
 * @param producer - Function that produces fresh data when cache is empty
 * @returns Promise resolving to the cached or produced data
 * 
 * @example
 * ```typescript
 * const embeddingStatus = await withDedupAndCache(
 *   'embedding-status', 
 *   2 * 60 * 1000, // 2 minutes
 *   async () => getEmbeddingSnapshot()
 * );
 * ```
 */
export async function withDedupAndCache<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>
): Promise<T> {
  return cacheManager.deduplicateRequest(key, async () => {
    // Check cache first - exact same pattern as analytics routes
    const cached = cacheManager.getAnalytics(key);
    if (cached) {
      return cached;
    }

    // Call producer function to get fresh data
    const freshData = await producer();

    // Cache with specified TTL - exact same pattern as analytics routes
    cacheManager.setAnalytics(key, freshData, ttlMs);

    return freshData;
  });
}

/**
 * Async route error handling wrapper that standardizes error handling patterns
 * while preserving custom error response shapes for different endpoints.
 * 
 * This function:
 * 1. Wraps route handlers with comprehensive try/catch logic
 * 2. Executes the route handler and sends successful JSON responses
 * 3. Catches errors and logs them consistently
 * 4. Returns standardized error responses with custom fallback data
 * 5. Maintains existing HTTP status codes and error message formats
 * 
 * @param handler - Async route handler function that returns response data
 * @param errorResponse - Custom error response object matching expected API shape
 * @param errorMessage - Custom error message for logging and response
 * @param statusCode - HTTP status code for error responses (default: 500)
 * @returns Express route handler with integrated error handling
 * 
 * @example
 * ```typescript
 * app.get("/api/analytics/embedding-status", asyncRoute(
 *   async (req, res) => {
 *     const data = await withDedupAndCache('embedding-status', 120000, getEmbeddingSnapshot);
 *     return data;
 *   },
 *   {
 *     error: "Failed to get embedding status",
 *     totalCustomers: 0,
 *     customersWithEmbeddings: 0,
 *     embeddingCompletionPercentage: 0,
 *     activeProcessingJobs: 0,
 *     systemStatus: 'ready'
 *   },
 *   'Embedding status error'
 * ));
 * ```
 */
export function asyncRoute<T = any>(
  handler: (req: Request, res: Response) => Promise<T>,
  errorResponse: any,
  errorMessage: string,
  statusCode: number = 500
) {
  return async (req: Request, res: Response) => {
    try {
      // Execute the route handler and get the result
      const result = await handler(req, res);
      
      // Only send response if handler didn't already send one
      // (Some handlers might send response directly)
      if (!res.headersSent) {
        res.json(result);
      }
    } catch (error) {
      // Log error with consistent format - matches existing pattern
      secureLogger.error(`${errorMessage}:`, { error: String(error) });
      
      // Send standardized error response with custom shape
      // Preserves existing error response formats from analytics routes
      if (!res.headersSent) {
        res.status(statusCode).json(errorResponse);
      }
    }
  };
}

/**
 * Specialized version of asyncRoute for analytics endpoints that commonly
 * return complex structured data with fallback shapes on errors.
 * 
 * Provides pre-configured error handling with standard analytics error patterns
 * including error logging prefixes and 500 status codes.
 * 
 * @param handler - Async route handler for analytics data
 * @param errorFallback - Analytics-specific error response object
 * @param operationName - Name of the analytics operation for error logging
 * @returns Express route handler configured for analytics error patterns
 * 
 * @example
 * ```typescript
 * app.get("/api/analytics/real-time-logs", requireAuth, analyticsRoute(
 *   async (req, res) => {
 *     return await withDedupAndCache('real-time-logs', 60000, getRealTimeLogs);
 *   },
 *   {
 *     error: "Failed to get real-time logs",
 *     // ... complex fallback structure
 *   },
 *   'Real-time logs'
 * ));
 * ```
 */
export function analyticsRoute<T = any>(
  handler: (req: Request, res: Response) => Promise<T>,
  errorFallback: any,
  operationName: string
) {
  return asyncRoute(
    handler,
    errorFallback,
    `${operationName} error`,
    500
  );
}

/**
 * Creates a cache key generator function for consistent cache key naming
 * across related endpoints. Useful for maintaining cache key patterns
 * and ensuring proper cache invalidation.
 * 
 * @param prefix - Common prefix for related cache keys
 * @returns Function that generates cache keys with the given prefix
 * 
 * @example
 * ```typescript
 * const analyticsCache = createCacheKeyGenerator('analytics');
 * const embeddingKey = analyticsCache('embedding-status'); // 'analytics:embedding-status'
 * const logsKey = analyticsCache('real-time-logs'); // 'analytics:real-time-logs'
 * ```
 */
export function createCacheKeyGenerator(prefix: string) {
  return (suffix: string): string => `${prefix}:${suffix}`;
}

/**
 * Utility for creating parameterized cache keys that include request-specific
 * data like user IDs, filters, or pagination parameters.
 * 
 * @param baseKey - Base cache key
 * @param params - Object containing parameters to include in cache key
 * @returns Deterministic cache key that includes parameter values
 * 
 * @example
 * ```typescript
 * const cacheKey = createParameterizedCacheKey('customer-analytics', {
 *   userId: '123',
 *   filter: 'active',
 *   page: 1
 * });
 * // Result: 'customer-analytics:filter=active:page=1:userId=123'
 * ```
 */
export function createParameterizedCacheKey(
  baseKey: string, 
  params: Record<string, string | number | boolean>
): string {
  // Sort parameters for consistent cache key generation
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(':');
  
  return sortedParams ? `${baseKey}:${sortedParams}` : baseKey;
}

/**
 * Type definitions for common analytics response shapes
 * Used to ensure type safety when defining error fallback objects
 */
export interface EmbeddingStatusResponse {
  totalCustomers: number;
  customersWithEmbeddings: number;
  embeddingCompletionPercentage: number;
  activeProcessingJobs: number;
  systemStatus: string;
  error?: string;
}

export interface RealTimeLogsErrorResponse {
  error: string;
  embeddingSystem: {
    totalCustomers: number;
    customersWithEmbeddings: number;
    embeddingCompletionPercentage: number;
    activeProcessingJobs: number;
    systemStatus: string;
  };
  logs: {
    recent: any[];
    duplicateDetection: any[];
    errors: any[];
    summary: {
      totalRecentLogs: number;
      duplicateEventsCount: number;
      recentErrorsCount: number;
      lastLogTimestamp: null;
    };
  };
  systemHealth: {
    systemActive: boolean;
    totalLogsToday: number;
    errorRate: number;
    warningRate: number;
    lastActivityAt: null;
    categories: {};
    healthStatus: string;
  };
  monitoring: {
    dataFreshness: string;
    responseGenerated: string;
    cacheStatus: string;
    nextRefresh: string;
  };
  quickStatus: {
    systemActive: boolean;
    hasRecentErrors: boolean;
    hasDuplicateEvents: boolean;
    embeddingProgress: number;
    overallHealth: string;
  };
}

/**
 * Standard error response factories for common analytics endpoints
 * These maintain the exact error response shapes from existing routes
 */
export const AnalyticsErrorResponses = {
  embeddingStatus: (): EmbeddingStatusResponse => ({
    error: "Failed to get embedding status",
    totalCustomers: 0,
    customersWithEmbeddings: 0,
    embeddingCompletionPercentage: 0,
    activeProcessingJobs: 0,
    systemStatus: 'ready'
  }),

  realTimeLogs: (): RealTimeLogsErrorResponse => ({
    error: "Failed to get real-time logs",
    embeddingSystem: {
      totalCustomers: 0,
      customersWithEmbeddings: 0,
      embeddingCompletionPercentage: 0,
      activeProcessingJobs: 0,
      systemStatus: 'ready'
    },
    logs: {
      recent: [],
      duplicateDetection: [],
      errors: [],
      summary: {
        totalRecentLogs: 0,
        duplicateEventsCount: 0,
        recentErrorsCount: 0,
        lastLogTimestamp: null
      }
    },
    systemHealth: {
      systemActive: false,
      totalLogsToday: 0,
      errorRate: 0,
      warningRate: 0,
      lastActivityAt: null,
      categories: {},
      healthStatus: 'unknown'
    },
    monitoring: {
      dataFreshness: new Date().toISOString(),
      responseGenerated: new Date().toISOString(),
      cacheStatus: 'error',
      nextRefresh: new Date(Date.now() + 60 * 1000).toISOString(),
    },
    quickStatus: {
      systemActive: false,
      hasRecentErrors: false,
      hasDuplicateEvents: false,
      embeddingProgress: 0,
      overallHealth: 'unknown'
    }
  })
};