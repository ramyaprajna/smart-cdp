/**
 * Shared Archive Table Configuration
 *
 * Centralized definition of archivable tables to eliminate duplication
 * across archive services and ensure consistency.
 *
 * Created: August 11, 2025 - Refactoring consolidation
 */

import {
  customers,
  customerIdentifiers,
  customerEvents,
  segments,
  customerSegments,
  dataImports,
  rawDataImports
} from '@shared/schema';

/**
 * Standard archivable tables configuration
 * Used by all archive services for consistency
 */
export const ARCHIVABLE_TABLES = {
  customers: customers,
  customer_identifiers: customerIdentifiers,
  customer_events: customerEvents,
  segments: segments,
  customer_segments: customerSegments,
  data_imports: dataImports,
  raw_data_imports: rawDataImports,
} as const;

/**
 * Table names array for validation and iteration
 */
export const ARCHIVABLE_TABLE_NAMES = Object.keys(ARCHIVABLE_TABLES) as Array<keyof typeof ARCHIVABLE_TABLES>;

/**
 * Tables excluded from archiving (derived data)
 */
export const EXCLUDED_TABLES = {
  customer_embeddings: 'Derived data with no id field, regenerated from customer profiles'
} as const;

/**
 * Archive operation types
 */
export const ARCHIVE_TYPES = ['full', 'partial', 'backup'] as const;
export type ArchiveType = typeof ARCHIVE_TYPES[number];

/**
 * Restore operation types
 */
export const RESTORE_TYPES = ['full', 'selective'] as const;
export type RestoreType = typeof RESTORE_TYPES[number];
