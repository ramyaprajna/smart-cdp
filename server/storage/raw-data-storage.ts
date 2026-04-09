import { rawDataImports, type RawDataImport, type InsertRawDataImport } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { secureLogger } from "../utils/secure-logger";
import { UserStorageBase } from "./user-storage-base";

export abstract class RawDataStorageBase extends UserStorageBase {
  async getRawDataImports(importSessionId: string, limit?: number, offset?: number): Promise<RawDataImport[]> {
    try {
      const baseQuery = db.select().from(rawDataImports).where(eq(rawDataImports.importSessionId, importSessionId));

      if (limit !== undefined && offset !== undefined) {
        return await baseQuery.limit(limit).offset(offset);
      } else if (limit !== undefined) {
        return await baseQuery.limit(limit);
      } else if (offset !== undefined) {
        return await baseQuery.offset(offset);
      } else {
        return await baseQuery;
      }
    } catch (error) {
      secureLogger.error('Failed to get raw data imports', { error: error instanceof Error ? error.message : String(error) }, 'STORAGE');
      throw new Error('Failed to retrieve import data');
    }
  }

  async createRawDataImport(rawData: InsertRawDataImport): Promise<RawDataImport> {
    try {
      const [result] = await db.insert(rawDataImports).values(rawData).returning();
      return result;
    } catch (error) {
      secureLogger.error('Failed to create raw data import', { error: error instanceof Error ? error.message : String(error) }, 'STORAGE');
      if (error instanceof Error && error.message.includes('duplicate key')) {
        throw new Error('Import data already exists');
      }
      throw new Error('Failed to save import data');
    }
  }

  async getRawDataStats(importSessionId: string): Promise<{
    totalRows: number;
    pendingRows: number;
    processedRows: number;
    failedRows: number;
  }> {
    try {
      const stats = await db.select({
        totalRows: sql<number>`count(*)`,
        pendingRows: sql<number>`count(*) filter (where processing_status = 'pending')`,
        processedRows: sql<number>`count(*) filter (where processing_status = 'processed')`,
        failedRows: sql<number>`count(*) filter (where processing_status = 'failed')`
      })
      .from(rawDataImports)
      .where(eq(rawDataImports.importSessionId, importSessionId));

      return stats[0] || { totalRows: 0, pendingRows: 0, processedRows: 0, failedRows: 0 };
    } catch (error) {
      secureLogger.error('Failed to get raw data stats', { error: error instanceof Error ? error.message : String(error) }, 'STORAGE');
      return { totalRows: 0, pendingRows: 0, processedRows: 0, failedRows: 0 };
    }
  }

  async markRawDataProcessed(rawDataIds: string[], status: 'processed' | 'failed' | 'skipped' = 'processed'): Promise<void> {
    try {
      await db.update(rawDataImports)
        .set({
          processingStatus: status,
          processedAt: new Date()
        })
        .where(sql`${rawDataImports.id} = ANY(${rawDataIds})`);
    } catch (error) {
      secureLogger.error('[Storage] Failed to mark raw data as processed:', { error: String(error) });
      throw new Error('Failed to update processing status');
    }
  }
}
