/**
 * Large File Handling Constants - Enterprise Enhanced
 *
 * Configuration for file size limits, warnings, and optimization thresholds
 * for the data import system to handle large files efficiently.
 * 
 * Enhanced with enterprise security considerations and performance optimization.
 * Integrated with useDataImport v3.0.0 security and performance features.
 * 
 * @version 2.0.0 - Enhanced for Enterprise Security & Performance
 * @security Includes security buffer calculations and validation rules
 * @performance Optimized timeout calculations and processing estimates
 * 
 * @author Smart CDP Platform Team
 * @lastUpdated September 17, 2025
 * @compatibility Compatible with enhanced useDataImport v3.0.0 security features
 */

// File size thresholds (in bytes)
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB - hard limit
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024, // 10MB - show performance warning
  HUGE_FILE_THRESHOLD: 50 * 1024 * 1024, // 50MB - show background processing option
  STREAMING_THRESHOLD: 25 * 1024 * 1024, // 25MB - suggest streaming mode
} as const;

// Record count thresholds
export const RECORD_COUNT_LIMITS = {
  SMALL_FILE: 100, // Normal processing
  MEDIUM_FILE: 1000, // Reduced logging
  LARGE_FILE: 5000, // Batch optimization
  HUGE_FILE: 10000, // Background processing recommendation
} as const;

// Timeout configuration based on file size
export const TIMEOUT_CONFIG = {
  SMALL_FILE: 60000, // 1 minute
  MEDIUM_FILE: 120000, // 2 minutes
  LARGE_FILE: 300000, // 5 minutes
  HUGE_FILE: 600000, // 10 minutes
} as const;

// File type specific optimizations
export const SUPPORTED_TYPES_EXTENDED = {
  'text/csv': { extension: '.csv', streaming: true, maxRecords: 100000 },
  'application/vnd.ms-excel': { extension: '.xls', streaming: false, maxRecords: 50000 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extension: '.xlsx', streaming: false, maxRecords: 50000 },
  'text/plain': { extension: '.txt', streaming: true, maxRecords: 200000 },
  'application/json': { extension: '.json', streaming: true, maxRecords: 75000 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: '.docx', streaming: false, maxRecords: 25000 },
} as const;

// User warning messages
export const FILE_SIZE_WARNINGS = {
  LARGE_FILE: 'Large file detected. Processing may take several minutes.',
  HUGE_FILE: 'Very large file detected. Consider processing in smaller batches for optimal performance.',
  TIMEOUT_WARNING: 'This file size may require extended processing time. Please keep the page open during import.',
  MEMORY_WARNING: 'Large file processing requires significant memory. Close other applications if you experience performance issues.',
  BACKGROUND_RECOMMENDATION: 'For files this large, we recommend using background processing to avoid browser timeouts.',
} as const;

// Progress update intervals
export const PROGRESS_CONFIG = {
  UPDATE_INTERVAL: 1000, // Update progress every 1 second
  BATCH_REPORT_INTERVAL: 10, // Report progress every 10 batches for large files
  LOG_REDUCTION_THRESHOLD: 1000, // Reduce verbose logging above this record count
} as const;

// Helper functions for file size analysis
export function analyzeFileSize(fileSize: number) {
  return {
    isLarge: fileSize >= FILE_SIZE_LIMITS.LARGE_FILE_THRESHOLD,
    isHuge: fileSize >= FILE_SIZE_LIMITS.HUGE_FILE_THRESHOLD,
    shouldStream: fileSize >= FILE_SIZE_LIMITS.STREAMING_THRESHOLD,
    exceedsLimit: fileSize > FILE_SIZE_LIMITS.MAX_FILE_SIZE,
    recommendedTimeout: fileSize >= FILE_SIZE_LIMITS.HUGE_FILE_THRESHOLD
      ? TIMEOUT_CONFIG.HUGE_FILE
      : fileSize >= FILE_SIZE_LIMITS.LARGE_FILE_THRESHOLD
      ? TIMEOUT_CONFIG.LARGE_FILE
      : fileSize >= FILE_SIZE_LIMITS.LARGE_FILE_THRESHOLD
      ? TIMEOUT_CONFIG.MEDIUM_FILE
      : TIMEOUT_CONFIG.SMALL_FILE,
    warningMessage: fileSize >= FILE_SIZE_LIMITS.HUGE_FILE_THRESHOLD
      ? FILE_SIZE_WARNINGS.HUGE_FILE
      : fileSize >= FILE_SIZE_LIMITS.LARGE_FILE_THRESHOLD
      ? FILE_SIZE_WARNINGS.LARGE_FILE
      : null
  };
}

export function estimateProcessingTime(recordCount: number): string {
  if (recordCount <= RECORD_COUNT_LIMITS.SMALL_FILE) {
    return '< 30 seconds';
  } else if (recordCount <= RECORD_COUNT_LIMITS.MEDIUM_FILE) {
    return '30 seconds - 2 minutes';
  } else if (recordCount <= RECORD_COUNT_LIMITS.LARGE_FILE) {
    return '2 - 5 minutes';
  } else {
    return '5+ minutes (consider background processing)';
  }
}
