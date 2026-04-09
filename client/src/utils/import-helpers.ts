import { ImportRecord, ImportFilters, ImportSummaryStats } from '../types/import';

/**
 * Import Helper Utilities
 *
 * This module contains pure utility functions for import data processing.
 * These functions are designed to be:
 * - Pure (no side effects)
 * - Testable (can be unit tested independently)
 * - Reusable (can be used across different components)
 * - Type-safe (full TypeScript support)
 *
 * All functions follow functional programming principles and can be
 * easily tested, mocked, or extended as needed.
 */

/**
 * Format file size in bytes to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes) return 'N/A';

  const sizes = ['Bytes', 'KB', 'MB', 'GB'] as const;
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = Math.round((bytes / Math.pow(1024, index)) * 100) / 100;

  return `${size} ${sizes[index]}`;
};

/**
 * Calculate success rate percentage
 */
export const calculateSuccessRate = (successful: number, total: number): number => {
  if (!total) return 0;
  return Math.round((successful / total) * 100);
};

/**
 * Filter imports based on search criteria
 */
export const filterImports = (imports: ImportRecord[], filters: ImportFilters): ImportRecord[] => {
  // Defensive programming: ensure imports is always an array
  if (!Array.isArray(imports)) {
    console.warn('filterImports: imports parameter is not an array:', imports);
    return [];
  }

  return imports.filter((importRecord) => {
    const matchesSearch = !filters.search ||
      importRecord.fileName.toLowerCase().includes(filters.search.toLowerCase()) ||
      importRecord.importedBy.toLowerCase().includes(filters.search.toLowerCase());

    const matchesStatus = filters.status === 'all' || importRecord.importStatus === filters.status;
    const matchesType = filters.type === 'all' || importRecord.importType === filters.type;

    return matchesSearch && matchesStatus && matchesType;
  });
};

/**
 * Calculate summary statistics from filtered imports
 */
export const calculateSummaryStats = (imports: ImportRecord[]): ImportSummaryStats => {
  // Defensive programming: ensure imports is always an array
  if (!Array.isArray(imports)) {
    console.warn('calculateSummaryStats: imports parameter is not an array:', imports);
    return {
      total: 0,
      successful: 0,
      failed: 0,
      recordsProcessed: 0
    };
  }

  return {
    total: imports.length,
    successful: imports.filter(imp => imp.importStatus === 'completed').length,
    failed: imports.filter(imp => imp.importStatus === 'failed').length,
    recordsProcessed: imports.reduce((sum, imp) => sum + (imp.recordsProcessed || 0), 0)
  };
};

/**
 * Build API query parameters from filters
 */
export const buildQueryParams = (filters: ImportFilters): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.search) params.append('search', filters.search);
  if (filters.status !== 'all') params.append('status', filters.status);
  if (filters.type !== 'all') params.append('type', filters.type);
  if (filters.dateRange !== 'all') params.append('dateRange', filters.dateRange);

  return params;
};

/**
 * Navigate to import details with data refresh
 */
export const navigateToImportDetails = (importId: string, refetch: () => void): void => {
  refetch();
  // Use pushState for SPA navigation instead of full page reload
  window.history.pushState({}, '', `/import-details/${importId}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * Navigate to import errors with data refresh
 */
export const navigateToImportErrors = (importId: string, refetch: () => void): void => {
  refetch();
  // Use pushState for SPA navigation instead of full page reload
  window.history.pushState({}, '', `/import-errors/${importId}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
