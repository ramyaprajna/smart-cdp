/**
 * ⚠️ CRITICAL FILE - LITE CDP v2 DATABASE SCHEMA - DO NOT DELETE ⚠️
 * This file defines the v2 data model for the Lite CDP feature.
 * Schema version: 2.0
 */
import { pgTable, text, uuid, timestamp, jsonb, integer, real, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript types for JSONB columns and domain enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type EntityType = "person" | "transaction" | "session" | "interaction" | "device" | "unknown";
export type IdentifierType = "email" | "phone" | "wa_number" | "device_id" | "ticket_number" | "rfid" | "cookie" | "session_id" | "crm_id" | "member_id" | "custom";
export type LinkType = "auto_matched" | "manual_linked" | "ai_suggested" | "merge_result";
export type StreamStatus = "draft" | "active" | "archived";
export type SourceType = "csv_upload" | "xlsx_upload" | "api_push" | "webhook" | "manual";

export interface FieldDefinition {
  key: string;
  label: string;
  dataType: "string" | "number" | "date" | "boolean" | "json";
  group: "identity" | "demographic" | "behavioral" | "transactional" | "metadata";
  isIdentifier: boolean;
  identifierType: IdentifierType | null;
  isRequired: boolean;
  isPII: boolean;
  sampleValues: unknown[];
  description?: string;
}

export interface IdentityField {
  key: string;
  identifierType: IdentifierType;
  confidence: number;
  isPrimary: boolean;
}

export interface ClusterIdentifier {
  type: IdentifierType;
  value: string;
  sourceStreamId: string;
  firstSeenAt: string;
}

export interface MergeHistoryEntry {
  action: "created" | "merged" | "linked" | "unlinked";
  at: string;
  by: string;
  mergedClusterId?: string;
  streamId?: string;
  recordCount?: number;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table: project_config
// Stores top-level project configuration for each CDP project.
// ─────────────────────────────────────────────────────────────────────────────

export const projectConfig = pgTable("project_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectName: text("project_name").notNull(),
  slug: text("slug").notNull().unique(),
  config: jsonb("config").notNull().default({}), // ProjectConfigV2 JSON
  configVersion: text("config_version").notNull().default("2.0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Table: data_streams
// Represents a logical data stream (a source of records) within a project.
// ─────────────────────────────────────────────────────────────────────────────

export const dataStreams = pgTable("data_streams", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(), // References projectConfig.id
  name: text("name").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull(), // 'csv_upload' | 'xlsx_upload' | 'api_push' | 'webhook' | 'manual'
  entityType: text("entity_type").notNull().default("unknown"), // 'person' | 'transaction' | 'session' | 'interaction' | 'device' | 'unknown'
  schemaDefinition: jsonb("schema_definition").notNull().default({}),
  identityFields: jsonb("identity_fields").notNull().default([]),
  aiAnalysis: jsonb("ai_analysis").notNull().default({}),
  status: text("status").notNull().default("draft"), // 'draft' | 'active' | 'archived'
  totalRecords: integer("total_records").notNull().default(0),
  identifiedRecords: integer("identified_records").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => ({
  projectIdIdx: index("data_streams_project_id_idx").on(table.projectId),
  statusIdx: index("data_streams_status_idx").on(table.status),
  entityTypeIdx: index("data_streams_entity_type_idx").on(table.entityType),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Table: records
// Raw data records ingested from a stream.
// GIN index for `attributes` JSONB is added via raw SQL in migration.
// ─────────────────────────────────────────────────────────────────────────────

export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  streamId: uuid("stream_id").notNull(), // References dataStreams.id
  projectId: uuid("project_id").notNull(), // Denormalized for efficient filtering
  importId: uuid("import_id"),
  attributes: jsonb("attributes").notNull().default({}),
  identityClusterId: uuid("identity_cluster_id"), // Nullable — set when linked
  originalSourceData: jsonb("original_source_data"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  streamIdIdx: index("records_stream_id_idx").on(table.streamId),
  projectIdIdx: index("records_project_id_idx").on(table.projectId),
  identityClusterIdIdx: index("records_identity_cluster_id_idx").on(table.identityClusterId),
  createdAtIdx: index("records_created_at_idx").on(table.createdAt),
  idempotencyUniqueIdx: uniqueIndex("records_idempotency_unique_idx").on(table.streamId, table.idempotencyKey),
  // GIN index for JSONB is added via raw SQL in migration
}));

// ─────────────────────────────────────────────────────────────────────────────
// Table: identity_clusters
// A resolved identity (person/entity) composed of one or more records.
// GIN index for `identifiers` JSONB is added via raw SQL in migration.
// ─────────────────────────────────────────────────────────────────────────────

export const identityClusters = pgTable("identity_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  primaryLabel: text("primary_label"),
  identifiers: jsonb("identifiers").notNull().default([]),
  streamCount: integer("stream_count").notNull().default(1),
  recordCount: integer("record_count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  mergeHistory: jsonb("merge_history").notNull().default([]),
  avgConfidence: real("avg_confidence").notNull().default(1.0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdIdx: index("identity_clusters_project_id_idx").on(table.projectId),
  lastSeenIdx: index("identity_clusters_last_seen_idx").on(table.lastSeenAt),
  // GIN index for identifiers is added via raw SQL in migration
}));

// ─────────────────────────────────────────────────────────────────────────────
// Table: identity_links
// Join table linking a single record to an identity cluster.
// Each record may belong to at most one cluster (enforced by unique index).
// ─────────────────────────────────────────────────────────────────────────────

export const identityLinks = pgTable("identity_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(), // References records.id
  identityClusterId: uuid("identity_cluster_id").notNull(), // References identityClusters.id
  linkType: text("link_type").notNull(), // 'auto_matched' | 'manual_linked' | 'ai_suggested' | 'merge_result'
  linkConfidence: real("link_confidence").notNull().default(1.0),
  matchedIdentifierType: text("matched_identifier_type"),
  matchedIdentifierValue: text("matched_identifier_value"),
  linkedBy: text("linked_by").notNull().default("system"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow(),
  linkNotes: text("link_notes"),
}, (table) => ({
  recordIdUniqueIdx: uniqueIndex("identity_links_record_id_unique_idx").on(table.recordId),
  clusterIdIdx: index("identity_links_cluster_id_idx").on(table.identityClusterId),
  linkTypeIdx: index("identity_links_link_type_idx").on(table.linkType),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Table: data_imports_v2
// Tracks import jobs that ingest data into a stream.
// ─────────────────────────────────────────────────────────────────────────────

export const dataImportsV2 = pgTable("data_imports_v2", {
  id: uuid("id").primaryKey().defaultRandom(),
  streamId: uuid("stream_id").notNull(),
  projectId: uuid("project_id").notNull(),
  importType: text("import_type").notNull(), // 'csv' | 'xlsx' | 'json' | 'api'
  importStatus: text("import_status").notNull().default("pending"),
  totalRows: integer("total_rows"),
  processedRows: integer("processed_rows").default(0),
  failedRows: integer("failed_rows").default(0),
  duplicateRows: integer("duplicate_rows").default(0),
  errorLog: jsonb("error_log").default([]),
  importConfig: jsonb("import_config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  streamIdIdx: index("data_imports_v2_stream_id_idx").on(table.streamId),
  projectIdIdx: index("data_imports_v2_project_id_idx").on(table.projectId),
  statusIdx: index("data_imports_v2_status_idx").on(table.importStatus),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const projectConfigRelations = relations(projectConfig, ({ many }) => ({
  dataStreams: many(dataStreams),
  records: many(records),
  identityClusters: many(identityClusters),
  dataImportsV2: many(dataImportsV2),
}));

export const dataStreamsRelations = relations(dataStreams, ({ one, many }) => ({
  project: one(projectConfig, {
    fields: [dataStreams.projectId],
    references: [projectConfig.id],
  }),
  records: many(records),
  dataImportsV2: many(dataImportsV2),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  stream: one(dataStreams, {
    fields: [records.streamId],
    references: [dataStreams.id],
  }),
  project: one(projectConfig, {
    fields: [records.projectId],
    references: [projectConfig.id],
  }),
  identityCluster: one(identityClusters, {
    fields: [records.identityClusterId],
    references: [identityClusters.id],
  }),
  importJob: one(dataImportsV2, {
    fields: [records.importId],
    references: [dataImportsV2.id],
  }),
  identityLink: one(identityLinks, {
    fields: [records.id],
    references: [identityLinks.recordId],
  }),
}));

export const identityClustersRelations = relations(identityClusters, ({ one, many }) => ({
  project: one(projectConfig, {
    fields: [identityClusters.projectId],
    references: [projectConfig.id],
  }),
  records: many(records),
  identityLinks: many(identityLinks),
}));

export const identityLinksRelations = relations(identityLinks, ({ one }) => ({
  record: one(records, {
    fields: [identityLinks.recordId],
    references: [records.id],
  }),
  identityCluster: one(identityClusters, {
    fields: [identityLinks.identityClusterId],
    references: [identityClusters.id],
  }),
}));

export const dataImportsV2Relations = relations(dataImportsV2, ({ one, many }) => ({
  stream: one(dataStreams, {
    fields: [dataImportsV2.streamId],
    references: [dataStreams.id],
  }),
  project: one(projectConfig, {
    fields: [dataImportsV2.projectId],
    references: [projectConfig.id],
  }),
  records: many(records),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Insert schemas (drizzle-zod) + Zod validation schemas
// ─────────────────────────────────────────────────────────────────────────────

export const insertProjectConfigSchema = createInsertSchema(projectConfig, {
  projectName: z.string().min(1, "Project name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  config: z.record(z.unknown()).default({}),
  configVersion: z.string().default("2.0"),
  isActive: z.boolean().default(true),
});

export const insertDataStreamsSchema = createInsertSchema(dataStreams, {
  name: z.string().min(1, "Stream name is required"),
  sourceType: z.enum(["csv_upload", "xlsx_upload", "api_push", "webhook", "manual"]),
  entityType: z.enum(["person", "transaction", "session", "interaction", "device", "unknown"]).default("unknown"),
  schemaDefinition: z.record(z.unknown()).default({}),
  identityFields: z.array(z.unknown()).default([]),
  aiAnalysis: z.record(z.unknown()).default({}),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  totalRecords: z.number().int().nonnegative().default(0),
  identifiedRecords: z.number().int().nonnegative().default(0),
});

export const insertRecordsSchema = createInsertSchema(records, {
  attributes: z.record(z.unknown()).default({}),
  originalSourceData: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

export const insertIdentityClustersSchema = createInsertSchema(identityClusters, {
  primaryLabel: z.string().optional(),
  identifiers: z.array(z.unknown()).default([]),
  streamCount: z.number().int().nonnegative().default(1),
  recordCount: z.number().int().nonnegative().default(0),
  mergeHistory: z.array(z.unknown()).default([]),
  avgConfidence: z.number().min(0).max(1).default(1.0),
});

export const insertIdentityLinksSchema = createInsertSchema(identityLinks, {
  linkType: z.enum(["auto_matched", "manual_linked", "ai_suggested", "merge_result"]),
  linkConfidence: z.number().min(0).max(1).default(1.0),
  matchedIdentifierType: z.string().optional(),
  matchedIdentifierValue: z.string().optional(),
  linkedBy: z.string().default("system"),
  linkNotes: z.string().optional(),
});

export const insertDataImportsV2Schema = createInsertSchema(dataImportsV2, {
  importType: z.enum(["csv", "xlsx", "json", "api"]),
  importStatus: z.string().default("pending"),
  totalRows: z.number().int().nonnegative().optional(),
  processedRows: z.number().int().nonnegative().default(0),
  failedRows: z.number().int().nonnegative().default(0),
  duplicateRows: z.number().int().nonnegative().default(0),
  errorLog: z.array(z.unknown()).default([]),
  importConfig: z.record(z.unknown()).default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived TypeScript types from insert schemas
// ─────────────────────────────────────────────────────────────────────────────

export type InsertProjectConfig = z.infer<typeof insertProjectConfigSchema>;
export type InsertDataStream = z.infer<typeof insertDataStreamsSchema>;
export type InsertRecord = z.infer<typeof insertRecordsSchema>;
export type InsertIdentityCluster = z.infer<typeof insertIdentityClustersSchema>;
export type InsertIdentityLink = z.infer<typeof insertIdentityLinksSchema>;
export type InsertDataImportV2 = z.infer<typeof insertDataImportsV2Schema>;

// Select types (full row types inferred from table definitions)
export type ProjectConfig = typeof projectConfig.$inferSelect;
export type DataStream = typeof dataStreams.$inferSelect;
export type Record = typeof records.$inferSelect;
export type IdentityCluster = typeof identityClusters.$inferSelect;
export type IdentityLink = typeof identityLinks.$inferSelect;
export type DataImportV2 = typeof dataImportsV2.$inferSelect;
