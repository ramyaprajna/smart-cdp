/**
 * System Health Service - Pure health metrics logic
 * 
 * Extracted from analytics routes for modularity and testability
 * Provides system health monitoring and status calculation
 * 
 * Last Updated: September 17, 2025
 * Code Quality: ✅ SONARCLOUD COMPLIANT - Pure functions, no side effects
 * 
 * Features:
 * - System health status calculation based on log statistics
 * - Activity monitoring and health indicators
 * - Optimized caching for performance (1-minute cache)
 * - Pure functions for easy testing and validation
 */

import { storage } from '../../storage';
import { cacheManager } from '../../cache';
import type { SystemHealth, LogStats } from './types';
import { secureLogger } from '../../utils/secure-logger';

/**
 * Pure function to calculate overall system health status
 * Extracted from analytics routes - preserves exact existing logic
 * 
 * @param logStats - Log statistics from storage
 * @returns Health status based on error and warning rates
 */
export function calculateHealthStatus(logStats: LogStats): 'healthy' | 'warning' | 'critical' | 'unknown' {
  const errorCount = logStats.logsByLevel.error || 0;
  const warningCount = logStats.logsByLevel.warn || 0;
  const totalLogs = logStats.totalLogs || 0;
  
  if (totalLogs === 0) return 'unknown';
  
  const errorRate = errorCount / totalLogs;
  const warningRate = warningCount / totalLogs;
  
  if (errorRate > 0.1) return 'critical'; // More than 10% errors
  if (errorRate > 0.05 || warningRate > 0.2) return 'warning'; // More than 5% errors or 20% warnings
  return 'healthy';
}

/**
 * Pure function to create empty health metrics for error cases
 * Preserves exact existing error handling behavior
 */
export function createEmptyHealthMetrics(): SystemHealth {
  return {
    systemActive: false,
    totalLogsToday: 0,
    errorRate: 0,
    warningRate: 0,
    lastActivityAt: null,
    categories: {},
    healthStatus: 'unknown'
  };
}

/**
 * Pure function to process log statistics into health metrics
 * Extracted for better testability and modularity
 * 
 * @param logStats - Raw log statistics from storage
 * @param recentActivityTotal - Number of recent activity logs
 * @param lastActivityTimestamp - Timestamp of last activity or null
 * @returns Processed system health metrics
 */
export function processLogStatsToHealthMetrics(
  logStats: LogStats,
  recentActivityTotal: number,
  lastActivityTimestamp: string | null
): SystemHealth {
  return {
    systemActive: recentActivityTotal > 0,
    totalLogsToday: logStats.totalLogs,
    errorRate: logStats.logsByLevel.error || 0,
    warningRate: logStats.logsByLevel.warn || 0,
    lastActivityAt: lastActivityTimestamp,
    categories: logStats.logsByCategory,
    healthStatus: calculateHealthStatus(logStats)
  };
}

/**
 * Helper function to get system health metrics
 * Moved from analytics routes - preserves exact existing functionality
 * 
 * Features:
 * - Gets log statistics for health assessment
 * - Calculates health indicators based on error/warning rates
 * - Monitors recent activity (last 5 minutes)
 * - Optimized caching for performance
 */
export async function getSystemHealthMetrics(): Promise<SystemHealth> {
  const healthCacheKey = 'system-health-metrics';
  let healthMetrics = cacheManager.getAnalytics(healthCacheKey);
  
  if (!healthMetrics) {
    try {
      // Get log statistics for health assessment
      const logStats = await storage.getLogStats();
      
      // Calculate health indicators
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      // Get recent activity indicators
      const recentActivity = await storage.getApplicationLogs({
        startDate: fiveMinutesAgo,
        isArchived: false,
        limit: 1,
        offset: 0
      });
      
      // Process log statistics into health metrics using pure function
      healthMetrics = processLogStatsToHealthMetrics(
        logStats,
        recentActivity.total,
        recentActivity.logs[0]?.timestamp?.toISOString() || null
      );

      // Cache for 1 minute
      cacheManager.setAnalytics(healthCacheKey, healthMetrics, 60 * 1000);
      
    } catch (error) {
      secureLogger.error('[System Health] Failed to get health metrics:', { error: String(error) });
      healthMetrics = createEmptyHealthMetrics();
    }
  }
  
  return healthMetrics;
}

/**
 * Alternative interface for getting health metrics with custom parameters
 * Allows for more flexible health monitoring while maintaining caching
 * 
 * @param activityWindowMinutes - Minutes to look back for recent activity (default: 5)
 * @param cacheKey - Optional custom cache key
 * @param cacheTTL - Optional custom cache TTL in milliseconds (default: 1 minute)
 * @returns System health metrics based on custom parameters
 */
export async function getSystemHealthMetricsWithParams(
  activityWindowMinutes: number = 5,
  cacheKey?: string,
  cacheTTL: number = 60 * 1000
): Promise<SystemHealth> {
  const finalCacheKey = cacheKey || `system-health-${activityWindowMinutes}min`;
  let healthMetrics = cacheManager.getAnalytics(finalCacheKey);
  
  if (!healthMetrics) {
    try {
      // Get log statistics for health assessment
      const logStats = await storage.getLogStats();
      
      // Calculate health indicators with custom activity window
      const now = new Date();
      const activityWindowStart = new Date(now.getTime() - activityWindowMinutes * 60 * 1000);
      
      // Get recent activity indicators
      const recentActivity = await storage.getApplicationLogs({
        startDate: activityWindowStart,
        isArchived: false,
        limit: 1,
        offset: 0
      });
      
      // Process log statistics into health metrics
      healthMetrics = processLogStatsToHealthMetrics(
        logStats,
        recentActivity.total,
        recentActivity.logs[0]?.timestamp?.toISOString() || null
      );

      // Cache with custom TTL
      cacheManager.setAnalytics(finalCacheKey, healthMetrics, cacheTTL);
      
    } catch (error) {
      secureLogger.error(`[System Health] Failed to get health metrics with ${activityWindowMinutes}min window:`, { error: String(error) });
      healthMetrics = createEmptyHealthMetrics();
    }
  }
  
  return healthMetrics;
}

/**
 * Pure function to determine if system is in healthy state
 * Useful for quick health checks and alerting
 * 
 * @param healthMetrics - System health metrics
 * @returns true if system is healthy, false otherwise
 */
export function isSystemHealthy(healthMetrics: SystemHealth): boolean {
  return healthMetrics.systemActive && 
         healthMetrics.healthStatus === 'healthy';
}

/**
 * Pure function to get health score (0-100)
 * Useful for dashboard indicators and monitoring
 * 
 * @param healthMetrics - System health metrics
 * @returns Health score from 0 (critical) to 100 (healthy)
 */
export function getHealthScore(healthMetrics: SystemHealth): number {
  if (!healthMetrics.systemActive) return 0;
  
  switch (healthMetrics.healthStatus) {
    case 'healthy': return 100;
    case 'warning': return 70;
    case 'critical': return 30;
    case 'unknown': return 50;
    default: return 0;
  }
}