/**
 * Archive Management Activity Logging Hook
 *
 * Provides comprehensive logging capabilities for Archive Management module
 * following CDP best practices for event tracking and state management.
 *
 * @created August 11, 2025
 * @module ArchiveLogging
 *
 * @features
 * - Evidence-based logging with real interaction data capture
 * - Isolated scope to Archive Management module only
 * - Performance tracking for archive operations
 * - Searchable log entries with Archive Management context
 * - User action correlation with system events
 *
 * @usage
 * const { logArchiveAction, logArchiveError, logArchivePerformance } = useArchiveLogging();
 *
 * // Log user actions
 * await logArchiveAction('create', archiveId, { archiveType: 'full', dataSize: '4.2MB' });
 *
 * // Log performance metrics
 * await logArchivePerformance('clean', startTime, { recordsProcessed: 1003 });
 */

import { useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface ArchiveLogContext {
  archiveId?: string;
  archiveName?: string;
  archiveType?: 'full' | 'partial' | 'backup';
  dataSize?: string | number;
  recordCount?: number;
  duration?: number;
  userAction?: string;
  componentContext?: string;
  operation?: string;
  performanceMetrics?: Record<string, any>;
  errorDetails?: Record<string, any>;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
}

export interface ArchivePerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  recordsProcessed?: number;
  dataTransferred?: number;
  errorCount?: number;
  componentRenderTime?: number;
  apiResponseTime?: number;
}

export function useArchiveLogging() {

  /**
   * Log Archive Management user actions with comprehensive context
   */
  const logArchiveAction = useCallback(async (
    action: 'create' | 'delete' | 'restore' | 'clean' | 'refresh' | 'view' | 'download' | 'edit' | 'search',
    context?: ArchiveLogContext
  ): Promise<void> => {
    try {
      const logEntry = {
        level: action === 'delete' || action === 'clean' ? 'warn' : 'info',
        category: 'archive',
        action,
        message: `Archive Management: User ${action}${context?.archiveId ? ` archive ${context.archiveId}` : ''}${context?.archiveName ? ` (${context.archiveName})` : ''}`,
        context: {
          ...context,
          timestamp: new Date().toISOString(),
          module: 'archive_management',
          userTriggered: true,
          browserInfo: {
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: performance.now()
          }
        }
      };

      // Send to logging API
      await fetch('/api/admin/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });

      // Console logging for development (evidence-based verification)
      console.group(`🗄️ Archive Log: ${action.toUpperCase()}`);


      console.groupEnd();

    } catch (error) {
      console.error('Failed to log archive action:', error);
      // Don't throw - logging should never break the application
    }
  }, []);

  /**
   * Log Archive Management errors with detailed context
   */
  const logArchiveError = useCallback(async (
    operation: string,
    error: Error | string,
    context?: ArchiveLogContext
  ): Promise<void> => {
    try {
      const errorMessage = error instanceof Error ? error.message : error;
      const stackTrace = error instanceof Error ? error.stack : undefined;

      const logEntry = {
        level: 'error',
        category: 'archive',
        action: 'error',
        message: `Archive Management Error: ${operation} failed - ${errorMessage}`,
        context: {
          ...context,
          operation,
          errorMessage,
          stackTrace,
          timestamp: new Date().toISOString(),
          module: 'archive_management',
          userTriggered: true
        }
      };

      await fetch('/api/admin/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });

      console.error(`🗄️ Archive Error: ${operation}`, error, context);

    } catch (logError) {
      console.error('Failed to log archive error:', logError);
    }
  }, []);

  /**
   * Log Archive Management performance metrics
   */
  const logArchivePerformance = useCallback(async (
    operation: string,
    startTime: number,
    metrics?: Partial<ArchivePerformanceMetrics>
  ): Promise<void> => {
    try {
      const endTime = performance.now();
      const duration = endTime - startTime;

      const performanceData: ArchivePerformanceMetrics = {
        operation,
        startTime,
        endTime,
        duration,
        ...metrics
      };

      const logEntry = {
        level: 'info',
        category: 'archive',
        action: 'performance',
        message: `Archive Management Performance: ${operation} completed in ${duration.toFixed(2)}ms`,
        context: {
          module: 'archive_management',
          performanceMetrics: performanceData,
          timestamp: new Date().toISOString(),
          userTriggered: true
        }
      };

      await fetch('/api/admin/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });

      // Development performance tracking


    } catch (error) {
      console.error('Failed to log archive performance:', error);
    }
  }, []);

  /**
   * Log Archive Management state changes with before/after snapshots
   */
  const logArchiveStateChange = useCallback(async (
    operation: string,
    beforeState: Record<string, any>,
    afterState: Record<string, any>,
    context?: ArchiveLogContext
  ): Promise<void> => {
    try {
      const logEntry = {
        level: 'info',
        category: 'archive',
        action: 'state_change',
        message: `Archive Management State Change: ${operation}`,
        context: {
          ...context,
          operation,
          beforeState,
          afterState,
          changeDetected: JSON.stringify(beforeState) !== JSON.stringify(afterState),
          timestamp: new Date().toISOString(),
          module: 'archive_management',
          userTriggered: true
        }
      };

      await fetch('/api/admin/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });



    } catch (error) {
      console.error('Failed to log archive state change:', error);
    }
  }, []);

  /**
   * Enhanced logging with automatic performance tracking
   */
  const withArchiveLogging = useCallback(<T extends any[], R>(
    operation: string,
    fn: (...args: T) => Promise<R>,
    context?: ArchiveLogContext
  ) => {
    return async (...args: T): Promise<R> => {
      const startTime = performance.now();

      try {
        await logArchiveAction(operation as any, context);
        const result = await fn(...args);
        await logArchivePerformance(operation, startTime, {
          recordsProcessed: context?.recordCount,
          dataTransferred: typeof context?.dataSize === 'number' ? context.dataSize : undefined
        });
        return result;
      } catch (error) {
        await logArchiveError(operation, error as Error, context);
        await logArchivePerformance(operation, startTime, { errorCount: 1 });
        throw error;
      }
    };
  }, [logArchiveAction, logArchivePerformance, logArchiveError]);

  return {
    // Core logging functions
    logArchiveAction,
    logArchiveError,
    logArchivePerformance,
    logArchiveStateChange,

    // Enhanced wrapper for automatic logging
    withArchiveLogging,

    // Utility functions for common patterns
    logArchiveCreate: (archiveId: string, archiveName: string, context?: ArchiveLogContext) =>
      logArchiveAction('create', { archiveId, archiveName, ...context }),

    logArchiveDelete: (archiveId: string, archiveName: string, context?: ArchiveLogContext) =>
      logArchiveAction('delete', { archiveId, archiveName, ...context }),

    logArchiveRestore: (archiveId: string, archiveName: string, context?: ArchiveLogContext) =>
      logArchiveAction('restore', { archiveId, archiveName, ...context }),

    logDataClean: (context?: ArchiveLogContext) =>
      logArchiveAction('clean', { operation: 'data_clean', ...context }),

    logArchiveRefresh: (context?: ArchiveLogContext) =>
      logArchiveAction('refresh', { operation: 'statistics_refresh', ...context }),

    logArchiveView: (archiveId?: string, context?: ArchiveLogContext) =>
      logArchiveAction('view', { archiveId, operation: 'archive_view', ...context })
  };
}

/**
 * Type definitions for Archive Management logging
 */
export type ArchiveLogAction = 'create' | 'delete' | 'restore' | 'clean' | 'refresh' | 'view' | 'download' | 'edit' | 'search';
export type ArchiveLogLevel = 'info' | 'warn' | 'error';

/**
 * Archive Management logging configuration
 */
export const ARCHIVE_LOG_CONFIG = {
  // Performance thresholds for alerting
  SLOW_OPERATION_THRESHOLD: 5000, // 5 seconds
  LARGE_DATA_THRESHOLD: 100 * 1024 * 1024, // 100MB

  // Log retention settings
  LOG_RETENTION_DAYS: 90,

  // Category for filtering
  LOG_CATEGORY: 'archive' as const,

  // Module identifier
  MODULE_NAME: 'archive_management' as const
} as const;
