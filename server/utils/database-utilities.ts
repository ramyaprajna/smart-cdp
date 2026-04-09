/**
 * Database Utilities - Common Database Operations
 *
 * Centralized utilities for common database patterns including:
 * - Record existence validation
 * - Batch processing operations
 * - Transaction management
 * - Common query patterns
 * - Data integrity checks
 *
 * Created: August 13, 2025
 * Purpose: Standardize database operations and reduce duplication
 */

import { db } from '../db';
import { eq, and, isNull, or } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { secureLogger } from '../utils/secure-logger';

export interface RecordExistenceResult {
  exists: boolean;
  record?: any;
}

export interface BatchProcessingOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  continueOnError?: boolean;
}

export interface NullAnalysisResult {
  totalRecords: number;
  completelyNullRecords: number;
  partiallyNullRecords: number;
  nullFields: string[];
}

/**
 * Record validation utilities
 */
export class RecordValidator {
  static async checkExists(
    table: any,
    conditions: any
  ): Promise<RecordExistenceResult> {
    try {
      const records = await db.select().from(table).where(conditions).limit(1);
      return {
        exists: records.length > 0,
        record: records[0] || null
      };
    } catch (error) {
      secureLogger.error('Error checking record existence:', { error: String(error) });
      return { exists: false };
    }
  }

  static async validateRecordExists(
    table: any,
    conditions: any,
    errorMessage: string
  ): Promise<any> {
    const result = await this.checkExists(table, conditions);
    if (!result.exists) {
      throw new Error(errorMessage);
    }
    return result.record;
  }
}

/**
 * Batch processing utilities
 */
export class BatchProcessor {
  static async processInBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: BatchProcessingOptions = {}
  ): Promise<R[]> {
    const {
      batchSize = 100,
      delayBetweenBatches = 0,
      continueOnError = false
    } = options;

    const results: R[] = [];
    const errors: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      try {
        secureLogger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}: ${batch.length} items`);

        const batchResults = await processor(batch);
        results.push(...batchResults);

        if (delayBetweenBatches > 0 && i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      } catch (error) {
        secureLogger.error(`Batch processing error for batch starting at index ${i}:`, { error: String(error) });
        errors.push({ batchStart: i, error });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    if (errors.length > 0 && continueOnError) {
      secureLogger.warn(`Batch processing completed with ${errors.length} errors:`, errors);
    }

    return results;
  }
}

/**
 * Status update utilities
 */
export class StatusUpdater {
  static async updateRecordStatus(
    table: any,
    id: string,
    status: string,
    additionalFields?: Record<string, any>
  ) {
    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalFields
    };

    await db.update(table)
      .set(updateData)
      .where(eq(table.id, id));
  }

  static async updateImportStatus(
    importId: string,
    status: 'preview' | 'processing' | 'completed' | 'failed',
    additionalData?: Record<string, any>
  ) {
    const { dataImports } = await import('@shared/schema');

    const updateData = {
      importStatus: status,
      updatedAt: new Date(),
      ...additionalData
    };

    await db.update(dataImports)
      .set(updateData)
      .where(eq(dataImports.id, importId));
  }
}

/**
 * NULL record analysis utilities
 */
export class NullRecordAnalyzer {
  static async analyzeNullCustomers(importId: string): Promise<NullAnalysisResult> {
    const { customers } = await import('@shared/schema');

    const records = await db.select()
      .from(customers)
      .where(eq(customers.importId, importId));

    const totalRecords = records.length;
    const completelyNullRecords = records.filter(r =>
      !r.firstName && !r.lastName && !r.email && !r.phoneNumber
    ).length;

    const partiallyNullRecords = totalRecords - completelyNullRecords;

    // Analyze which fields are NULL
    const nullFields: string[] = [];
    const fieldChecks = [
      { field: 'firstName', check: (r: any) => !r.firstName },
      { field: 'lastName', check: (r: any) => !r.lastName },
      { field: 'email', check: (r: any) => !r.email },
      { field: 'phoneNumber', check: (r: any) => !r.phoneNumber },
      { field: 'customerSegment', check: (r: any) => !r.customerSegment }
    ];

    for (const { field, check } of fieldChecks) {
      const nullCount = records.filter(check).length;
      if (nullCount > totalRecords * 0.1) { // More than 10% NULL
        nullFields.push(field);
      }
    }

    return {
      totalRecords,
      completelyNullRecords,
      partiallyNullRecords,
      nullFields
    };
  }

  static async deleteNullRecords(importId: string): Promise<number> {
    const { customers } = await import('@shared/schema');

    const deleteResult = await db.delete(customers)
      .where(and(
        eq(customers.importId, importId),
        isNull(customers.firstName),
        isNull(customers.lastName),
        isNull(customers.email)
      ));

    return deleteResult.rowCount || 0;
  }
}

/**
 * Data aggregation utilities
 */
export class DataAggregator {
  static async getDistribution(
    table: any,
    field: string,
    conditions?: any
  ): Promise<Record<string, number>> {
    try {
      const records = conditions
        ? await db.select().from(table).where(conditions)
        : await db.select().from(table);

      const distribution: Record<string, number> = {};

      records.forEach((record: any) => {
        const value = record[field] || 'Unknown';
        distribution[value] = (distribution[value] || 0) + 1;
      });

      return distribution;
    } catch (error) {
      secureLogger.error(`Error getting distribution for field ${field}:`, { error: String(error) });
      return {};
    }
  }

  static calculateAverages(records: any[], fields: string[]): Record<string, number> {
    const averages: Record<string, number> = {};

    fields.forEach(field => {
      const values = records
        .map(r => r[field])
        .filter(v => v != null && !isNaN(Number(v)))
        .map(Number);

      averages[field] = values.length > 0
        ? values.reduce((sum, val) => sum + val, 0) / values.length
        : 0;
    });

    return averages;
  }
}

/**
 * Transaction management utilities
 */
export class TransactionManager {
  static async executeInTransaction<T>(
    operation: (tx: any) => Promise<T>
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      return await operation(tx);
    });
  }

  static async executeSafely<T>(
    operation: () => Promise<T>,
    rollbackOperation?: () => Promise<void>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (rollbackOperation) {
        try {
          await rollbackOperation();
        } catch (rollbackError) {
          secureLogger.error('Rollback operation failed:', { error: String(rollbackError) });
        }
      }
      throw error;
    }
  }
}
