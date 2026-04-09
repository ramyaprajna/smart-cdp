/**
 * Import Error Service for Smart CDP Platform
 * Comprehensive error tracking and retrieval for data import operations
 *
 * This service provides detailed error tracking capabilities for CDP systems:
 * - Individual record error details (row number, field values, error type)
 * - Comprehensive error logging with correlation IDs
 * - Error pattern analysis and reporting
 * - Error recovery and retry mechanisms
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY for CDP error tracking requirements
 */

import { db } from "../db";
import { dataImports, rawDataImports, customers, type InsertDataImport } from "@shared/schema";
import { eq, and, sql, desc, like, inArray } from "drizzle-orm";
import { errorHandler } from "../enhanced-error-handler";
import { nanoid } from "nanoid";
import { secureLogger } from '../utils/secure-logger';

export interface ImportErrorDetail {
  id: string;
  importSessionId: string;
  sourceFileName: string;
  sourceRowNumber: number;
  errorType: string;
  errorMessage: string;
  fieldErrors: Record<string, string>; // field name -> error message
  originalRowData: Record<string, any>; // original field values
  attemptedValues: Record<string, any>; // values that caused the error
  correlationId: string;
  timestamp: Date;
  retryCount: number;
  canRetry: boolean;
  suggestedFix?: string;
}

export interface ImportErrorSummary {
  importSessionId: string;
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByField: Record<string, number>;
  criticalErrors: number;
  retryableErrors: number;
  patternAnalysis: {
    mostCommonError: string;
    affectedRowRange: { start: number; end: number };
    suggestedBulkFix?: string;
  };
}

export interface ErrorRetrievalOptions {
  importSessionId?: string;
  errorType?: string;
  sourceFileName?: string;
  rowNumber?: number;
  limit?: number;
  offset?: number;
  includeRetried?: boolean;
}

export class ImportErrorService {

  /**
   * Record detailed error information for a failed import record
   */
  async recordImportError(
    importSessionId: string,
    sourceFileName: string,
    sourceRowNumber: number,
    errorType: string,
    errorMessage: string,
    originalRowData: Record<string, any>,
    fieldErrors: Record<string, string> = {},
    correlationId?: string
  ): Promise<ImportErrorDetail> {

    const errorId = nanoid(16);
    const errorCorrelationId = correlationId || errorHandler.generateCorrelationId();

    // Analyze error to determine if it's retryable
    const canRetry = this.isRetryableError(errorType, fieldErrors);
    const suggestedFix = this.generateSuggestedFix(errorType, fieldErrors, originalRowData);

    const errorDetail: ImportErrorDetail = {
      id: errorId,
      importSessionId,
      sourceFileName,
      sourceRowNumber,
      errorType,
      errorMessage,
      fieldErrors,
      originalRowData,
      attemptedValues: originalRowData, // same as original for now
      correlationId: errorCorrelationId,
      timestamp: new Date(),
      retryCount: 0,
      canRetry,
      suggestedFix
    };

    // Store error in rawDataImports table with failed status
    await db.update(rawDataImports)
      .set({
        processingStatus: 'failed',
        validationErrors: {
          errorType,
          errorMessage,
          fieldErrors,
          canRetry,
          suggestedFix,
          correlationId: errorCorrelationId,
          timestamp: new Date().toISOString()
        },
        processedAt: new Date()
      })
      .where(and(
        eq(rawDataImports.importSessionId, importSessionId),
        eq(rawDataImports.sourceRowNumber, sourceRowNumber),
        eq(rawDataImports.sourceFileName, sourceFileName)
      ));

    // Log structured error for monitoring
    errorHandler.logError(new Error(errorMessage), {
      correlationId: errorCorrelationId,
      operation: 'import_record_processing',
      metadata: {
        importSessionId,
        sourceFileName,
        sourceRowNumber,
        errorType,
        fieldErrors,
        canRetry,
        originalDataSample: this.sanitizeDataForLogging(originalRowData)
      }
    });

    secureLogger.info(`🚨 [Import Error] Recorded error for row ${sourceRowNumber}`, {
      correlationId: errorCorrelationId,
      errorType,
      canRetry,
      suggestedFix: suggestedFix ? 'Available' : 'None'
    });

    return errorDetail;
  }

  /**
   * Retrieve detailed information about failed records
   */
  async getFailedRecords(options: ErrorRetrievalOptions = {}): Promise<ImportErrorDetail[]> {
    const conditions = [];

    // Build query conditions
    if (options.importSessionId) {
      conditions.push(eq(rawDataImports.importSessionId, options.importSessionId));
    }

    if (options.sourceFileName) {
      conditions.push(eq(rawDataImports.sourceFileName, options.sourceFileName));
    }

    if (options.rowNumber) {
      conditions.push(eq(rawDataImports.sourceRowNumber, options.rowNumber));
    }

    // Always include failed records, optionally include retried ones
    const statusConditions = ['failed'];
    if (options.includeRetried) {
      statusConditions.push('retry');
    }
    conditions.push(inArray(rawDataImports.processingStatus, statusConditions));

    // Execute query
    const query = db.select()
      .from(rawDataImports)
      .where(and(...conditions))
      .orderBy(desc(rawDataImports.sourceRowNumber));

    // Apply pagination
    let results;
    if (options.limit) {
      if (options.offset) {
        results = await query.limit(options.limit).offset(options.offset);
      } else {
        results = await query.limit(options.limit);
      }
    } else {
      results = await query;
    }

    // Transform to ImportErrorDetail format
    return results
      .filter(row => row.validationErrors) // Only include rows with error details
      .map(row => this.transformToErrorDetail(row));
  }

  /**
   * Get error summary for an import session
   */
  async getImportErrorSummary(importSessionId: string): Promise<ImportErrorSummary> {
    // Get all failed records for this import
    const failedRecords = await this.getFailedRecords({
      importSessionId,
      includeRetried: true
    });

    const errorsByType: Record<string, number> = {};
    const errorsByField: Record<string, number> = {};
    let criticalErrors = 0;
    let retryableErrors = 0;
    const rowNumbers: number[] = [];

    // Analyze error patterns
    for (const error of failedRecords) {
      // Count by error type
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;

      // Count by field
      Object.keys(error.fieldErrors).forEach(field => {
        errorsByField[field] = (errorsByField[field] || 0) + 1;
      });

      // Categorize error severity
      if (error.canRetry) {
        retryableErrors++;
      } else {
        criticalErrors++;
      }

      rowNumbers.push(error.sourceRowNumber);
    }

    // Find most common error type
    const mostCommonError = Object.entries(errorsByType)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';

    // Determine affected row range
    const sortedRows = rowNumbers.sort((a, b) => a - b);
    const affectedRowRange = {
      start: sortedRows[0] || 0,
      end: sortedRows[sortedRows.length - 1] || 0
    };

    // Generate bulk fix suggestion
    const suggestedBulkFix = this.generateBulkFixSuggestion(errorsByType, errorsByField);

    return {
      importSessionId,
      totalErrors: failedRecords.length,
      errorsByType,
      errorsByField,
      criticalErrors,
      retryableErrors,
      patternAnalysis: {
        mostCommonError,
        affectedRowRange,
        suggestedBulkFix
      }
    };
  }

  /**
   * Get specific failed record by row number
   */
  async getFailedRecordByRow(
    importSessionId: string,
    sourceRowNumber: number,
    sourceFileName?: string
  ): Promise<ImportErrorDetail | null> {
    const records = await this.getFailedRecords({
      importSessionId,
      rowNumber: sourceRowNumber,
      sourceFileName,
      limit: 1
    });

    return records[0] || null;
  }

  /**
   * Mark error as resolved/retried
   */
  async markErrorResolved(
    importSessionId: string,
    sourceRowNumber: number,
    sourceFileName: string,
    resolution: 'resolved' | 'retried' | 'skipped'
  ): Promise<void> {
    await db.update(rawDataImports)
      .set({
        processingStatus: resolution === 'resolved' ? 'processed' : resolution,
        processedAt: new Date()
      })
      .where(and(
        eq(rawDataImports.importSessionId, importSessionId),
        eq(rawDataImports.sourceRowNumber, sourceRowNumber),
        eq(rawDataImports.sourceFileName, sourceFileName)
      ));
  }

  /**
   * Get import session details
   */
  async getImportSession(importSessionId: string) {
    const session = await db.select()
      .from(dataImports)
      .where(eq(dataImports.id, importSessionId))
      .limit(1);

    return session[0] || null;
  }

  // Private helper methods

  private transformToErrorDetail(rawDataRow: any): ImportErrorDetail {
    const validationErrors = rawDataRow.validationErrors || {};

    return {
      id: rawDataRow.id,
      importSessionId: rawDataRow.importSessionId,
      sourceFileName: rawDataRow.sourceFileName,
      sourceRowNumber: rawDataRow.sourceRowNumber,
      errorType: validationErrors.errorType || 'Unknown',
      errorMessage: validationErrors.errorMessage || 'No error message',
      fieldErrors: validationErrors.fieldErrors || {},
      originalRowData: rawDataRow.rawDataRow || {},
      attemptedValues: rawDataRow.rawDataRow || {},
      correlationId: validationErrors.correlationId || 'unknown',
      timestamp: validationErrors.timestamp ? new Date(validationErrors.timestamp) : rawDataRow.createdAt,
      retryCount: validationErrors.retryCount || 0,
      canRetry: validationErrors.canRetry || false,
      suggestedFix: validationErrors.suggestedFix
    };
  }

  private isRetryableError(errorType: string, fieldErrors: Record<string, string>): boolean {
    const retryableErrors = [
      'INVALID_EMAIL',
      'INVALID_PHONE',
      'MISSING_REQUIRED_FIELD',
      'INVALID_DATE_FORMAT',
      'INVALID_NUMBER_FORMAT'
    ];

    const nonRetryableErrors = [
      'DUPLICATE_RECORD',
      'MEMORY_LIMIT_EXCEEDED',
      'FILE_PARSING_ERROR'
    ];

    if (nonRetryableErrors.includes(errorType)) return false;
    if (retryableErrors.includes(errorType)) return true;

    // Analyze field errors for retryability
    const hasValidationErrors = Object.keys(fieldErrors).length > 0;
    return hasValidationErrors; // Most validation errors are retryable
  }

  private generateSuggestedFix(
    errorType: string,
    fieldErrors: Record<string, string>,
    originalRowData: Record<string, any>
  ): string | undefined {

    const fixes: Record<string, string> = {
      'INVALID_EMAIL': 'Check email format and ensure it contains @ symbol and valid domain',
      'INVALID_PHONE': 'Verify phone number format and remove any invalid characters',
      'MISSING_REQUIRED_FIELD': 'Add missing required fields: ' + Object.keys(fieldErrors).join(', '),
      'INVALID_DATE_FORMAT': 'Use standard date format (YYYY-MM-DD) or Excel date format',
      'DUPLICATE_RECORD': 'Remove duplicate or enable "Skip Duplicates" option',
      'INVALID_NUMBER_FORMAT': 'Ensure numeric fields contain only numbers and valid decimal points'
    };

    const baseSuggestion = fixes[errorType];

    // Add specific field suggestions
    const fieldSuggestions = Object.entries(fieldErrors).map(([field, error]) => {
      const value = originalRowData[field];
      return `${field}: "${value}" - ${error}`;
    });

    if (baseSuggestion && fieldSuggestions.length > 0) {
      return `${baseSuggestion}. Specific issues: ${fieldSuggestions.join('; ')}`;
    }

    return baseSuggestion;
  }

  private generateBulkFixSuggestion(
    errorsByType: Record<string, number>,
    errorsByField: Record<string, number>
  ): string | undefined {

    const topErrorType = Object.entries(errorsByType)
      .sort(([,a], [,b]) => b - a)[0];

    const topErrorField = Object.entries(errorsByField)
      .sort(([,a], [,b]) => b - a)[0];

    if (!topErrorType) return undefined;

    const [errorType, errorCount] = topErrorType;
    const [fieldName, fieldCount] = topErrorField || [null, 0];

    if (errorCount > 5 && fieldName) {
      return `Most common issue: ${errorType} in ${fieldName} field (${errorCount} records). Consider bulk data cleaning for this field.`;
    }

    return `Primary error: ${errorType} affecting ${errorCount} records. Review data source for consistency.`;
  }

  private sanitizeDataForLogging(data: Record<string, any>): Record<string, any> {
    // Remove or mask sensitive fields for logging
    const sanitized = { ...data };

    // Define sensitive field patterns
    const sensitivePatterns = [
      /email/i, /mail/i, /e-mail/i,
      /phone/i, /mobile/i, /tel/i,
      /ssn/i, /social/i, /credit/i, /card/i,
      /password/i, /pwd/i, /pass/i,
      /dob/i, /birth/i, /age/i,
      /address/i, /street/i, /zip/i, /postal/i,
      /income/i, /salary/i, /wage/i
    ];

    Object.keys(sanitized).forEach(key => {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));

      if (isSensitive && sanitized[key]) {
        const value = String(sanitized[key]);

        // Email masking
        if (/email|mail/i.test(key) && value.includes('@')) {
          sanitized[key] = value.replace(/(.{2}).*(@.*)/, '$1***$2');
        }
        // Phone number masking
        else if (/phone|mobile|tel/i.test(key)) {
          sanitized[key] = value.replace(/(.{3}).*(.{2})/, '$1***$2');
        }
        // General sensitive data masking
        else if (value.length > 3) {
          sanitized[key] = value.substring(0, 2) + '***' + value.substring(value.length - 1);
        } else {
          sanitized[key] = '***';
        }
      }
    });

    // Limit data size for logging and ensure no circular references
    const safeEntries = Object.entries(sanitized)
      .slice(0, 8)
      .filter(([_, value]) => typeof value !== 'object' || value === null);

    return Object.fromEntries(safeEntries);
  }
}

// Export singleton instance
export const importErrorService = new ImportErrorService();
