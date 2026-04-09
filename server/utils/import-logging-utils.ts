/**
 * Import Activity Logging Utilities
 *
 * Centralized utilities for logging Data Import module activities.
 * Reduces code duplication and ensures consistent logging patterns
 * across all import-related operations.
 *
 * @module ImportLoggingUtils
 * @created August 10, 2025 (refactoring for maintainability)
 */

import { Request } from 'express';
import { applicationLogger } from '../services/application-logger';

/**
 * User context information for logging
 */
interface UserContext {
  id?: string;
  email?: string;
  role?: string;
}

/**
 * Extract user context from request for consistent logging
 */
function getUserContext(req: Request): UserContext {
  const user = (req as any).user;
  return {
    id: user?.id || 'anonymous',
    email: user?.email,
    role: user?.role
  };
}

/**
 * Base metadata for import operations
 */
interface BaseImportMetadata {
  operation: string;
  [key: string]: any;
}

/**
 * File information for logging
 */
interface FileInfo {
  name: string;
  size: number;
  type?: string;
}

/**
 * Enhanced file information with processing details
 */
interface ProcessedFileInfo extends FileInfo {
  rowCount?: number;
  headerCount?: number;
  totalDataPoints?: number;
  processingTimeMs?: number;
}

/**
 * AI analysis results for logging
 */
interface AIAnalysisResults {
  mappingsGenerated: number;
  confidenceScores: number[];
  recommendedColumns: number;
  aiModelUsed?: string;
}

/**
 * Import Access Logging Utilities
 */
export const importAccessLogger = {
  /**
   * Log import history access with filters
   */
  async logHistoryAccess(req: Request, filters: Record<string, any>): Promise<void> {
    const user = getUserContext(req);
    const hasFilters = Object.values(filters).some(value =>
      value && value !== 'all' && value !== 'none' && value !== 0
    );

    await applicationLogger.info('import', 'Import history accessed', {
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      accessedByRole: user.role,
      filters: {
        search: filters.search || 'none',
        status: filters.status || 'all',
        type: filters.type || 'all',
        dateRange: filters.dateRange || 'all',
        limit: filters.limit,
        offset: filters.offset
      },
      hasFilters,
      operation: 'import_history_access'
    }, req);
  },

  /**
   * Log import history retrieval results
   */
  async logHistoryResults(req: Request, resultCount: number, appliedFilters: string[]): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Import history retrieved successfully', {
      resultCount,
      accessedBy: user.id,
      appliedFilters,
      operation: 'import_history_results'
    }, req);
  },

  /**
   * Log import source data access
   */
  async logSourceAccess(req: Request, importSource: string, customerCount: number): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Import source data accessed', {
      importSource,
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      accessedByRole: user.role,
      purpose: 'view_customers_by_import_source',
      operation: 'import_source_access'
    }, req);

    await applicationLogger.info('import', 'Import source customers retrieved', {
      importSource,
      customerCount,
      accessedBy: user.id,
      cacheStatus: 'cache_enabled',
      operation: 'import_source_results'
    }, req);
  }
};

/**
 * File Processing Logging Utilities
 */
export const fileProcessingLogger = {
  /**
   * Log file preview generation start
   */
  async logPreviewStart(req: Request, fileInfo: FileInfo, correlationId?: string): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'File preview generation started', {
      correlationId,
      fileName: fileInfo.name,
      fileSize: fileInfo.size,
      fileType: fileInfo.type || fileInfo.name.split('.').pop(),
      uploadedBy: user.id,
      uploadedByEmail: user.email,
      operation: 'file_preview_start'
    }, req);
  },

  /**
   * Log successful file preview generation
   */
  async logPreviewSuccess(req: Request, fileInfo: ProcessedFileInfo, correlationId?: string): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'File preview generated successfully', {
      correlationId,
      fileName: fileInfo.name,
      rowCount: fileInfo.rowCount || 0,
      headerCount: fileInfo.headerCount || 0,
      totalDataPoints: fileInfo.totalDataPoints || 0,
      uploadedBy: user.id,
      processingTimeMs: fileInfo.processingTimeMs || 0,
      operation: 'file_preview_success'
    }, req);
  },

  /**
   * Log file preview generation failure
   */
  async logPreviewError(req: Request, error: Error, fileInfo: FileInfo, correlationId?: string): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.error('import', 'File preview generation failed', error, {
      correlationId,
      fileName: fileInfo.name,
      fileSize: fileInfo.size,
      fileType: fileInfo.type || fileInfo.name.split('.').pop(),
      uploadedBy: user.id,
      operation: 'file_preview_error',
      errorType: 'preview_generation_failure'
    }, req);
  }
};

/**
 * Error Analysis Logging Utilities
 */
export const errorAnalysisLogger = {
  /**
   * Log import error access with validation
   */
  async logErrorAccess(req: Request, importId: string, filters: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Import errors accessed for analysis', {
      importId,
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      accessedByRole: user.role,
      filters: {
        errorType: filters.errorType || 'all',
        limit: filters.limit,
        offset: filters.offset,
        includeRetried: filters.includeRetried
      },
      purpose: 'error_analysis',
      operation: 'import_error_access'
    }, req);
  },

  /**
   * Log error records retrieval results
   */
  async logErrorResults(req: Request, importId: string, errorCount: number, errorTypes: string[]): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Import error records retrieved', {
      importId,
      errorCount,
      accessedBy: user.id,
      hasErrors: errorCount > 0,
      errorTypes: errorTypes.slice(0, 5), // Log up to 5 unique error types
      operation: 'import_error_results'
    }, req);
  },

  /**
   * Log specific error record access
   */
  async logSpecificErrorAccess(req: Request, importId: string, rowNumber: number, fileName?: string): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Specific import error record accessed', {
      importId,
      rowNumber,
      fileName,
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      purpose: 'detailed_error_analysis',
      operation: 'specific_error_access'
    }, req);
  },

  /**
   * Log error summary access
   */
  async logSummaryAccess(req: Request, importId: string, summaryData?: any): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Import error summary accessed', {
      importId,
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      accessedByRole: user.role,
      purpose: 'error_summary_analysis',
      operation: 'error_summary_access'
    }, req);

    if (summaryData) {
      await applicationLogger.info('import', 'Import error summary generated', {
        importId,
        totalErrors: summaryData.totalErrors || 0,
        errorCategories: Object.keys(summaryData.errorsByType || {}),
        accessedBy: user.id,
        hasCriticalErrors: summaryData.totalErrors > 0,
        operation: 'error_summary_results'
      }, req);
    }
  },

  /**
   * Log invalid UUID access attempts
   */
  async logInvalidUUID(req: Request, providedId: string, operation: string): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.warn('import', `${operation} attempt with invalid UUID`, {
      providedImportId: providedId,
      ...user,
      accessedBy: user.id,
      accessedByEmail: user.email,
      operation: `${operation}_invalid_uuid`
    }, req);
  }
};

/**
 * AI Mapping Logging Utilities
 */
export const aiMappingLogger = {
  /**
   * Log AI analysis start
   */
  async logAnalysisStart(req: Request, fileInfo: FileInfo, maxSampleSize: number): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'AI column mapping analysis started', {
      fileName: fileInfo.name,
      fileSize: fileInfo.size,
      fileType: fileInfo.type || fileInfo.name.split('.').pop(),
      maxSampleSize,
      ...user,
      requestedBy: user.id,
      requestedByEmail: user.email,
      requestedByRole: user.role,
      operation: 'ai_column_mapping_start'
    }, req);
  },

  /**
   * Log successful AI analysis completion
   */
  async logAnalysisSuccess(req: Request, fileInfo: ProcessedFileInfo, results: AIAnalysisResults): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'AI column mapping analysis completed', {
      fileName: fileInfo.name,
      totalHeaders: fileInfo.headerCount || 0,
      totalRows: fileInfo.rowCount || 0,
      mappingsGenerated: results.mappingsGenerated,
      confidenceScores: results.confidenceScores,
      recommendedColumns: results.recommendedColumns,
      requestedBy: user.id,
      processingTimeMs: fileInfo.processingTimeMs || 0,
      aiModelUsed: results.aiModelUsed || 'gpt-4o',
      operation: 'ai_column_mapping_success'
    }, req);
  },

  /**
   * Log bulk analysis operations
   */
  async logBulkAnalysis(req: Request, files: any[], jobId: string, options: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', 'Bulk AI analysis started', {
      fileCount: files.length,
      fileNames: files.map(f => f.originalname || f.name),
      totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
      maxSampleSize: options.maxSampleSize,
      enableCaching: options.enableCaching,
      ...user,
      requestedBy: user.id,
      requestedByEmail: user.email,
      requestedByRole: user.role,
      operation: 'bulk_ai_analysis_start'
    }, req);

    await applicationLogger.info('import', 'Bulk AI analysis job created', {
      jobId,
      fileCount: files.length,
      requestedBy: user.id,
      cachingEnabled: options.enableCaching,
      operation: 'bulk_ai_analysis_job'
    }, req);
  },

  /**
   * Log AI analysis errors with context
   */
  async logAnalysisError(req: Request, error: Error, context: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.error('import', context.message || 'AI analysis operation failed', error, {
      ...context,
      requestedBy: user.id,
      operation: context.operation || 'ai_analysis_error'
    }, req);
  }
};

/**
 * Generic import operation logging utilities
 */
export const importOperationLogger = {
  /**
   * Log successful operation with metrics
   */
  async logSuccess(req: Request, operation: string, metrics: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.info('import', `${operation} completed successfully`, {
      ...metrics,
      performedBy: user.id,
      operation: `${operation}_success`
    }, req);
  },

  /**
   * Log operation failure with context
   */
  async logFailure(req: Request, operation: string, error: Error, context: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.error('import', `${operation} failed`, error, {
      ...context,
      performedBy: user.id,
      operation: `${operation}_failure`
    }, req);
  },

  /**
   * Log validation warnings
   */
  async logValidationWarning(req: Request, operation: string, details: Record<string, any>): Promise<void> {
    const user = getUserContext(req);

    await applicationLogger.warn('import', `${operation} validation warning`, {
      ...details,
      performedBy: user.id,
      operation: `${operation}_validation_warning`
    }, req);
  }
};
