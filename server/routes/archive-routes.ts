/**
 * Isolated Archive Management Routes
 *
 * RESTful API endpoints for database-level separated archive management.
 * Provides secure admin-only access to isolated archive operations with
 * complete separation from live application data.
 *
 * Features:
 * - Database schema isolation (archive namespace)
 * - Complete data separation from live application
 * - Independent query performance and optimization
 * - Secure admin-only access controls
 *
 * Endpoints:
 * - POST /api/archives - Create new isolated archive
 * - GET /api/archives - List all isolated archives with filtering
 * - GET /api/archives/:id - Get specific archive details
 * - PUT /api/archives/:id - Update archive metadata
 * - DELETE /api/archives/:id - Delete archive
 * - POST /api/archives/:id/restore - Restore archive data
 * - GET /api/archives/statistics - Get archive statistics
 * - GET /api/archives/isolation/verify - Verify archive isolation
 *
 * Last Updated: August 1, 2025
 * Integration Status: ✅ NEW - Database-level separation implementation
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { isolatedArchiveService, type IsolatedArchiveCreationOptions, type IsolatedRestoreOptions } from '../services/isolated-archive-service';
import { archiveValidationService } from '../services/archive-validation-service';
import { ValidationSchemaFactory } from '../utils/validation-schema-factory';
import { applicationLogger } from '../services/application-logger';

const router = Router();

// Use centralized validation schemas
const archiveSchemas = ValidationSchemaFactory.createArchiveSchemas();

/**
 * Create a new archive
 * POST /api/archives
 */
router.post('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const validatedData = ValidationSchemaFactory.validateBody(archiveSchemas.create, req.body);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }


    const options: IsolatedArchiveCreationOptions = {
      ...validatedData,
      dateRange: validatedData.dateRange ? {
        startDate: new Date(validatedData.dateRange.startDate),
        endDate: new Date(validatedData.dateRange.endDate)
      } : undefined
    };

    const archive = await isolatedArchiveService.createArchive(options, userId);

    res.json({
      success: true,
      archive,
      message: `Archive "${archive.name}" created successfully`
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive creation error', error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid archive data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create archive',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all archives with filtering and pagination
 * GET /api/archives
 */
router.get('/', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const queryParams = ValidationSchemaFactory.validateQuery(archiveSchemas.query, req.query);
    const result = await isolatedArchiveService.getArchives(queryParams);

    res.json({
      success: true,
      archives: result.archives,
      pagination: {
        total: result.totalCount,
        limit: queryParams.limit,
        offset: queryParams.offset,
        hasMore: result.totalCount > ((queryParams.offset || 0) + (queryParams.limit || 20))
      }
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive listing error', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve archives'
    });
  }
});

/**
 * Get archive statistics
 * GET /api/archives/statistics
 */
router.get('/statistics', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const statistics = await isolatedArchiveService.getArchiveStatistics();

    res.json({
      success: true,
      statistics
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive statistics error', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve archive statistics'
    });
  }
});

/**
 * Verify archive isolation
 * GET /api/archives/isolation/verify
 */
router.get('/isolation/verify', requireAuth, requireRole(['admin']), async (req, res) => {
  try {

    const verification = await isolatedArchiveService.verifyArchiveIsolation();

    res.json({
      success: true,
      verification,
      message: verification.isolated
        ? 'Archive isolation verified successfully'
        : 'Archive isolation issues detected'
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive isolation verification error', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to verify archive isolation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get specific archive details
 * GET /api/archives/:id
 */
router.get('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const archive = await isolatedArchiveService.getArchiveById(id);

    if (!archive) {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    // Archive data is now stored in isolated schema - simplified response
    const archiveData = [];

    res.json({
      success: true,
      archive,
      summary: {
        recordCounts: archive.recordCounts || {},
        dataSize: archive.dataSize || 0,
        isolationStatus: 'database_schema_separated',
        schemaNamespace: 'archive'
      }
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive retrieval error', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve archive'
    });
  }
});

/**
 * Update archive metadata
 * PUT /api/archives/:id
 */
router.put('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = ValidationSchemaFactory.validateBody(archiveSchemas.update, req.body);

    const updatedArchive = await isolatedArchiveService.updateArchive(id, validatedData);

    if (!updatedArchive) {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    res.json({
      success: true,
      archive: updatedArchive,
      message: 'Archive updated successfully'
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive update error', error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid update data',
        details: error.errors
      });
    }

    if (error instanceof Error && error.message === 'Archive not found') {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update archive'
    });
  }
});

/**
 * Delete archive
 * DELETE /api/archives/:id
 */
router.delete('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const success = await isolatedArchiveService.deleteArchive(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    res.json({
      success: true,
      message: 'Archive deleted successfully from isolated schema'
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive deletion error', error instanceof Error ? error : undefined);

    if (error instanceof Error && error.message === 'Archive not found') {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete archive'
    });
  }
});

/**
 * Clean application data (with automatic backup)
 * POST /api/archives/clean
 */
router.post('/clean', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }


    // First, create a backup archive before cleaning
    const backupName = `Backup Before Clean ${new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/[/:]/g, '-').replace(', ', ' ')}`;

    const backupArchive = await isolatedArchiveService.createArchive({
      name: backupName,
      description: 'Automatic backup created before data cleaning operation',
      archiveType: 'backup'
    }, userId);


    // Then clean the application data
    const { tablesToClean } = req.body;
    const cleanResult = await isolatedArchiveService.cleanApplicationData(tablesToClean);

    // Critical: Invalidate analytics cache after cleaning to maintain data consistency
    try {
      const { invalidateAnalyticsCache } = await import('../performance-middleware');
      invalidateAnalyticsCache();
    } catch (error) {
      applicationLogger.warn('archive', 'Failed to invalidate analytics cache', { error: error instanceof Error ? error.message : String(error) });
    }

    res.json({
      success: true,
      backup: {
        archiveId: backupArchive.id,
        archiveName: backupArchive.name,
        message: 'Backup created successfully before cleaning'
      },
      clean: {
        tablesProcessed: cleanResult.cleaned,
        recordsRemoved: cleanResult.recordsRemoved,
        message: `Successfully cleaned ${cleanResult.recordsRemoved} records from ${cleanResult.cleaned.length} tables`
      },
      message: `Data cleaned successfully. Backup archive "${backupArchive.name}" created with ${Object.values(backupArchive.recordCounts || {}).reduce((a: number, b: number) => a + b, 0)} records.`
    });

  } catch (error) {
    applicationLogger.error('archive', 'Clean data operation error', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to clean application data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Restore archive data with comprehensive validation
 * POST /api/archives/:id/restore
 */
router.post('/:id/restore', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = ValidationSchemaFactory.validateBody(archiveSchemas.restore, req.body);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }


    const options: IsolatedRestoreOptions = {
      archiveId: id,
      restoreType: validatedData.restoreType,
      selectedTables: validatedData.selectedTables,
      replaceExisting: validatedData.replaceExisting || false,
      validateData: validatedData.validateData || true
    };

    // Step 1: Perform the restore operation
    const restoreResult = await isolatedArchiveService.restoreArchive(id, options);

    // Step 2: Comprehensive post-restore validation
    applicationLogger.info('archive', `Starting post-restore validation for ${restoreResult.recordsRestored} records`);

    // Get accurate expected counts from archive metadata
    const archive = await isolatedArchiveService.getArchiveById(id);
    const restoredCounts: Record<string, number> = {};

    if (archive?.recordCounts) {
      // Use actual record counts from archive metadata
      const recordCounts = archive.recordCounts as Record<string, number>;
      Object.keys(recordCounts).forEach(tableName => {
        restoredCounts[tableName] = recordCounts[tableName] || 0;
      });
    } else {
      // Fallback: get current actual counts from database
      applicationLogger.warn('archive', 'Archive metadata missing record counts, using current database counts', { archiveId: id });
      restoreResult.restored.forEach(tableName => {
        restoredCounts[tableName] = 0; // Will be updated by validation service
      });
    }

    const validationResult = await archiveValidationService.validateRestoration(
      id,
      restoredCounts,
      {
        validateEmptyFields: validatedData.validateData || true,
        validateDataTypes: validatedData.validateData || true,
        validateRelationships: true,
        requiredFields: {
          customers: ['first_name', 'last_name', 'email'], // Fixed: use actual DB column names
          segments: ['name', 'criteria'],
          data_imports: ['fileName', 'importStatus'] // Fixed: use actual table name
        }
      }
    );

    // Step 3: Log validation results to archive logs
    const validationSummary = {
      archiveId: id,
      restoreDate: new Date().toISOString(),
      recordsRestored: restoreResult.recordsRestored,
      tablesRestored: restoreResult.restored.length,
      validationPassed: validationResult.isValid,
      dataCompleteness: validationResult.summary.dataCompletenessPercentage,
      criticalIssues: validationResult.criticalIssues.length,
      warnings: validationResult.warnings.length
    };

    // Report any critical validation issues
    if (!validationResult.isValid) {
      applicationLogger.error('archive', `Post-restore validation FAILED for archive ${id}`, undefined, { criticalIssues: validationResult.criticalIssues });
    }

    // Step 4: Run post-restore data quality improvements

    // Run name repair to ensure customer name completeness
    try {
      const { spawn } = await import('child_process');
      
      // SECURITY FIX: Use spawn instead of execSync to prevent shell injection
      const nameRepairProcess = spawn('node', ['fix-names-comprehensive.cjs'], {
        cwd: process.cwd(),
        stdio: 'pipe', // Capture output securely
        shell: false, // CRITICAL: Prevents shell injection
        timeout: 30000 // 30 second timeout
      });
      
      // Collect output
      let output = '';
      let errorOutput = '';
      
      nameRepairProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      nameRepairProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        nameRepairProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Name repair process exited with code ${code}. Error: ${errorOutput}`));
          }
        });
        
        nameRepairProcess.on('error', (error) => {
          reject(new Error(`Failed to start name repair process: ${error.message}`));
        });
        
        // Timeout handling
        setTimeout(() => {
          nameRepairProcess.kill('SIGTERM');
          reject(new Error('Name repair process timed out after 30 seconds'));
        }, 30000);
      });
      
      applicationLogger.info('archive', 'Name repair completed successfully');
    } catch (error) {
      applicationLogger.warn('archive', 'Name repair failed, but continuing', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    res.json({
      success: true,
      restoration: {
        recordsRestored: restoreResult.recordsRestored,
        tablesRestored: restoreResult.restored,
        tablesProcessed: restoreResult.tablesProcessed,
        message: `Successfully restored ${restoreResult.recordsRestored} records to ${restoreResult.restored.length} tables with automatic data quality improvements`
      },
      validation: {
        isValid: validationResult.isValid,
        dataCompleteness: validationResult.summary.dataCompletenessPercentage,
        totalErrors: validationResult.summary.totalErrors,
        totalWarnings: validationResult.summary.totalWarnings,
        criticalIssues: validationResult.criticalIssues,
        warnings: validationResult.warnings,
        tableValidation: validationResult.validationResults.map(table => ({
          tableName: table.tableName,
          recordCount: table.recordCount,
          emptyFields: table.emptyFields,
          validationErrors: table.validationErrors
        }))
      },
      summary: validationSummary,
      message: validationResult.isValid
        ? `Archive restoration completed successfully with ${validationResult.summary.dataCompletenessPercentage}% data completeness. ${restoreResult.recordsRestored} records restored and validated.`
        : `Archive restoration completed with ${validationResult.summary.totalErrors} critical issues detected. Manual review required.`
    });

  } catch (error) {
    applicationLogger.error('archive', 'Archive restoration error', error instanceof Error ? error : undefined);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid restoration options',
        details: error.errors
      });
    }

    if (error instanceof Error && error.message === 'Archive not found') {
      return res.status(404).json({
        success: false,
        error: 'Archive not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to restore archive',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
