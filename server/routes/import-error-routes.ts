/**
 * Import Error Management Routes
 *
 * This module handles all operations related to tracking, retrieving, and resolving
 * import errors that occur during customer data processing. Provides detailed
 * error information for debugging failed imports and maintaining data quality.
 *
 * @module ImportErrorRoutes
 * @created August 5, 2025
 * @extracted_from server/routes.ts (refactoring for maintainability)
 *
 * @dependencies
 * - importErrorService - Core error tracking business logic
 * - validation-utils - Centralized UUID validation and query parsing
 * - response-utils - Standardized response patterns and error handling
 *
 * @routes
 * - GET /:importId/errors - List failed records for import session
 * - GET /:importId/errors/row/:rowNumber - Get specific error details
 * - GET /:importId/error-summary - Get error statistics summary
 * - PATCH /:importId/errors/row/:rowNumber/resolve - Mark error as resolved
 * - GET /:importId - Get import session details
 *
 * @features
 * - Paginated error listing with filtering capabilities
 * - Detailed error information by row number for debugging
 * - Import session error summaries and statistics
 * - Error resolution tracking for monitoring fixes
 * - UUID validation for all import session identifiers
 */
import { Router } from 'express';
import { importErrorService } from '../services/import-error-service';
import { isValidUUID, parseQueryParams } from '../utils/validation-utils';
import { sendSuccess, sendError, asyncHandler } from '../utils/response-utils';

const router = Router();

/**
 * Get failed records for a specific import session
 *
 * Retrieves paginated list of records that failed during import processing.
 * Supports filtering by error type and includes retry tracking.
 *
 * @route GET /:importId/errors
 * @param {string} importId - UUID of the import session
 * @query {string} errorType - Optional filter by error category
 * @query {number} limit - Maximum records to return (default: 50)
 * @query {number} offset - Pagination offset (default: 0)
 * @query {boolean} includeRetried - Include previously retried records (default: false)
 * @returns {Object} List of failed records with error details
 */
router.get("/:importId/errors", asyncHandler('get_failed_records', async (req, res) => {
  const { importId } = req.params;
  const { errorAnalysisLogger } = await import('../utils/import-logging-utils');

  if (!isValidUUID(importId)) {
    await errorAnalysisLogger.logInvalidUUID(req, importId, 'get_failed_records');
    return res.status(400).json({
      error: 'Invalid import ID format. Expected UUID format.',
      providedId: importId
    });
  }

  const params = parseQueryParams(req.query, {
    errorType: undefined,
    limit: 50,
    offset: 0,
    includeRetried: false
  });

  await errorAnalysisLogger.logErrorAccess(req, importId, params);

  const failedRecords = await importErrorService.getFailedRecords({
    importSessionId: importId,
    errorType: params.errorType,
    limit: params.limit,
    offset: params.offset,
    includeRetried: params.includeRetried
  });

  const errorTypes = Array.from(new Set(failedRecords.map((r: any) => r.errorType)));
  await errorAnalysisLogger.logErrorResults(req, importId, failedRecords.length, errorTypes);

  sendSuccess(res, {
    failedRecords,
    totalReturned: failedRecords.length
  });
}));

/**
 * Get specific failed record by row number
 *
 * Retrieves detailed error information for a specific row that failed during import.
 * Essential for debugging individual record processing issues.
 *
 * @route GET /:importId/errors/row/:rowNumber
 * @param {string} importId - UUID of the import session
 * @param {number} rowNumber - The row number that failed processing
 * @query {string} fileName - Optional filename for additional context
 * @returns {Object} Detailed error information for the specific row
 */
router.get("/:importId/errors/row/:rowNumber", asyncHandler('get_failed_record_by_row', async (req, res) => {
  const { importId, rowNumber } = req.params;
  const { fileName } = req.query;
  const { errorAnalysisLogger, importOperationLogger } = await import('../utils/import-logging-utils');

  await errorAnalysisLogger.logSpecificErrorAccess(req, importId, parseInt(rowNumber), fileName as string);

  const failedRecord = await importErrorService.getFailedRecordByRow(
    importId,
    parseInt(rowNumber),
    fileName as string
  );

  if (!failedRecord) {
    await importOperationLogger.logValidationWarning(req, 'specific_error_record_access', {
      importId,
      rowNumber: parseInt(rowNumber),
      fileName: fileName as string,
      reason: 'record_not_found'
    });
    return res.status(404).json({
      error: 'Failed record not found for the specified row'
    });
  }

  await importOperationLogger.logSuccess(req, 'specific_error_record_retrieval', {
    importId,
    rowNumber: parseInt(rowNumber),
    errorType: (failedRecord as any).errorType,
    errorMessage: (failedRecord as any).errorMessage?.substring(0, 100)
  });

  sendSuccess(res, { failedRecord });
}));

// Get error summary for an import session
router.get("/:importId/error-summary", asyncHandler('get_error_summary', async (req, res) => {
  const { importId } = req.params;
  const { errorAnalysisLogger } = await import('../utils/import-logging-utils');

  if (!isValidUUID(importId)) {
    await errorAnalysisLogger.logInvalidUUID(req, importId, 'get_error_summary');
    return res.status(400).json({
      error: 'Invalid import ID format. Expected UUID format.',
      providedId: importId
    });
  }

  const errorSummary = await importErrorService.getImportErrorSummary(importId);
  await errorAnalysisLogger.logSummaryAccess(req, importId, errorSummary);
  sendSuccess(res, { errorSummary });
}));

// Mark error as resolved
router.patch("/:importId/errors/row/:rowNumber/resolve", asyncHandler('mark_error_resolved', async (req, res) => {
  const { importId, rowNumber } = req.params;
  const { fileName, resolution = 'resolved' } = req.body;

  await importErrorService.markErrorResolved(
    importId,
    parseInt(rowNumber),
    fileName,
    resolution
  );

  sendSuccess(res, {
    message: `Record row ${rowNumber} marked as ${resolution}`
  });
}));

// Get import session details
router.get("/:importId", asyncHandler('get_import_session', async (req, res) => {
  const { importId } = req.params;

  if (!isValidUUID(importId)) {
    return res.status(400).json({
      error: 'Invalid import ID format. Expected UUID format.',
      providedId: importId
    });
  }

  const importSession = await importErrorService.getImportSession(importId);

  if (!importSession) {
    return res.status(404).json({
      error: 'Import session not found'
    });
  }

  sendSuccess(res, { importSession });
}));

export default router;
