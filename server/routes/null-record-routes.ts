/**
 * NULL Record Management Routes
 *
 * API endpoints for diagnosing, analyzing, and fixing NULL records
 * caused by failed header mapping during imports.
 */

import { Router } from 'express';
import { requireAuth } from '../jwt-utils';
import { nullRecordFixer } from '../services/null-record-fixer';
import { db } from '../db';
import { customers, dataImports } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

const router = Router();

/**
 * POST /api/null-records/analyze/:importId
 * Comprehensive analysis of NULL records for a specific import
 */
router.post('/analyze/:importId', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;

    secureLogger.info(`🔍 Starting NULL record analysis for import: ${importId}`);

    // Get comprehensive analysis and recommendations
    const recommendations = await nullRecordFixer.generateFixRecommendations(importId);

    res.json({
      success: true,
      importId,
      analysis: recommendations.analysis,
      diagnosis: {
        rootCause: recommendations.analysis.rootCause,
        severity: recommendations.analysis.completelyNullRecords === recommendations.analysis.totalRecords ? 'CRITICAL' : 'MODERATE',
        fixable: recommendations.analysis.fixable,
        dataRecoverable: recommendations.analysis.hasRawData
      },
      solutions: {
        quickFixes: recommendations.quickFixes,
        comprehensiveSolution: recommendations.comprehensiveSolution,
        sqlQueries: recommendations.sqlQueries
      },
      recommendations: recommendations.analysis.recommendations
    });

  } catch (error) {
    secureLogger.error('NULL record analysis failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/null-records/fix/:importId
 * Attempt to fix NULL records using AI mapping (if raw data available)
 */
router.post('/fix/:importId', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;

    secureLogger.info(`🤖 Starting AI-powered NULL record fix for import: ${importId}`);

    const fixResult = await nullRecordFixer.fixNullRecordsWithAI(importId);

    if (fixResult.success) {
      // Clear analytics cache since we updated customer data
      const { cacheManager } = await import('../cache');
      cacheManager.invalidateAnalytics();
    }

    res.json({
      success: fixResult.success,
      result: fixResult,
      message: fixResult.success
        ? `Successfully fixed ${fixResult.recordsFixed}/${fixResult.recordsProcessed} records using AI mapping`
        : 'Could not fix records - see errors for details'
    });

  } catch (error) {
    secureLogger.error('NULL record fix failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Fix operation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/null-records/cleanup/:importId
 * Remove completely NULL records from the database
 */
router.delete('/cleanup/:importId', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;

    secureLogger.info(`🧹 Starting cleanup of NULL records for import: ${importId}`);

    const cleanupResult = await nullRecordFixer.cleanupNullRecords(importId);

    if (cleanupResult.success) {
      // Clear analytics cache since we deleted records
      const { cacheManager } = await import('../cache');
      cacheManager.invalidateAnalytics();
    }

    res.json({
      success: cleanupResult.success,
      deletedRecords: cleanupResult.deletedRecords,
      message: cleanupResult.success
        ? `Successfully deleted ${cleanupResult.deletedRecords} NULL records`
        : `Cleanup failed: ${cleanupResult.error}`,
      nextSteps: [
        'Dashboard analytics will now reflect accurate customer count',
        'Re-import your Excel file to get properly mapped data',
        'New AI mapping will handle international headers correctly'
      ]
    });

  } catch (error) {
    secureLogger.error('NULL record cleanup failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/null-records/imports-with-nulls
 * List all imports that have NULL records
 */
router.get('/imports-with-nulls', requireAuth, async (req, res) => {
  try {

    // Find imports with significant NULL records
    const importsWithNulls = await db.select({
      importId: customers.importId,
      fileName: dataImports.fileName,
      importedAt: dataImports.importedAt,
      totalRecords: dataImports.recordsProcessed,
      successfulRecords: dataImports.recordsSuccessful
    })
    .from(customers)
    .leftJoin(dataImports, eq(customers.importId, dataImports.id))
    .where(and(
      isNull(customers.firstName),
      isNull(customers.lastName),
      isNull(customers.email)
    ))
    .groupBy(customers.importId, dataImports.fileName, dataImports.importedAt, dataImports.recordsProcessed, dataImports.recordsSuccessful)
    .limit(20);

    // Get count of NULL records for each import
    const analysisPromises = importsWithNulls.map(async (imp) => {
      if (!imp.importId) return { ...imp, nullRecords: 0 };

      const nullCount = await db.select({ count: customers.id })
        .from(customers)
        .where(and(
          eq(customers.importId, imp.importId),
          isNull(customers.firstName),
          isNull(customers.lastName),
          isNull(customers.email)
        ));

      return {
        ...imp,
        nullRecords: nullCount.length
      };
    });

    const results = await Promise.all(analysisPromises);

    res.json({
      success: true,
      importsWithNulls: results,
      totalImportsAffected: results.length,
      summary: {
        totalNullRecords: results.reduce((sum, r) => sum + r.nullRecords, 0),
        mostAffectedImport: results.reduce((max, r) => r.nullRecords > max.nullRecords ? r : max, results[0])
      }
    });

  } catch (error) {
    secureLogger.error('Failed to list imports with NULLs:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze imports',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/null-records/sample/:importId
 * Get sample of NULL records to understand the data structure
 */
router.get('/sample/:importId', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const sampleRecords = await db.select()
      .from(customers)
      .where(eq(customers.importId, importId))
      .limit(limit);

    const analysis = {
      totalSampled: sampleRecords.length,
      fieldAnalysis: {
        firstName: sampleRecords.filter(r => r.firstName).length,
        lastName: sampleRecords.filter(r => r.lastName).length,
        email: sampleRecords.filter(r => r.email).length,
        phoneNumber: sampleRecords.filter(r => r.phoneNumber).length,
        customerSegment: sampleRecords.filter(r => r.customerSegment).length,
        dateOfBirth: sampleRecords.filter(r => r.dateOfBirth).length
      },
      sampleData: sampleRecords.slice(0, 3) // Show first 3 records
    };

    res.json({
      success: true,
      importId,
      analysis
    });

  } catch (error) {
    secureLogger.error('Failed to get sample records:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to get sample',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as nullRecordRoutes };
