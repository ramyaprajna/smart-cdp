/**
 * Import Type Definitions
 *
 * This module contains all TypeScript interfaces and types related to
 * import functionality. It serves as the single source of truth for
 * data structures used throughout the import system.
 *
 * Key Features:
 * - Union types for enhanced type safety (ImportStatus, ImportType)
 * - Comprehensive interfaces for all data structures
 * - Optional fields marked appropriately
 * - Generic Record type for flexible metadata
 *
 * Usage:
 * Import these types in any component or service that handles import data
 * to ensure type safety and consistent data structures.
 */
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ImportType = 'excel' | 'csv' | 'json' | 'api';

export interface ImportRecord {
  id: string;
  fileName: string;
  fileSize: number;
  importType: ImportType;
  importSource: string;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  recordsDuplicates?: number;
  recordsSkipped?: number;
  recordsUpdated?: number;
  recordsMerged?: number;
  duplicateHandlingStrategy?: string;
  importStatus: ImportStatus;
  importedBy: string;
  importedAt: string;
  completedAt?: string;
  importMetadata?: Record<string, any>;
}

export interface ImportFilters {
  search: string;
  status: string;
  type: string;
  dateRange: string;
}

export interface ImportSummaryStats {
  total: number;
  successful: number;
  failed: number;
  recordsProcessed: number;
}

// Error Tracking Types (Added August 14, 2025)
export interface ImportErrorDetail {
  id: string;
  importSessionId: string;
  sourceFileName: string;
  sourceRowNumber: number;
  errorType: string;
  errorMessage: string;
  fieldErrors: Record<string, string>;
  originalRowData: Record<string, any>;
  attemptedValues: Record<string, any>;
  correlationId: string;
  timestamp: Date | string;
  retryCount: number;
  canRetry: boolean;
  suggestedFix?: string;
  // Additional properties from hook interface
  fieldName?: string;
  fieldValue?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isResolved?: boolean;
  markedForRetry?: boolean;
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

export interface ImportSession {
  id: string;
  fileName: string;
  fileSize: number;
  importType: string;
  importSource: string;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  importStatus: string;
  importedAt: Date;
  completedAt?: Date;
}

// Progress Tracking Types (Added August 14, 2025)
export interface ImportProgress {
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  currentBatch: number;
  totalBatches: number;
  startTime: Date;
  lastUpdateTime: Date;
  estimatedCompletion?: Date;
  processingSpeed: number; // records per second
  status: 'starting' | 'processing' | 'timeout' | 'error' | 'completed' | 'paused';
  importSessionId: string;
  currentOperation: string;
  lastProcessedRecord?: number;
  duplicatesHandled?: number;
  canResume?: boolean;
  errorMessage?: string;
}

export interface ResumeOptions {
  importSessionId: string;
  lastProcessedRecord: number;
  duplicateHandlingStrategy: string;
  preservedSettings: Record<string, any>;
}
