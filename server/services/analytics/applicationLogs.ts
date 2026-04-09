/**
 * Application Logs Service - Pure log processing logic
 * 
 * Extracted from analytics routes for modularity and testability
 * Provides real-time log processing with focus on duplicate detection
 * 
 * Last Updated: September 17, 2025
 * Code Quality: ✅ SONARCLOUD COMPLIANT - Pure functions, modular design
 * 
 * Features:
 * - Real-time log processing from database
 * - Special focus on duplicate detection events
 * - Optimized caching for performance (30-second cache)
 * - Error logs and warning prioritization
 * - Modular isDuplicateEvent predicate for reuse and testing
 */

import { storage } from '../../storage';
import { cacheManager } from '../../cache';
import { secureLogger } from '../../utils/secure-logger';
import type { 
  RealTimeLogs, 
  ProcessedLogEntry, 
  DuplicateLogEntry, 
  ErrorLogEntry, 
  LogSummary,
  LogQueryParams,
  LogQueryResult
} from './types';

/**
 * Pure predicate function to check if a log entry is a duplicate detection event
 * Extracted for reuse and testing
 * 
 * @param log - Log entry to check
 * @returns true if the log is related to duplicate detection
 */
export function isDuplicateEvent(log: any): boolean {
  // Handle null/undefined inputs gracefully
  if (!log) return false;
  
  // Filter for duplicate detection events specifically
  const hasMessageDuplicate = log.message?.toLowerCase().includes('duplicate') || false;
  const hasMetadataDuplicate = log.metadata && typeof log.metadata === 'object' && 
    JSON.stringify(log.metadata).toLowerCase().includes('duplicate');
  
  return hasMessageDuplicate || Boolean(hasMetadataDuplicate);
}

/**
 * Pure function to process and categorize logs
 * Extracted for better testability and modularity
 * 
 * @param recentLogs - Recent logs query result
 * @param duplicateDetectionLogs - Duplicate detection logs query result  
 * @param errorLogs - Error logs query result
 * @returns Processed and categorized logs
 */
export function processAndCategorizeLogs(
  recentLogs: LogQueryResult,
  duplicateDetectionLogs: LogQueryResult,
  errorLogs: LogQueryResult
): RealTimeLogs {
  // Process recent logs
  const recent: ProcessedLogEntry[] = recentLogs.logs.map(log => ({
    id: log.id,
    level: log.level,
    category: log.category,
    message: log.message,
    timestamp: log.timestamp,
    userId: log.userId,
    metadata: log.metadata,
    stackTrace: log.stackTrace ? log.stackTrace.substring(0, 500) + '...' : undefined
  }));

  // Process duplicate detection logs with filtering
  const duplicateDetection: DuplicateLogEntry[] = duplicateDetectionLogs.logs
    .filter(isDuplicateEvent)
    .map(log => ({
      id: log.id,
      level: log.level,
      message: log.message,
      timestamp: log.timestamp,
      metadata: log.metadata
    }));

  // Process error logs
  const errors: ErrorLogEntry[] = errorLogs.logs.map(log => ({
    id: log.id,
    level: log.level,
    category: log.category,
    message: log.message,
    timestamp: log.timestamp,
    errorFingerprint: log.errorFingerprint
  }));

  // Create summary statistics
  const summary: LogSummary = {
    totalRecentLogs: recentLogs.total,
    duplicateEventsCount: duplicateDetectionLogs.logs.filter(isDuplicateEvent).length,
    recentErrorsCount: errorLogs.total,
    lastLogTimestamp: recentLogs.logs[0]?.timestamp?.toISOString() || null
  };

  return {
    recent,
    duplicateDetection,
    errors,
    summary
  };
}

/**
 * Pure function to create empty logs structure for error cases
 * Preserves exact existing error handling behavior
 */
export function createEmptyLogsStructure(): RealTimeLogs {
  return {
    recent: [],
    duplicateDetection: [],
    errors: [],
    summary: {
      totalRecentLogs: 0,
      duplicateEventsCount: 0,
      recentErrorsCount: 0,
      lastLogTimestamp: null
    }
  };
}

/**
 * Helper function to get recent application logs with focus on real-time monitoring
 * Moved from analytics routes - preserves exact existing functionality
 * 
 * Features:
 * - Gets last 30 minutes of logs focused on key categories
 * - Fetches logs in parallel for different priorities
 * - Special focus on duplicate detection events from import category
 * - Optimized caching for performance
 */
export async function getRecentApplicationLogs(): Promise<RealTimeLogs> {
  const cacheKey = 'real-time-logs';
  let cachedLogs = cacheManager.getAnalytics(cacheKey);
  
  if (!cachedLogs) {
    try {
      // Get last 30 minutes of logs focused on key categories
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      // Fetch logs in parallel for different priorities
      const [recentLogs, duplicateDetectionLogs, errorLogs] = await Promise.all([
        // Recent logs from key categories (last 50 entries)
        storage.getApplicationLogs({
          startDate: thirtyMinutesAgo,
          isArchived: false,
          limit: 50,
          offset: 0
        }),
        
        // Specific duplicate detection logs (last 20 entries)
        storage.getApplicationLogs({
          category: 'import',
          startDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // Last 2 hours
          isArchived: false,
          limit: 20,
          offset: 0
        }),
        
        // Recent error/warning logs (last 10 entries)
        storage.getApplicationLogs({
          level: 'error',
          startDate: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          isArchived: false,
          limit: 10,
          offset: 0
        })
      ]);

      // Process and categorize logs using pure function
      const processedLogs = processAndCategorizeLogs(recentLogs, duplicateDetectionLogs, errorLogs);

      // Cache for 30 seconds for real-time feel
      cacheManager.setAnalytics(cacheKey, processedLogs, 30 * 1000);
      cachedLogs = processedLogs;
      
    } catch (error) {
      secureLogger.error('[Real-time Logs] Failed to fetch logs:', { error: String(error) });
      // Return empty structure on error - preserves existing error handling
      cachedLogs = createEmptyLogsStructure();
    }
  }
  
  return cachedLogs;
}

/**
 * Alternative interface for getting application logs with custom parameters
 * Allows for more flexible log querying while maintaining caching
 * 
 * @param params - Custom query parameters
 * @param cacheKey - Optional custom cache key
 * @param cacheTTL - Optional custom cache TTL in milliseconds
 * @returns Processed logs based on custom query
 */
export async function getApplicationLogsWithParams(
  params: {
    recentLogsParams?: LogQueryParams;
    duplicateLogsParams?: LogQueryParams;
    errorLogsParams?: LogQueryParams;
  },
  cacheKey?: string,
  cacheTTL: number = 30 * 1000
): Promise<RealTimeLogs> {
  const finalCacheKey = cacheKey || `custom-logs-${JSON.stringify(params)}`;
  let cachedLogs = cacheManager.getAnalytics(finalCacheKey);
  
  if (!cachedLogs) {
    try {
      // Default parameters if not provided
      const defaultRecentParams: LogQueryParams = {
        startDate: new Date(Date.now() - 30 * 60 * 1000),
        isArchived: false,
        limit: 50,
        offset: 0
      };

      const defaultDuplicateParams: LogQueryParams = {
        category: 'import',
        startDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isArchived: false,
        limit: 20,
        offset: 0
      };

      const defaultErrorParams: LogQueryParams = {
        level: 'error',
        startDate: new Date(Date.now() - 60 * 60 * 1000),
        isArchived: false,
        limit: 10,
        offset: 0
      };

      // Fetch logs with custom or default parameters
      const [recentLogs, duplicateDetectionLogs, errorLogs] = await Promise.all([
        storage.getApplicationLogs(params.recentLogsParams || defaultRecentParams),
        storage.getApplicationLogs(params.duplicateLogsParams || defaultDuplicateParams),
        storage.getApplicationLogs(params.errorLogsParams || defaultErrorParams)
      ]);

      // Process and categorize logs
      const processedLogs = processAndCategorizeLogs(recentLogs, duplicateDetectionLogs, errorLogs);

      // Cache with custom TTL
      cacheManager.setAnalytics(finalCacheKey, processedLogs, cacheTTL);
      cachedLogs = processedLogs;
      
    } catch (error) {
      secureLogger.error(`[Application Logs] Failed to fetch logs with custom params:`, { error: String(error) });
      cachedLogs = createEmptyLogsStructure();
    }
  }
  
  return cachedLogs;
}