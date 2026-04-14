/**
 * Data Stream Service — Lite CDP v2
 *
 * CRUD operations for data streams: creation, schema configuration,
 * status transitions (draft → active → archived), and statistics.
 */

import { db } from '../../db';
import { dataStreams, records, dataImportsV2, identityClusters, identityLinks } from '@shared/schema-v2';
import { eq, and, sql, count, desc } from 'drizzle-orm';
import type { EntityType, SourceType, StreamStatus, FieldDefinition, IdentityField } from '@shared/schema-v2';

export class DataStreamService {
  // ─── Create ─────────────────────────────────────────────────────────────────

  /**
   * Create a new data stream. Starts with status = 'draft'.
   */
  async createStream(params: {
    projectId: string;
    name: string;
    description?: string;
    sourceType: SourceType;
  }): Promise<typeof dataStreams.$inferSelect> {
    const [stream] = await db
      .insert(dataStreams)
      .values({
        projectId: params.projectId,
        name: params.name,
        description: params.description ?? null,
        sourceType: params.sourceType,
        status: 'draft',
        totalRecords: 0,
        identifiedRecords: 0,
        createdAt: new Date(),
      })
      .returning();

    return stream;
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /**
   * Get a single stream by its ID. Returns null if not found.
   */
  async getStream(streamId: string): Promise<typeof dataStreams.$inferSelect | null> {
    const [stream] = await db
      .select()
      .from(dataStreams)
      .where(eq(dataStreams.id, streamId))
      .limit(1);

    return stream ?? null;
  }

  /**
   * List all streams for a project, optionally filtered by status.
   */
  async listStreams(
    projectId: string,
    status?: StreamStatus,
  ): Promise<(typeof dataStreams.$inferSelect)[]> {
    const conditions = [eq(dataStreams.projectId, projectId)];
    if (status) {
      conditions.push(eq(dataStreams.status, status));
    }

    return db
      .select()
      .from(dataStreams)
      .where(and(...conditions))
      .orderBy(desc(dataStreams.createdAt));
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  /**
   * Update a stream's schema and configuration.
   * Only allowed when status = 'draft'; throws otherwise.
   */
  async updateStreamSchema(
    streamId: string,
    params: {
      entityType?: EntityType;
      schemaDefinition?: { version: string; fields: FieldDefinition[] };
      identityFields?: IdentityField[];
      aiAnalysis?: Record<string, unknown>;
    },
  ): Promise<typeof dataStreams.$inferSelect> {
    const existing = await this.getStream(streamId);
    if (!existing) {
      throw new Error(`Stream not found: ${streamId}`);
    }
    if (existing.status !== 'draft') {
      throw new Error(
        `Stream "${streamId}" is in status "${existing.status}". Schema can only be updated when status is "draft".`,
      );
    }

    const updates: Partial<typeof dataStreams.$inferInsert> = {};

    if (params.entityType !== undefined) updates.entityType = params.entityType;
    if (params.schemaDefinition !== undefined) updates.schemaDefinition = params.schemaDefinition;
    if (params.identityFields !== undefined) updates.identityFields = params.identityFields;
    if (params.aiAnalysis !== undefined) updates.aiAnalysis = params.aiAnalysis;

    const [updated] = await db
      .update(dataStreams)
      .set(updates)
      .where(eq(dataStreams.id, streamId))
      .returning();

    return updated;
  }

  // ─── Status transitions ──────────────────────────────────────────────────────

  /**
   * Activate a stream (draft → active).
   * Requires the stream to have a defined entityType and at least one identity field.
   */
  async activateStream(streamId: string): Promise<typeof dataStreams.$inferSelect> {
    const existing = await this.getStream(streamId);
    if (!existing) {
      throw new Error(`Stream not found: ${streamId}`);
    }
    if (existing.status !== 'draft') {
      throw new Error(
        `Stream "${streamId}" cannot be activated from status "${existing.status}". Expected "draft".`,
      );
    }
    if (!existing.entityType) {
      throw new Error(`Stream "${streamId}" must have an entityType set before activation.`);
    }

    const [updated] = await db
      .update(dataStreams)
      .set({ status: 'active', activatedAt: new Date() })
      .where(eq(dataStreams.id, streamId))
      .returning();

    return updated;
  }

  /**
   * Archive a stream (active → archived).
   */
  async archiveStream(streamId: string): Promise<typeof dataStreams.$inferSelect> {
    const existing = await this.getStream(streamId);
    if (!existing) {
      throw new Error(`Stream not found: ${streamId}`);
    }
    if (existing.status !== 'active') {
      throw new Error(
        `Stream "${streamId}" cannot be archived from status "${existing.status}". Expected "active".`,
      );
    }

    const [updated] = await db
      .update(dataStreams)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(eq(dataStreams.id, streamId))
      .returning();

    return updated;
  }

  // ─── Statistics ──────────────────────────────────────────────────────────────

  /**
   * Return aggregate statistics for a stream:
   * total records, identified records, identity rate, and cluster count.
   */
  async getStreamStats(streamId: string): Promise<{
    totalRecords: number;
    identifiedRecords: number;
    identityRate: number;
    clusterCount: number;
  }> {
    const existing = await this.getStream(streamId);
    if (!existing) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Count total records in this stream
    const [totalRow] = await db
      .select({ value: count() })
      .from(records)
      .where(eq(records.streamId, streamId));

    // Count records that have an assigned identity cluster
    const [identifiedRow] = await db
      .select({ value: count() })
      .from(records)
      .where(
        and(
          eq(records.streamId, streamId),
          sql`${records.identityClusterId} IS NOT NULL`,
        ),
      );

    // Count distinct clusters linked to records in this stream
    const [clusterRow] = await db
      .select({ value: sql<number>`COUNT(DISTINCT ${identityLinks.identityClusterId})` })
      .from(identityLinks)
      .innerJoin(records, eq(identityLinks.recordId, records.id))
      .where(eq(records.streamId, streamId));

    const total = Number(totalRow?.value ?? 0);
    const identified = Number(identifiedRow?.value ?? 0);
    const clusterCount = Number(clusterRow?.value ?? 0);
    const identityRate = total > 0 ? identified / total : 0;

    return {
      totalRecords: total,
      identifiedRecords: identified,
      identityRate,
      clusterCount,
    };
  }

  /**
   * Recount and persist totalRecords / identifiedRecords on the stream row.
   * Call this after any import or identity-resolution batch completes.
   */
  async updateStreamCounts(streamId: string): Promise<void> {
    const [totalRow] = await db
      .select({ value: count() })
      .from(records)
      .where(eq(records.streamId, streamId));

    const [identifiedRow] = await db
      .select({ value: count() })
      .from(records)
      .where(
        and(
          eq(records.streamId, streamId),
          sql`${records.identityClusterId} IS NOT NULL`,
        ),
      );

    await db
      .update(dataStreams)
      .set({
        totalRecords: Number(totalRow?.value ?? 0),
        identifiedRecords: Number(identifiedRow?.value ?? 0),
      })
      .where(eq(dataStreams.id, streamId));
  }
}

export const dataStreamService = new DataStreamService();
