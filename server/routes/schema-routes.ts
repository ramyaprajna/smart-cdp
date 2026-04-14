/**
 * Schema Management Routes
 *
 * AI Schema Proposer, Dynamic Table Generation, Late Binding, and Anonymous Analytics.
 *
 * Endpoints:
 *   POST /api/schema/propose          — AI analyze sample data and propose schema
 *   POST /api/schema/propose/save     — Save proposed schema to registry
 *   POST /api/schema/dynamic/preview  — Preview CREATE TABLE SQL (dry run)
 *   POST /api/schema/dynamic/create   — Execute CREATE TABLE (requires approval)
 *   GET  /api/schema/dynamic/tables   — List dynamically created tables
 *   DELETE /api/schema/dynamic/:name  — Drop a dynamic table
 *   POST /api/schema/late-binding/run — Trigger late binding resolution
 *   GET  /api/analytics/anonymous     — Anonymous insights dashboard
 *   GET  /api/analytics/cohorts       — Anonymous cohort analysis
 *
 * @module SchemaRoutes
 */

import type { Express } from "express";
import { secureLogger } from "../utils/secure-logger";
import { z } from "zod";

// ── Validation Schemas ──────────────────────────────────────────

const proposeSchemaInput = z.object({
  sampleData: z.array(z.record(z.unknown())).min(1).max(1000),
  domainHint: z.string().max(128).optional(),
  sourceName: z.string().max(128).optional(),
});

// ── Route Setup ─────────────────────────────────────────────────

export function setupSchemaRoutes(app: Express): void {

  // ── AI Schema Proposer ──────────────────────────────────────

  /**
   * POST /api/schema/propose — Analyze sample data and propose schema
   */
  app.post("/api/schema/propose", async (req, res) => {
    try {
      const parsed = proposeSchemaInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const { aiSchemaProposer } = await import("../services/ai-schema-proposer");
      const schema = await aiSchemaProposer.proposeSchema(parsed.data);

      return res.json({
        status: "proposed",
        schema,
        message: `Schema proposed: ${schema.fields.length} fields detected, domain: ${schema.detectedDomain} (${schema.domainConfidence}% confidence)`,
      });
    } catch (error) {
      secureLogger.error("Schema proposal failed", { error: String(error) });
      return res.status(500).json({ error: "Schema proposal failed" });
    }
  });

  /**
   * POST /api/schema/propose/save — Save proposed schema to registry
   */
  app.post("/api/schema/propose/save", async (req, res) => {
    try {
      const { aiSchemaProposer } = await import("../services/ai-schema-proposer");
      const schemaId = await aiSchemaProposer.saveToRegistry(req.body);

      return res.status(201).json({
        status: "saved",
        schemaId,
        message: "Schema saved to registry — available for future imports",
      });
    } catch (error) {
      secureLogger.error("Schema save failed", { error: String(error) });
      return res.status(500).json({ error: "Failed to save schema" });
    }
  });

  // ── Dynamic Table Generation ────────────────────────────────

  /**
   * POST /api/schema/dynamic/preview — Preview CREATE TABLE SQL (dry run)
   */
  app.post("/api/schema/dynamic/preview", async (req, res) => {
    try {
      const { dynamicSchemaService } = await import("../services/dynamic-schema-service");
      const sqlStatement = dynamicSchemaService.generateSQL(req.body);

      return res.json({
        status: "preview",
        sql: sqlStatement,
        message: "This is a preview. Use POST /api/schema/dynamic/create to execute.",
      });
    } catch (error) {
      secureLogger.error("Schema preview failed", { error: String(error) });
      return res.status(500).json({ error: "Schema preview failed" });
    }
  });

  /**
   * POST /api/schema/dynamic/create — Execute CREATE TABLE
   */
  app.post("/api/schema/dynamic/create", async (req, res) => {
    try {
      const { dynamicSchemaService } = await import("../services/dynamic-schema-service");
      const result = await dynamicSchemaService.createTable(req.body);

      if (!result.success) {
        return res.status(400).json({ error: result.error, sql: result.sqlStatement });
      }

      return res.status(201).json({
        status: "created",
        tableName: result.tableName,
        sql: result.sqlStatement,
        message: `Table ${result.tableName} created successfully`,
      });
    } catch (error) {
      secureLogger.error("Dynamic table creation failed", { error: String(error) });
      return res.status(500).json({ error: "Table creation failed" });
    }
  });

  /**
   * GET /api/schema/dynamic/tables — List all dynamic tables
   */
  app.get("/api/schema/dynamic/tables", async (_req, res) => {
    try {
      const { dynamicSchemaService } = await import("../services/dynamic-schema-service");
      const tables = await dynamicSchemaService.listTables();
      return res.json({ tables });
    } catch (error) {
      return res.status(500).json({ error: "Failed to list tables" });
    }
  });

  /**
   * DELETE /api/schema/dynamic/:name — Drop a dynamic table
   */
  app.delete("/api/schema/dynamic/:name", async (req, res) => {
    try {
      const { dynamicSchemaService } = await import("../services/dynamic-schema-service");
      const result = await dynamicSchemaService.dropTable(req.params.name);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({ status: "dropped", tableName: req.params.name });
    } catch (error) {
      return res.status(500).json({ error: "Failed to drop table" });
    }
  });

  // ── Late Binding ────────────────────────────────────────────

  /**
   * POST /api/schema/late-binding/run — Trigger late binding resolution
   */
  app.post("/api/schema/late-binding/run", async (req, res) => {
    try {
      const batchSize = req.body?.batchSize || 200;
      const { lateBindingService } = await import("../services/late-binding-service");
      const result = await lateBindingService.resolve(batchSize);

      return res.json({
        status: "completed",
        ...result,
        message: `Scanned ${result.totalScanned} items, resolved ${result.eventsResolved} events + ${result.entitiesResolved} entities`,
      });
    } catch (error) {
      secureLogger.error("Late binding failed", { error: String(error) });
      return res.status(500).json({ error: "Late binding resolution failed" });
    }
  });

  // ── Anonymous Analytics ─────────────────────────────────────

  /**
   * GET /api/analytics/anonymous — Anonymous + identified insights
   */
  app.get("/api/analytics/anonymous", async (req, res) => {
    try {
      const dateFrom = req.query.from ? new Date(req.query.from as string) : undefined;
      const dateTo = req.query.to ? new Date(req.query.to as string) : undefined;

      const { anonymousAnalyticsService } = await import("../services/anonymous-analytics-service");
      const insights = await anonymousAnalyticsService.getInsights(dateFrom, dateTo);

      return res.json(insights);
    } catch (error) {
      secureLogger.error("Anonymous analytics failed", { error: String(error) });
      return res.status(500).json({ error: "Analytics query failed" });
    }
  });

  /**
   * GET /api/analytics/cohorts — Anonymous cohort analysis by source
   */
  app.get("/api/analytics/cohorts", async (_req, res) => {
    try {
      const { anonymousAnalyticsService } = await import("../services/anonymous-analytics-service");
      const cohorts = await anonymousAnalyticsService.getCohortsBySource();
      return res.json({ cohorts });
    } catch (error) {
      return res.status(500).json({ error: "Cohort analysis failed" });
    }
  });
}
