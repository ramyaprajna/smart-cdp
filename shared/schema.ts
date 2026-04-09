/**
 * ⚠️ CRITICAL FILE - CORE DATABASE SCHEMA - DO NOT DELETE ⚠️
 * This file defines the entire application's data model and is used throughout the system.
 */
import { pgTable, text, uuid, timestamp, jsonb, integer, real, boolean, index, uniqueIndex, customType } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Custom pgvector type definition for 1536-dimensional vectors
const vector = customType<{ data: number[]; notNull: false; default: false }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      // Parse vector string format: "[1,2,3]"
      const cleaned = value.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(Number);
    }
    return value as number[];
  },
});

// Embedding Jobs Table - for tracking cancellable embedding generation jobs
// Implementation: August 12, 2025 - Supports real-time cancellable embedding workflow
// Key Features: Job lifecycle management, token savings calculation, graceful cancellation
export const embeddingJobs = pgTable("embedding_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("idle"), // Job states: 'idle', 'running', 'cancelling', 'cancelled', 'completed', 'failed'
  totalCustomers: integer("total_customers").notNull().default(0), // Total customers to process in this job
  processedCustomers: integer("processed_customers").notNull().default(0), // Real-time count of completed customers
  batchSize: integer("batch_size").notNull().default(100), // Processing batch size (configurable via environment)
  cancelRequested: boolean("cancel_requested").notNull().default(false), // Flag for graceful cancellation
  estimatedTokensSaved: integer("estimated_tokens_saved").default(0), // Token cost savings from cancellation
  errorMessage: text("error_message"), // Error details for failed jobs
  autoRestartCount: integer("auto_restart_count").notNull().default(0), // Auto-restart attempts for orphaned jobs (max 3)
  lastFailedAt: timestamp("last_failed_at", { withTimezone: true }), // When job last failed (for cooldown period)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }), // When job processing began
  completedAt: timestamp("completed_at", { withTimezone: true }), // Natural completion time
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }), // User-initiated cancellation time
}, (table) => ({
  statusIdx: index("embedding_jobs_status_idx").on(table.status), // Fast status-based queries
  createdAtIdx: index("embedding_jobs_created_at_idx").on(table.createdAt), // Chronological ordering
}));

// Embedding Progress Table - for detailed progress tracking with database persistence
// Implementation: September 21, 2025 - Supports monitoring across restarts and distributed scaling
// Enhanced: September 22, 2025 - Added advanced batch metrics, concurrency control, watchdog detection, and adaptive processing
// Key Features: Batch-level progress tracking, error aggregation, time estimation, resumption capability, real-time streaming, adaptive batch sizing
export const embeddingProgress = pgTable("embedding_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  importId: uuid("import_id").notNull().unique(), // Links to specific import session
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed', 'cancelled', 'paused'
  totalCustomers: integer("total_customers").notNull().default(0), // Total customers to process
  processedCustomers: integer("processed_customers").notNull().default(0), // Customers processed so far
  generatedEmbeddings: integer("generated_embeddings").notNull().default(0), // Successfully generated embeddings
  failedEmbeddings: integer("failed_embeddings").notNull().default(0), // Failed embedding attempts
  currentBatch: integer("current_batch").default(0), // Current batch being processed
  totalBatches: integer("total_batches").default(0), // Total number of batches
  batchSize: integer("batch_size").notNull().default(50), // Size of each processing batch
  estimatedTimeRemainingMs: integer("estimated_time_remaining_ms"), // Estimated completion time in milliseconds
  errors: jsonb("errors").default('[]'), // Array of error messages for debugging
  processingMetrics: jsonb("processing_metrics"), // Performance metrics (timing, throughput, etc.)
  
  // Enhanced Timing and Performance Metrics
  averageBatchTimeMs: integer("average_batch_time_ms"), // Rolling average batch processing time
  lastBatchTimeMs: integer("last_batch_time_ms"), // Time for last completed batch
  fastestBatchTimeMs: integer("fastest_batch_time_ms"), // Fastest batch time recorded
  slowestBatchTimeMs: integer("slowest_batch_time_ms"), // Slowest batch time recorded
  throughputPerSecond: real("throughput_per_second"), // Current processing throughput (customers/second)
  
  // Concurrency and Rate Limiting
  maxConcurrentBatches: integer("max_concurrent_batches").default(1), // Maximum concurrent batch processing
  currentConcurrentBatches: integer("current_concurrent_batches").default(0), // Currently active batches
  adaptiveBatchSizing: boolean("adaptive_batch_sizing").default(true), // Enable dynamic batch size adjustment
  minBatchSize: integer("min_batch_size").default(10), // Minimum allowed batch size
  maxBatchSize: integer("max_batch_size").default(200), // Maximum allowed batch size
  
  // Rate Limiting and API Management
  apiCallsPerMinute: integer("api_calls_per_minute"), // Current API call rate
  rateLimitHits: integer("rate_limit_hits").default(0), // Number of rate limit encounters
  lastRateLimitHit: timestamp("last_rate_limit_hit", { withTimezone: true }), // When last rate limit was hit
  backoffMultiplier: real("backoff_multiplier").default(1.0), // Current exponential backoff multiplier
  
  // Retry and Recovery Management
  retryAttempts: integer("retry_attempts").default(0), // Total retry attempts made
  maxRetryAttempts: integer("max_retry_attempts").default(3), // Maximum retries allowed
  lastRetryAt: timestamp("last_retry_at", { withTimezone: true }), // When last retry was attempted
  recoveryStrategy: text("recovery_strategy").default("exponential_backoff"), // 'exponential_backoff', 'linear_backoff', 'immediate'
  
  // Watchdog and Health Monitoring
  watchdogTimeoutMs: integer("watchdog_timeout_ms").default(600000), // Watchdog timeout (10 minutes default)
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }), // Last activity timestamp for watchdog
  isStalled: boolean("is_stalled").default(false), // Marked as stalled by watchdog
  stalledAt: timestamp("stalled_at", { withTimezone: true }), // When job was marked as stalled
  stalledReason: text("stalled_reason"), // Reason for stalling (timeout, error, etc.)
  
  // Job Control and Management
  pauseRequested: boolean("pause_requested").default(false), // Request to pause processing
  pausedAt: timestamp("paused_at", { withTimezone: true }), // When job was paused
  resumedAt: timestamp("resumed_at", { withTimezone: true }), // When job was resumed
  cancelRequested: boolean("cancel_requested").default(false), // Request to cancel processing
  cancelledBy: uuid("cancelled_by"), // User who requested cancellation
  
  // Streaming and Real-time Updates
  lastStreamed: timestamp("last_streamed", { withTimezone: true }), // Last WebSocket broadcast
  streamingEnabled: boolean("streaming_enabled").default(true), // Enable real-time progress streaming
  subscriberCount: integer("subscriber_count").default(0), // Number of active WebSocket subscribers
  
  startedAt: timestamp("started_at", { withTimezone: true }), // When processing started
  completedAt: timestamp("completed_at", { withTimezone: true }), // When processing completed
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow(), // Last progress update
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  importIdIdx: index("embedding_progress_import_id_idx").on(table.importId), // Fast import-based lookups
  statusIdx: index("embedding_progress_status_idx").on(table.status), // Filter by status
  lastUpdatedIdx: index("embedding_progress_last_updated_idx").on(table.lastUpdatedAt), // Monitor stale jobs
  lastHeartbeatIdx: index("embedding_progress_heartbeat_idx").on(table.lastHeartbeat), // Watchdog monitoring
  isStalledException: index("embedding_progress_stalled_idx").on(table.isStalled), // Identify stalled jobs
  pauseRequestedIdx: index("embedding_progress_pause_idx").on(table.pauseRequested), // Job control filtering
  cancelRequestedIdx: index("embedding_progress_cancel_idx").on(table.cancelRequested), // Cancellation tracking
  streamingEnabledIdx: index("embedding_progress_streaming_idx").on(table.streamingEnabled), // Real-time filtering
}));

// Customer Embeddings Table - for vector similarity search
// Implementation: August 12, 2025 - PostgreSQL real array format for pgvector compatibility
// Key Features: Unique customer constraint for upserts, proper number array format
export const customerEmbeddings = pgTable("customer_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().unique(), // Unique constraint enables safe upsert operations
  embedding: real("embedding").array().notNull(), // Vector embedding as PostgreSQL real array (not JSON) - DEPRECATED: Use embeddingVector for performance
  embeddingVector: vector("embedding_vector"), // NEW: Optimized pgvector column for HNSW indexing and sub-second similarity search
  embeddingType: text("embedding_type").notNull().default("customer_profile"), // Future support for multiple embedding types
  profileTextHash: text("profile_text_hash"), // SHA-256 hash of normalized profile text for deduplication
  lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }).defaultNow(), // Tracks generation timestamp
}, (table) => ({
  embeddingTypeIdx: index("customer_embeddings_type_idx").on(table.embeddingType), // Fast type-based filtering
  customerIdIdx: index("customer_embeddings_customer_id_idx").on(table.customerId), // CRITICAL: Fast customer ID lookups and COUNT operations
  profileTextHashIdx: index("customer_embeddings_profile_hash_idx").on(table.profileTextHash), // Fast hash-based lookups for deduplication
}));

// Customers Table
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phoneNumber: text("phone_number"),
  dateOfBirth: timestamp("date_of_birth"),
  gender: text("gender"),
  currentAddress: jsonb("current_address"),
  customerSegment: text("customer_segment"),
  lifetimeValue: real("lifetime_value").default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  dataQualityScore: real("data_quality_score").default(0),
  importId: uuid("import_id"),
  sourceRowNumber: integer("source_row_number"),
  sourceFileHash: text("source_file_hash"),
  dataLineage: jsonb("data_lineage"),
  // Enhanced JSON Storage for Unmapped Fields
  unmappedFields: jsonb("unmapped_fields"), // Store unmapped source data as JSON
  originalSourceData: jsonb("original_source_data"), // Complete original row data
  fieldMappingMetadata: jsonb("field_mapping_metadata"), // AI mapping details and confidence scores
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index("customers_email_idx").on(table.email),
  segmentIdx: index("customers_segment_idx").on(table.customerSegment),
  lifetimeValueIdx: index("customers_lifetime_value_idx").on(table.lifetimeValue),
  // Additional performance indexes
  phoneNumberIdx: index("customers_phone_number_idx").on(table.phoneNumber),
  importIdIdx: index("customers_import_id_idx").on(table.importId),
  updatedAtIdx: index("customers_updated_at_idx").on(table.updatedAt),
  // JSONB GIN indexes for efficient JSON querying
  unmappedFieldsIdx: index("customers_unmapped_fields_gin_idx").using('gin', table.unmappedFields),
  originalSourceDataIdx: index("customers_original_source_data_gin_idx").using('gin', table.originalSourceData),
}));

// Customer Events Table
export const customerEvents = pgTable("customer_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull(),
  eventType: text("event_type").notNull(),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).defaultNow(),
  source: text("source"),
  sessionId: text("session_id"),
  deviceId: text("device_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  eventProperties: jsonb("event_properties"),
  importId: uuid("import_id"),
  sourceRowNumber: integer("source_row_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdIdx: index("customer_events_customer_id_idx").on(table.customerId),
  eventTypeIdx: index("customer_events_type_idx").on(table.eventType),
  timestampIdx: index("customer_events_timestamp_idx").on(table.eventTimestamp),
  // Composite index for efficient customer event queries
  customerTimestampIdx: index("customer_events_customer_timestamp_idx").on(table.customerId, table.eventTimestamp),
}));

// Segments Table
export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").notNull(),
  isActive: boolean("is_active").default(true),
  customerCount: integer("customer_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  nameIdx: index("segments_name_idx").on(table.name),
  activeIdx: index("segments_active_idx").on(table.isActive),
}));

// Customer Segments Junction Table
export const customerSegments = pgTable("customer_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull(),
  segmentId: uuid("segment_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdIdx: index("customer_segments_customer_id_idx").on(table.customerId),
  segmentIdIdx: index("customer_segments_segment_id_idx").on(table.segmentId),
}));

// Customer Identifiers Table
export const customerIdentifiers = pgTable("customer_identifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull(),
  identifierType: text("identifier_type").notNull(), // 'email', 'phone', 'national_id', etc.
  identifierValue: text("identifier_value").notNull(),
  sourceSystem: text("source_system"),
  importId: uuid("import_id"),
  sourceRowNumber: integer("source_row_number"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdIdx: index("customer_identifiers_customer_id_idx").on(table.customerId),
  typeValueIdx: index("customer_identifiers_type_value_idx").on(table.identifierType, table.identifierValue),
}));

// Users Table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("user"), // 'admin', 'user', 'viewer'
  isActive: boolean("is_active").default(false), // Changed to false for email activation
  isEmailVerified: boolean("is_email_verified").default(false),
  activationToken: text("activation_token"),
  activationTokenExpires: timestamp("activation_token_expires", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  roleIdx: index("users_role_idx").on(table.role),
  activationTokenIdx: index("users_activation_token_idx").on(table.activationToken),
}));

// User Sessions Table
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  tokenIdx: index("user_sessions_token_idx").on(table.sessionToken),
  expiresIdx: index("user_sessions_expires_idx").on(table.expiresAt),
}));

// Raw Data Imports Table
export const rawDataImports = pgTable("raw_data_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  importSessionId: uuid("import_session_id").notNull(),
  sourceFileName: text("source_file_name"),
  sourceSheetName: text("source_sheet_name"),
  sourceRowNumber: integer("source_row_number").notNull(),
  rawDataRow: jsonb("raw_data_row").notNull(),
  originalHeaders: jsonb("original_headers"),
  dataTypesDetected: jsonb("data_types_detected"),
  validationErrors: jsonb("validation_errors"),
  processingStatus: text("processing_status").notNull().default("pending"), // 'pending', 'processed', 'failed', 'skipped'
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  sessionIdIdx: index("raw_data_imports_session_id_idx").on(table.importSessionId),
  statusIdx: index("raw_data_imports_status_idx").on(table.processingStatus),
  sourceRowNumberIdx: index("raw_data_imports_source_row_number_idx").on(table.sourceRowNumber),
}));

// Data Imports Table (for completed imports)
export const dataImports = pgTable("data_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  importType: text("import_type").notNull(), // 'csv', 'xlsx', 'json', 'api'
  importSource: text("import_source"),
  recordsProcessed: integer("records_processed").default(0),
  recordsSuccessful: integer("records_successful").default(0),
  recordsFailed: integer("records_failed").default(0),
  recordsDuplicates: integer("records_duplicates").default(0),
  recordsSkipped: integer("records_skipped").default(0),
  recordsUpdated: integer("records_updated").default(0),
  recordsMerged: integer("records_merged").default(0),
  duplicateHandlingStrategy: text("duplicate_handling_strategy"), // 'skip_duplicates', 'overwrite_existing', 'merge_data', 'create_new'
  importStatus: text("import_status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  importMetadata: jsonb("import_metadata"),
  importedBy: text("imported_by"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  processingMode: text("processing_mode"),
  chunkSize: integer("chunk_size"),
  validationRules: jsonb("validation_rules"),
  fieldMappings: jsonb("field_mappings"),
}, (table) => ({
  statusIdx: index("data_imports_status_idx").on(table.importStatus),
  importedAtIdx: index("data_imports_imported_at_idx").on(table.importedAt),
  fileNameIdx: index("data_imports_file_name_idx").on(table.fileName),
  importSourceIdx: index("data_imports_source_idx").on(table.importSource),
}));

// Data Source Schemas Table (for flexible CDP schema management)
export const dataSourceSchemas = pgTable("data_source_schemas", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceName: text("source_name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  schemaVersion: text("schema_version").notNull().default("1.0"),
  fieldDefinitions: jsonb("field_definitions").notNull(), // FieldDefinition objects
  mappingTemplates: jsonb("mapping_templates"), // Header -> field mappings
  validationRules: jsonb("validation_rules"),
  industryContext: jsonb("industry_context"),
  isActive: boolean("is_active").default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceNameIdx: index("data_source_schemas_source_name_idx").on(table.sourceName),
  activeIdx: index("data_source_schemas_active_idx").on(table.isActive),
}));

// Customer Attributes Table (for dynamic attributes)
export const customerAttributes = pgTable("customer_attributes", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull(),
  attributeName: text("attribute_name").notNull(),
  attributeValue: text("attribute_value"),
  attributeType: text("attribute_type").notNull().default("text"), // 'text', 'number', 'date', 'boolean'
  dataSource: text("data_source"),
  confidence: real("confidence").default(1.0), // AI confidence score
  isSystem: boolean("is_system").default(false), // System vs user-defined
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdIdx: index("customer_attributes_customer_id_idx").on(table.customerId),
  attributeNameIdx: index("customer_attributes_name_idx").on(table.attributeName),
  customerAttributeIdx: index("customer_attributes_customer_name_idx").on(table.customerId, table.attributeName),
}));

// Enhanced Application Logs Table - Evidence-Based Structured Logging
// Implementation: August 14, 2025 - ✅ PRODUCTION READY
// Status: 2,514+ log entries operational with real-time monitoring
// Features: Structured logging, PII redaction, sampling, error grouping, lifecycle management
// Integration: Complete data flow synchronization verified from database to frontend
export const applicationLogs = pgTable("application_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  level: text("level").notNull(), // Standard levels: 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
  category: text("category").notNull(), // 'email', 'authentication', 'database', 'api', 'system', 'import', 'vector', 'archive', 'security', 'ai'
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional structured data
  userId: uuid("user_id"), // User associated with the event (if applicable)
  sessionId: text("session_id"), // Session identifier
  ipAddress: text("ip_address"), // Request IP address
  userAgent: text("user_agent"), // Browser/client information
  requestId: text("request_id"), // Unique request identifier for correlation
  correlationId: text("correlation_id"), // Cross-service correlation identifier
  stackTrace: text("stack_trace"), // Error stack trace (for errors)

  // Evidence-Based Enhancement Fields
  service: text("service").notNull().default("cdp-platform"), // Service/module identifier
  environment: text("environment").notNull().default("development"), // Environment context
  version: text("version"), // Application version/commit hash
  host: text("host"), // Host identifier

  // Data Quality & Security
  isRedacted: boolean("is_redacted").default(false), // PII/secrets redaction flag
  redactionRules: jsonb("redaction_rules"), // Applied redaction rules
  isSampled: boolean("is_sampled").default(false), // Sampling flag
  sampleRate: real("sample_rate"), // Applied sample rate

  // Error Grouping
  errorFingerprint: text("error_fingerprint"), // Normalized error signature for grouping
  errorGroupId: uuid("error_group_id"), // Reference to error group

  // Lifecycle Management
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ttlExpiry: timestamp("ttl_expiry", { withTimezone: true }), // Retention expiry

  // Schema Validation
  schemaVersion: text("schema_version").notNull().default("1.0"), // Log schema version
  isValid: boolean("is_valid").default(true), // Schema validation result
  validationErrors: jsonb("validation_errors"), // Validation error details

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Existing indexes
  timestampIdx: index("application_logs_timestamp_idx").on(table.timestamp),
  levelIdx: index("application_logs_level_idx").on(table.level),
  categoryIdx: index("application_logs_category_idx").on(table.category),
  userIdIdx: index("application_logs_user_id_idx").on(table.userId),
  archivedIdx: index("application_logs_archived_idx").on(table.isArchived),
  levelCategoryIdx: index("application_logs_level_category_idx").on(table.level, table.category),

  // Enhanced indexes for evidence-based requirements
  serviceIdx: index("application_logs_service_idx").on(table.service),
  environmentIdx: index("application_logs_environment_idx").on(table.environment),
  correlationIdIdx: index("application_logs_correlation_id_idx").on(table.correlationId),
  errorFingerprintIdx: index("application_logs_error_fingerprint_idx").on(table.errorFingerprint),
  errorGroupIdIdx: index("application_logs_error_group_id_idx").on(table.errorGroupId),
  ttlExpiryIdx: index("application_logs_ttl_expiry_idx").on(table.ttlExpiry),
  validIdx: index("application_logs_valid_idx").on(table.isValid),

  // Composite indexes for efficient filtering and analytics
  levelServiceIdx: index("application_logs_level_service_idx").on(table.level, table.service),
  timestampLevelIdx: index("application_logs_timestamp_level_idx").on(table.timestamp, table.level),
  environmentServiceIdx: index("application_logs_environment_service_idx").on(table.environment, table.service),
}));

// Error Groups Table - For error fingerprinting and grouping
// Implementation: August 14, 2025 - ✅ PRODUCTION READY
// Status: Intelligent error aggregation with MD5 fingerprinting operational
// Features: Normalized error signatures, occurrence tracking, sample log references
// Evidence: Complete schema validation, proper foreign key relationships
export const errorGroups = pgTable("error_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  fingerprint: text("fingerprint").notNull().unique(), // Normalized error signature
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1), // Total occurrences
  sampleLogId: uuid("sample_log_id"), // Reference to representative log entry
  level: text("level").notNull(), // Error level for grouping
  category: text("category").notNull(), // Category for grouping
  service: text("service").notNull(), // Service for grouping
  messageTemplate: text("message_template"), // Normalized message pattern
  stackTraceHash: text("stack_trace_hash"), // Stack trace signature
  isResolved: boolean("is_resolved").default(false), // Resolution status
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"), // User who resolved
  notes: text("notes"), // Resolution notes
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  fingerprintIdx: index("error_groups_fingerprint_idx").on(table.fingerprint),
  firstSeenIdx: index("error_groups_first_seen_idx").on(table.firstSeen),
  lastSeenIdx: index("error_groups_last_seen_idx").on(table.lastSeen),
  countIdx: index("error_groups_count_idx").on(table.count),
  levelIdx: index("error_groups_level_idx").on(table.level),
  serviceIdx: index("error_groups_service_idx").on(table.service),
  isResolvedIdx: index("error_groups_resolved_idx").on(table.isResolved),
  // Composite indexes for analytics
  levelServiceIdx: index("error_groups_level_service_idx").on(table.level, table.service),
  lastSeenCountIdx: index("error_groups_last_seen_count_idx").on(table.lastSeen, table.count),
}));

// Log Settings Table - For retention, redaction, and alert configuration
// Implementation: August 14, 2025 - Centralized logging configuration
// Features: Retention policies, redaction rules, sampling rates, alert thresholds
export const logSettings = pgTable("log_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  settingKey: text("setting_key").notNull().unique(), // Configuration key
  settingValue: jsonb("setting_value").notNull(), // Configuration value
  settingType: text("setting_type").notNull(), // 'retention', 'redaction', 'sampling', 'alerts'
  description: text("description"), // Human-readable description
  isActive: boolean("is_active").default(true),
  validationSchema: jsonb("validation_schema"), // JSON schema for value validation
  updatedBy: uuid("updated_by"), // Last modified by
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  settingKeyIdx: index("log_settings_key_idx").on(table.settingKey),
  settingTypeIdx: index("log_settings_type_idx").on(table.settingType),
  isActiveIdx: index("log_settings_active_idx").on(table.isActive),
}));

// Log Alerts Table - For health monitoring and anomaly detection
// Implementation: August 14, 2025 - Evidence-based health monitoring
// Features: Rolling error rates, z-score analysis, persistence of alert events
export const logAlerts = pgTable("log_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertType: text("alert_type").notNull(), // 'error_rate', 'volume_spike', 'anomaly', 'threshold'
  scope: text("scope").notNull(), // 'service', 'category', 'global'
  scopeValue: text("scope_value"), // Specific service/category if scoped
  metric: text("metric").notNull(), // 'error_rate', 'log_count', 'fatal_count'
  threshold: real("threshold").notNull(), // Alert threshold
  currentValue: real("current_value").notNull(), // Current metric value
  status: text("status").notNull().default("active"), // 'active', 'resolved', 'muted'
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'

  // Statistical Analysis
  analysisMethod: text("analysis_method"), // 'z_score', 'ewma', 'threshold'
  zScore: real("z_score"), // Z-score for anomaly detection
  baseline: real("baseline"), // Historical baseline value
  windowSize: integer("window_size"), // Analysis window in minutes

  // Alert Management
  firstTriggered: timestamp("first_triggered", { withTimezone: true }).notNull(),
  lastTriggered: timestamp("last_triggered", { withTimezone: true }).notNull(),
  triggerCount: integer("trigger_count").default(1), // Number of triggers
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"), // User who resolved
  mutedUntil: timestamp("muted_until", { withTimezone: true }), // Mute expiry

  // Context and Metadata
  alertData: jsonb("alert_data"), // Additional alert context
  message: text("message"), // Alert description
  actionRequired: text("action_required"), // Suggested actions

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  alertTypeIdx: index("log_alerts_type_idx").on(table.alertType),
  scopeIdx: index("log_alerts_scope_idx").on(table.scope),
  statusIdx: index("log_alerts_status_idx").on(table.status),
  severityIdx: index("log_alerts_severity_idx").on(table.severity),
  firstTriggeredIdx: index("log_alerts_first_triggered_idx").on(table.firstTriggered),
  lastTriggeredIdx: index("log_alerts_last_triggered_idx").on(table.lastTriggered),
  // Composite indexes for efficient filtering
  statusSeverityIdx: index("log_alerts_status_severity_idx").on(table.status, table.severity),
  scopeStatusIdx: index("log_alerts_scope_status_idx").on(table.scope, table.status),
  alertTypeStatusIdx: index("log_alerts_type_status_idx").on(table.alertType, table.status),
}));

// CDP Phase 1A: Customer Profile (Golden Record)
export const customerProfile = pgTable("customer_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phoneNumber: text("phone_number"),
  whatsappId: text("whatsapp_id"),
  dateOfBirth: timestamp("date_of_birth"),
  gender: text("gender"),
  currentAddress: jsonb("current_address"),
  mergedProfileIds: text("merged_profile_ids").array(),
  attributes: jsonb("attributes"),
  dataQualityScore: real("data_quality_score").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index("customer_profile_email_idx").on(table.email),
  phoneIdx: index("customer_profile_phone_idx").on(table.phoneNumber),
  whatsappIdx: index("customer_profile_whatsapp_idx").on(table.whatsappId),
}));

// CDP Phase 1A: Customer Identity (links identifiers to golden record profiles)
export const customerIdentity = pgTable("customer_identity", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  identifierType: text("identifier_type").notNull(),
  identifierValue: text("identifier_value").notNull(),
  sourceSystem: text("source_system"),
  confidence: real("confidence").default(1.0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileIdIdx: index("customer_identity_profile_id_idx").on(table.profileId),
  typeValueUniqueIdx: uniqueIndex("customer_identity_type_value_unique_idx").on(table.identifierType, table.identifierValue),
}));

// CDP Phase 1A: Event Store (immutable event log for CDP pipeline)
export const eventStore = pgTable("event_store", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  eventType: text("event_type").notNull(),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).defaultNow(),
  source: text("source"),
  channel: text("channel"),
  idempotencyKey: text("idempotency_key"),
  eventProperties: jsonb("event_properties"),
  rawPayload: jsonb("raw_payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileIdIdx: index("event_store_profile_id_idx").on(table.profileId),
  eventTypeIdx: index("event_store_event_type_idx").on(table.eventType),
  timestampIdx: index("event_store_timestamp_idx").on(table.eventTimestamp),
  profileTimestampIdx: index("event_store_profile_timestamp_idx").on(table.profileId, table.eventTimestamp),
  idempotencyKeyIdx: uniqueIndex("event_store_idempotency_key_idx").on(table.idempotencyKey),
}));

// CDP Phase 1A: Segment Definition (rule-based segment definitions for CDP)
export const segmentDefinition = pgTable("segment_definition", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  rules: jsonb("rules").notNull(),
  isActive: boolean("is_active").default(true),
  evaluationFrequency: text("evaluation_frequency").default("daily"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  memberCount: integer("member_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  nameIdx: index("segment_definition_name_idx").on(table.name),
  activeIdx: index("segment_definition_active_idx").on(table.isActive),
}));

// =====================================================
// CDP Phase 2B: Point Ledger & Loyalty Core
// =====================================================

// Point Ledger Table — immutable append-only transaction log
// Balances are ALWAYS derived from this table; never stored directly.
// Application enforces append-only (no updates/deletes in service layer).
export const pointLedger = pgTable("point_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  transactionType: text("transaction_type").notNull(), // 'earn' | 'burn' | 'expiry' | 'adjustment'
  activityType: text("activity_type").notNull(), // 'quiz_complete' | 'survey_submit' | 'referral_success' | 'task_complete' | 'redemption' | 'expiry' | 'admin_adjustment'
  points: integer("points").notNull(), // positive = earn, negative = burn
  balanceAfter: integer("balance_after").notNull(), // snapshot of balance after this transaction
  idempotencyKey: text("idempotency_key").notNull(), // prevents duplicate earn/burn
  referenceId: text("reference_id"), // external reference (quiz ID, campaign ID, redemption ID, etc.)
  referrerProfileId: uuid("referrer_profile_id"), // for referral transactions
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = points never expire
  metadata: jsonb("metadata"), // additional context
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileIdIdx: index("point_ledger_profile_id_idx").on(table.profileId),
  transactionTypeIdx: index("point_ledger_transaction_type_idx").on(table.transactionType),
  activityTypeIdx: index("point_ledger_activity_type_idx").on(table.activityType),
  createdAtIdx: index("point_ledger_created_at_idx").on(table.createdAt),
  expiresAtIdx: index("point_ledger_expires_at_idx").on(table.expiresAt),
  idempotencyKeyIdx: uniqueIndex("point_ledger_idempotency_key_idx").on(table.idempotencyKey),
  profileCreatedIdx: index("point_ledger_profile_created_idx").on(table.profileId, table.createdAt),
}));

// Point Balance Table — materialized cache for fast balance lookups
// Updated on each transaction; derived from point_ledger for consistency.
export const pointBalance = pgTable("point_balance", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  totalEarned: integer("total_earned").notNull().default(0), // all-time earned points
  totalBurned: integer("total_burned").notNull().default(0), // all-time burned points
  currentBalance: integer("current_balance").notNull().default(0), // active non-expired balance
  pendingRedemption: integer("pending_redemption").notNull().default(0), // points locked in pending redemptions
  loyaltyTier: text("loyalty_tier").notNull().default("bronze"), // 'bronze' | 'silver' | 'gold' | 'platinum'
  lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileIdIdx: uniqueIndex("point_balance_profile_id_idx").on(table.profileId),
  loyaltyTierIdx: index("point_balance_tier_idx").on(table.loyaltyTier),
  currentBalanceIdx: index("point_balance_current_balance_idx").on(table.currentBalance),
}));

// Redemption Table — tracks redemption requests with status lifecycle
export const redemption = pgTable("redemption", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  points: integer("points").notNull(), // points to burn for this redemption
  rewardType: text("reward_type").notNull(), // 'voucher' | 'cashback' | 'merchandise' | 'donation'
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled'
  idempotencyKey: text("idempotency_key").notNull(), // prevents duplicate redemption requests
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processedBy: uuid("processed_by"), // admin user ID who processed this
  redemptionCode: text("redemption_code"), // voucher code or reference
  notes: text("notes"),
  metadata: jsonb("metadata"), // reward-type-specific data
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileIdIdx: index("redemption_profile_id_idx").on(table.profileId),
  statusIdx: index("redemption_status_idx").on(table.status),
  requestedAtIdx: index("redemption_requested_at_idx").on(table.requestedAt),
  idempotencyKeyIdx: uniqueIndex("redemption_idempotency_key_idx").on(table.idempotencyKey),
  profileStatusIdx: index("redemption_profile_status_idx").on(table.profileId, table.status),
}));

// =====================================================
// CDP Phase 2A: Consent & Suppression Layer
// =====================================================

// Consent Record Table - tracks opt-in/opt-out per channel per customer profile
export const consentRecord = pgTable("consent_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(), // References customer_profile.id
  channel: text("channel").notNull(), // 'whatsapp', 'email', 'sms', 'push', 'all'
  status: text("status").notNull().default("pending"), // 'opt_in', 'opt_out', 'pending', 'revoked'
  method: text("method"), // 'explicit', 'implicit', 'double_opt_in', 'system'
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Optional consent expiry
  source: text("source"), // 'web_form', 'api', 'waba', 'crm', 'import'
  consentText: text("consent_text"), // Exact consent language shown to user
  ipAddress: text("ip_address"), // IP address when consent was given
  userAgent: text("user_agent"), // Browser/app info when consent was given
  // Frequency capping configuration
  maxSendsPerDay: integer("max_sends_per_day"), // null = unlimited
  maxSendsPerWeek: integer("max_sends_per_week"), // null = unlimited
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileChannelIdx: uniqueIndex("consent_record_profile_channel_idx").on(table.profileId, table.channel),
  profileIdIdx: index("consent_record_profile_id_idx").on(table.profileId),
  channelIdx: index("consent_record_channel_idx").on(table.channel),
  statusIdx: index("consent_record_status_idx").on(table.status),
}));

// Suppression List Table - global/channel-level blocklist
export const suppressionList = pgTable("suppression_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifierType: text("identifier_type").notNull(), // 'profile_id', 'email', 'phone', 'global'
  identifierValue: text("identifier_value").notNull(), // The actual identifier value
  channel: text("channel"), // null means all channels suppressed
  reason: text("reason").notNull(), // 'unsubscribe', 'bounce', 'complaint', 'legal', 'manual', 'fraud'
  addedBy: uuid("added_by"), // User ID who added this record
  notes: text("notes"),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Optional suppression expiry
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  identifierIdx: index("suppression_list_identifier_idx").on(table.identifierType, table.identifierValue),
  channelIdx: index("suppression_list_channel_idx").on(table.channel),
  isActiveIdx: index("suppression_list_active_idx").on(table.isActive),
  uniqueEntry: uniqueIndex("suppression_list_unique_entry_idx").on(table.identifierType, table.identifierValue, table.channel),
}));

// Consent Frequency Log - tracks sends per profile/channel for frequency capping
export const consentFrequencyLog = pgTable("consent_frequency_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(),
  channel: text("channel").notNull(),
  campaignId: uuid("campaign_id"), // Optional, links to campaign when available
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  profileChannelIdx: index("freq_log_profile_channel_idx").on(table.profileId, table.channel),
  sentAtIdx: index("freq_log_sent_at_idx").on(table.sentAt),
  profileChannelSentIdx: index("freq_log_profile_channel_sent_idx").on(table.profileId, table.channel, table.sentAt),
}));

// =====================================================
// CDP Phase 2C: Campaign Management Module
// =====================================================

// Campaign Table — defines outbound campaigns (WhatsApp/email)
// Status lifecycle: draft → scheduled → sending → sent → completed | cancelled
export const campaign = pgTable("campaign", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  channel: text("channel").notNull(), // 'whatsapp' | 'email' | 'sms' | 'push'
  status: text("status").notNull().default("draft"), // 'draft' | 'scheduled' | 'sending' | 'sent' | 'completed' | 'cancelled'
  segmentDefinitionId: uuid("segment_definition_id"), // References segment_definition.id
  templateId: text("template_id"), // External template reference (WhatsApp template name, email template ID)
  templatePayload: jsonb("template_payload"), // Template variables / personalization map
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // null = immediate execution
  executedAt: timestamp("executed_at", { withTimezone: true }), // When campaign was actually sent
  completedAt: timestamp("completed_at", { withTimezone: true }), // When all messages processed
  createdBy: uuid("created_by"), // User who created the campaign
  // Analytics counters — updated as delivery status events arrive
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  readCount: integer("read_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  metadata: jsonb("metadata"), // Additional campaign context
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index("campaign_status_idx").on(table.status),
  channelIdx: index("campaign_channel_idx").on(table.channel),
  segmentDefinitionIdIdx: index("campaign_segment_definition_id_idx").on(table.segmentDefinitionId),
  scheduledAtIdx: index("campaign_scheduled_at_idx").on(table.scheduledAt),
  createdAtIdx: index("campaign_created_at_idx").on(table.createdAt),
  createdByIdx: index("campaign_created_by_idx").on(table.createdBy),
}));

// Campaign Message Table — individual send record per recipient
// One row per (campaign, profile_id) — tracks delivery status per recipient
export const campaignMessage = pgTable("campaign_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull(), // References campaign.id
  profileId: uuid("profile_id").notNull(), // References customer_profile.id
  channel: text("channel").notNull(), // Inherited from campaign
  status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed'
  suppressionReason: text("suppression_reason"), // Reason if suppressed (no_consent, frequency_capped, suppressed)
  // Delivery tracking (populated by channel integration callbacks)
  externalMessageId: text("external_message_id"), // WABA/email provider message ID
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  // Personalization snapshot
  recipientAddress: text("recipient_address"), // Phone/email used for sending
  personalizedPayload: jsonb("personalized_payload"), // Resolved template variables for this recipient
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  campaignIdIdx: index("campaign_message_campaign_id_idx").on(table.campaignId),
  profileIdIdx: index("campaign_message_profile_id_idx").on(table.profileId),
  statusIdx: index("campaign_message_status_idx").on(table.status),
  campaignProfileUniqueIdx: uniqueIndex("campaign_message_campaign_profile_unique_idx").on(table.campaignId, table.profileId),
  channelIdx: index("campaign_message_channel_idx").on(table.channel),
  sentAtIdx: index("campaign_message_sent_at_idx").on(table.sentAt),
}));

// =====================================================
// CDP Phase 2D: WABA Channel Integration
// =====================================================

// waba_template: local cache of approved WhatsApp message templates
// Populated via GET /api/waba/templates?refresh=true
export const wabaTemplate = pgTable("waba_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalTemplateId: text("external_template_id").notNull().unique(), // Meta template ID
  name: text("name").notNull(),
  status: text("status").notNull(),    // 'APPROVED' | 'PENDING' | 'REJECTED'
  category: text("category").notNull(), // 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: text("language").notNull(), // BCP-47 e.g. 'id', 'en_US'
  components: jsonb("components"),      // Full component definition from Meta API
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  nameIdx: index("waba_template_name_idx").on(table.name),
  statusIdx: index("waba_template_status_idx").on(table.status),
  languageIdx: index("waba_template_language_idx").on(table.language),
  lastSyncedAtIdx: index("waba_template_last_synced_at_idx").on(table.lastSyncedAt),
}));

// CDP Phase 2D: WABA types
export type WabaTemplateRecord = typeof wabaTemplate.$inferSelect;

// Relations
export const customersRelations = relations(customers, ({ many }) => ({
  events: many(customerEvents),
  embeddings: many(customerEmbeddings),
  segments: many(customerSegments),
  identifiers: many(customerIdentifiers),
}));

export const customerEventsRelations = relations(customerEvents, ({ one }) => ({
  customer: one(customers, { fields: [customerEvents.customerId], references: [customers.id] }),
}));

export const customerEmbeddingsRelations = relations(customerEmbeddings, ({ one }) => ({
  customer: one(customers, { fields: [customerEmbeddings.customerId], references: [customers.id] }),
}));

export const segmentsRelations = relations(segments, ({ many }) => ({
  customers: many(customerSegments),
}));

export const customerSegmentsRelations = relations(customerSegments, ({ one }) => ({
  customer: one(customers, { fields: [customerSegments.customerId], references: [customers.id] }),
  segment: one(segments, { fields: [customerSegments.segmentId], references: [segments.id] }),
}));

export const customerIdentifiersRelations = relations(customerIdentifiers, ({ one }) => ({
  customer: one(customers, { fields: [customerIdentifiers.customerId], references: [customers.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

// CDP Phase 1A Relations
export const customerProfileRelations = relations(customerProfile, ({ many }) => ({
  identities: many(customerIdentity),
  events: many(eventStore),
}));

export const customerIdentityRelations = relations(customerIdentity, ({ one }) => ({
  profile: one(customerProfile, { fields: [customerIdentity.profileId], references: [customerProfile.id] }),
}));

export const eventStoreRelations = relations(eventStore, ({ one }) => ({
  profile: one(customerProfile, { fields: [eventStore.profileId], references: [customerProfile.id] }),
}));

// Logging Relations
export const applicationLogsRelations = relations(applicationLogs, ({ one }) => ({
  errorGroup: one(errorGroups, { fields: [applicationLogs.errorGroupId], references: [errorGroups.id] }),
}));

export const errorGroupsRelations = relations(errorGroups, ({ one, many }) => ({
  sampleLog: one(applicationLogs, { fields: [errorGroups.sampleLogId], references: [applicationLogs.id] }),
  logs: many(applicationLogs),
}));

// Zod schemas for validation
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerEventSchema = createInsertSchema(customerEvents).omit({
  id: true,
  createdAt: true,
});

export const insertSegmentSchema = createInsertSchema(segments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerEmbeddingSchema = createInsertSchema(customerEmbeddings).omit({
  id: true,
});

export const insertEmbeddingJobSchema = createInsertSchema(embeddingJobs).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
});

export const insertRawDataImportSchema = createInsertSchema(rawDataImports).omit({
  id: true,
  createdAt: true,
});

export const insertDataImportSchema = createInsertSchema(dataImports).omit({
  id: true,
});

export const insertDataSourceSchemaSchema = createInsertSchema(dataSourceSchemas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerAttributeSchema = createInsertSchema(customerAttributes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApplicationLogSchema = createInsertSchema(applicationLogs).omit({
  id: true,
  createdAt: true,
  isArchived: true,
  archivedAt: true,
  ttlExpiry: true,
});

export const insertErrorGroupSchema = createInsertSchema(errorGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLogSettingSchema = createInsertSchema(logSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLogAlertSchema = createInsertSchema(logAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfile).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerIdentitySchema = createInsertSchema(customerIdentity).omit({
  id: true,
  createdAt: true,
});

export const insertEventStoreSchema = createInsertSchema(eventStore).omit({
  id: true,
  createdAt: true,
});

export const insertSegmentDefinitionSchema = createInsertSchema(segmentDefinition).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CDP Phase 2A: Consent & Suppression insert schemas
export const insertConsentRecordSchema = createInsertSchema(consentRecord).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSuppressionListSchema = createInsertSchema(suppressionList).omit({
  id: true,
  createdAt: true,
});

export const insertConsentFrequencyLogSchema = createInsertSchema(consentFrequencyLog).omit({
  id: true,
  createdAt: true,
});

// =====================================================
// Deterministic Segmentation Engine Types
// =====================================================

export interface SegmentCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'within_days' | 'contains' | 'not_contains' | 'is_null' | 'is_not_null';
  value?: string | number | boolean | null;
}

export interface SegmentRuleGroup {
  operator: 'AND' | 'OR';
  conditions: (SegmentCondition | SegmentRuleGroup)[];
}

export type SegmentRules = SegmentRuleGroup;

export interface SegmentEvaluationResult {
  segmentId: string;
  segmentName: string;
  matchingProfileIds: string[];
  memberCount: number;
  evaluatedAt: string;
  durationMs: number;
}

// Type exports
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type CustomerEvent = typeof customerEvents.$inferSelect;
export type InsertCustomerEvent = z.infer<typeof insertCustomerEventSchema>;

export type Segment = typeof segments.$inferSelect;
export type InsertSegment = z.infer<typeof insertSegmentSchema>;

export type CustomerEmbedding = typeof customerEmbeddings.$inferSelect;
export type InsertCustomerEmbedding = z.infer<typeof insertCustomerEmbeddingSchema>;

export type EmbeddingJob = typeof embeddingJobs.$inferSelect;
export type InsertEmbeddingJob = z.infer<typeof insertEmbeddingJobSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;

export type RawDataImport = typeof rawDataImports.$inferSelect;
export type InsertRawDataImport = z.infer<typeof insertRawDataImportSchema>;

export type DataImport = typeof dataImports.$inferSelect;
export type InsertDataImport = z.infer<typeof insertDataImportSchema>;

export type DataSourceSchema = typeof dataSourceSchemas.$inferSelect;
export type InsertDataSourceSchema = z.infer<typeof insertDataSourceSchemaSchema>;

export type CustomerAttribute = typeof customerAttributes.$inferSelect;
export type InsertCustomerAttribute = z.infer<typeof insertCustomerAttributeSchema>;

export type ApplicationLog = typeof applicationLogs.$inferSelect;
export type InsertApplicationLog = z.infer<typeof insertApplicationLogSchema>;

export type ErrorGroup = typeof errorGroups.$inferSelect;
export type InsertErrorGroup = z.infer<typeof insertErrorGroupSchema>;

export type LogSetting = typeof logSettings.$inferSelect;
export type InsertLogSetting = z.infer<typeof insertLogSettingSchema>;

export type LogAlert = typeof logAlerts.$inferSelect;
export type InsertLogAlert = z.infer<typeof insertLogAlertSchema>;

export type CustomerProfile = typeof customerProfile.$inferSelect;
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;

export type CustomerIdentity = typeof customerIdentity.$inferSelect;
export type InsertCustomerIdentity = z.infer<typeof insertCustomerIdentitySchema>;

export type EventStoreEntry = typeof eventStore.$inferSelect;
export type InsertEventStoreEntry = z.infer<typeof insertEventStoreSchema>;

export type SegmentDefinition = typeof segmentDefinition.$inferSelect;
export type InsertSegmentDefinition = z.infer<typeof insertSegmentDefinitionSchema>;

// CDP Phase 2A: Consent & Suppression types
export type ConsentRecord = typeof consentRecord.$inferSelect;
export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;

export type SuppressionListEntry = typeof suppressionList.$inferSelect;
export type InsertSuppressionListEntry = z.infer<typeof insertSuppressionListSchema>;

export type ConsentFrequencyLog = typeof consentFrequencyLog.$inferSelect;
export type InsertConsentFrequencyLog = z.infer<typeof insertConsentFrequencyLogSchema>;

// CDP Phase 2B: Point Ledger & Loyalty insert schemas
export const insertPointLedgerSchema = createInsertSchema(pointLedger).omit({
  id: true,
  createdAt: true,
});

export const insertPointBalanceSchema = createInsertSchema(pointBalance).omit({
  id: true,
  updatedAt: true,
});

export const insertRedemptionSchema = createInsertSchema(redemption).omit({
  id: true,
  requestedAt: true,
  createdAt: true,
});

// CDP Phase 2B: Point Ledger & Loyalty types
export type PointLedgerEntry = typeof pointLedger.$inferSelect;
export type InsertPointLedgerEntry = z.infer<typeof insertPointLedgerSchema>;

export type PointBalance = typeof pointBalance.$inferSelect;
export type InsertPointBalance = z.infer<typeof insertPointBalanceSchema>;

export type Redemption = typeof redemption.$inferSelect;
export type InsertRedemption = z.infer<typeof insertRedemptionSchema>;

// CDP Phase 2C: Campaign Management insert schemas
export const insertCampaignSchema = createInsertSchema(campaign).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executedAt: true,
  completedAt: true,
  totalRecipients: true,
  sentCount: true,
  deliveredCount: true,
  readCount: true,
  failedCount: true,
});

export const insertCampaignMessageSchema = createInsertSchema(campaignMessage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  failedAt: true,
});

// CDP Phase 2C: Campaign Management types
export type Campaign = typeof campaign.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type CampaignMessage = typeof campaignMessage.$inferSelect;
export type InsertCampaignMessage = z.infer<typeof insertCampaignMessageSchema>;
