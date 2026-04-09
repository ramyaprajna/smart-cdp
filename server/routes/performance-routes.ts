/**
 * Performance Monitoring API Routes - Phase 3 Memory Optimization
 * Real-time performance metrics, system health, and cache statistics
 * Implementation: August 15, 2025
 */

import { Application } from 'express';
import { performanceMonitor } from '../services/performance-monitor';
import { cacheManager } from '../cache';
import { secureLogger } from '../utils/secure-logger';

export function addPerformanceRoutes(app: Application) {

  /**
   * Get current system performance statistics
   * @route GET /api/performance/stats
   */
  app.get("/api/performance/stats", (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes as string) || 10;
      const stats = performanceMonitor.getPerformanceStats(minutes);

      res.json({
        success: true,
        data: {
          timeWindow: `${minutes} minutes`,
          ...stats,
        }
      });
    } catch (error) {
      secureLogger.error('Performance stats error:', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance statistics'
      });
    }
  });

  /**
   * Get current system health status
   * @route GET /api/performance/health
   */
  app.get("/api/performance/health", (req, res) => {
    try {
      const health = performanceMonitor.getSystemHealth();

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      secureLogger.error('System health error:', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system health'
      });
    }
  });

  /**
   * Get cache statistics and performance metrics
   * @route GET /api/performance/cache
   */
  app.get("/api/performance/cache", (req, res) => {
    try {
      const cacheStats = cacheManager.getCacheStats();

      res.json({
        success: true,
        data: {
          caches: cacheStats,
          timestamp: new Date().toISOString(),
          memoryUsage: process.memoryUsage(),
        }
      });
    } catch (error) {
      secureLogger.error('Cache stats error:', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve cache statistics'
      });
    }
  });

  /**
   * Get comprehensive system overview
   * @route GET /api/performance/overview
   */
  app.get("/api/performance/overview", (req, res) => {
    try {
      const stats = performanceMonitor.getPerformanceStats(30); // Last 30 minutes
      const health = performanceMonitor.getSystemHealth();
      const cacheStats = cacheManager.getCacheStats();

      res.json({
        success: true,
        data: {
          systemHealth: health,
          performance: stats,
          cacheStats,
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      secureLogger.error('Performance overview error:', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system overview'
      });
    }
  });
}
