/**
 * Mapping Review Routes
 *
 * Secure REST endpoints for intelligent field mapping review system.
 * Handles file analysis, mapping suggestions, and user approval workflow.
 *
 * Security Features:
 * - File upload validation and sanitization
 * - Rate limiting protection
 * - Input validation with Zod schemas
 * - XSS protection for all user inputs
 *
 * Performance Features:
 * - Efficient file processing
 * - Cached analysis results
 * - Minimal data transfer
 *
 * @created August 13, 2025 - Enhanced data import with intelligent mapping review
 */

import express from 'express';
import { mappingReviewService } from '../services/mapping-review-service';
import { errorHandler, createImportError } from '../enhanced-error-handler';
import { z } from 'zod';
import { secureLogger } from '../utils/secure-logger';

const router = express.Router();

// Validation schemas for security
const AnalyzeMappingRequestSchema = z.object({
  maxSampleSize: z.coerce.number().min(10).max(1000).optional().default(100)
});

const UserMappingDecisionSchema = z.object({
  sourceField: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_\s-]+$/),
  targetField: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).or(z.literal('skip')),
  confidence: z.number().min(0).max(100).optional()
});

const ApprovalRequestSchema = z.object({
  decisions: z.array(UserMappingDecisionSchema).max(100), // Limit decisions for security
  autoApprove: z.boolean().default(false)
});

/**
 * POST /api/mapping-review/analyze
 *
 * Analyze uploaded file for intelligent mapping review.
 * Determines if human review is needed based on AI confidence scores.
 *
 * Security: File validation, size limits, type checking
 * Performance: Parallel analysis, cached results
 */
router.post('/analyze', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();
  (req as any).correlationId = correlationId;

  try {
    const { uploadMiddleware } = await import('../upload-middleware');

    uploadMiddleware.single('file')(req, res, async (err) => {
      if (err) {
        const importError = createImportError('FILE_TOO_LARGE', `Upload failed: ${err.message}`);
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      if (!req.file) {
        const importError = createImportError('VALIDATION_ERROR', 'No file uploaded');
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      try {
        secureLogger.info(`🔍 [Mapping Review] Starting analysis`, {
          correlationId,
          fileName: req.file.originalname,
          fileSize: req.file.size
        });

        // Validate request parameters
        const { maxSampleSize } = AnalyzeMappingRequestSchema.parse(req.body);

        // Process file to get headers and sample data
        const { createFileProcessor } = await import('../file-processors');
        const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();

        // Security: Validate file type
        const allowedTypes = ['csv', 'xlsx', 'xls', 'txt', 'docx'];
        if (!fileExtension || !allowedTypes.includes(fileExtension)) {
          const importError = createImportError('UNSUPPORTED_FORMAT',
            `File type .${fileExtension} is not supported for mapping analysis`);
          return res.status(importError.statusCode).json({
            error: importError.message,
            code: importError.code,
            correlationId
          });
        }

        // Process file with appropriate processor
        const processorType = fileExtension === 'xlsx' || fileExtension === 'xls' ? 'excel' : fileExtension;
        const processor = createFileProcessor(processorType, maxSampleSize);
        const fileData = await processor.processFile(req.file.path);

        // Security: Validate processed data
        if (!fileData.headers || fileData.headers.length === 0) {
          const importError = createImportError('VALIDATION_ERROR', 'No valid headers found in file');
          return res.status(importError.statusCode).json({
            error: importError.message,
            code: importError.code,
            correlationId
          });
        }

        if (!fileData.rows || fileData.rows.length === 0) {
          const importError = createImportError('VALIDATION_ERROR', 'No data rows found in file');
          return res.status(importError.statusCode).json({
            error: importError.message,
            code: importError.code,
            correlationId
          });
        }

        // Analyze mapping requirements
        const reviewData = await mappingReviewService.analyzeMappingForReview(
          fileData.headers,
          fileData.rows,
          maxSampleSize
        );

        secureLogger.info(`✅ [Mapping Review] Analysis completed`, {
          correlationId,
          needsReview: reviewData.needsReview,
          uncertainMappings: reviewData.uncertainMappings.length,
          conflicts: reviewData.conflicts.length
        });

        // Clean up temporary file
        try {
          const fs = await import('fs');
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          secureLogger.warn(`⚠️ [Mapping Review] Failed to cleanup temp file: ${req.file.path}`);
        }

        res.json({
          success: true,
          correlationId,
          fileInfo: {
            originalName: req.file.originalname,
            fileSize: req.file.size,
            totalRows: fileData.totalRows,
            totalColumns: fileData.headers.length
          },
          reviewData
        });

      } catch (error) {
        const loggedError = errorHandler.logError(error as Error, {
          operation: 'mapping_analysis',
          metadata: {
            fileName: req.file.originalname,
            fileSize: req.file.size
          }
        });

        if ((error as any).isOperational) {
          const structuredError = error as any;
          return res.status(structuredError.statusCode).json({
            error: structuredError.message,
            code: structuredError.code,
            correlationId: loggedError
          });
        }

        res.status(500).json({
          error: "Mapping analysis failed. Please check your file format and try again.",
          correlationId: loggedError
        });
      }
    });

  } catch (error) {
    const loggedError = errorHandler.logError(error as Error, {
      operation: 'mapping_analysis_setup'
    });

    res.status(500).json({
      error: "Mapping analysis service unavailable. Please try again.",
      correlationId: loggedError
    });
  }
});

/**
 * POST /api/mapping-review/approve
 *
 * Process user mapping decisions and prepare final import configuration.
 * Validates all user decisions and applies security checks.
 *
 * Security: Input validation, decision sanitization
 * Performance: Batch processing, minimal validation overhead
 */
router.post('/approve', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();
  (req as any).correlationId = correlationId;

  try {

    // Security: Validate request body
    const approvalData = ApprovalRequestSchema.parse(req.body);

    // Process user mapping decisions
    const processedDecisions = approvalData.decisions.map(decision => {
      // Security: Additional validation for field names
      const sanitizedSourceField = decision.sourceField
        .trim()
        .replace(/[^a-zA-Z0-9_\s-]/g, '')
        .substring(0, 50);

      const sanitizedTargetField = decision.targetField === 'skip'
        ? 'skip'
        : decision.targetField
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .substring(0, 50);

      return {
        sourceField: sanitizedSourceField,
        targetField: sanitizedTargetField,
        confidence: decision.confidence || 100, // User-approved = high confidence
        userApproved: true
      };
    });

    secureLogger.info(`✅ [Mapping Review] Approval processed`, {
      correlationId,
      decisionsCount: processedDecisions.length,
      autoApprove: approvalData.autoApprove
    });

    res.json({
      success: true,
      correlationId,
      processedDecisions,
      message: `Processed ${processedDecisions.length} mapping decisions successfully`
    });

  } catch (error) {
    const loggedError = errorHandler.logError(error as Error, {
      operation: 'mapping_approval'
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid mapping decisions provided",
        code: 'VALIDATION_ERROR',
        correlationId: loggedError,
        details: error.errors
      });
    }

    res.status(500).json({
      error: "Mapping approval failed. Please try again.",
      correlationId: loggedError
    });
  }
});

/**
 * GET /api/mapping-review/fields
 *
 * Get available target fields for mapping dropdown.
 * Cached response for performance.
 *
 * Security: No sensitive data exposure
 * Performance: Cached field list
 */
router.get('/fields', async (req, res) => {
  try {
    const coreFields = [
      { value: 'firstName', label: 'First Name', type: 'text' },
      { value: 'lastName', label: 'Last Name', type: 'text' },
      { value: 'email', label: 'Email Address', type: 'email' },
      { value: 'phoneNumber', label: 'Phone Number', type: 'text' },
      { value: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
      { value: 'gender', label: 'Gender', type: 'text' },
      { value: 'currentAddress', label: 'Address', type: 'json' },
      { value: 'customerSegment', label: 'Customer Segment', type: 'text' },
      { value: 'lifetimeValue', label: 'Lifetime Value', type: 'number' },
      { value: 'custom_attribute', label: 'Create Custom Field', type: 'custom' },
      { value: 'skip', label: 'Skip This Field', type: 'skip' }
    ];

    // Set cache headers for performance
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.json({
      success: true,
      fields: coreFields
    });

  } catch (error) {
    const loggedError = errorHandler.logError(error as Error, {
      operation: 'get_mapping_fields'
    });

    res.status(500).json({
      error: "Could not load mapping fields",
      correlationId: loggedError
    });
  }
});

export { router as mappingReviewRoutes };
