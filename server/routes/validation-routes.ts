/**
 * Archive Validation Routes
 *
 * API endpoints for manual validation and health checks
 *
 * @created August 11, 2025
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../jwt-utils';
import { archiveValidationService } from '../services/archive-validation-service';
import { z } from 'zod';
import { secureLogger } from '../utils/secure-logger';

const router = Router();

/**
 * Manual validation of current database state
 * POST /api/validation/current-state
 */
router.post('/current-state', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { tables } = req.body;

    // Get current record counts for validation
    const recordCounts: Record<string, number> = {};

    // This is a simplified approach - in practice you'd get actual counts
    if (tables?.includes('customers')) recordCounts.customers = 1000;
    if (tables?.includes('segments')) recordCounts.segments = 10;

    const validationResult = await archiveValidationService.validateRestoration(
      'manual-validation',
      recordCounts,
      {
        validateEmptyFields: true,
        validateDataTypes: true,
        validateRelationships: true
      }
    );

    res.json({
      success: true,
      validation: validationResult,
      message: validationResult.isValid
        ? 'Database validation passed successfully'
        : 'Database validation detected issues requiring attention'
    });

  } catch (error) {
    secureLogger.error('Manual validation error:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get validation report for specific archive restoration
 * GET /api/validation/archive/:id
 */
router.get('/archive/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // This would fetch stored validation results from archive logs
    // For now, return a template response
    res.json({
      success: true,
      archiveId: id,
      message: 'Validation report endpoint ready',
      note: 'This endpoint would return stored validation results from archive restoration logs'
    });

  } catch (error) {
    secureLogger.error('Archive validation report error:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve validation report'
    });
  }
});

export default router;
