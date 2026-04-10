/**
 * Identity Cluster Service — Lite CDP v2
 *
 * CRUD operations for identity clusters: creation, identifier-based lookup,
 * record linking/unlinking, cluster merging, label generation, and statistics.
 */

import { db } from '../../db';
import { identityClusters, identityLinks, records, dataStreams } from '@shared/schema-v2';
import { eq, and, sql, desc, count, gte, ilike } from 'drizzle-orm';
import type { ClusterIdentifier, MergeHistoryEntry, IdentifierType } from '@shared/schema-v2';

export class IdentityClusterService {
  // ─── Create ─────────────────────────────────────────────────────────────────

  /**
   * Create a new identity cluster with an initial set of identifiers.
   */
  async createCluster(params: {
    projectId: string;
    primaryLabel?: string;
    identifiers: ClusterIdentifier[];
  }): Promise<typeof identityClusters.$inferSelect> {
    const [cluster] = await db
      .insert(identityClusters)
      .values({
        projectId: params.projectId,
        primaryLabel: params.primaryLabel ?? null,
        identifiers: params.identifiers,
        mergeHistory: [],
        recordCount: 0,
        streamCount: 0,
        avgConfidence: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return cluster;
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /**
   * Find a cluster by an exact identifier match (type + value) within a project.
   * Uses JSONB containment: identifiers @> '[{"type":..., "value":...}]'::jsonb
   */
  async findClusterByIdentifier(
    projectId: string,
    identifierType: IdentifierType,
    value: string,
  ): Promise<typeof identityClusters.$inferSelect | null> {
    const searchJson = JSON.stringify([{ type: identifierType, value }]);

    const [cluster] = await db
      .select()
      .from(identityClusters)
      .where(
        and(
          eq(identityClusters.projectId, projectId),
          sql`${identityClusters.identifiers} @> ${searchJson}::jsonb`,
        ),
      )
      .limit(1);

    return cluster ?? null;
  }

  /**
   * List clusters for a project with optional pagination, minimum stream count filter,
   * and primary_label search.
   */
  async listClusters(
    projectId: string,
    params: {
      page?: number;
      pageSize?: number;
      minStreamCount?: number;
      search?: string;
    } = {},
  ): Promise<{
    clusters: (typeof identityClusters.$inferSelect)[];
    total: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(identityClusters.projectId, projectId)];

    if (params.minStreamCount !== undefined && params.minStreamCount > 0) {
      conditions.push(gte(identityClusters.streamCount, params.minStreamCount));
    }

    if (params.search) {
      conditions.push(ilike(identityClusters.primaryLabel, `%${params.search}%`));
    }

    const [countRow] = await db
      .select({ value: count() })
      .from(identityClusters)
      .where(and(...conditions));

    const total = Number(countRow?.value ?? 0);

    const clusters = await db
      .select()
      .from(identityClusters)
      .where(and(...conditions))
      .orderBy(desc(identityClusters.recordCount))
      .limit(pageSize)
      .offset(offset);

    return { clusters, total };
  }

  /**
   * Get a cluster with all its linked records (including stream name).
   */
  async getClusterDetail(clusterId: string): Promise<{
    cluster: typeof identityClusters.$inferSelect;
    records: Array<typeof records.$inferSelect & { streamName: string }>;
  }> {
    const [cluster] = await db
      .select()
      .from(identityClusters)
      .where(eq(identityClusters.id, clusterId))
      .limit(1);

    if (!cluster) {
      throw new Error(`Identity cluster not found: ${clusterId}`);
    }

    const linkedRecords = await db
      .select({
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
        streamName: dataStreams.name,
      })
      .from(records)
      .innerJoin(identityLinks, eq(identityLinks.recordId, records.id))
      .innerJoin(dataStreams, eq(dataStreams.id, records.streamId))
      .where(eq(identityLinks.clusterId, clusterId))
      .orderBy(desc(records.createdAt));

    return { cluster, records: linkedRecords };
  }

  // ─── Link / Unlink ───────────────────────────────────────────────────────────

  /**
   * Link a record to a cluster. Also sets records.identity_cluster_id and
   * refreshes cluster statistics.
   */
  async linkRecord(params: {
    recordId: string;
    clusterId: string;
    linkType: 'auto_matched' | 'manual_linked' | 'ai_suggested' | 'merge_result';
    confidence: number;
    matchedIdentifierType?: string;
    matchedIdentifierValue?: string;
    linkedBy?: string;
    notes?: string;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      // Upsert the identity link
      await tx
        .insert(identityLinks)
        .values({
          recordId: params.recordId,
          clusterId: params.clusterId,
          linkType: params.linkType,
          confidence: params.confidence,
          matchedIdentifierType: params.matchedIdentifierType ?? null,
          matchedIdentifierValue: params.matchedIdentifierValue ?? null,
          linkedBy: params.linkedBy ?? null,
          notes: params.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [identityLinks.recordId, identityLinks.clusterId],
          set: {
            linkType: params.linkType,
            confidence: params.confidence,
            matchedIdentifierType: params.matchedIdentifierType ?? null,
            matchedIdentifierValue: params.matchedIdentifierValue ?? null,
            linkedBy: params.linkedBy ?? null,
            notes: params.notes ?? null,
            updatedAt: new Date(),
          },
        });

      // Set the denormalized FK on the record itself
      await tx
        .update(records)
        .set({ identityClusterId: params.clusterId, updatedAt: new Date() })
        .where(eq(records.id, params.recordId));
    });

    // Refresh cluster stats outside the transaction (non-critical)
    await this.updateClusterStats(params.clusterId);
  }

  /**
   * Unlink a record from its cluster. Clears the denormalized FK on the record.
   */
  async unlinkRecord(recordId: string): Promise<void> {
    // Find the current cluster for stats refresh later
    const [existingLink] = await db
      .select({ clusterId: identityLinks.clusterId })
      .from(identityLinks)
      .where(eq(identityLinks.recordId, recordId))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx
        .delete(identityLinks)
        .where(eq(identityLinks.recordId, recordId));

      await tx
        .update(records)
        .set({ identityClusterId: null, updatedAt: new Date() })
        .where(eq(records.id, recordId));
    });

    if (existingLink) {
      await this.updateClusterStats(existingLink.clusterId);
    }
  }

  // ─── Merge ───────────────────────────────────────────────────────────────────

  /**
   * Merge clusterB into clusterA:
   *  1. Move all identity_links from B → A
   *  2. Update records.identity_cluster_id from B → A
   *  3. Combine identifiers (deduplicate by type+value)
   *  4. Append to clusterA.merge_history
   *  5. Delete clusterB
   *  6. Refresh clusterA stats
   */
  async mergeClusters(
    clusterAId: string,
    clusterBId: string,
    mergedBy: string,
    reason?: string,
  ): Promise<typeof identityClusters.$inferSelect> {
    const [clusterA] = await db
      .select()
      .from(identityClusters)
      .where(eq(identityClusters.id, clusterAId))
      .limit(1);

    const [clusterB] = await db
      .select()
      .from(identityClusters)
      .where(eq(identityClusters.id, clusterBId))
      .limit(1);

    if (!clusterA) throw new Error(`Cluster A not found: ${clusterAId}`);
    if (!clusterB) throw new Error(`Cluster B not found: ${clusterBId}`);
    if (clusterAId === clusterBId) throw new Error('Cannot merge a cluster with itself.');

    await db.transaction(async (tx) => {
      // 1. Move all identity links from B → A (update or skip duplicates)
      await tx
        .update(identityLinks)
        .set({ clusterId: clusterAId, updatedAt: new Date() })
        .where(eq(identityLinks.clusterId, clusterBId));

      // 2. Update denormalized FK on records
      await tx
        .update(records)
        .set({ identityClusterId: clusterAId, updatedAt: new Date() })
        .where(eq(records.identityClusterId, clusterBId));

      // 3. Merge identifiers (deduplicate)
      const existingIds: ClusterIdentifier[] = (clusterA.identifiers as ClusterIdentifier[]) ?? [];
      const incomingIds: ClusterIdentifier[] = (clusterB.identifiers as ClusterIdentifier[]) ?? [];
      const merged = [...existingIds];
      for (const id of incomingIds) {
        const exists = merged.some((e) => e.type === id.type && e.value === id.value);
        if (!exists) merged.push(id);
      }

      // 4. Append to merge_history
      const historyEntry: MergeHistoryEntry = {
        mergedClusterId: clusterBId,
        mergedAt: new Date().toISOString(),
        mergedBy,
        reason: reason ?? null,
        recordCountAtMerge: clusterB.recordCount ?? 0,
      };
      const existingHistory: MergeHistoryEntry[] = (clusterA.mergeHistory as MergeHistoryEntry[]) ?? [];

      await tx
        .update(identityClusters)
        .set({
          identifiers: merged,
          mergeHistory: [...existingHistory, historyEntry],
          updatedAt: new Date(),
        })
        .where(eq(identityClusters.id, clusterAId));

      // 5. Delete cluster B
      await tx
        .delete(identityClusters)
        .where(eq(identityClusters.id, clusterBId));
    });

    // 6. Refresh stats + label
    await this.updateClusterStats(clusterAId);
    await this.updateClusterLabel(clusterAId);

    const [updated] = await db
      .select()
      .from(identityClusters)
      .where(eq(identityClusters.id, clusterAId))
      .limit(1);

    return updated;
  }

  // ─── Label & Stats ───────────────────────────────────────────────────────────

  /**
   * Auto-generate the cluster's primary_label from linked record attributes.
   * Priority: full name → first name → email → phone → identifier fallback.
   */
  async updateClusterLabel(clusterId: string): Promise<void> {
    const linkedRecords = await db
      .select({ attributes: records.attributes })
      .from(records)
      .innerJoin(identityLinks, eq(identityLinks.recordId, records.id))
      .where(eq(identityLinks.clusterId, clusterId))
      .limit(20); // Sample first 20 records

    let label: string | null = null;

    for (const record of linkedRecords) {
      const attrs = record.attributes as Record<string, unknown>;
      const name =
        (attrs['full_name'] as string | undefined) ||
        (attrs['fullName'] as string | undefined) ||
        (attrs['name'] as string | undefined);
      const firstName =
        (attrs['first_name'] as string | undefined) ||
        (attrs['firstName'] as string | undefined);
      const email = (attrs['email'] as string | undefined);
      const phone =
        (attrs['phone'] as string | undefined) ||
        (attrs['phone_number'] as string | undefined) ||
        (attrs['phoneNumber'] as string | undefined);

      if (name) { label = name; break; }
      if (firstName) { label = firstName; break; }
      if (email) { label = email; break; }
      if (phone) { label = phone; break; }
    }

    // Fallback: use cluster ID prefix if no label found from records
    if (!label) {
      // Try identifiers on the cluster itself
      const [cluster] = await db
        .select({ identifiers: identityClusters.identifiers })
        .from(identityClusters)
        .where(eq(identityClusters.id, clusterId))
        .limit(1);

      const ids = (cluster?.identifiers as ClusterIdentifier[]) ?? [];
      if (ids.length > 0) {
        label = `${ids[0].type}:${ids[0].value}`;
      } else {
        label = `cluster:${clusterId.slice(0, 8)}`;
      }
    }

    await db
      .update(identityClusters)
      .set({ primaryLabel: label, updatedAt: new Date() })
      .where(eq(identityClusters.id, clusterId));
  }

  /**
   * Recount and update record_count, stream_count, and avg_confidence on the cluster.
   */
  async updateClusterStats(clusterId: string): Promise<void> {
    // Total records linked
    const [recordCountRow] = await db
      .select({ value: count() })
      .from(identityLinks)
      .where(eq(identityLinks.clusterId, clusterId));

    // Distinct streams
    const [streamCountRow] = await db
      .select({
        value: sql<number>`COUNT(DISTINCT ${records.streamId})`,
      })
      .from(identityLinks)
      .innerJoin(records, eq(records.id, identityLinks.recordId))
      .where(eq(identityLinks.clusterId, clusterId));

    // Average confidence
    const [avgConfRow] = await db
      .select({
        value: sql<number>`AVG(${identityLinks.confidence})`,
      })
      .from(identityLinks)
      .where(eq(identityLinks.clusterId, clusterId));

    await db
      .update(identityClusters)
      .set({
        recordCount: Number(recordCountRow?.value ?? 0),
        streamCount: Number(streamCountRow?.value ?? 0),
        avgConfidence: parseFloat(String(avgConfRow?.value ?? 0)),
        updatedAt: new Date(),
      })
      .where(eq(identityClusters.id, clusterId));
  }
}

export const identityClusterService = new IdentityClusterService();
