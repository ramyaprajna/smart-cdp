/**
 * Archive Database Schema
 *
 * Completely separate database schema for archived data storage.
 * Provides full isolation from live application data to ensure:
 * - Data integrity and security
 * - Optimized query performance
 * - Clear separation of concerns
 * - Independent scaling and maintenance
 *
 * Last Updated: September 14, 2025
 * Integration Status: ✅ OPERATIONAL - Database-level separation with archiveData table
 */

import { pgTable, text, uuid, timestamp, jsonb, integer, index, pgSchema } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Create separate archive schema namespace
export const archiveSchema = pgSchema("archive");

// Archive metadata table - isolated in archive schema
export const archiveMetadata = archiveSchema.table("metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  archiveType: text("archive_type").notNull().default("full"), // 'full', 'partial', 'backup'
  status: text("status").notNull().default("creating"), // 'creating', 'completed', 'failed', 'restored'
  dataSize: integer("data_size").default(0), // Size in bytes
  recordCounts: jsonb("record_counts"), // Count per table
  metadata: jsonb("metadata"), // Additional archive metadata
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  restoredBy: text("restored_by"),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
}, (table) => ({
  // Optimized indexes for archive queries
  nameIdx: index("archive_metadata_name_idx").on(table.name),
  statusIdx: index("archive_metadata_status_idx").on(table.status),
  createdAtIdx: index("archive_metadata_created_at_idx").on(table.createdAt),
  typeIdx: index("archive_metadata_type_idx").on(table.archiveType),
}));

// Archived customers data - completely isolated
export const archivedCustomers = archiveSchema.table("customers", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(), // Original customer ID from live system
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phoneNumber: text("phone_number"),
  dateOfBirth: timestamp("date_of_birth"),
  gender: text("gender"),
  currentAddress: jsonb("current_address"),
  customerSegment: text("customer_segment"),
  lifetimeValue: text("lifetime_value"), // Store as text to preserve exact precision
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  dataQualityScore: text("data_quality_score"), // Store as text to preserve exact precision
  importId: uuid("import_id"),
  sourceRowNumber: integer("source_row_number"),
  sourceFileHash: text("source_file_hash"),
  dataLineage: jsonb("data_lineage"),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  originalUpdatedAt: timestamp("original_updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_customers_archive_idx").on(table.archiveId),
  originalIdIdx: index("archived_customers_original_idx").on(table.originalId),
  emailIdx: index("archived_customers_email_idx").on(table.email),
  segmentIdx: index("archived_customers_segment_idx").on(table.customerSegment),
}));

// Archived customer identifiers - isolated
export const archivedCustomerIdentifiers = archiveSchema.table("customer_identifiers", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  customerId: uuid("customer_id").notNull(), // References archived customer
  identifierType: text("identifier_type").notNull(),
  identifierValue: text("identifier_value").notNull(),
  sourceSystem: text("source_system"),
  importId: uuid("import_id"),
  sourceRowNumber: integer("source_row_number"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_identifiers_archive_idx").on(table.archiveId),
  customerIdIdx: index("archived_identifiers_customer_idx").on(table.customerId),
  typeValueIdx: index("archived_identifiers_type_value_idx").on(table.identifierType, table.identifierValue),
}));

// Archived customer events - isolated
export const archivedCustomerEvents = archiveSchema.table("customer_events", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  sessionId: text("session_id"),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_events_archive_idx").on(table.archiveId),
  customerIdIdx: index("archived_events_customer_idx").on(table.customerId),
  eventTypeIdx: index("archived_events_type_idx").on(table.eventType),
}));

// Archived customer embeddings - isolated
export const archivedCustomerEmbeddings = archiveSchema.table("customer_embeddings", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  embedding: jsonb("embedding"), // Store as JSON to preserve vector data
  embeddingType: text("embedding_type").default("customer_profile"),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  originalUpdatedAt: timestamp("original_updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_embeddings_archive_idx").on(table.archiveId),
  customerIdIdx: index("archived_embeddings_customer_idx").on(table.customerId),
}));

// Archived segments - isolated
export const archivedSegments = archiveSchema.table("segments", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria"),
  isActive: text("is_active"), // Store as text
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  originalUpdatedAt: timestamp("original_updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_segments_archive_idx").on(table.archiveId),
  nameIdx: index("archived_segments_name_idx").on(table.name),
}));

// Archived customer segments mapping - isolated
export const archivedCustomerSegments = archiveSchema.table("customer_segments", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  segmentId: uuid("segment_id").notNull(),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_customer_segments_archive_idx").on(table.archiveId),
  customerIdIdx: index("archived_customer_segments_customer_idx").on(table.customerId),
  segmentIdIdx: index("archived_customer_segments_segment_idx").on(table.segmentId),
}));

// Archived data imports - isolated
export const archivedDataImports = archiveSchema.table("data_imports", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  importType: text("import_type").notNull(),
  importSource: text("import_source").notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsSuccessful: integer("records_successful").default(0),
  recordsFailed: integer("records_failed").default(0),
  importStatus: text("import_status").notNull(),
  importMetadata: jsonb("import_metadata"),
  importedBy: text("imported_by"),
  originalImportedAt: timestamp("original_imported_at", { withTimezone: true }),
  originalCompletedAt: timestamp("original_completed_at", { withTimezone: true }),
  processingMode: text("processing_mode"),
  chunkSize: integer("chunk_size"),
  validationRules: jsonb("validation_rules"),
  fieldMappings: jsonb("field_mappings"),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_data_imports_archive_idx").on(table.archiveId),
  fileNameIdx: index("archived_data_imports_filename_idx").on(table.fileName),
  statusIdx: index("archived_data_imports_status_idx").on(table.importStatus),
}));

// Archived raw data imports - isolated
export const archivedRawDataImports = archiveSchema.table("raw_data_imports", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  originalId: uuid("original_id").notNull(),
  importSessionId: uuid("import_session_id").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  sourceSheetName: text("source_sheet_name"),
  sourceRowNumber: integer("source_row_number").notNull(),
  rawDataRow: jsonb("raw_data_row").notNull(),
  originalHeaders: jsonb("original_headers"),
  dataTypesDetected: jsonb("data_types_detected"),
  validationErrors: jsonb("validation_errors"),
  processingStatus: text("processing_status"),
  originalProcessedAt: timestamp("original_processed_at", { withTimezone: true }),
  originalCreatedAt: timestamp("original_created_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archived_raw_data_imports_archive_idx").on(table.archiveId),
  sessionIdx: index("archived_raw_data_imports_session_idx").on(table.importSessionId),
}));

// Archive data storage table - stores compressed data for each archived table
export const archiveData = archiveSchema.table("archive_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  archiveId: uuid("archive_id").references(() => archiveMetadata.id, { onDelete: "cascade" }).notNull(),
  tableName: text("table_name").notNull(), // Name of the archived table
  tableData: jsonb("table_data").notNull(), // Compressed/serialized table data
  recordCount: integer("record_count").notNull().default(0), // Number of records in this table
  dataSize: integer("data_size").notNull().default(0), // Size of compressed data in bytes
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  archiveIdIdx: index("archive_data_archive_idx").on(table.archiveId),
  tableNameIdx: index("archive_data_table_name_idx").on(table.tableName),
}));

// Archive relationships - isolated within archive schema
export const archiveRelations = relations(archiveMetadata, ({ many }) => ({
  archiveData: many(archiveData),
  customers: many(archivedCustomers),
  customerIdentifiers: many(archivedCustomerIdentifiers),
  customerEvents: many(archivedCustomerEvents),
  customerEmbeddings: many(archivedCustomerEmbeddings),
  segments: many(archivedSegments),
  customerSegments: many(archivedCustomerSegments),
  dataImports: many(archivedDataImports),
  rawDataImports: many(archivedRawDataImports),
}));

export const archiveDataRelations = relations(archiveData, ({ one }) => ({
  archive: one(archiveMetadata, {
    fields: [archiveData.archiveId],
    references: [archiveMetadata.id],
  }),
}));

// Zod schemas for archive operations
export const insertArchiveMetadataSchema = createInsertSchema(archiveMetadata).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  restoredAt: true,
});

export const insertArchivedCustomerSchema = createInsertSchema(archivedCustomers).omit({
  id: true,
  archivedAt: true,
});

export const insertArchiveDataSchema = createInsertSchema(archiveData).omit({
  id: true,
  createdAt: true,
});

// Type exports for archive operations
export type ArchiveMetadata = typeof archiveMetadata.$inferSelect;
export type InsertArchiveMetadata = z.infer<typeof insertArchiveMetadataSchema>;

export type ArchivedCustomer = typeof archivedCustomers.$inferSelect;
export type InsertArchivedCustomer = z.infer<typeof insertArchivedCustomerSchema>;

export type ArchivedCustomerIdentifier = typeof archivedCustomerIdentifiers.$inferSelect;
export type ArchivedCustomerEvent = typeof archivedCustomerEvents.$inferSelect;
export type ArchivedCustomerEmbedding = typeof archivedCustomerEmbeddings.$inferSelect;
export type ArchivedSegment = typeof archivedSegments.$inferSelect;
export type ArchivedCustomerSegment = typeof archivedCustomerSegments.$inferSelect;
export type ArchivedDataImport = typeof archivedDataImports.$inferSelect;
export type ArchivedRawDataImport = typeof archivedRawDataImports.$inferSelect;

export type ArchiveData = typeof archiveData.$inferSelect;
export type InsertArchiveData = z.infer<typeof insertArchiveDataSchema>;

// Type aliases for compatibility with archive service
export type Archive = ArchiveMetadata;

// Archive table mapping for service operations
export const ARCHIVE_TABLE_MAPPING = {
  customers: archivedCustomers,
  customer_identifiers: archivedCustomerIdentifiers,
  customer_events: archivedCustomerEvents,
  customer_embeddings: archivedCustomerEmbeddings,
  segments: archivedSegments,
  customer_segments: archivedCustomerSegments,
  data_imports: archivedDataImports,
  raw_data_imports: archivedRawDataImports,
} as const;

// Export archive metadata table with alias for compatibility
export { archiveMetadata as archives };
