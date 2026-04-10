/**
 * Record Service — Lite CDP v2
 *
 * CRUD operations for records within data streams:
 * bulk insert with idempotency, paginated retrieval with JSONB filtering,
 * cluster-aware queries, and bulk deletion for re-imports.
 */

import { db } from '../../db';
import { records, dataStreams, identityClusters, identityLinks } from '@shared/schema-v2';
import { eq, and, sql, desc, asc, count } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';
  value: unknown;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class RecordService {
  private readonly BATCH_SIZE = 100;

  // ─── Create ─────────────────────────────────────────────────────────────────

  /**
   * Bulk-insert records in batches of 100.
   * Uses ON CONFLICT DO NOTHING keyed on idempotency_key for safe re-imports.
   * Returns inserted count, duplicate count, and any per-row error messages.
   */
  async bulkInsertRecords(params: {
    streamId: string;
    projectId: string;
    importId?: string;
    records: Array<{
      attributes: Record<string, unknown>;
      originalSourceData?: Record<string, unknown>;
      idempotencyKey?: string;
    }>;
  }): Promise<{ inserted: number; duplicates: number; errors: string[] }> {
    let inserted = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // Split into batches
    const batches: (typeof params.records) = params.records;
    for (let i = 0; i < batches.length; i += this.BATCH_SIZE) {
      const batch = batches.slice(i, i + this.BATCH_SIZE);

      try {
        const values = batch.map((r) => ({
          streamId: params.streamId,
          projectId: params.projectId,
          importId: params.importId ?? null,
          attributes: r.attributes,
          originalSourceData: r.originalSourceData ?? null,
          idempotencyKey: r.idempotencyKey ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        // Use onConflictDoNothing for idempotency on idempotency_key
        const result = await db
          .insert(records)
          .values(values)
          .onConflictDoNothing()
          .returning({ id: records.id });

        const batchInserted = result.length;
        const batchDuplicates = batch.length - batchInserted;
        inserted += batchInserted;
        duplicates += batchDuplicates;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Batch ${Math.floor(i / this.BATCH_SIZE) + 1} failed: ${msg}`);
      }
    }

    return { inserted, duplicates, errors };
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /**
   * Get paginated records for a stream, with optional sorting and JSONB attribute filtering.
   * Supported filter operators: eq, ne, gt, lt, contains (ILIKE).
   */
  async getRecords(
    streamId: string,
    params: {
      page?: number;
      pageSize?: number;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
      filters?: FilterCondition[];
    } = {},
  ): Promise<{
    records: (typeof records.$inferSelect)[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    // Build WHERE conditions
    const conditions = [eq(records.streamId, streamId)];

    for (const filter of params.filters ?? []) {
      const safeField = filter.field.replace(/[^a-zA-Z0-9_]/g, ''); // sanitize field name
      const strValue = String(filter.value);

      switch (filter.operator) {
        case 'eq':
          conditions.push(
            sql`${records.attributes}->>${safeField} = ${strValue}`,
          );
          break;
        case 'ne':
          conditions.push(
            sql`${records.attributes}->>${safeField} != ${strValue}`,
          );
          break;
        case 'gt':
          conditions.push(
            sql`(${records.attributes}->>${safeField})::numeric > ${strValue}::numeric`,
          );
          break;
        case 'lt':
          conditions.push(
            sql`(${records.attributes}->>${safeField})::numeric < ${strValue}::numeric`,
          );
          break;
        case 'contains':
          conditions.push(
            sql`${records.attributes}->>${safeField} ILIKE ${'%' + strValue + '%'}`,
          );
          break;
      }
    }

    // Count total (without pagination)
    const [countRow] = await db
      .select({ value: count() })
      .from(records)
      .where(and(...conditions));

    const total = Number(countRow?.value ?? 0);

    // Build ORDER BY
    let orderExpr;
    if (params.sortField) {
      const safeSort = params.sortField.replace(/[^a-zA-Z0-9_]/g, '');
      const dir = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
      // Sort on JSONB attribute field
      orderExpr = sql.raw(`attributes->>'${safeSort}' ${dir}`);
    } else {
      orderExpr = desc(records.createdAt);
    }

    const rows = await db
      .select()
      .from(records)
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(pageSize)
      .offset(offset);

    return { records: rows, total, page, pageSize };
  }

  /**
   * Get a single record by ID. Returns null if not found.
   */
  async getRecord(recordId: string): Promise<typeof records.$inferSelect | null> {
    const [row] = await db
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Get all records linked to an identity cluster, including the stream name.
   */
  async getClusterRecords(
    clusterId: string,
  ): Promise<(typeof records.$inferSelect & { streamName: string })[]> {
    const rows = await db
      .select({
        // Spread all record columns
        id: records.id,
        streamId: records.streamId,
        projectId: records.projectId,
        importId: records.importId,
        attributes: records.attributes,
        originalSourceData: records.originalSourceData,
        idempotencyKey: records.idempotencyKey,
        identityClusterId: records.identityClusterId,
        createdAt: records.createdAt,
        updatedAt: records.updatedAt,
        // Join stream name
        streamName: dataStreams.name,
      })
      .from(records)
      .innerJoin(identityLinks, eq(identityLinks.recordId, records.id))
      .innerJoin(dataStreams, eq(dataStreams.id, records.streamId))
      .where(eq(identityLinks.clusterId, clusterId))
      .orderBy(desc(records.createdAt));

    return rows;
  }

  /**
   * Count records per stream for a project, with stream names.
   */
  async getRecordCountsByStream(
    projectId: string,
  ): Promise<Array<{ streamId: string; streamName: string; count: number }>> {
    const rows = await db
      .select({
        streamId: records.streamId,
        streamName: dataStreams.name,
        count: count(),
      })
      .from(records)
      .innerJoin(dataStreams, eq(dataStreams.id, records.streamId))
      .where(eq(records.projectId, projectId))
      .groupBy(records.streamId, dataStreams.name)
      .orderBy(desc(count()));

    return rows.map((r) => ({
      streamId: r.streamId,
      streamName: r.streamName,
      count: Number(r.count),
    }));
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  /**
   * Delete all records for a stream (e.g. before a full re-import).
   * Returns the number of records deleted.
   */
  async deleteStreamRecords(streamId: string): Promise<number> {
    const deleted = await db
      .delete(records)
      .where(eq(records.streamId, streamId))
      .returning({ id: records.id });

    return deleted.length;
  }
}

export const recordService = new RecordService();
