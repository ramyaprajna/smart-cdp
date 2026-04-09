/**
 * File Upload and Processing Routes
 *
 * This module handles file upload operations and processing workflows for customer data.
 * Supports multiple file formats (CSV, Excel, TXT, DOCX) with preview generation,
 * AI-powered column mapping, and comprehensive error handling.
 *
 * @module FileUploadRoutes
 * @created August 5, 2025
 * @extracted_from server/routes.ts (refactoring for maintainability)
 *
 * @dependencies
 * - enhanced-error-handler - Centralized error handling with correlation IDs
 * - file-preview-service - Generates data previews for validation
 * - simple-file-processor - Handles actual data processing and import
 * - upload-middleware - Multer-based file upload handling
 * - performance-middleware - Cache invalidation after successful imports
 *
 * @routes
 * - POST /preview - Generate file preview before import (validation)
 * - POST /upload - Process and import file data to database
 *
 * @features
 * - Multi-format file support (CSV, Excel, TXT, DOCX)
 * - File validation and error handling with correlation tracking
 * - Preview generation for data validation before import
 * - AI-powered column mapping suggestions
 * - Comprehensive logging for debugging import issues
 * - Cache invalidation to ensure fresh analytics after imports
 */
import { Router } from 'express';
import { errorHandler, createImportError } from '../enhanced-error-handler';
import { sendSuccess, sendError } from '../utils/response-utils';
import { secureLogger } from '../utils/secure-logger';

const router = Router();

/**
 * File preview endpoint - Generate preview before import
 *
 * Analyzes uploaded file and generates data preview for validation.
 * Allows users to verify data structure and quality before committing to full import.
 * Essential for preventing bad data from entering the system.
 *
 * @route POST /preview
 * @upload multipart/form-data with 'file' field
 * @returns {Object} Preview data with headers, sample rows, and validation info
 */
router.post("/preview", async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();
  (req as any).correlationId = correlationId;

  try {
    const { filePreviewService } = await import('../file-preview-service');
    const { uploadMiddleware } = await import('../upload-middleware');

    uploadMiddleware.single('file')(req, res, async (err) => {
      if (err) {
        const importError = createImportError('FILE_TOO_LARGE', `Preview failed: ${err.message}`);
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      if (!req.file) {
        const importError = createImportError('VALIDATION_ERROR', 'No file uploaded for preview');
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      try {
        const { fileProcessingLogger } = await import('../utils/import-logging-utils');
        const fileInfo = {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.originalname.split('.').pop()
        };

        await fileProcessingLogger.logPreviewStart(req, fileInfo, correlationId);

        secureLogger.info(`🔍 [File Preview] Starting preview generation`, {
          correlationId,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          operation: 'file_preview'
        });

        const startTime = Date.now();
        const previewData = await filePreviewService.generatePreview(req.file.path, req.file.originalname, req.file.size);

        const processedFileInfo = {
          ...fileInfo,
          rowCount: previewData.rows?.length || 0,
          headerCount: previewData.headers?.length || 0,
          totalDataPoints: (previewData.rows?.length || 0) * (previewData.headers?.length || 0),
          processingTimeMs: Date.now() - startTime
        };

        await fileProcessingLogger.logPreviewSuccess(req, processedFileInfo, correlationId);

        secureLogger.info(`✅ [File Preview] Preview generated successfully`, {
          correlationId,
          rowCount: previewData.rows?.length || 0,
          headerCount: previewData.headers?.length || 0
        });

        res.json({
          success: true,
          correlationId,
          preview: previewData,
          fileInfo: {
            originalName: req.file.originalname,
            fileSize: req.file.size,
            fileType: req.file.originalname.split('.').pop()
          }
        });

      } catch (error) {
        const { fileProcessingLogger } = await import('../utils/import-logging-utils');
        const fileInfo = {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.originalname.split('.').pop()
        };

        await fileProcessingLogger.logPreviewError(req, error as Error, fileInfo, correlationId);

        const loggedError = errorHandler.logError(error as Error, {
          operation: 'file_preview',
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
          error: "Preview generation failed. Please try again.",
          correlationId: loggedError
        });
      }
    });
  } catch (error) {
    const loggedError = errorHandler.logError(error as Error, {
      operation: 'file_preview_setup'
    });

    res.status(500).json({
      error: "Preview service unavailable. Please try again.",
      correlationId: loggedError
    });
  }
});

// Enhanced file upload endpoint
router.post("/upload", async (req, res) => {
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

      // Enhanced file validation
      const allowedExtensions = ['.csv', '.xlsx', '.xls', '.txt', '.docx'];
      const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
      if (!fileExtension || !allowedExtensions.includes(`.${fileExtension}`)) {
        const importError = createImportError('VALIDATION_ERROR',
          `Unsupported file type: .${fileExtension}. Allowed types: ${allowedExtensions.join(', ')}`);
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      // File size validation (redundant check for security)
      const maxFileSize = 100 * 1024 * 1024; // 100MB
      if (req.file.size > maxFileSize) {
        const importError = createImportError('FILE_TOO_LARGE',
          `File size ${(req.file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum limit of 100MB`);
        return res.status(importError.statusCode).json({
          error: importError.message,
          code: importError.code,
          correlationId
        });
      }

      try {


        secureLogger.info(`🚀 [File Upload] Starting file processing`, {
          correlationId,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          operation: 'file_upload'
        });

        // Extract and validate duplicate options from form data if provided
        let duplicateOptions = null;

        if (req.body.duplicateOptions) {
          try {
            duplicateOptions = JSON.parse(req.body.duplicateOptions);

            // Validate duplicate options structure
            if (duplicateOptions && typeof duplicateOptions === 'object') {
              // Sanitize and validate the options
              const validFileActions = ['skip', 'overwrite', 'append_suffix'];
              const validCustomerActions = ['skip_duplicates', 'overwrite_existing', 'merge_data', 'create_new'];

              if (duplicateOptions.fileAction && !validFileActions.includes(duplicateOptions.fileAction)) {
                secureLogger.warn(`🔧 [File Upload] Invalid fileAction: ${duplicateOptions.fileAction}, defaulting to 'skip'`);
                duplicateOptions.fileAction = 'skip';
              }
              if (duplicateOptions.customerAction && !validCustomerActions.includes(duplicateOptions.customerAction)) {
                secureLogger.warn(`🔧 [File Upload] Invalid customerAction: ${duplicateOptions.customerAction}, defaulting to 'skip_duplicates'`);
                duplicateOptions.customerAction = 'skip_duplicates';
              }
            }
          } catch (error) {
            secureLogger.error(`🔧 [File Upload] Failed to parse duplicate options:`, { error: String(error) });
            duplicateOptions = null;
          }
        }

        secureLogger.info(`🔧 [File Upload] Duplicate options analysis:`, {
          hasDuplicateOptions: !!duplicateOptions,
          rawDuplicateOptions: req.body.duplicateOptions,
          parsedDuplicateOptions: duplicateOptions,
          duplicateOptionsType: typeof duplicateOptions
        });

        if (duplicateOptions) {
        } else {
        }

        // Initialize progress tracking for the import
        const { nanoid } = await import('nanoid');
        const importSessionId = nanoid();

        // Import the progress tracking system
        const { progressTracker, importSessions } = await import('./import-progress-routes');

        // Initialize progress tracking
        const initialProgress = {
          totalRecords: 0, // Will be updated by file processor
          processedRecords: 0,
          successfulRecords: 0,
          failedRecords: 0,
          duplicatesHandled: 0,
          currentBatch: 0,
          totalBatches: 1,
          startTime: new Date(),
          lastUpdateTime: new Date(),
          processingSpeed: 0,
          status: 'starting' as const,
          importSessionId,
          currentOperation: 'Initializing file processing...'
        };

        progressTracker.set(importSessionId, initialProgress);

        // Initialize import session
        importSessions.set(importSessionId, {
          sessionId: importSessionId,
          fileName: req.file.originalname,
          originalTotalRecords: 0, // Will be updated by file processor
          duplicateHandlingStrategy: duplicateOptions?.customerAction || 'skip_duplicates',
          status: 'active',
          startTime: new Date(),
          lastProcessedRecord: 0,
          preservedSettings: duplicateOptions || {}
        });

        secureLogger.info(`🔧 [File Upload] Processing with duplicate options:`, {
          hasDuplicateOptions: !!duplicateOptions,
          duplicateOptions: duplicateOptions
        });

        const { simpleFileProcessor } = await import('../simple-file-processor');
        const result = await simpleFileProcessor.processFile(
          req.file.path,
          req.file.originalname,
          false,
          duplicateOptions,
          importSessionId // Pass session ID for progress tracking
        );

        secureLogger.info(`✅ [File Upload] Processing completed`, {
          correlationId,
          success: result.success,
          recordsProcessed: result.recordsProcessed,
          recordsSuccessful: result.recordsSuccessful,
          recordsFailed: result.recordsFailed
        });

        // Clear analytics cache after successful import
        const { invalidateAnalyticsCache } = await import('../performance-middleware');
        invalidateAnalyticsCache();

        // Mark progress as completed
        const finalProgress = progressTracker.get(importSessionId);
        if (finalProgress) {
          finalProgress.status = result.success ? 'completed' : 'error';
          finalProgress.lastUpdateTime = new Date();
          finalProgress.currentOperation = result.success ? 'Import completed successfully' : 'Import failed';
          progressTracker.set(importSessionId, finalProgress);
        }

        // Get duplicate handling information from import session
        const session = importSessions.get(importSessionId);
        const duplicateHandlingStrategy = session?.duplicateHandlingStrategy;

        // Get detailed duplicate handling results based on strategy and duplicate count
        const duplicateCount = result.recordsDuplicates || 0;
        const duplicateHandlingDetails = {
          recordsSkipped: duplicateHandlingStrategy === 'skip_duplicates' ? duplicateCount : 0,
          recordsUpdated: duplicateHandlingStrategy === 'overwrite_existing' ? duplicateCount : 0,
          recordsMerged: duplicateHandlingStrategy === 'merge_data' ? duplicateCount : 0,
          recordsCreated: duplicateHandlingStrategy === 'create_new' ? duplicateCount : 0
        };

        res.json({
          success: result.success,
          message: result.message,
          correlationId,
          fileInfo: {
            originalName: req.file.originalname,
            fileSize: req.file.size,
            fileType: req.file.originalname.split('.').pop()
          },
          results: {
            recordsProcessed: result.recordsProcessed,
            recordsSuccessful: result.recordsSuccessful,
            recordsDuplicates: result.recordsDuplicates || 0,
            recordsFailed: result.recordsFailed,
            importSessionId: importSessionId, // Return our session ID for progress tracking
            duplicateHandlingStrategy: duplicateHandlingStrategy,
            ...duplicateHandlingDetails,
            errors: result.errors
          }
        });

      } catch (error) {
        const loggedError = errorHandler.logError(error as Error, {
          operation: 'file_processing',
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
          error: "File processing failed. Please check your file format and try again.",
          correlationId: loggedError
        });
      }
    });
  } catch (error) {
    const loggedError = errorHandler.logError(error as Error, {
      operation: 'file_upload_setup'
    });

    res.status(500).json({
      error: "Upload service unavailable. Please try again.",
      correlationId: loggedError
    });
  }
});

export default router;
