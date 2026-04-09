/**
 * Archive Management Logging Routes
 *
 * Dedicated API endpoints for Archive Management module logging.
 * Isolated from other logging systems to maintain clear separation of concerns.
 *
 * @created August 11, 2025
 * @module ArchiveLoggingRoutes
 *
 * @features
 * - Archive-specific log ingestion
 * - Performance metrics tracking
 * - Error correlation and debugging
 * - User action audit trails
 *
 * @routes
 * - POST /api/admin/logs/archive - Log archive management events
 * - GET /api/admin/logs/archive/stats - Archive logging statistics
 * - GET /api/admin/logs/archive/search - Search archive logs
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { applicationLogger } from '../services/application-logger';

const router = Router();

// Validation schemas
const archiveLogEntrySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'critical']),
  category: z.literal('archive'),
  action: z.string(),
  message: z.string(),
  context: z.object({
    archiveId: z.string().optional(),
    archiveName: z.string().optional(),
    archiveType: z.enum(['full', 'partial', 'backup']).optional(),
    dataSize: z.union([z.string(), z.number()]).optional(),
    recordCount: z.number().optional(),
    duration: z.number().optional(),
    operation: z.string().optional(),
    module: z.literal('archive_management'),
    userTriggered: z.boolean().default(true),
    timestamp: z.string(),
    performanceMetrics: z.record(z.any()).optional(),
    errorMessage: z.string().optional(),
    stackTrace: z.string().optional(),
    beforeState: z.record(z.any()).optional(),
    afterState: z.record(z.any()).optional(),
    browserInfo: z.object({
      userAgent: z.string(),
      viewport: z.string(),
      timestamp: z.number()
    }).optional()
  })
});

const archiveLogSearchSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  action: z.string().optional(),
  archiveId: z.string().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error', 'critical']).optional(),
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0)
});

/**
 * Log Archive Management events
 * POST /api/admin/logs/archive
 */
router.post('/archive', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = archiveLogEntrySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid log entry format',
        details: validation.error.errors
      });
      return;
    }

    const { level, category, action, message, context } = validation.data;

    // Log the archive event using the application logger
    await applicationLogger.logArchive(
      action as any,
      context.archiveId,
      {
        ...context,
        userId: req.user?.id,
        sessionId: (req as any).sessionID,
        clientTriggered: true
      },
      req
    );

    // Additional performance tracking for slow operations
    if (context.performanceMetrics && context.performanceMetrics.duration > 5000) {
      await applicationLogger.warn('archive',
        `Slow archive operation detected: ${action} took ${context.performanceMetrics.duration}ms`,
        { slowOperation: true, ...context.performanceMetrics },
        req
      );
    }

    res.json({
      success: true,
      message: 'Archive log entry recorded',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await applicationLogger.error('archive',
      'Failed to process archive log entry',
      error as Error,
      { logIngestionError: true },
      req
    );

    res.status(500).json({
      error: 'Failed to log archive event',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Archive Management logging statistics
 * GET /api/admin/logs/archive/stats
 */
router.get('/archive/stats', requireAuth, requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    // Get archive-specific log statistics from storage
    const stats = await req.app.locals.storage.getLogStats({
      category: 'archive',
      timeRange: '24h'
    });

    await applicationLogger.info('archive', 'Archive log statistics requested', {
      statsType: 'archive_logs',
      requestedBy: req.user?.id
    }, req);

    res.json({
      success: true,
      data: {
        ...stats,
        category: 'archive',
        timeRange: '24h',
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    await applicationLogger.error('archive',
      'Failed to retrieve archive log statistics',
      error as Error,
      undefined,
      req
    );

    res.status(500).json({
      error: 'Failed to retrieve archive log statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search Archive Management logs with filtering
 * GET /api/admin/logs/archive/search
 */
router.get('/archive/search', requireAuth, requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = archiveLogSearchSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid search parameters',
        details: validation.error.errors
      });
      return;
    }

    const filters = {
      ...validation.data,
      category: 'archive' as const,
      startDate: validation.data.startDate ? new Date(validation.data.startDate) : undefined,
      endDate: validation.data.endDate ? new Date(validation.data.endDate) : undefined
    };

    const result = await req.app.locals.storage.getApplicationLogs(filters);

    await applicationLogger.info('archive', 'Archive log search performed', {
      searchFilters: filters,
      resultsCount: result.logs.length,
      requestedBy: req.user?.id
    }, req);

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: result.logs.length === filters.limit
      },
      filters: {
        ...filters,
        appliedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    await applicationLogger.error('archive',
      'Failed to search archive logs',
      error as Error,
      undefined,
      req
    );

    res.status(500).json({
      error: 'Failed to search archive logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
