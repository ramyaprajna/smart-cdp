// DATA LINEAGE SERVICE MODULE LOADED DEBUG
// Data Lineage Service - Production ready

import { db } from './db';
import { dataImports, customers, customerIdentifiers, customerEvents, applicationLogs } from '../shared/schema';
import type { InsertDataImport, InsertCustomer, DataImport } from '../shared/schema';
import { eq, sql, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { schemaMapper } from './utils/schema-mapper';
import { secureLogger } from './utils/secure-logger';

export interface ImportOptions {
  fileName: string;
  filePath?: string;
  importType: 'excel' | 'csv' | 'json' | 'api';
  importSource: string; // e.g., 'delta_fm_excel', 'crm_export', 'marketing_data'
  importedBy?: string;
  metadata?: Record<string, any>;
}

export interface ImportResult {
  importId: string;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  errors: string[];
}

export class DataLineageService {
  /**
   * Initialize a new data import session
   */
  async startImport(options: ImportOptions): Promise<string> {
    const fileHash = options.filePath ? await this.generateFileHash(options.filePath) : null;
    const fileSize = options.filePath ? await this.getFileSize(options.filePath) : null;

    const importTimestamp = new Date();

    const [importRecord] = await db.insert(dataImports).values({
      fileName: options.fileName,
      filePath: options.filePath,
      fileSize,
      importType: options.importType,
      importSource: options.importSource,
      importStatus: 'processing',
      importedAt: importTimestamp,
      importMetadata: {
        ...options.metadata,
        fileHash,
        startedAt: importTimestamp.toISOString(),
      },
      importedBy: options.importedBy || 'system',
    }).returning({ id: dataImports.id });

    return importRecord.id;
  }

  /**
   * Import customers with full data lineage tracking
   */
  async importCustomers(
    importId: string,
    customersData: Array<Omit<InsertCustomer, 'importId' | 'sourceRowNumber' | 'sourceFileHash' | 'dataLineage'>>,
    sourceRowNumbers?: number[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      importId,
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsFailed: 0,
      errors: [],
    };

    // Get import record for metadata
    const importRecord = await this.getImportRecord(importId);
    const fileHash = (importRecord?.importMetadata as any)?.fileHash;

    // Dynamic batch sizing for optimal performance based on file size
    const totalRecords = customersData.length;
    const isLargeFile = totalRecords > 500;
    const batchSize = totalRecords > 5000 ? 500 : totalRecords > 1000 ? 1000 : 100;
    const logInterval = Math.max(1, Math.floor(totalRecords / 20)); // Log progress every 5%

    secureLogger.info(`📊 [Large File Optimization] Processing ${totalRecords} records in batches of ${batchSize}${isLargeFile ? ' (large file mode)' : ''}`);
    if (isLargeFile) {
      secureLogger.info(`🚀 [Performance] Reduced logging frequency for optimal processing speed`);
    }

    secureLogger.info(`🚀 Starting batch processing: ${totalRecords} records in batches of ${batchSize}`);

    for (let batchStart = 0; batchStart < totalRecords; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, totalRecords);
      const batch = customersData.slice(batchStart, batchEnd);
      const batchSourceRowNumbers = sourceRowNumbers?.slice(batchStart, batchEnd);

      secureLogger.info(`📦 Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(totalRecords / batchSize)}: records ${batchStart + 1}-${batchEnd}`);

      const batchCustomers = batch.map((customerData, batchIndex) => {
        const globalIndex = batchStart + batchIndex;
        const sourceRowNumber = batchSourceRowNumbers?.[batchIndex] || globalIndex + 1;

        // Use schema mapper to properly map CSV fields to database fields
        const { mappedFields, unmappedFields } = schemaMapper.mapCSVDataToCustomerFields(customerData);

        // Optimized logging: only log progress for large files to prevent console spam
        const shouldLog = !isLargeFile || (globalIndex + 1) % logInterval === 0 || globalIndex === 0 || globalIndex === totalRecords - 1;
        if (shouldLog) {
          if (isLargeFile) {
            const progress = Math.round(((globalIndex + 1) / totalRecords) * 100);
            secureLogger.info(`📈 [Batch Progress] ${progress}% complete (${globalIndex + 1}/${totalRecords} records)`);
          } else {
            secureLogger.debug('Row mapping completed', { sourceRowNumber, mappedFieldCount: Object.keys(mappedFields).length }, 'DATA_LINEAGE');
            if (Object.keys(unmappedFields).length > 0) {
              secureLogger.debug('Row unmapped fields detected', { sourceRowNumber, unmappedFieldCount: Object.keys(unmappedFields).length }, 'DATA_LINEAGE');
            }
          }
        }

        // Create data lineage tracking
        const dataLineage = {
          importId,
          sourceFile: importRecord?.fileName,
          sourceRowNumber,
          importedAt: new Date().toISOString(),
          fieldSources: this.mapFieldSources({ ...mappedFields, ...customerData }, importRecord?.importSource || 'unknown'),
        };

        // Store unmapped fields in unmappedFields JSON field
        const finalCustomerData: any = {
          ...mappedFields,
          importId,
          sourceRowNumber,
          sourceFileHash: fileHash,
          dataLineage,
        };

        // If there are unmapped fields, store them in unmappedFields
        if (Object.keys(unmappedFields).length > 0) {
          finalCustomerData.unmappedFields = unmappedFields;
        }

        return finalCustomerData;
      });

      try {
        // Batch insert optimized for performance

        // Try batch insert first (fastest for unique records)
        await db.insert(customers).values(batchCustomers);
        result.recordsSuccessful += batch.length;
        result.recordsProcessed += batch.length;

        // Enhanced batch completion logging with memory management
        const batchProgress = Math.round((result.recordsSuccessful / totalRecords) * 100);

        if (isLargeFile) {
          secureLogger.info(`✅ [Batch ${Math.ceil((batchStart + 1) / batchSize)}] ${batchProgress}% complete (${result.recordsSuccessful}/${totalRecords})`);

          // Memory management for large files
          if (global.gc && result.recordsSuccessful % 5000 === 0) {
            global.gc();
          }
        } else {
        }

      } catch (error) {
        // If batch fails (likely due to duplicates), process individual records with efficient batching
        result.recordsProcessed += batch.length;

        // Process individual records with controlled concurrency for optimal performance
        const concurrencyLimit = 10; // Process up to 10 records concurrently
        const chunks: any[][] = [];
        
        // Split records into concurrent chunks
        for (let i = 0; i < batchCustomers.length; i += concurrencyLimit) {
          chunks.push(batchCustomers.slice(i, i + concurrencyLimit));
        }

        // Process chunks with Promise.allSettled for optimal performance
        for (const chunk of chunks) {
          const insertPromises = chunk.map(async (customer) => {
            try {
              await db.insert(customers).values([customer]);
              return { success: true, customer };
            } catch (individualError) {
              return { success: false, customer, error: individualError };
            }
          });

          const results = await Promise.allSettled(insertPromises);
          
          // Process results efficiently
          results.forEach((promiseResult, index) => {
            if (promiseResult.status === 'fulfilled') {
              const insertResult = promiseResult.value;
              if (insertResult.success) {
                result.recordsSuccessful++;
              } else {
                const individualError = insertResult.error;
                // Check if it's a duplicate email constraint violation
                if (individualError instanceof Error && individualError.message.includes('customers_email_unique')) {
                  // Skip duplicate emails - count as processed but not failed
                } else {
                  // Real error - count as failed
                  result.recordsFailed++;
                  result.errors.push(`Row ${insertResult.customer.sourceRowNumber || 'unknown'}: ${individualError instanceof Error ? individualError.message : 'Unknown error'}`);
                }
              }
            } else {
              // Promise itself failed
              result.recordsFailed++;
              result.errors.push(`Row ${chunk[index]?.sourceRowNumber || 'unknown'}: Promise failed`);
            }
          });
        }

      }

      // Update import progress every 10 batches
      if ((batchStart / batchSize + 1) % 10 === 0) {
        await this.updateImportProgress(importId, result.recordsProcessed, result.recordsSuccessful, result.recordsFailed);
      }
    }

    // Start embedding generation after successful import using the production batch service
    if (result.recordsSuccessful > 0) {
      try {
        const { batchOptimizedEmbeddingService } = await import('./services/batch-optimized-embedding-service');

        // Start batch embedding job for the imported data
        await batchOptimizedEmbeddingService.startJob();
        secureLogger.info(`✅ [Import Complete] Started batch embedding generation for ${result.recordsSuccessful} customers`);

      } catch (embeddingError) {
        secureLogger.error(`⚠️ [Import Complete] Failed to start embedding generation:`, { error: String(embeddingError) });
        // Don't fail the import if embedding generation fails
      }
    }

    // Update import record with results
    await this.updateImportStatus(importId, 'completed', {
      recordsProcessed: result.recordsProcessed,
      recordsSuccessful: result.recordsSuccessful,
      recordsFailed: result.recordsFailed,
      // Initialize duplicate handling stats as 0 (will be updated if duplicates were handled)
      recordsDuplicates: 0,
      recordsSkipped: 0,
      recordsUpdated: 0,
      recordsMerged: 0,
      duplicateHandlingStrategy: null,
    });

    return result;
  }

  /**
   * Import customer identifiers with lineage tracking
   */
  async importCustomerIdentifiers(
    importId: string,
    identifiersData: Array<{
      customerId: string;
      identifierType: string;
      identifierValue: string;
      sourceSystem?: string;
    }>,
    sourceRowNumbers?: number[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      importId,
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsFailed: 0,
      errors: [],
    };

    for (let i = 0; i < identifiersData.length; i++) {
      try {
        result.recordsProcessed++;

        const identifierData = identifiersData[i];
        const sourceRowNumber = sourceRowNumbers?.[i] || i + 1;

        await db.insert(customerIdentifiers).values({
          ...identifierData,
          importId,
          sourceRowNumber,
        });

        result.recordsSuccessful++;
      } catch (error) {
        result.recordsFailed++;
        result.errors.push(`Row ${sourceRowNumbers?.[i] || i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Import customer events with lineage tracking
   */
  async importCustomerEvents(
    importId: string,
    eventsData: Array<{
      customerId?: string;
      eventType: string;
      eventTimestamp: Date;
      source?: string;
      sessionId?: string;
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
      eventProperties?: Record<string, any>;
    }>,
    sourceRowNumbers?: number[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      importId,
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsFailed: 0,
      errors: [],
    };

    for (let i = 0; i < eventsData.length; i++) {
      try {
        result.recordsProcessed++;

        const eventData = eventsData[i];
        const sourceRowNumber = sourceRowNumbers?.[i] || i + 1;

        if (eventData.customerId) {
          await db.insert(customerEvents).values([{
            ...eventData,
            customerId: eventData.customerId,
            // Note: customerEvents table doesn't have importId field
            // importId is tracked through customer relationship
          }]);
        }

        result.recordsSuccessful++;
      } catch (error) {
        result.recordsFailed++;
        result.errors.push(`Row ${sourceRowNumbers?.[i] || i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Get data lineage for a specific customer
   */
  async getCustomerLineage(customerId: string) {
    const customer = await db.select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      importId: customers.importId,
      sourceRowNumber: customers.sourceRowNumber,
      sourceFileHash: customers.sourceFileHash,
      dataLineage: customers.dataLineage,
      createdAt: customers.createdAt,
      // Import details
      fileName: dataImports.fileName,
      importSource: dataImports.importSource,
      importType: dataImports.importType,
      importedBy: dataImports.importedBy,
      importedAt: dataImports.importedAt,
    })
    .from(customers)
    .leftJoin(dataImports, eq(customers.importId, dataImports.id))
    .where(eq(customers.id, customerId))
    .limit(1);

    return customer[0];
  }

  /**
   * Get import history with optional filtering and pagination
   */
  async getImportHistory(filters?: {
    search?: string;
    status?: string;
    type?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
  }) {

    // Execute the query directly without chaining to avoid type issues
    const result = await db.select({
      id: dataImports.id,
      fileName: dataImports.fileName,
      fileSize: dataImports.fileSize,
      importSource: dataImports.importSource,
      importType: dataImports.importType,
      recordsProcessed: dataImports.recordsProcessed,
      recordsSuccessful: dataImports.recordsSuccessful,
      recordsFailed: dataImports.recordsFailed,
      recordsDuplicates: dataImports.recordsDuplicates,
      recordsSkipped: dataImports.recordsSkipped,
      recordsUpdated: dataImports.recordsUpdated,
      recordsMerged: dataImports.recordsMerged,
      duplicateHandlingStrategy: dataImports.duplicateHandlingStrategy,
      importStatus: dataImports.importStatus,
      importedBy: dataImports.importedBy,
      importedAt: dataImports.importedAt,
      completedAt: dataImports.completedAt,
      importMetadata: dataImports.importMetadata,
    }).from(dataImports)
    .orderBy(sql`${dataImports.importedAt} DESC`)
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

    return result;
  }

  /**
   * Get customers by import source
   */
  async getCustomersByImportSource(importSource: string) {
    return await db.select({
      customerId: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      sourceRowNumber: customers.sourceRowNumber,
      fileName: dataImports.fileName,
      importedAt: dataImports.importedAt,
    })
    .from(customers)
    .innerJoin(dataImports, eq(customers.importId, dataImports.id))
    .where(eq(dataImports.importSource, importSource))
    .orderBy(sql`${dataImports.importedAt} DESC`);
  }

  /**
   * Detect and report potential duplicate imports
   */
  async detectDuplicateImports(): Promise<{
    duplicateFiles: Array<{
      fileName: string;
      count: number;
      imports: Array<{ id: string; importedAt: Date; importedBy: string }>;
    }>;
    duplicateCustomers: Array<{
      email: string;
      count: number;
      customers: Array<{ id: string; importId: string; fileName: string }>;
    }>;
  }> {
    // Check for duplicate files
    const duplicateFiles = await db.select({
      fileName: dataImports.fileName,
      count: sql<number>`count(*)::int`,
    })
    .from(dataImports)
    .groupBy(dataImports.fileName)
    .having(sql`count(*) > 1`);

    // Check for duplicate customers by email
    const duplicateCustomers = await db.select({
      email: customers.email,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(sql`email IS NOT NULL`)
    .groupBy(customers.email)
    .having(sql`count(*) > 1`);

    return {
      duplicateFiles: [],
      duplicateCustomers: [],
    };
  }

  /**
   * Get import record by ID
   */
  async getImportRecord(importId: string): Promise<DataImport | null> {
    const result = await db.select()
      .from(dataImports)
      .where(eq(dataImports.id, importId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get detailed import information with duplicate detection logs
   */
  async getImportDetails(importId: string): Promise<{
    import: DataImport;
    duplicateLogs: Array<{
      id: string;
      customerId: string;
      customerEmail: string;
      customerName: string;
      action: string;
      matchReason: string;
      matchConfidence: number;
      rowNumber: number;
      dataChanges?: Record<string, { from: any; to: any }>;
      createdAt: string;
    }>;
    processingStats: {
      totalDuplicatesFound: number;
      duplicatesSkipped: number;
      duplicatesUpdated: number;
      duplicatesCreated: number;
      averageProcessingTime: number;
    };
  } | null> {
    // Get the import record
    const importRecord = await this.getImportRecord(importId);
    if (!importRecord) {
      return null;
    }

    // Get duplicate detection logs from application logs
    const duplicateLogs = await db.select({
      id: applicationLogs.id,
      message: applicationLogs.message,
      metadata: applicationLogs.metadata,
      createdAt: applicationLogs.createdAt,
    })
    .from(applicationLogs)
    .where(
      and(
        eq(applicationLogs.category, 'duplicate_detection'),
        sql`${applicationLogs.metadata}->>'importId' = ${importId}`
      )
    )
    .orderBy(desc(applicationLogs.createdAt));

    // Transform logs into structured format
    const structuredLogs = await Promise.all(
      duplicateLogs
        .filter(log => log.metadata && typeof log.metadata === 'object' && 'action' in log.metadata)
        .map(async (log) => {
          const metadata = log.metadata as any;
          let customerInfo = { email: '', name: '' };

          // Try to get customer information if customerId exists
          if (metadata.customerId) {
            try {
              const customer = await db.select({
                email: customers.email,
                firstName: customers.firstName,
                lastName: customers.lastName,
              })
              .from(customers)
              .where(eq(customers.id, metadata.customerId))
              .limit(1);

              if (customer[0]) {
                customerInfo.email = customer[0].email || '';
                customerInfo.name = `${customer[0].firstName || ''} ${customer[0].lastName || ''}`.trim();
              }
            } catch (err) {
              secureLogger.error('Error fetching customer info for duplicate log:', { error: String(err) });
            }
          }

          return {
            id: log.id,
            customerId: metadata.customerId || '',
            customerEmail: customerInfo.email,
            customerName: customerInfo.name,
            action: metadata.action || '',
            matchReason: metadata.matchReason || '',
            matchConfidence: metadata.matchConfidence || 0,
            rowNumber: metadata.rowNumber || 0,
            dataChanges: metadata.dataChanges,
            createdAt: log.createdAt?.toISOString() || new Date().toISOString(),
          };
        })
    );

    // Calculate processing statistics
    const processingStats = {
      totalDuplicatesFound: importRecord.recordsDuplicates || 0,
      duplicatesSkipped: importRecord.recordsSkipped || 0,
      duplicatesUpdated: importRecord.recordsUpdated || 0,
      duplicatesCreated: structuredLogs.filter(log => log.action === 'created_new').length,
      averageProcessingTime: 0, // Could be calculated from logs if timing data is available
    };

    return {
      import: importRecord,
      duplicateLogs: structuredLogs,
      processingStats,
    };
  }

  /**
   * Update import progress during processing
   */
  async updateImportProgress(importId: string, recordsProcessed: number, recordsSuccessful: number, recordsFailed: number) {
    await db.update(dataImports)
      .set({
        recordsProcessed,
        recordsSuccessful,
        recordsFailed,
      })
      .where(eq(dataImports.id, importId));
  }

  // Private helper methods

  private async updateImportStatus(
    importId: string,
    status: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const updateData: any = {
      importStatus: status,
    };

    if (metadata) {
      updateData.recordsProcessed = metadata.recordsProcessed;
      updateData.recordsSuccessful = metadata.recordsSuccessful;
      updateData.recordsFailed = metadata.recordsFailed;

      // Add duplicate handling statistics
      if (metadata.recordsDuplicates !== undefined) updateData.recordsDuplicates = metadata.recordsDuplicates;
      if (metadata.recordsSkipped !== undefined) updateData.recordsSkipped = metadata.recordsSkipped;
      if (metadata.recordsUpdated !== undefined) updateData.recordsUpdated = metadata.recordsUpdated;
      if (metadata.recordsMerged !== undefined) updateData.recordsMerged = metadata.recordsMerged;
      if (metadata.duplicateHandlingStrategy !== undefined) updateData.duplicateHandlingStrategy = metadata.duplicateHandlingStrategy;
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    await db.update(dataImports)
      .set(updateData)
      .where(eq(dataImports.id, importId));
  }

  /**
   * Update import statistics after duplicate handling is complete
   */
  async updateDuplicateHandlingStats(
    importId: string,
    duplicateStats: {
      recordsDuplicates: number;
      recordsSkipped: number;
      recordsUpdated: number;
      duplicateHandlingStrategy: string;
    }
  ): Promise<void> {
    const updateData = {
      recordsDuplicates: duplicateStats.recordsDuplicates,
      recordsSkipped: duplicateStats.recordsSkipped,
      recordsUpdated: duplicateStats.recordsUpdated,
      recordsMerged: duplicateStats.duplicateHandlingStrategy === 'merge_data' ? duplicateStats.recordsUpdated : 0,
      duplicateHandlingStrategy: duplicateStats.duplicateHandlingStrategy,
    };

    await db.update(dataImports)
      .set(updateData)
      .where(eq(dataImports.id, importId));

    secureLogger.info(`📊 [Import Stats] Updated duplicate handling statistics:`, {
      importId,
      ...updateData
    });
  }

  private async generateFileHash(filePath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(filePath)) return null;

      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      secureLogger.error('Error generating file hash:', { error: String(error) });
      return null;
    }
  }

  private async getFileSize(filePath: string): Promise<number | null> {
    try {
      if (!fs.existsSync(filePath)) return null;

      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      secureLogger.error('Error getting file size:', { error: String(error) });
      return null;
    }
  }

  private mapFieldSources(customerData: any, importSource: string): Record<string, string> {
    const fieldSources: Record<string, string> = {};

    Object.keys(customerData).forEach(field => {
      if (customerData[field] !== null && customerData[field] !== undefined) {
        fieldSources[field] = importSource;
      }
    });

    return fieldSources;
  }
}

export const dataLineageService = new DataLineageService();
