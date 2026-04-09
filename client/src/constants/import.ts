import { ImportStatus } from '../types/import';

/**
 * Import Configuration Constants
 *
 * This module centralizes all configuration values, UI options, and
 * constants related to import functionality. It provides a single
 * source of truth for:
 *
 * - Query configuration (refetch intervals, cache settings)
 * - UI filter options and labels
 * - Status badge styling variants
 * - Table column definitions
 * - Default filter values
 *
 * Benefits:
 * - Easy to modify settings without touching component code
 * - Consistent behavior across components
 * - Type-safe constant definitions with 'as const' assertions
 * - Centralized configuration management
 *
 * Note: All constants use 'as const' to ensure immutability and
 * proper TypeScript literal type inference.
 */

// Query configuration constants
export const QUERY_CONFIG = {
  REFETCH_INTERVAL: 30000, // 30 seconds
  STALE_TIME: 10000, // 10 seconds
} as const;

// Filter options for the UI
export const FILTER_OPTIONS = {
  STATUS: [
    { value: 'all', label: 'All Statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'processing', label: 'Processing' },
    { value: 'pending', label: 'Pending' },
  ],
  TYPE: [
    { value: 'all', label: 'All Types' },
    { value: 'excel', label: 'Excel' },
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
    { value: 'api', label: 'API' },
  ],
  DATE_RANGE: [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
  ],
} as const;

// Status badge variants mapping
export const STATUS_VARIANTS = {
  completed: 'default',
  failed: 'destructive',
  processing: 'secondary',
  pending: 'outline',
} as const;

// Table column configuration
export const TABLE_COLUMNS = [
  'Status',
  'File Name',
  'Type',
  'Size',
  'Records',
  'Success Rate',
  'Imported By',
  'Date',
  'Actions',
] as const;

// Default filter values
export const DEFAULT_FILTERS = {
  search: '',
  status: 'all',
  type: 'all',
  dateRange: 'all',
} as const;
