/**
 * Data Lineage and Import Management Routes
 *
 * This module manages data import sessions, tracking data lineage and providing
 * audit trails for all data processing operations. Essential for compliance
 * and data governance in enterprise environments.
 *
 * @module DataLineageRoutes
 * @created August 5, 2025
 * @extracted_from server/routes.ts (refactoring for maintainability)
 *
 * @dependencies
 * - dataLineageService - Core import tracking and lineage business logic
 * - insertDataImportSchema - Zod validation schema for import requests
 * - performance-middleware - Caching middleware for expensive queries
 * - storage - Direct database access for import records
 *
 * @routes
 * - GET / - List all imports with pagination (cached)
 * - POST /start - Initialize new import session
 * - GET /:importId/status - Get import session status (cached)
 * - PATCH /:importId/complete - Mark import session as completed
 * - GET /:importId/history - Get detailed import history
 * - DELETE /:importId - Delete import session and associated data
 *
 * @features
 * - Complete audit trail for all data imports
 * - Session-based import tracking with status management
 * - Performance-optimized with intelligent caching
 * - Comprehensive metadata tracking for compliance
 * - Integration with error tracking system
 */
import { Router } from 'express';
import { DataLineageService } from '../data-lineage-service';
import { insertDataImportSchema } from '@shared/schema';
import { cacheMiddleware } from '../performance-middleware';
import { asyncHandler, sendSuccess } from '../utils/response-utils';
import { parseQueryParams } from '../utils/validation-utils';

const router = Router();

/**
 * Get all imports with optional filtering and pagination
 *
 * Retrieves paginated list of all import sessions for audit and monitoring.
 * Cached for 5 minutes to improve performance on frequently accessed data.
 *
 * @route GET /
 * @query {number} limit - Maximum records to return (default: 50)
 * @query {number} offset - Pagination offset (default: 0)
 * @returns {Object} List of import sessions with metadata
 * @cache 300000ms (5 minutes)
 */
router.get("/", cacheMiddleware(300000), asyncHandler('get_imports', async (req, res) => {
  const params = parseQueryParams(req.query, {
    limit: 50,
    offset: 0
  });

  // Use dataLineageService.getImportHistory method for proper import history
  const dataLineageService = new DataLineageService();
  const imports = await dataLineageService.getImportHistory({
    limit: params.limit,
    offset: params.offset
  });
  sendSuccess(res, { imports });
}));

/**
 * Start new import session
 *
 * Initializes a new data import session with metadata tracking.
 * Creates audit trail entry and returns session ID for subsequent operations.
 *
 * @route POST /start
 * @body {Object} Import metadata (fileName, filePath, importType, etc.)
 * @returns {Object} New import session ID for tracking
 * @validation Uses insertDataImportSchema for request validation
 */
router.post("/start", asyncHandler('start_import', async (req, res) => {
  const validatedData = insertDataImportSchema.parse(req.body);

  const dataLineageService = new DataLineageService();
  const importId = await dataLineageService.startImport({
    fileName: validatedData.fileName || '',
    filePath: validatedData.filePath || '',
    importType: validatedData.importType as 'json' | 'excel' | 'csv' | 'api',
    importSource: validatedData.importSource || '',
    importedBy: validatedData.importedBy || '',
    metadata: validatedData.importMetadata as Record<string, any> || {},
  });

  sendSuccess(res, { importId });
}));

// Get import session status
router.get("/:importId/status", cacheMiddleware(60000), asyncHandler('get_import_status', async (req, res) => {
  const { importId } = req.params;
  // Use storage layer directly since getImportStatus doesn't exist on dataLineageService
  const dataLineageService = new DataLineageService();
  const importRecord = await dataLineageService.getImportRecord(importId);

  if (!importRecord) {
    return res.status(404).json({ error: "Import not found" });
  }

  sendSuccess(res, { status: importRecord.importStatus });
}));

/**
 * Get detailed import information with duplicate detection logs
 *
 * Retrieves comprehensive import details including processing statistics,
 * duplicate detection logs, and detailed data changes for audit purposes.
 *
 * @route GET /:importId/details
 * @param {string} importId - The import session ID
 * @returns {Object} Detailed import information with duplicate logs
 * @cache 60000ms (1 minute)
 */
router.get("/:importId/details", cacheMiddleware(60000), asyncHandler('get_import_details', async (req, res) => {
  const { importId } = req.params;
  const dataLineageService = new DataLineageService();
  const details = await dataLineageService.getImportDetails(importId);

  if (!details) {
    return res.status(404).json({ error: "Import not found" });
  }

  sendSuccess(res, details);
}));

// Get customer lineage information
router.get("/:id/lineage", cacheMiddleware(300000), asyncHandler('get_customer_lineage', async (req, res) => {
  const { id } = req.params;
  const dataLineageService = new DataLineageService();
  const lineage = await dataLineageService.getCustomerLineage(id);

  if (!lineage) {
    return res.status(404).json({ error: "Customer not found" });
  }

  sendSuccess(res, { lineage });
}));

// Detect duplicate imports
router.get("/duplicates", cacheMiddleware(600000), asyncHandler('detect_duplicates', async (req, res) => {
  // Note: detectDuplicateImports method not implemented yet
  sendSuccess(res, { duplicates: [] });
}));

// Import customers to specific import session
router.post("/:importId/customers", asyncHandler('import_customers', async (req, res) => {
  const { importId } = req.params;
  const { customers: customersData, sourceRowNumbers } = req.body;

  if (!Array.isArray(customersData)) {
    return res.status(400).json({ error: "Customers data must be an array" });
  }

  const dataLineageService = new DataLineageService();
  const result = await dataLineageService.importCustomers(importId, customersData, sourceRowNumbers);
  sendSuccess(res, { result });
}));

export default router;
