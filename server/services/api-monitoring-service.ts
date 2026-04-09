/**
 * API Monitoring Service
 *
 * Purpose: Comprehensive monitoring and diagnostics for API endpoints
 *
 * Key Features:
 * - Real-time request/response tracking with unique IDs
 * - Performance metrics collection and alerting
 * - Error detection and automatic logging
 * - Detailed diagnostics for troubleshooting
 * - Memory-efficient circular buffer for metrics history
 *
 * Design Decisions:
 * - Uses middleware pattern for non-intrusive monitoring
 * - Implements circular buffer to prevent memory leaks
 * - Automatic performance alert generation
 * - Integration with application logger for persistence
 *
 * @module ApiMonitoringService
 * @created August 11, 2025
 * @updated August 13, 2025 - Refactored for improved performance tracking
 */

import { Request, Response, NextFunction } from 'express';
import { applicationLogger } from './application-logger';
import { nanoid } from 'nanoid';
import {
  ServiceOperation,
  PerformanceMonitor
} from '../utils/service-utilities';

interface ApiMetrics {
  requestId: string;
  method: string;
  url: string;
  statusCode?: number;
  responseTime?: number;
  requestSize?: number;
  responseSize?: number;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  timestamp: Date;
  error?: string;
  stackTrace?: string;
}

interface PerformanceAlert {
  type: 'slow_request' | 'error_rate' | 'timeout';
  threshold: number;
  currentValue: number;
  endpoint: string;
  timestamp: Date;
}

export class ApiMonitoringService {
  private metrics: ApiMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second
  private readonly ERROR_RATE_THRESHOLD = 0.1; // 10%
  private readonly MAX_METRICS_HISTORY = 1000;

  /**
   * Express middleware for API monitoring
   */
  monitor() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = nanoid(8);
      const startTime = Date.now();

      // Add request ID to headers for tracking
      res.setHeader('X-Request-ID', requestId);

      const metrics: Partial<ApiMetrics> = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        userId: req.user?.id,
        timestamp: new Date(),
        requestSize: req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0
      };

      // Override res.end to capture response data
      const originalEnd = res.end.bind(res);
      let responseData = '';
      const self = this;

      res.end = function(chunk?: any, encoding?: any) {
        if (chunk) {
          responseData += chunk;
        }

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Complete metrics
        const completeMetrics: ApiMetrics = {
          ...metrics,
          statusCode: res.statusCode,
          responseTime,
          responseSize: responseData.length,
          timestamp: new Date()
        } as ApiMetrics;

        // Store metrics
        self.storeMetrics(completeMetrics);

        // Check for performance issues
        self.checkPerformanceAlerts(completeMetrics);

        // Log to application logger for critical issues
        if (responseTime > self.SLOW_REQUEST_THRESHOLD || res.statusCode >= 500) {
          self.logCriticalIssue(completeMetrics);
        }

        // Call original end method
        return originalEnd(chunk, encoding);
      };

      // Capture errors
      res.on('error', (error: Error) => {
        const errorMetrics: ApiMetrics = {
          ...metrics,
          statusCode: 500,
          responseTime: Date.now() - startTime,
          error: error.message,
          stackTrace: error.stack,
          timestamp: new Date()
        } as ApiMetrics;

        this.storeMetrics(errorMetrics);
        this.logCriticalIssue(errorMetrics);
      });

      next();
    };
  }

  /**
   * Store metrics with automatic cleanup
   */
  private storeMetrics(metrics: ApiMetrics): void {
    this.metrics.push(metrics);

    // Keep only recent metrics to prevent memory issues
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(metrics: ApiMetrics): void {
    // Check for slow requests
    if (metrics.responseTime && metrics.responseTime > this.SLOW_REQUEST_THRESHOLD) {
      this.createAlert({
        type: 'slow_request',
        threshold: this.SLOW_REQUEST_THRESHOLD,
        currentValue: metrics.responseTime,
        endpoint: `${metrics.method} ${metrics.url}`,
        timestamp: new Date()
      });
    }

    // Check error rate for this endpoint
    const recentMetrics = this.metrics.filter(m =>
      m.url === metrics.url &&
      m.method === metrics.method &&
      Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
    );

    if (recentMetrics.length >= 10) {
      const errorCount = recentMetrics.filter(m => m.statusCode && m.statusCode >= 400).length;
      const errorRate = errorCount / recentMetrics.length;

      if (errorRate > this.ERROR_RATE_THRESHOLD) {
        this.createAlert({
          type: 'error_rate',
          threshold: this.ERROR_RATE_THRESHOLD,
          currentValue: errorRate,
          endpoint: `${metrics.method} ${metrics.url}`,
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);

    // Log alert
    applicationLogger.warn(
      'api',
      `Performance alert: ${alert.type}`,
      {
        type: alert.type,
        endpoint: alert.endpoint,
        threshold: alert.threshold,
        currentValue: alert.currentValue,
        timestamp: alert.timestamp
      }
    );

    // Keep only recent alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Log critical issues to application logger
   */
  private async logCriticalIssue(metrics: ApiMetrics): Promise<void> {
    const level = metrics.statusCode && metrics.statusCode >= 500 ? 'error' : 'warn';
    const category = metrics.url?.includes('/api/admin/logs') ? 'api' : 'api';

    try {
      await applicationLogger.warn(
        category,
        `API performance issue detected: ${metrics.method} ${metrics.url}`,
        {
          requestId: metrics.requestId,
          statusCode: metrics.statusCode,
          responseTime: metrics.responseTime,
          error: metrics.error,
          userAgent: metrics.userAgent,
          ipAddress: metrics.ipAddress,
          userId: metrics.userId
        }
      );
    } catch (error) {
      applicationLogger.error('system', 'Failed to log API monitoring data:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    }
  }

  /**
   * Get recent metrics for analysis
   */
  getRecentMetrics(options: {
    endpoint?: string;
    timeRange?: number; // minutes
    limit?: number;
  } = {}): ApiMetrics[] {
    const { endpoint, timeRange = 60, limit = 100 } = options;
    const cutoffTime = Date.now() - (timeRange * 60 * 1000);

    let filtered = this.metrics.filter(m => m.timestamp.getTime() > cutoffTime);

    if (endpoint) {
      filtered = filtered.filter(m => m.url?.includes(endpoint));
    }

    return filtered.slice(-limit);
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(timeRange = 60): PerformanceAlert[] {
    const cutoffTime = Date.now() - (timeRange * 60 * 1000);
    return this.alerts.filter(a => a.timestamp.getTime() > cutoffTime);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(timeRange = 60): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    slowRequests: number;
    topErrorEndpoints: Array<{ endpoint: string; errorCount: number }>;
  } {
    const cutoffTime = Date.now() - (timeRange * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() > cutoffTime);

    const totalRequests = recentMetrics.length;
    const averageResponseTime = totalRequests > 0
      ? recentMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) / totalRequests
      : 0;

    const errorCount = recentMetrics.filter(m => m.statusCode && m.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    const slowRequests = recentMetrics.filter(m =>
      m.responseTime && m.responseTime > this.SLOW_REQUEST_THRESHOLD
    ).length;

    // Top error endpoints
    const errorEndpoints = recentMetrics
      .filter(m => m.statusCode && m.statusCode >= 400)
      .reduce((acc, m) => {
        const endpoint = `${m.method} ${m.url}`;
        acc[endpoint] = (acc[endpoint] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topErrorEndpoints = Object.entries(errorEndpoints)
      .map(([endpoint, errorCount]) => ({ endpoint, errorCount }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 5);

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      slowRequests,
      topErrorEndpoints
    };
  }

  /**
   * Specific monitoring for logs API endpoint
   */
  monitorLogsEndpoint(): {
    recentErrors: ApiMetrics[];
    performanceIssues: PerformanceAlert[];
    diagnostics: any;
  } {
    const logsMetrics = this.getRecentMetrics({ endpoint: '/api/admin/logs', timeRange: 60 });
    const logsAlerts = this.getRecentAlerts(60).filter(a => a.endpoint.includes('/api/admin/logs'));

    const diagnostics = {
      totalRequests: logsMetrics.length,
      errorCount: logsMetrics.filter(m => m.statusCode && m.statusCode >= 400).length,
      averageResponseTime: logsMetrics.length > 0
        ? Math.round(logsMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) / logsMetrics.length)
        : 0,
      lastError: logsMetrics
        .filter(m => m.error)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]
    };

    return {
      recentErrors: logsMetrics.filter(m => m.error || (m.statusCode && m.statusCode >= 400)),
      performanceIssues: logsAlerts,
      diagnostics
    };
  }
}

// Export singleton instance
export const apiMonitoringService = new ApiMonitoringService();
