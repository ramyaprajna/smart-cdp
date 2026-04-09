/**
 * Archive Database Connection
 *
 * Separate database connection specifically for archive operations.
 * Provides complete isolation of archived data from live application data.
 *
 * Features:
 * - Dedicated connection pool for archive operations
 * - Separate schema namespace (archive)
 * - Optimized for large data archival operations
 * - Independent query performance and scaling
 *
 * Last Updated: August 1, 2025
 * Integration Status: ✅ NEW - Database-level separation implementation
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as archiveSchema from "@shared/archive-schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Security: Never log the actual DATABASE_URL value
const dbUrlStatus = process.env.DATABASE_URL ? '[CONFIGURED]' : '[NOT_SET]';
import { secureLogger } from './utils/secure-logger';

secureLogger.info(`🔐 Archive database connection ${dbUrlStatus}`, 
  { 
    connectionPoolSize: 2,
    dbConfigured: !!process.env.DATABASE_URL,
    lazyInitialization: true
  }, 
  'ARCHIVE_DB_CONNECTION'
);

// Create dedicated connection pool for archive operations
// PRODUCTION FIX: Reduced pool size from 5 to 2 to prevent connection exhaustion
// Archive operations are infrequent and don't need many concurrent connections
export const archivePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,                          // Reduced to 2 connections (archive is infrequent)
  idleTimeoutMillis: 30000,        // Remove idle connections after 30 seconds
  connectionTimeoutMillis: 20000,   // Increased timeout to 20s for production stability
});

// Archive database instance with isolated schema
export const archiveDb = drizzle({
  client: archivePool,
  schema: archiveSchema,
});

// Lazy initialization state management
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Lazy initialization wrapper with retry logic and circuit breaker
 * Ensures archive schema is initialized only when actually needed
 * 
 * SECURITY: Prevents connection exhaustion on module load
 * PERFORMANCE: Defers expensive initialization until first use
 * RELIABILITY: Includes exponential backoff retry for transient failures
 */
export async function ensureArchiveSchemaInitialized(): Promise<void> {
  // Return immediately if already initialized
  if (isInitialized) {
    return;
  }

  // Return existing initialization promise if in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization with retry logic
  initializationPromise = initializeArchiveSchemaWithRetry();
  
  try {
    await initializationPromise;
    isInitialized = true;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Initialize with exponential backoff retry logic
 */
async function initializeArchiveSchemaWithRetry(): Promise<void> {
  const maxRetries = 3;
  const baseDelayMs = 1000;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await initializeArchiveSchema();
      secureLogger.info('✅ Archive schema initialized successfully', 
        { attempt: attempt + 1, maxRetries: maxRetries + 1 }, 
        'ARCHIVE_INIT'
      );
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (isLastAttempt) {
        secureLogger.error('❌ Archive schema initialization failed after all retries', 
          { 
            attempts: attempt + 1, 
            error: errorMessage,
            recommendation: 'Archive features will be unavailable until manual intervention'
          }, 
          'ARCHIVE_INIT'
        );
        throw new Error(`Archive schema initialization failed after ${attempt + 1} attempts: ${errorMessage}`);
      }
      
      // Calculate exponential backoff delay
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      secureLogger.warn(`⚠️ Archive schema initialization attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, 
        { error: errorMessage, nextRetryMs: delayMs }, 
        'ARCHIVE_INIT'
      );
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Initialize complete archive schema with all tables
 * Creates the archive schema namespace and all required tables if they don't exist
 * 
 * INTERNAL USE ONLY - Use ensureArchiveSchemaInitialized() instead
 */
async function initializeArchiveSchema(): Promise<void> {
  try {
    // Create archive schema if it doesn't exist
    await archivePool.query('CREATE SCHEMA IF NOT EXISTS archive');

    // Create all archive tables
    const archiveTableStatements = [
      `CREATE TABLE IF NOT EXISTS archive.metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        archive_type TEXT NOT NULL DEFAULT 'full',
        status TEXT NOT NULL DEFAULT 'creating',
        data_size INTEGER DEFAULT 0,
        record_counts JSONB,
        metadata JSONB,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        restored_by TEXT,
        restored_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS archive.customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone_number TEXT,
        date_of_birth TIMESTAMP,
        gender TEXT,
        current_address JSONB,
        customer_segment TEXT,
        lifetime_value TEXT,
        last_active_at TIMESTAMP WITH TIME ZONE,
        data_quality_score TEXT,
        import_id UUID,
        source_row_number INTEGER,
        source_file_hash TEXT,
        data_lineage JSONB,
        original_created_at TIMESTAMP WITH TIME ZONE,
        original_updated_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.customer_identifiers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        identifier_type TEXT NOT NULL,
        identifier_value TEXT NOT NULL,
        source_system TEXT,
        import_id UUID,
        source_row_number INTEGER,
        last_seen_at TIMESTAMP WITH TIME ZONE,
        original_created_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.customer_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        event_type TEXT NOT NULL,
        event_data JSONB,
        session_id TEXT,
        original_created_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.customer_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        embedding JSONB,
        embedding_type TEXT DEFAULT 'customer_profile',
        original_created_at TIMESTAMP WITH TIME ZONE,
        original_updated_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.segments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        criteria JSONB,
        is_active TEXT,
        original_created_at TIMESTAMP WITH TIME ZONE,
        original_updated_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.customer_segments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        segment_id UUID NOT NULL,
        original_created_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.data_imports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        import_type TEXT NOT NULL,
        import_source TEXT NOT NULL,
        records_processed INTEGER DEFAULT 0,
        records_successful INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        import_status TEXT NOT NULL,
        import_metadata JSONB,
        imported_by TEXT,
        original_imported_at TIMESTAMP WITH TIME ZONE,
        original_completed_at TIMESTAMP WITH TIME ZONE,
        processing_mode TEXT,
        chunk_size INTEGER,
        validation_rules JSONB,
        field_mappings JSONB,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      `CREATE TABLE IF NOT EXISTS archive.raw_data_imports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        archive_id UUID NOT NULL REFERENCES archive.metadata(id) ON DELETE CASCADE,
        original_id UUID NOT NULL,
        import_session_id UUID NOT NULL,
        source_file_name TEXT NOT NULL,
        source_sheet_name TEXT,
        source_row_number INTEGER NOT NULL,
        raw_data_row JSONB NOT NULL,
        original_headers JSONB,
        data_types_detected JSONB,
        validation_errors JSONB,
        processing_status TEXT,
        original_processed_at TIMESTAMP WITH TIME ZONE,
        original_created_at TIMESTAMP WITH TIME ZONE,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`
    ];

    // Execute each table creation
    for (let i = 0; i < archiveTableStatements.length; i++) {
      await archivePool.query(archiveTableStatements[i]);
    }

    // Create indexes for performance
    const archiveIndexes = [
      'CREATE INDEX IF NOT EXISTS archive_metadata_name_idx ON archive.metadata (name);',
      'CREATE INDEX IF NOT EXISTS archive_metadata_status_idx ON archive.metadata (status);',
      'CREATE INDEX IF NOT EXISTS archive_metadata_created_at_idx ON archive.metadata (created_at);',
      'CREATE INDEX IF NOT EXISTS archived_customers_archive_idx ON archive.customers (archive_id);',
      'CREATE INDEX IF NOT EXISTS archived_customers_original_idx ON archive.customers (original_id);',
      'CREATE INDEX IF NOT EXISTS archived_customers_email_idx ON archive.customers (email);'
    ];

    for (const indexSql of archiveIndexes) {
      try {
        await archivePool.query(indexSql);
      } catch (indexError) {
        // Index creation failures are non-critical
        secureLogger.warn(`Index creation warning: ${indexError}`);
      }
    }

  } catch (error) {
    secureLogger.error('❌ Failed to initialize archive schema:', { error: String(error) });
    throw new Error(`Archive schema initialization failed: ${(error as Error).message}`);
  }
}

/**
 * Get archive database statistics
 */
export async function getArchiveDbStats() {
  try {
    const stats = await archivePool.query(`
      SELECT
        schemaname,
        tablename,
        n_tup_ins as total_inserts,
        n_tup_upd as total_updates,
        n_tup_del as total_deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables
      WHERE schemaname = 'archive'
      ORDER BY tablename
    `);

    return stats.rows;
  } catch (error) {
    secureLogger.error('Failed to get archive database statistics:', { error: String(error) });
    return [];
  }
}

/**
 * Clean up archive database connections
 */
export async function closeArchiveConnections(): Promise<void> {
  try {
    await archivePool.end();
  } catch (error) {
    secureLogger.error('❌ Failed to close archive connections:', { error: String(error) });
  }
}

// PRODUCTION FIX: Archive schema initialization removed from module load
// Archive schema is now lazily initialized on first use via ensureArchiveSchemaInitialized()
// This prevents connection timeout issues during server startup and conserves database connections
//
// Migration Note: All archive service calls now use ensureArchiveSchemaInitialized() before operations
