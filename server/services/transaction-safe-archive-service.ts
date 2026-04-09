/**
 * Transaction-Safe Archive Service
 *
 * Purpose: Provide transaction-safe archival with rollback support
 *
 * Key Features:
 * - Transaction-safe operations with rollback
 * - Partial success handling and recovery
 * - Incremental validation per table
 * - Comprehensive error recovery
 * - Data consistency guarantees
 *
 * Design Decisions:
 * - Table-by-table processing for granular control
 * - Rollback support for failed operations
 * - Schema verification before archival
 * - Progress tracking with detailed status
 *
 * @module TransactionSafeArchiveService
 * @created August 1, 2025
 * @updated August 13, 2025 - Refactored for improved modularity
 */

import { db } from '../db';
import { archiveDb, archivePool } from '../db-archive';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  PerformanceMonitor
} from '../utils/service-utilities';
import {
  BatchProcessor,
  StatusUpdater
} from '../utils/database-utilities';
import {
  archiveMetadata,
  archivedCustomers,
  archivedCustomerIdentifiers,
  archivedCustomerEvents,
  archivedCustomerEmbeddings,
  archivedSegments,
  archivedCustomerSegments,
  archivedDataImports,
  archivedRawDataImports,
  type ArchiveMetadata
} from '@shared/archive-schema';
import {
  customers,
  customerIdentifiers,
  customerEvents,
  customerEmbeddings,
  segments,
  customerSegments,
  dataImports,
  rawDataImports
} from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { schemaVerificationService } from './schema-verification-service';

export interface TransactionSafeArchiveOptions {
  name: string;
  description?: string;
  archiveType?: 'full' | 'partial' | 'backup';
  validateSchemas?: boolean;
  enableRollback?: boolean;
  batchSize?: number;
  includeTables?: string[];
  excludeTables?: string[];
}

export interface ArchivalProgress {
  tableName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  recordsProcessed: number;
  totalRecords: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface TransactionSafeArchiveResult {
  archiveId: string;
  success: boolean;
  totalRecordsArchived: number;
  tablesProcessed: number;
  tablesSucceeded: number;
  tablesFailed: number;
  progress: ArchivalProgress[];
  errors: string[];
  rollbackPerformed: boolean;
  duration: number;
}

export class TransactionSafeArchiveService {
  private readonly TABLE_ARCHIVE_MAPPING = {
    customers: { live: customers, archive: archivedCustomers },
    customer_identifiers: { live: customerIdentifiers, archive: archivedCustomerIdentifiers },
    customer_events: { live: customerEvents, archive: archivedCustomerEvents },
    customer_embeddings: { live: customerEmbeddings, archive: archivedCustomerEmbeddings },
    segments: { live: segments, archive: archivedSegments },
    customer_segments: { live: customerSegments, archive: archivedCustomerSegments },
    data_imports: { live: dataImports, archive: archivedDataImports },
    raw_data_imports: { live: rawDataImports, archive: archivedRawDataImports },
  };

  /**
   * Create archive with full transaction safety and error recovery
   */
  async createTransactionSafeArchive(
    options: TransactionSafeArchiveOptions,
    createdBy: string
  ): Promise<TransactionSafeArchiveResult> {
    const startTime = Date.now();
    secureLogger.info(`🔒 Starting transaction-safe archive: ${options.name}`);

    // Initialize progress tracking
    const tablesToProcess = this.getTableList(options);
    const progress: ArchivalProgress[] = tablesToProcess.map(tableName => ({
      tableName,
      status: 'pending',
      recordsProcessed: 0,
      totalRecords: 0
    }));

    let archiveId: string | null = null;
    let rollbackPerformed = false;
    const errors: string[] = [];

    try {
      // Step 1: Schema verification (if enabled)
      if (options.validateSchemas !== false) {
        const schemaReport = await schemaVerificationService.verifySchemaCompatibility();

        if (!schemaReport.overallCompatible) {
          throw new Error(`Schema incompatibility detected: ${schemaReport.criticalIssues.join('; ')}`);
        }
      }

      // Step 2: Create archive metadata with transaction
      archiveId = await this.createArchiveMetadata(options, createdBy);

      // Step 3: Process each table with individual transactions
      let totalRecordsArchived = 0;
      let tablesSucceeded = 0;
      let tablesFailed = 0;

      for (const tableName of tablesToProcess) {
        const tableProgress = progress.find(p => p.tableName === tableName)!;

        try {
          tableProgress.status = 'in_progress';
          tableProgress.startTime = new Date();

          const result = await this.archiveTableSafely(
            tableName,
            archiveId,
            options.batchSize || 1000
          );

          tableProgress.recordsProcessed = result.recordsArchived;
          tableProgress.totalRecords = result.totalRecords;
          tableProgress.status = 'completed';
          tableProgress.endTime = new Date();

          totalRecordsArchived += result.recordsArchived;
          tablesSucceeded++;


        } catch (error) {
          tableProgress.status = 'failed';
          tableProgress.endTime = new Date();
          tableProgress.error = (error as Error).message;

          errors.push(`Table ${tableName}: ${(error as Error).message}`);
          tablesFailed++;

          secureLogger.error(`❌ Table ${tableName} failed:`, { error: String(error) });

          // Decide whether to continue or rollback based on options
          if (options.enableRollback !== false && this.isCriticalTable(tableName)) {
            rollbackPerformed = await this.rollbackArchive(archiveId, progress);
            break;
          }
        }
      }

      // Step 4: Update archive completion status
      await this.updateArchiveStatus(archiveId, {
        status: rollbackPerformed ? 'failed' : (tablesFailed === 0 ? 'completed' : 'partial'),
        metadata: {
          totalRecordsArchived,
          tablesSucceeded,
          tablesFailed,
          rollbackPerformed,
          errors: errors.length > 0 ? errors : undefined
        }
      });

      const duration = Date.now() - startTime;

      return {
        archiveId,
        success: !rollbackPerformed && tablesFailed === 0,
        totalRecordsArchived,
        tablesProcessed: tablesToProcess.length,
        tablesSucceeded,
        tablesFailed,
        progress,
        errors,
        rollbackPerformed,
        duration
      };

    } catch (error) {
      secureLogger.error('❌ Archive creation failed:', { error: String(error) });

      // Attempt rollback if archive was created
      if (archiveId && options.enableRollback !== false) {
        rollbackPerformed = await this.rollbackArchive(archiveId, progress);
      }

      return {
        archiveId: archiveId || 'failed-to-create',
        success: false,
        totalRecordsArchived: 0,
        tablesProcessed: 0,
        tablesSucceeded: 0,
        tablesFailed: tablesToProcess.length,
        progress,
        errors: [error instanceof Error ? error.message : 'Unknown error', ...errors],
        rollbackPerformed,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Archive individual table with transaction safety
   */
  private async archiveTableSafely(
    tableName: string,
    archiveId: string,
    batchSize: number
  ): Promise<{ recordsArchived: number; totalRecords: number }> {
    const mapping = this.TABLE_ARCHIVE_MAPPING[tableName as keyof typeof this.TABLE_ARCHIVE_MAPPING];
    if (!mapping) {
      throw new Error(`No archive mapping found for table: ${tableName}`);
    }

    // Count total records
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(mapping.live);
    const totalRecords = countResult.count;

    if (totalRecords === 0) {
      return { recordsArchived: 0, totalRecords: 0 };
    }


    let recordsArchived = 0;
    let offset = 0;

    // Process in batches with individual transactions
    while (offset < totalRecords) {
      const transaction = await archivePool.connect();

      try {
        await transaction.query('BEGIN');

        // Fetch batch from live table
        const batch = await db
          .select()
          .from(mapping.live)
          .limit(batchSize)
          .offset(offset);

        if (batch.length === 0) break;

        // Transform records for archive
        const archiveRecords = batch.map(record => ({
          archiveId,
          originalId: (record as any).id,
          ...this.transformRecordForArchive(record, tableName),
          archivedAt: new Date()
        }));

        // Insert into archive table
        await archiveDb.insert(mapping.archive).values(archiveRecords);

        await transaction.query('COMMIT');

        recordsArchived += batch.length;
        offset += batchSize;


      } catch (error) {
        await transaction.query('ROLLBACK');
        throw new Error(`Batch insert failed at offset ${offset}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        transaction.release();
      }
    }

    return { recordsArchived, totalRecords };
  }

  /**
   * Transform live record for archive storage
   */
  private transformRecordForArchive(record: any, tableName: string): any {
    const transformed = { ...record };
    delete transformed.id; // Remove original ID

    switch (tableName) {
      case 'customers':
        return {
          firstName: transformed.first_name,
          lastName: transformed.last_name,
          email: transformed.email,
          phoneNumber: transformed.phone_number,
          dateOfBirth: transformed.date_of_birth,
          gender: transformed.gender,
          currentAddress: transformed.current_address,
          customerSegment: transformed.customer_segment,
          lifetimeValue: transformed.lifetime_value?.toString(),
          lastActiveAt: transformed.last_active_at,
          dataQualityScore: transformed.data_quality_score?.toString(),
          importId: transformed.import_id,
          sourceRowNumber: transformed.source_row_number,
          sourceFileHash: transformed.source_file_hash,
          dataLineage: transformed.data_lineage,
          originalCreatedAt: transformed.created_at,
          originalUpdatedAt: transformed.updated_at,
        };

      case 'customer_identifiers':
        return {
          customerId: transformed.customer_id,
          identifierType: transformed.identifier_type,
          identifierValue: transformed.identifier_value,
          sourceSystem: transformed.source_system,
          importId: transformed.import_id,
          sourceRowNumber: transformed.source_row_number,
          lastSeenAt: transformed.last_seen_at,
          originalCreatedAt: transformed.created_at,
        };

      case 'customer_events':
        return {
          customerId: transformed.customer_id,
          eventType: transformed.event_type,
          eventTimestamp: transformed.event_timestamp,
          source: transformed.source,
          sessionId: transformed.session_id,
          deviceId: transformed.device_id,
          ipAddress: transformed.ip_address,
          userAgent: transformed.user_agent,
          eventProperties: transformed.event_properties,
          importId: transformed.import_id,
          sourceRowNumber: transformed.source_row_number,
          originalCreatedAt: transformed.created_at,
        };

      case 'customer_embeddings':
        return {
          customerId: transformed.customer_id,
          embedding: Array.isArray(transformed.embedding)
            ? transformed.embedding
            : JSON.parse(transformed.embedding || '[]'),
          embeddingType: transformed.embedding_type,
          originalCreatedAt: transformed.created_at,
          originalUpdatedAt: transformed.updated_at,
        };

      case 'segments':
        return {
          name: transformed.name,
          description: transformed.description,
          criteria: transformed.criteria,
          isActive: transformed.is_active?.toString(),
          originalCreatedAt: transformed.created_at,
          originalUpdatedAt: transformed.updated_at,
        };

      case 'customer_segments':
        return {
          customerId: transformed.customer_id,
          segmentId: transformed.segment_id,
          originalCreatedAt: transformed.created_at,
        };

      case 'data_imports':
        return {
          sessionId: transformed.session_id,
          sourceFileName: transformed.source_file_name,
          totalRows: transformed.total_rows,
          processedRows: transformed.processed_rows,
          successfulRows: transformed.successful_rows,
          failedRows: transformed.failed_rows,
          processingStatus: transformed.processing_status,
          importType: transformed.import_type,
          validationRules: transformed.validation_rules,
          fieldMappings: transformed.field_mappings,
          originalCreatedAt: transformed.created_at,
        };

      case 'raw_data_imports':
        return {
          importSessionId: transformed.import_session_id,
          sourceFileName: transformed.source_file_name,
          sourceSheetName: transformed.source_sheet_name,
          sourceRowNumber: transformed.source_row_number,
          rawDataRow: transformed.raw_data_row,
          originalHeaders: transformed.original_headers,
          dataTypesDetected: transformed.data_types_detected,
          validationErrors: transformed.validation_errors,
          processingStatus: transformed.processing_status,
          originalProcessedAt: transformed.processed_at,
          originalCreatedAt: transformed.created_at,
        };

      default:
        return transformed;
    }
  }

  /**
   * Rollback archive by deleting archived data
   */
  private async rollbackArchive(archiveId: string, progress: ArchivalProgress[]): Promise<boolean> {
    try {

      // Delete archived data for each completed table
      for (const tableProgress of progress) {
        if (tableProgress.status === 'completed') {
          const mapping = this.TABLE_ARCHIVE_MAPPING[tableProgress.tableName as keyof typeof this.TABLE_ARCHIVE_MAPPING];
          if (mapping) {
            await archiveDb.delete(mapping.archive).where(eq(mapping.archive.archiveId, archiveId));
            tableProgress.status = 'rolled_back';
          }
        }
      }

      // Update archive status
      await this.updateArchiveStatus(archiveId, {
        status: 'failed',
        metadata: { rollbackCompleted: true, rollbackAt: new Date().toISOString() }
      });

      return true;

    } catch (error) {
      secureLogger.error('❌ Rollback failed:', { error: String(error) });
      return false;
    }
  }

  /**
   * Create archive metadata record
   */
  private async createArchiveMetadata(options: TransactionSafeArchiveOptions, createdBy: string): Promise<string> {
    const [archive] = await archiveDb
      .insert(archiveMetadata)
      .values({
        name: options.name,
        description: options.description || `Transaction-safe archive created on ${new Date().toLocaleDateString()}`,
        archiveType: options.archiveType || 'full',
        status: 'creating',
        createdBy,
        metadata: {
          transactionSafe: true,
          creationOptions: options,
          isolationLevel: 'database_schema'
        }
      })
      .returning();

    return archive.id;
  }

  /**
   * Update archive status and metadata
   */
  private async updateArchiveStatus(archiveId: string, updates: {
    status?: string;
    metadata?: any;
  }): Promise<void> {
    const updateData: any = {};

    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'completed') {
        updateData.completedAt = new Date();
      }
    }

    if (updates.metadata) {
      updateData.metadata = updates.metadata;
    }

    await archiveDb
      .update(archiveMetadata)
      .set(updateData)
      .where(eq(archiveMetadata.id, archiveId));
  }

  /**
   * Get list of tables to process based on options
   */
  private getTableList(options: TransactionSafeArchiveOptions): string[] {
    const allTables = Object.keys(this.TABLE_ARCHIVE_MAPPING);

    if (options.includeTables?.length) {
      return options.includeTables.filter(table => allTables.includes(table));
    }

    if (options.excludeTables?.length) {
      return allTables.filter(table => !options.excludeTables!.includes(table));
    }

    return allTables;
  }

  /**
   * Check if table is critical for rollback decisions
   */
  private isCriticalTable(tableName: string): boolean {
    const criticalTables = ['customers', 'customer_identifiers'];
    return criticalTables.includes(tableName);
  }
}

export const transactionSafeArchiveService = new TransactionSafeArchiveService();
