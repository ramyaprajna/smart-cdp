/**
 * Embedding Safeguard API Routes
 * 
 * Purpose: API endpoints for embedding module protection and monitoring
 * 
 * Key Features:
 * - Pre-change validation endpoints
 * - Real-time monitoring status
 * - Critical file change verification
 * - System health reporting
 * 
 * @module SafeguardRoutes
 * @created September 23, 2025
 */

import { Router } from 'express';
import { globalEmbeddingSafeguard } from '../services/embedding-safeguard-service';
import { requireAuth } from '../jwt-utils';
import { performanceMonitor } from '../services/performance-monitor';

const router = Router();

/**
 * GET /api/safeguards/system-health
 * Get comprehensive system health report
 */
router.get('/system-health', requireAuth, async (req, res) => {
  const requestId = (req as any).requestId || 'unknown';
  const startTime = performance.now();

  try {
    const healthReport = await globalEmbeddingSafeguard.runPreChangeValidation();
    
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/system-health', responseTime, 200);

    res.json({
      success: true,
      data: healthReport,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/system-health', responseTime, 500);

    res.status(500).json({
      success: false,
      error: 'Failed to generate system health report',
      details: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });
  }
});

/**
 * POST /api/safeguards/verify-change
 * Verify if a change to embedding module is safe
 */
router.post('/verify-change', requireAuth, async (req, res) => {
  const requestId = (req as any).requestId || 'unknown';
  const startTime = performance.now();

  try {
    const { filePath, changeDescription } = req.body;

    if (!filePath || !changeDescription) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: filePath and changeDescription',
        meta: { requestId, timestamp: new Date().toISOString() }
      });
    }

    const verificationResult = await globalEmbeddingSafeguard.verifyCriticalFileChange(
      filePath,
      changeDescription
    );
    
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/verify-change', responseTime, 200);

    res.json({
      success: true,
      data: verificationResult,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/verify-change', responseTime, 500);

    res.status(500).json({
      success: false,
      error: 'Failed to verify change safety',
      details: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });
  }
});

/**
 * GET /api/safeguards/critical-files
 * Get list of critical embedding files that require special protection
 */
router.get('/critical-files', requireAuth, async (req, res) => {
  const requestId = (req as any).requestId || 'unknown';
  const startTime = performance.now();

  try {
    const criticalFiles = globalEmbeddingSafeguard.getCriticalFiles();
    
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/critical-files', responseTime, 200);

    res.json({
      success: true,
      data: {
        criticalFiles,
        count: criticalFiles.length,
        description: 'Files that require pre-change validation and enhanced monitoring'
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/critical-files', responseTime, 500);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve critical files list',
      details: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });
  }
});

/**
 * GET /api/safeguards/recent-alerts
 * Get recent safeguard alerts and warnings
 */
router.get('/recent-alerts', requireAuth, async (req, res) => {
  const requestId = (req as any).requestId || 'unknown';
  const startTime = performance.now();

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const recentAlerts = globalEmbeddingSafeguard.getRecentAlerts(limit);
    
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/recent-alerts', responseTime, 200);

    res.json({
      success: true,
      data: {
        alerts: recentAlerts,
        count: recentAlerts.length,
        limit
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/recent-alerts', responseTime, 500);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent alerts',
      details: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });
  }
});

/**
 * POST /api/safeguards/run-monitoring
 * Manually trigger continuous monitoring check
 */
router.post('/run-monitoring', requireAuth, async (req, res) => {
  const requestId = (req as any).requestId || 'unknown';
  const startTime = performance.now();

  try {
    const isHealthy = await globalEmbeddingSafeguard.runContinuousMonitoring();
    
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/run-monitoring', responseTime, 200);

    res.json({
      success: true,
      data: {
        isHealthy,
        status: isHealthy ? 'System healthy' : 'System requires attention',
        recommendation: isHealthy ? 'Continue normal operations' : 'Check recent alerts and system health report'
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    performanceMonitor.recordMetric('/api/safeguards/run-monitoring', responseTime, 500);

    res.status(500).json({
      success: false,
      error: 'Failed to run monitoring check',
      details: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        responseTime: Math.round(responseTime)
      }
    });
  }
});

export default router;