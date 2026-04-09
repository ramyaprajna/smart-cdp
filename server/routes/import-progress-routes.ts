/**
 * Import Progress and Resume API Routes
 *
 * Provides endpoints for real-time import progress tracking and resume functionality.
 *
 * Features:
 * - GET /api/imports/:sessionId/progress - Real-time progress tracking
 * - POST /api/imports/:sessionId/resume - Resume interrupted imports
 * - GET /api/imports/:sessionId/status - Import session status
 * - POST /api/imports/:sessionId/cancel - Cancel running imports
 *
 * Last Updated: August 14, 2025
 * Integration Status: ✅ NEW - Real-time progress and resume functionality
 */

import { Router } from 'express';
import { z } from 'zod';
import { dataLineageService } from '../data-lineage-service';
import { applicationLogger } from '../services/application-logger';

const router = Router();

// Progress tracking storage (in production, use Redis or similar)
const progressTracker = new Map<string, ImportProgressData>();
const importSessions = new Map<string, ImportSessionData>();

interface ImportProgressData {
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  currentBatch: number;
  totalBatches: number;
  startTime: Date;
  lastUpdateTime: Date;
  estimatedCompletion?: Date;
  processingSpeed: number;
  status: 'starting' | 'processing' | 'timeout' | 'error' | 'completed' | 'paused';
  importSessionId: string;
  currentOperation: string;
  lastProcessedRecord?: number;
  duplicatesHandled?: number;
  canResume?: boolean;
  errorMessage?: string;
}

interface ImportSessionData {
  sessionId: string;
  fileName: string;
  originalTotalRecords: number;
  duplicateHandlingStrategy: string;
  startTime: Date;
  lastProcessedRecord: number;
  preservedSettings: Record<string, any>;
  status: 'active' | 'paused' | 'completed' | 'error';
}

// Resume options validation schema
const resumeOptionsSchema = z.object({
  lastProcessedRecord: z.number().min(0),
  duplicateHandlingStrategy: z.string(),
  preservedSettings: z.record(z.any())
});

/**
 * GET /api/imports/:sessionId/progress
 * Get real-time import progress for a session
 */
router.get('/:sessionId/progress', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const progress = progressTracker.get(sessionId);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: 'Import session not found'
      });
    }

    // Calculate processing speed if applicable
    if (progress.status === 'processing' && progress.processedRecords > 0) {
      const elapsedSeconds = (Date.now() - progress.startTime.getTime()) / 1000;
      progress.processingSpeed = progress.processedRecords / elapsedSeconds;

      // Estimate completion time
      if (progress.processingSpeed > 0) {
        const remainingRecords = progress.totalRecords - progress.processedRecords;
        const remainingSeconds = remainingRecords / progress.processingSpeed;
        progress.estimatedCompletion = new Date(Date.now() + remainingSeconds * 1000);
      }
    }

    // Update last update time
    progress.lastUpdateTime = new Date();
    progressTracker.set(sessionId, progress);

    res.json({
      success: true,
      ...progress
    });

  } catch (error) {
    applicationLogger.error('import', '🚨 [Progress API] Failed to get progress:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve import progress'
    });
  }
});

/**
 * POST /api/imports/:sessionId/resume
 * Resume an interrupted import from the last processed record
 */
router.post('/:sessionId/resume', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const validatedOptions = resumeOptionsSchema.parse(req.body);


    // Check if session exists
    const session = importSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Import session not found'
      });
    }

    // Update session with resume information
    session.lastProcessedRecord = validatedOptions.lastProcessedRecord;
    session.duplicateHandlingStrategy = validatedOptions.duplicateHandlingStrategy;
    session.preservedSettings = {
      ...session.preservedSettings,
      ...validatedOptions.preservedSettings,
      resumedAt: new Date(),
      resumeCount: (session.preservedSettings.resumeCount || 0) + 1
    };
    session.status = 'active';

    importSessions.set(sessionId, session);

    // Update progress tracker
    const currentProgress = progressTracker.get(sessionId);
    if (currentProgress) {
      currentProgress.status = 'processing';
      currentProgress.currentOperation = 'Resuming import...';
      currentProgress.lastProcessedRecord = validatedOptions.lastProcessedRecord;
      currentProgress.lastUpdateTime = new Date();
      progressTracker.set(sessionId, currentProgress);
    }

    // Log the resume operation for audit trail
    await applicationLogger.logImport(
      `Import session ${sessionId} resumed from record ${validatedOptions.lastProcessedRecord}`,
      'info',
      {
        sessionId,
        lastProcessedRecord: validatedOptions.lastProcessedRecord,
        duplicateHandlingStrategy: validatedOptions.duplicateHandlingStrategy,
        resumeCount: session.preservedSettings.resumeCount,
        fileName: session.fileName,
        operation: 'import_resumed'
      }
    );

    res.json({
      success: true,
      message: 'Import resume initiated successfully',
      sessionId,
      resumePoint: validatedOptions.lastProcessedRecord,
      auditLogged: true
    });

  } catch (error) {
    applicationLogger.error('import', '🚨 [Resume API] Failed to resume import:', error instanceof Error ? error : new Error(String(error))).catch(() => {});

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Log the failed resume attempt
    await applicationLogger.logImport(
      `Failed to resume import session ${req.params.sessionId}: ${errorMessage}`,
      'error',
      {
        sessionId: req.params.sessionId,
        error: errorMessage,
        requestBody: req.body,
        operation: 'import_resume_failed'
      }
    );

    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
});

/**
 * GET /api/imports/:sessionId/status
 * Get import session status and metadata
 */
router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = importSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Import session not found'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    applicationLogger.error('import', '🚨 [Status API] Failed to get session status:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve session status'
    });
  }
});

/**
 * POST /api/imports/:sessionId/cancel
 * Cancel a running import session
 */
router.post('/:sessionId/cancel', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Update progress to cancelled
    const progress = progressTracker.get(sessionId);
    if (progress) {
      progress.status = 'paused';
      progress.currentOperation = 'Import cancelled by user';
      progress.lastUpdateTime = new Date();
      progressTracker.set(sessionId, progress);
    }

    // Update session status
    const session = importSessions.get(sessionId);
    if (session) {
      session.status = 'paused';
      importSessions.set(sessionId, session);
    }

    // Log the cancellation
    await applicationLogger.logImport(
      `Import session ${sessionId} cancelled by user`,
      'info',
      {
        sessionId,
        processedRecords: progress?.processedRecords || 0,
        totalRecords: progress?.totalRecords || 0,
        operation: 'import_cancelled'
      }
    );

    res.json({
      success: true,
      message: 'Import cancelled successfully'
    });

  } catch (error) {
    applicationLogger.error('import', '🚨 [Cancel API] Failed to cancel import:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    res.status(500).json({
      success: false,
      message: 'Failed to cancel import'
    });
  }
});

// Helper functions for external use
export const updateImportProgress = (sessionId: string, updates: Partial<ImportProgressData>) => {
  const current = progressTracker.get(sessionId);
  if (current) {
    const updated = { ...current, ...updates, lastUpdateTime: new Date() };
    progressTracker.set(sessionId, updated);
    applicationLogger.info('import', `📊 [Progress Update] ${sessionId}: ${updated.processedRecords}/${updated.totalRecords} (${updated.status})`);
  }
};

export const initializeImportSession = (sessionData: ImportSessionData) => {
  importSessions.set(sessionData.sessionId, sessionData);

  const progress: ImportProgressData = {
    totalRecords: sessionData.originalTotalRecords,
    processedRecords: 0,
    successfulRecords: 0,
    failedRecords: 0,
    currentBatch: 1,
    totalBatches: Math.ceil(sessionData.originalTotalRecords / 100),
    startTime: sessionData.startTime,
    lastUpdateTime: new Date(),
    processingSpeed: 0,
    status: 'starting',
    importSessionId: sessionData.sessionId,
    currentOperation: 'Initializing import...',
    canResume: true
  };

  progressTracker.set(sessionData.sessionId, progress);
};

export const completeImportSession = (sessionId: string, finalStats: any) => {
  updateImportProgress(sessionId, {
    status: 'completed',
    currentOperation: 'Import completed successfully',
    processedRecords: finalStats.totalProcessed || 0,
    successfulRecords: finalStats.successful || 0,
    failedRecords: finalStats.errors || 0,
    duplicatesHandled: finalStats.duplicates || 0
  });

  const session = importSessions.get(sessionId);
  if (session) {
    session.status = 'completed';
    importSessions.set(sessionId, session);
  }
};

// Export progress tracking utilities for use in other modules
export { progressTracker, importSessions };
export default router;
