import { db } from '../../db';
import { records, dataStreams, identityClusters, identityLinks } from '@shared/schema-v2';
import { eq, and, sql, ne, isNull, isNotNull } from 'drizzle-orm';
import type { IdentityField, ClusterIdentifier, IdentifierType } from '@shared/schema-v2';

const BATCH_SIZE = 100;

export class IdentityResolutionServiceV2 {

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Main entry point — resolve identities for all unlinked records in a stream.
   *
   * Flow:
   * 1. Load stream and its identity_fields configuration.
   * 2. If no identity fields are configured, all records are unresolvable.
   * 3. Fetch all unlinked records (identity_cluster_id IS NULL) for the stream.
   * 4. Process them in batches of 100.
   * 5. After all batches, update stream.identified_records count.
   */
  async resolveStream(streamId: string): Promise<{
    processedRecords: number;
    newClusters: number;
    linkedToExisting: number;
    unresolvable: number;
  }> {
    // 1. Load stream
    const [stream] = await db
      .select()
      .from(dataStreams)
      .where(eq(dataStreams.id, streamId))
      .limit(1);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const identityFields: IdentityField[] = (stream.identityFields as IdentityField[]) ?? [];

    // 2. No identity fields → nothing to resolve
    if (identityFields.length === 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(records)
        .where(eq(records.streamId, streamId));

      return {
        processedRecords: count,
        newClusters: 0,
        linkedToExisting: 0,
        unresolvable: count,
      };
    }

    // 3. Fetch all unlinked records
    const unlinkedRecords = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.streamId, streamId),
          isNull(records.identityClusterId)
        )
      );

    if (unlinkedRecords.length === 0) {
      return {
        processedRecords: 0,
        newClusters: 0,
        linkedToExisting: 0,
        unresolvable: 0,
      };
    }

    // 4. Process in batches
    let totalLinked = 0;
    let totalNewClusters = 0;
    let totalUnresolvable = 0;

    for (let i = 0; i < unlinkedRecords.length; i += BATCH_SIZE) {
      const batch = unlinkedRecords.slice(i, i + BATCH_SIZE);
      const { linked, newClusters } = await this.processBatch(batch, stream, stream.projectId);
      totalLinked += linked;
      totalNewClusters += newClusters;
    }

    // Records that couldn't be resolved (no identifiers extractable)
    totalUnresolvable = unlinkedRecords.length - totalLinked - (totalNewClusters > 0 ? 0 : 0);
    // Recalculate: every processed record either went to existing or created new
    const processedRecords = unlinkedRecords.length;
    const linkedToExisting = totalLinked - totalNewClusters;

    // 5. Update stream's identified_records count
    await db
      .update(dataStreams)
      .set({
        identifiedRecords: sql`${dataStreams.identifiedRecords} + ${totalLinked}`,
      })
      .where(eq(dataStreams.id, streamId));

    return {
      processedRecords,
      newClusters: totalNewClusters,
      linkedToExisting: Math.max(0, linkedToExisting),
      unresolvable: processedRecords - totalLinked,
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization
  // ---------------------------------------------------------------------------

  /**
   * Normalize an identifier value for consistent matching.
   *
   * - email       → lowercase + trim
   * - phone / wa_number → strip spaces/dashes/parens, convert Indonesian leading
   *                        "0" or bare "62" prefix to E.164 "+62"
   * - all others  → trim whitespace
   */
  private normalizeIdentifier(type: IdentifierType, value: string): string {
    const trimmed = value.trim();

    switch (type) {
      case 'email':
        return trimmed.toLowerCase();

      case 'phone':
      case 'wa_number': {
        // Strip formatting characters
        let normalized = trimmed.replace(/[\s\-().+]/g, '');

        // Indonesian number normalization
        // "081234567890" → "+6281234567890"
        if (/^0\d{8,12}$/.test(normalized)) {
          normalized = '+62' + normalized.slice(1);
        }
        // "6281234567890" (no leading +) → "+6281234567890"
        else if (/^62\d{8,12}$/.test(normalized)) {
          normalized = '+' + normalized;
        }
        // Already in E.164: "+628..." → keep as-is
        // International numbers (non-Indonesian) remain unchanged after strip

        return normalized;
      }

      default:
        return trimmed;
    }
  }

  // ---------------------------------------------------------------------------
  // Identifier extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract identifier values from a record's `attributes` object, guided by
   * the stream's `identity_fields` configuration.
   */
  private extractIdentifiers(
    attributes: Record<string, unknown>,
    identityFields: IdentityField[]
  ): Array<{ type: IdentifierType; value: string; originalValue: string }> {
    const result: Array<{ type: IdentifierType; value: string; originalValue: string }> = [];

    for (const field of identityFields) {
      const rawValue = attributes[field.key];

      if (rawValue === null || rawValue === undefined || rawValue === '') {
        continue;
      }

      const originalValue = String(rawValue);
      const normalized = this.normalizeIdentifier(field.identifierType as IdentifierType, originalValue);

      if (normalized.length > 0) {
        result.push({
          type: field.identifierType as IdentifierType,
          value: normalized,
          originalValue,
        });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Cluster lookup
  // ---------------------------------------------------------------------------

  /**
   * Find existing clusters that match any of the given identifiers using JSONB
   * containment queries.
   *
   * For each identifier we execute:
   *   WHERE identifiers @> '[{"type":"<type>","value":"<value>"}]'::jsonb
   *
   * Results are deduplicated by cluster id.
   */
  private async findMatchingClusters(
    projectId: string,
    identifiers: Array<{ type: IdentifierType; value: string }>
  ): Promise<Array<typeof identityClusters.$inferSelect>> {
    if (identifiers.length === 0) return [];

    const matched = new Map<string, typeof identityClusters.$inferSelect>();

    for (const { type, value } of identifiers) {
      const probe = JSON.stringify([{ type, value }]);

      const rows = await db
        .select()
        .from(identityClusters)
        .where(
          and(
            eq(identityClusters.projectId, projectId),
            sql`${identityClusters.identifiers} @> ${probe}::jsonb`
          )
        );

      for (const row of rows) {
        if (!matched.has(row.id)) {
          matched.set(row.id, row);
        }
      }
    }

    return Array.from(matched.values());
  }

  // ---------------------------------------------------------------------------
  // Cluster creation
  // ---------------------------------------------------------------------------

  /**
   * Create a new identity cluster seeded with the given identifiers.
   */
  private async createNewCluster(
    projectId: string,
    identifiers: ClusterIdentifier[],
    label?: string
  ): Promise<typeof identityClusters.$inferSelect> {
    const [cluster] = await db
      .insert(identityClusters)
      .values({
        projectId,
        identifiers,
        primaryLabel: label ?? null,
        recordCount: 0,
        streamCount: 0,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        mergeHistory: [],
      })
      .returning();

    return cluster;
  }

  // ---------------------------------------------------------------------------
  // Record ↔ cluster linking
  // ---------------------------------------------------------------------------

  /**
   * Link a record to an existing cluster.
   *
   * Steps:
   * 1. Insert a row into identity_links.
   * 2. Set records.identity_cluster_id.
   * 3. Update cluster stats (last_seen_at, record_count, stream_count).
   * 4. Merge any new identifiers discovered from this record into the cluster.
   */
  private async linkRecordToCluster(
    recordId: string,
    clusterId: string,
    matchedType: string,
    matchedValue: string,
    streamId: string,
    allRecordIdentifiers: ClusterIdentifier[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Insert identity link
      await tx.insert(identityLinks).values({
        recordId,
        identityClusterId: clusterId,
        linkType: 'auto_matched',
        linkConfidence: 1.0,
        matchedIdentifierType: matchedType,
        matchedIdentifierValue: matchedValue,
        linkedBy: 'system',
      });

      // 2. Update record
      await tx
        .update(records)
        .set({ identityClusterId: clusterId })
        .where(eq(records.id, recordId));

      // 3. Update cluster stats
      const [currentCluster] = await tx
        .select()
        .from(identityClusters)
        .where(eq(identityClusters.id, clusterId))
        .limit(1);

      if (!currentCluster) return;

      // Count distinct streams for this cluster
      const [{ streamCount }] = await tx
        .select({
          streamCount: sql<number>`count(distinct ${records.streamId})::int`,
        })
        .from(identityLinks)
        .innerJoin(records, eq(records.id, identityLinks.recordId))
        .where(eq(identityLinks.identityClusterId, clusterId));

      // 4. Merge new identifiers (deduplicate by type+value)
      const existingIdentifiers: ClusterIdentifier[] =
        (currentCluster.identifiers as ClusterIdentifier[]) ?? [];

      const existingKeys = new Set(
        existingIdentifiers.map((i) => `${i.type}:${i.value}`)
      );

      const newIdentifiers = allRecordIdentifiers.filter(
        (i) => !existingKeys.has(`${i.type}:${i.value}`)
      );

      const mergedIdentifiers = [...existingIdentifiers, ...newIdentifiers];

      await tx
        .update(identityClusters)
        .set({
          lastSeenAt: new Date(),
          recordCount: sql`${identityClusters.recordCount} + 1`,
          streamCount,
          identifiers: mergedIdentifiers,
          updatedAt: new Date(),
        })
        .where(eq(identityClusters.id, clusterId));
    });
  }

  // ---------------------------------------------------------------------------
  // Cluster merging
  // ---------------------------------------------------------------------------

  /**
   * Merge multiple clusters into a single surviving cluster.
   *
   * This happens when a single incoming record matches identifiers across
   * different existing clusters — meaning they all refer to the same person.
   *
   * Steps:
   * 1. Pick the cluster with the highest record_count as the primary.
   * 2. Combine all identifiers, deduplicated by type+value.
   * 3. Re-point all identity_links from absorbed clusters to the primary.
   * 4. Re-point all records from absorbed clusters to the primary.
   * 5. Record a merge_history entry on the primary.
   * 6. Delete absorbed clusters.
   * 7. Recompute primary cluster stats.
   *
   * Returns the surviving (primary) cluster id.
   */
  private async mergeClusters(
    clusterIds: string[],
    triggeredByRecordId: string
  ): Promise<string> {
    if (clusterIds.length === 0) throw new Error('No cluster ids provided for merge');
    if (clusterIds.length === 1) return clusterIds[0];

    return await db.transaction(async (tx) => {
      // 1. Load all clusters
      const clustersToMerge = await tx
        .select()
        .from(identityClusters)
        .where(sql`${identityClusters.id} = ANY(${clusterIds})`);

      // Pick primary: most records wins
      const primary = clustersToMerge.reduce((best, c) =>
        (c.recordCount ?? 0) >= (best.recordCount ?? 0) ? c : best
      );

      const absorbed = clustersToMerge.filter((c) => c.id !== primary.id);
      const absorbedIds = absorbed.map((c) => c.id);

      // 2. Combine identifiers (deduplicate)
      const allIdentifiers: ClusterIdentifier[] = [
        ...((primary.identifiers as ClusterIdentifier[]) ?? []),
      ];
      const seen = new Set(allIdentifiers.map((i) => `${i.type}:${i.value}`));

      for (const c of absorbed) {
        for (const ident of (c.identifiers as ClusterIdentifier[]) ?? []) {
          const key = `${ident.type}:${ident.value}`;
          if (!seen.has(key)) {
            seen.add(key);
            allIdentifiers.push(ident);
          }
        }
      }

      // 3. Re-point identity_links
      for (const absorbedId of absorbedIds) {
        await tx
          .update(identityLinks)
          .set({ identityClusterId: primary.id })
          .where(eq(identityLinks.identityClusterId, absorbedId));
      }

      // 4. Re-point records
      for (const absorbedId of absorbedIds) {
        await tx
          .update(records)
          .set({ identityClusterId: primary.id })
          .where(eq(records.identityClusterId, absorbedId));
      }

      // 5. Build merge_history entry
      const mergeHistory: unknown[] = (primary.mergeHistory as unknown[]) ?? [];
      mergeHistory.push({
        mergedAt: new Date().toISOString(),
        absorbedClusterIds: absorbedIds,
        triggeredByRecordId,
      });

      // 6. Delete absorbed clusters
      for (const absorbedId of absorbedIds) {
        await tx
          .delete(identityClusters)
          .where(eq(identityClusters.id, absorbedId));
      }

      // 7. Recompute primary stats
      const [{ recordCount }] = await tx
        .select({ recordCount: sql<number>`count(*)::int` })
        .from(records)
        .where(eq(records.identityClusterId, primary.id));

      const [{ streamCount }] = await tx
        .select({ streamCount: sql<number>`count(distinct ${records.streamId})::int` })
        .from(identityLinks)
        .innerJoin(records, eq(records.id, identityLinks.recordId))
        .where(eq(identityLinks.identityClusterId, primary.id));

      await tx
        .update(identityClusters)
        .set({
          identifiers: allIdentifiers,
          recordCount,
          streamCount,
          mergeHistory,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(identityClusters.id, primary.id));

      return primary.id;
    });
  }

  // ---------------------------------------------------------------------------
  // Label generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a human-readable display label for a cluster by inspecting the
   * attributes of its linked records.
   *
   * Priority: full_name → name → firstName+lastName → email → phone →
   *           first identifier value
   */
  private async generateClusterLabel(clusterId: string): Promise<string> {
    const clusterRecords = await db
      .select({ attributes: records.attributes })
      .from(records)
      .where(eq(records.identityClusterId, clusterId))
      .limit(10);

    for (const { attributes } of clusterRecords) {
      if (!attributes || typeof attributes !== 'object') continue;

      const attrs = attributes as Record<string, unknown>;

      const fullName = attrs['full_name'] ?? attrs['fullName'];
      if (fullName && typeof fullName === 'string' && fullName.trim()) {
        return fullName.trim();
      }

      const name = attrs['name'];
      if (name && typeof name === 'string' && name.trim()) {
        return name.trim();
      }

      const firstName = attrs['first_name'] ?? attrs['firstName'];
      const lastName = attrs['last_name'] ?? attrs['lastName'];
      if (firstName || lastName) {
        return [firstName, lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
      }

      const email = attrs['email'];
      if (email && typeof email === 'string' && email.trim()) {
        return email.trim().toLowerCase();
      }

      const phone = attrs['phone'] ?? attrs['phone_number'] ?? attrs['phoneNumber'];
      if (phone && typeof phone === 'string' && phone.trim()) {
        return phone.trim();
      }
    }

    // Fallback: use the first identifier stored on the cluster itself
    const [cluster] = await db
      .select({ identifiers: identityClusters.identifiers })
      .from(identityClusters)
      .where(eq(identityClusters.id, clusterId))
      .limit(1);

    const identifiers = (cluster?.identifiers as ClusterIdentifier[]) ?? [];
    if (identifiers.length > 0) {
      return identifiers[0].value;
    }

    return clusterId;
  }

  // ---------------------------------------------------------------------------
  // Batch processor
  // ---------------------------------------------------------------------------

  /**
   * Process a batch of unlinked records.
   *
   * For each record:
   * a. Extract identifiers from attributes using the stream's identity_fields.
   * b. Find matching existing clusters.
   * c. If no match → create new cluster + link.
   * d. If one match → link to existing cluster.
   * e. If multiple distinct clusters match → merge them first, then link.
   *
   * All database operations for a single record are wrapped in a transaction
   * (via linkRecordToCluster / mergeClusters which are themselves transactional).
   */
  private async processBatch(
    streamRecords: Array<typeof records.$inferSelect>,
    stream: typeof dataStreams.$inferSelect,
    projectId: string
  ): Promise<{ linked: number; newClusters: number }> {
    const identityFields: IdentityField[] = (stream.identityFields as IdentityField[]) ?? [];
    let linked = 0;
    let newClusters = 0;

    for (const record of streamRecords) {
      try {
        const attributes = (record.attributes as Record<string, unknown>) ?? {};
        const extracted = this.extractIdentifiers(attributes, identityFields);

        if (extracted.length === 0) {
          // No usable identifiers — skip (unresolvable)
          continue;
        }

        const identifierSearchList = extracted.map(({ type, value }) => ({ type, value }));
        const matchingClusters = await this.findMatchingClusters(projectId, identifierSearchList);

        // Build ClusterIdentifier array from extracted identifiers
        const clusterIdentifiers: ClusterIdentifier[] = extracted.map(({ type, value }) => ({
          type,
          value,
          sourceStreamId: stream.id,
          firstSeenAt: new Date().toISOString(),
        }));

        let targetClusterId: string;
        let isNew = false;

        if (matchingClusters.length === 0) {
          // d. No match → create new cluster
          const label = await this._deriveLabelFromAttributes(attributes);
          const newCluster = await this.createNewCluster(projectId, clusterIdentifiers, label);
          targetClusterId = newCluster.id;
          isNew = true;
          newClusters++;
        } else if (matchingClusters.length === 1) {
          // c. One match → use existing cluster
          targetClusterId = matchingClusters[0].id;
        } else {
          // e. Multiple distinct clusters → merge first
          const clusterIds = matchingClusters.map((c) => c.id);
          targetClusterId = await this.mergeClusters(clusterIds, record.id);
        }

        // Determine which identifier was the first match (for link metadata)
        const firstMatch = extracted[0];

        await this.linkRecordToCluster(
          record.id,
          targetClusterId,
          firstMatch.type,
          firstMatch.value,
          stream.id,
          clusterIdentifiers
        );

        linked++;

        // If a new cluster was created, try to set a meaningful label now that
        // the record is linked (so generateClusterLabel can read attributes)
        if (isNew) {
          const label = await this.generateClusterLabel(targetClusterId);
          if (label && label !== targetClusterId) {
            await db
              .update(identityClusters)
              .set({ primaryLabel: label, updatedAt: new Date() })
              .where(eq(identityClusters.id, targetClusterId));
          }
        }
      } catch (err) {
        // Log and continue — a single record failure should not abort the batch
        console.error(
          `[IdentityResolutionV2] Failed to resolve record ${record.id}:`,
          err
        );
      }
    }

    return { linked, newClusters };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Quick label derivation from raw attribute map (used before a cluster is
   * persisted, so generateClusterLabel cannot yet be used).
   */
  private async _deriveLabelFromAttributes(
    attrs: Record<string, unknown>
  ): Promise<string | undefined> {
    const fullName = attrs['full_name'] ?? attrs['fullName'];
    if (fullName && typeof fullName === 'string' && fullName.trim()) {
      return fullName.trim();
    }

    const name = attrs['name'];
    if (name && typeof name === 'string' && name.trim()) {
      return name.trim();
    }

    const firstName = attrs['first_name'] ?? attrs['firstName'];
    const lastName = attrs['last_name'] ?? attrs['lastName'];
    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
    }

    const email = attrs['email'];
    if (email && typeof email === 'string' && email.trim()) {
      return email.trim().toLowerCase();
    }

    return undefined;
  }
}

export const identityResolutionServiceV2 = new IdentityResolutionServiceV2();
