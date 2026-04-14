/**
 * Raw Ingest Routes — Universal Data Landing Zone
 *
 * Accepts ANY data without requiring a customer/profile anchor.
 * Data lands in `raw_entities` table as-is, then AI classifies
 * the entity type and optionally resolves to a profile later.
 *
 * Endpoints:
 *   POST /api/ingest/raw           — single entity
 *   POST /api/ingest/raw/batch     — bulk (up to 1000 per request)
 *   GET  /api/ingest/raw/stats     — landing zone statistics
 *   POST /api/ingest/raw/:id/classify — trigger AI classification
 *
 * @module RawIngestRoutes
 */

import type { Express } from "express";
import { db } from "../db";
import { rawEntities } from "@shared/schema";
import { eq, sql, and, count } from "drizzle-orm";
import { secureLogger } from "../utils/secure-logger";
import { rateLimitMiddleware } from "../performance-middleware";
import { z } from "zod";

// ── Validation Schemas ──────────────────────────────────────────

const rawIngestSchema = z.object({
  data: z.record(z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: "data must be a non-empty object" }
  ),
  entityType: z.string().max(64).optional(),
  sourceSystem: z.string().max(128).optional(),
  sourceId: z.string().max(256).optional(),
  sourceFileName: z.string().max(512).optional(),
  sourceRowNumber: z.number().int().positive().optional(),
  profileId: z.string().uuid().optional(),
});

const batchRawIngestSchema = z.object({
  entities: z.array(rawIngestSchema).min(1).max(1000),
  sourceSystem: z.string().max(128).optional(),   // shared source for all
  sourceId: z.string().max(256).optional(),         // shared source ID
  sourceFileName: z.string().max(512).optional(),   // shared filename
});

// ── Route Setup ─────────────────────────────────────────────────

export function setupRawIngestRoutes(app: Express): void {

  /**
   * POST /api/ingest/raw — Ingest a single raw entity
   *
   * Accepts any JSON object and stores it with zero transformation.
   * If entityType is not provided, defaults to "unknown" (AI will classify later).
   * profileId is optional — data without a known customer can still be accepted.
   */
  app.post("/api/ingest/raw", rateLimitMiddleware(120, 60000), async (req, res) => {
    try {
      const parsed = rawIngestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const payload = parsed.data;

      const [entity] = await db
        .insert(rawEntities)
        .values({
          entityType: payload.entityType || "unknown",
          sourceSystem: payload.sourceSystem,
          sourceId: payload.sourceId,
          sourceFileName: payload.sourceFileName,
          sourceRowNumber: payload.sourceRowNumber,
          data: payload.data,
          profileId: payload.profileId,
          status: "pending",
        })
        .returning();

      return res.status(201).json({
        status: "accepted",
        entityId: entity.id,
        entityType: entity.entityType,
        message: payload.entityType
          ? `Entity ingested as '${payload.entityType}'`
          : "Entity ingested — pending AI classification",
      });
    } catch (error) {
      secureLogger.error("Raw ingest error", {
        error: String(error),
      });
      return res.status(500).json({ error: "Raw entity ingestion failed" });
    }
  });

  /**
   * POST /api/ingest/raw/batch — Ingest multiple raw entities
   *
   * Accepts up to 1000 entities per request.
   * Shared source metadata (sourceSystem, sourceId, sourceFileName)
   * is applied to all entities unless overridden per-entity.
   */
  app.post("/api/ingest/raw/batch", rateLimitMiddleware(30, 60000), async (req, res) => {
    try {
      const parsed = batchRawIngestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const { entities, sourceSystem, sourceId, sourceFileName } = parsed.data;

      const values = entities.map((e, idx) => ({
        entityType: e.entityType || "unknown",
        sourceSystem: e.sourceSystem || sourceSystem,
        sourceId: e.sourceId || sourceId,
        sourceFileName: e.sourceFileName || sourceFileName,
        sourceRowNumber: e.sourceRowNumber ?? idx + 1,
        data: e.data,
        profileId: e.profileId,
        status: "pending" as const,
      }));

      const inserted = await db
        .insert(rawEntities)
        .values(values)
        .returning({ id: rawEntities.id, entityType: rawEntities.entityType });

      return res.status(201).json({
        status: "accepted",
        count: inserted.length,
        entities: inserted,
        message: `${inserted.length} entities ingested into landing zone`,
      });
    } catch (error) {
      secureLogger.error("Raw batch ingest error", {
        error: String(error),
      });
      return res.status(500).json({ error: "Batch ingestion failed" });
    }
  });

  /**
   * GET /api/ingest/raw/stats — Landing zone statistics
   *
   * Returns counts by status and entity type for monitoring.
   */
  app.get("/api/ingest/raw/stats", async (_req, res) => {
    try {
      const byStatus = await db
        .select({
          status: rawEntities.status,
          count: count(),
        })
        .from(rawEntities)
        .groupBy(rawEntities.status);

      const byEntityType = await db
        .select({
          entityType: rawEntities.entityType,
          count: count(),
        })
        .from(rawEntities)
        .groupBy(rawEntities.entityType);

      const totalResult = await db
        .select({ total: count() })
        .from(rawEntities);

      return res.json({
        total: totalResult[0]?.total ?? 0,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
        byEntityType: Object.fromEntries(byEntityType.map((r) => [r.entityType, r.count])),
      });
    } catch (error) {
      secureLogger.error("Raw stats error", { error: String(error) });
      return res.status(500).json({ error: "Failed to get landing zone stats" });
    }
  });

  /**
   * POST /api/ingest/raw/:id/classify — Trigger AI classification
   *
   * Runs the entity classifier on a single pending entity.
   * Updates entityType, aiClassification, and status.
   */
  app.post("/api/ingest/raw/:id/classify", async (req, res) => {
    try {
      const { id } = req.params;

      const [entity] = await db
        .select()
        .from(rawEntities)
        .where(eq(rawEntities.id, id))
        .limit(1);

      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }

      // Import the entity classifier (lazy load)
      const { entityClassifier } = await import("../services/entity-classifier");
      const classification = await entityClassifier.classify(entity.data as Record<string, unknown>);

      const [updated] = await db
        .update(rawEntities)
        .set({
          entityType: classification.entityType,
          aiClassification: classification,
          status: "classified",
          processedAt: new Date(),
        })
        .where(eq(rawEntities.id, id))
        .returning();

      return res.json({
        status: "classified",
        entityId: updated.id,
        classification,
      });
    } catch (error) {
      secureLogger.error("Entity classification error", { error: String(error) });
      return res.status(500).json({ error: "Classification failed" });
    }
  });
}
