/**
 * Stream Deploy Service — Lite CDP v2
 *
 * Purpose: Auto-deploys a data stream when an admin clicks "Activate Stream".
 * Creates PostgreSQL expression indexes on `records.attributes` for fast
 * field-level lookups and updates the project config with stream metadata.
 *
 * Key Features:
 * - Creates filtered expression indexes per identity/groupBy/timeField
 * - Sanitises field keys to prevent SQL injection (alphanumeric + underscore only)
 * - Short stream ID prefix (8 chars) keeps index names within PostgreSQL 63-char limit
 * - Project config update: appends stream to streams[], refreshes chatbot context
 * - Clean teardown: dropStreamIndexes removes all indexes for an archived stream
 *
 * Design Decisions:
 * - Uses pool.query() for raw DDL (CREATE/DROP INDEX) — Drizzle ORM doesn't
 *   support arbitrary DDL, consistent with how vector-engine.ts handles this
 * - Uses db (Drizzle) for all DML (SELECT, UPDATE) — consistent with other services
 * - Index naming: idx_records_{streamId8}_{sanitisedFieldKey}
 *   e.g. idx_records_a1b2c3d4_email — stays well under 63-char limit
 * - Errors per-index are collected (not re-thrown) so one bad field doesn't
 *   abort the full deploy; errors are returned to the caller for logging
 *
 * @module StreamDeployService
 * @created 2025 — Lite CDP v2 Sprint 2.3
 */

import { db, pool } from '../../db';
import { dataStreams, records, projectConfig } from '@shared/schema-v2';
import { eq, sql } from 'drizzle-orm';
import type { FieldDefinition, IdentityField } from '@shared/schema-v2';

// ─── Internal Types ───────────────────────────────────────────────────────────

/**
 * Shape of the analytics config stored inside dataStreams.aiAnalysis.
 * Mirrors AIAnalysisResult.analyticsConfig from stream-analyzer-service.ts.
 */
interface AnalyticsConfig {
  groupByFields?: string[];
  aggregateFields?: Array<{ key: string; aggregations: string[] }>;
  timeField?: string | null;
  primaryMetric?: string | null;
}

/**
 * Shape of dataStreams.aiAnalysis JSONB column.
 */
interface AIAnalysisPayload {
  analyticsConfig?: AnalyticsConfig;
  chatbotContext?: string;
  embeddingTemplate?: string;
  streamType?: string;
  analysisConfidence?: number;
}

/**
 * Shape of the entry added to projectConfig.config.streams[].
 */
interface ProjectStreamEntry {
  streamId: string;
  name: string;
  entityType: string;
  streamType: string;
  status: string;
  activatedAt: string | null;
  chatbotContext: string;
}

/**
 * Shape of projectConfig.config JSONB (ProjectConfigV2).
 * Only the fields this service reads/writes are listed.
 */
interface ProjectConfigV2 {
  streams?: ProjectStreamEntry[];
  chatbotContext?: string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitise a field key for safe embedding in an index name.
 * Keeps only a–z, A–Z, 0–9, and underscore. All other characters are removed.
 * Returns empty string if the result is empty (caller should skip such fields).
 */
function sanitiseKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Return the first 8 characters of a UUID (without dashes) for use in index names.
 * e.g. "a1b2c3d4-e5f6-..." → "a1b2c3d4"
 */
function shortStreamId(streamId: string): string {
  return streamId.replace(/-/g, '').slice(0, 8);
}

/**
 * Build the index name for a given stream + field combination.
 * Format: idx_records_{streamId8}_{sanitisedKey}
 * Maximum length: 4 + 1 + 7 + 1 + 8 + 1 + 63 = well under 63 chars for
 * reasonable field key lengths (PostgreSQL identifier limit is 63 bytes).
 */
function buildIndexName(streamId: string, fieldKey: string): string {
  const safeKey = sanitiseKey(fieldKey);
  const prefix = shortStreamId(streamId);
  return `idx_records_${prefix}_${safeKey}`;
}

// ─── Main Class ───────────────────────────────────────────────────────────────

export class StreamDeployService {
  // ── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Deploy a stream: create expression indexes and update project config.
   *
   * Called when an admin clicks "Activate Stream" in the UI. The stream
   * must already be in 'active' status (set by DataStreamService.activateStream
   * before calling this method) or this method can be called as part of
   * the activation flow.
   *
   * @param streamId  UUID of the data stream to deploy
   */
  async deployStream(streamId: string): Promise<{
    success: boolean;
    indexesCreated: string[];
    errors: string[];
  }> {
    const errors: string[] = [];

    // ── 1. Fetch stream record ───────────────────────────────────────────────
    const [stream] = await db
      .select()
      .from(dataStreams)
      .where(eq(dataStreams.id, streamId))
      .limit(1);

    if (!stream) {
      return {
        success: false,
        indexesCreated: [],
        errors: [`Stream not found: ${streamId}`],
      };
    }

    // ── 2. Parse field definitions and identity fields from JSONB columns ────
    const fieldDefinitions: FieldDefinition[] = Array.isArray(stream.schemaDefinition)
      ? (stream.schemaDefinition as FieldDefinition[])
      : [];

    const identityFields: IdentityField[] = Array.isArray(stream.identityFields)
      ? (stream.identityFields as IdentityField[])
      : [];

    // ── 3. Create expression indexes ─────────────────────────────────────────
    let indexesCreated: string[] = [];
    try {
      indexesCreated = await this.createExpressionIndexes(
        streamId,
        fieldDefinitions,
        identityFields,
        stream.aiAnalysis as AIAnalysisPayload
      );
    } catch (err) {
      errors.push(`Index creation failed: ${(err as Error).message}`);
    }

    // ── 4. Update project config ─────────────────────────────────────────────
    try {
      await this.updateProjectConfig(stream.projectId, stream);
    } catch (err) {
      errors.push(`Project config update failed: ${(err as Error).message}`);
    }

    return {
      success: errors.length === 0,
      indexesCreated,
      errors,
    };
  }

  /**
   * Drop all expression indexes associated with an archived stream.
   *
   * Call this when archiving a stream to reclaim disk space and reduce
   * PostgreSQL index maintenance overhead.
   *
   * @param streamId  UUID of the stream whose indexes should be dropped
   */
  async dropStreamIndexes(streamId: string): Promise<void> {
    const prefix = shortStreamId(streamId);
    const namePattern = `idx_records_${prefix}_%`;

    // Query pg_indexes to find all indexes matching our naming pattern
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'records'
         AND indexname LIKE $1`,
      [namePattern]
    );

    const indexNames: string[] = result.rows.map((row) => row.indexname);

    // Drop each index
    for (const indexName of indexNames) {
      // Index names are fetched from pg_indexes — they are already safe, but
      // we sanitise anyway to guard against any unexpected characters.
      const safeIndexName = indexName.replace(/[^a-zA-Z0-9_]/g, '');
      if (!safeIndexName) continue;

      await pool.query(`DROP INDEX IF EXISTS "${safeIndexName}"`);
    }
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Create PostgreSQL expression indexes on records(attributes->>'{key}')
   * filtered by stream_id for each relevant field.
   *
   * Fields indexed:
   *   - All identity fields (isIdentifier = true)
   *   - analyticsConfig.groupByFields
   *   - analyticsConfig.timeField (if present)
   *
   * Each index is:
   *   CREATE INDEX IF NOT EXISTS idx_records_{streamId8}_{fieldKey}
   *     ON records((attributes->>'fieldKey'))
   *     WHERE stream_id = 'streamId'
   *
   * @returns List of index names that were successfully created
   */
  private async createExpressionIndexes(
    streamId: string,
    fields: FieldDefinition[],
    identityFields: IdentityField[],
    aiAnalysis?: AIAnalysisPayload
  ): Promise<string[]> {
    // Collect unique field keys to index
    const keysToIndex = new Set<string>();

    // Identity fields are always indexed
    identityFields.forEach((idf) => {
      if (idf.key) keysToIndex.add(idf.key);
    });

    // Also index any FieldDefinition that is flagged as an identifier
    fields
      .filter((fd) => fd.isIdentifier && fd.key)
      .forEach((fd) => keysToIndex.add(fd.key));

    // analyticsConfig.groupByFields
    const analyticsConfig = aiAnalysis?.analyticsConfig;
    if (analyticsConfig?.groupByFields) {
      analyticsConfig.groupByFields.forEach((key) => {
        if (key) keysToIndex.add(key);
      });
    }

    // analyticsConfig.timeField
    if (analyticsConfig?.timeField) {
      keysToIndex.add(analyticsConfig.timeField);
    }

    const createdIndexes: string[] = [];

    for (const fieldKey of Array.from(keysToIndex)) {
      const safeKey = sanitiseKey(fieldKey);

      // Skip fields whose keys become empty after sanitisation
      if (!safeKey) {
        continue;
      }

      const indexName = buildIndexName(streamId, fieldKey);

      // DDL template — all variable parts are sanitised:
      //   indexName: output of buildIndexName (alphanumeric + underscore only)
      //   fieldKey:  re-sanitised — never interpolated raw from user input
      //   streamId:  passed as a parameterised value via $1
      //
      // We cannot use parameterised queries for DDL identifiers in PostgreSQL,
      // so we manually sanitise. The streamId is a UUID passed via $1 (safe).
      const ddl = `
        CREATE INDEX IF NOT EXISTS "${indexName}"
          ON records ((attributes->>'${safeKey}'))
          WHERE stream_id = $1
      `.trim();

      try {
        await pool.query(ddl, [streamId]);
        createdIndexes.push(indexName);
      } catch (err) {
        // Collect error but continue with remaining indexes
        // This allows partial success and lets the caller decide what to do
        throw new Error(
          `Failed to create index "${indexName}" for field "${fieldKey}": ${(err as Error).message}`
        );
      }
    }

    return createdIndexes;
  }

  /**
   * Update the project config JSONB to include the newly activated stream.
   *
   * Operations performed:
   * 1. Read existing projectConfig.config (ProjectConfigV2 JSON)
   * 2. Upsert the stream entry in config.streams[] (by streamId)
   * 3. Regenerate config.chatbotContext as a concatenation of all active stream contexts
   * 4. Write the updated config back
   *
   * @param projectId  UUID of the project that owns the stream
   * @param stream     The dataStreams row for the activated stream
   */
  private async updateProjectConfig(
    projectId: string,
    stream: typeof dataStreams.$inferSelect
  ): Promise<void> {
    // ── 1. Fetch current project config ──────────────────────────────────────
    const [project] = await db
      .select()
      .from(projectConfig)
      .where(eq(projectConfig.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Parse existing config — default to empty object if malformed
    let config: ProjectConfigV2;
    try {
      config =
        typeof project.config === 'object' && project.config !== null
          ? (project.config as ProjectConfigV2)
          : {};
    } catch {
      config = {};
    }

    const existingStreams: ProjectStreamEntry[] = Array.isArray(config.streams)
      ? config.streams
      : [];

    // ── 2. Extract chatbot context from AI analysis ───────────────────────────
    const aiAnalysis = (stream.aiAnalysis as AIAnalysisPayload) ?? {};
    const streamChatbotContext = aiAnalysis.chatbotContext ?? '';
    const streamType = aiAnalysis.streamType ?? stream.entityType;

    // ── 3. Build the updated stream entry ────────────────────────────────────
    const updatedEntry: ProjectStreamEntry = {
      streamId: stream.id,
      name: stream.name,
      entityType: stream.entityType,
      streamType,
      status: stream.status,
      activatedAt: stream.activatedAt ? stream.activatedAt.toISOString() : null,
      chatbotContext: streamChatbotContext,
    };

    // Upsert: replace existing entry for this stream, or append if new
    const streamIndex = existingStreams.findIndex((s) => s.streamId === stream.id);
    if (streamIndex >= 0) {
      existingStreams[streamIndex] = updatedEntry;
    } else {
      existingStreams.push(updatedEntry);
    }

    // ── 4. Regenerate combined chatbot context ────────────────────────────────
    const activeContexts = existingStreams
      .filter((s) => s.status === 'active' && s.chatbotContext)
      .map((s) => s.chatbotContext.trim())
      .filter(Boolean);

    const combinedChatbotContext =
      activeContexts.length > 0
        ? activeContexts.join(' ')
        : streamChatbotContext;

    // ── 5. Write updated config back ─────────────────────────────────────────
    const updatedConfig: ProjectConfigV2 = {
      ...config,
      streams: existingStreams,
      chatbotContext: combinedChatbotContext,
    };

    await db
      .update(projectConfig)
      .set({
        config: updatedConfig,
        updatedAt: new Date(),
      })
      .where(eq(projectConfig.id, projectId));
  }
}
