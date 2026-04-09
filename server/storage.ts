/**
 * ⚠️ CRITICAL SERVICE - DATABASE STORAGE LAYER - DO NOT DELETE ⚠️
 * Database Storage Layer - Core Data Access Interface
 *
 * This module provides the primary database abstraction layer for the Smart CDP Platform.
 * Implements all CRUD operations, analytics queries, and business logic for customer data,
 * user management, and system operations with basic caching and performance monitoring.
 *
 * @module DatabaseStorage
 * @created Initial implementation
 * @last_updated August 5, 2025
 *
 * @architecture
 * - Single responsibility: Database operations and data access patterns
 * - Interface-based design (IStorage) for testability and maintainability
 * - Comprehensive error handling with proper transaction management
 * - Basic query caching with room for optimization (current COUNT queries: 1000-1700ms)
 * - Type-safe operations using Drizzle ORM and TypeScript
 *
 * @dependencies
 * - @shared/schema - Type-safe database schema definitions and validation
 * - db - PostgreSQL connection with pgvector extensions
 * - drizzle-orm - Type-safe SQL query builder and ORM
 * - cache - LRU-Cache based caching layer for performance optimization
 *
 * @capabilities
 * - Customer lifecycle management (CRUD operations)
 * - Vector similarity search and embedding operations
 * - Advanced analytics and reporting queries
 * - User authentication and session management
 * - Data import tracking and error handling
 * - Segment management and customer classification
 * - Performance metrics and data quality scoring
 *
 * @current_performance_status
 * - Basic query caching with TTL management
 * - Database indexes exist but require optimization for 348K+ records
 * - Batch processing available but needs tuning for large operations
 * - Connection pooling enabled
 * - TODO: Optimize COUNT queries for analytics endpoints
 * - TODO: Add database indexing strategies for performance improvements
 */
import { customers, customerEvents, customerEmbeddings, segments, customerSegments, customerIdentifiers, users, userSessions, rawDataImports, applicationLogs, errorGroups, logSettings, logAlerts, type Customer, type InsertCustomer, type CustomerEvent, type InsertCustomerEvent, type Segment, type InsertSegment, type CustomerEmbedding, type User, type InsertUser, type UserSession, type InsertUserSession, type RawDataImport, type InsertRawDataImport, type ApplicationLog, type InsertApplicationLog, type ErrorGroup, type InsertErrorGroup, type LogSetting, type InsertLogSetting, type LogAlert, type InsertLogAlert } from "@shared/schema";
import { AnalyticsStorageBase } from './storage/analytics-storage';
import { db } from "./db";
import { eq, desc, like, sql, and, gte, lte, count, ilike, gt, lt, ne, or, isNull, isNotNull } from "drizzle-orm";
import { cacheManager } from "./cache";
import { SecuritySanitizer } from './utils/security-sanitizer';

// CRITICAL INTEGRATION: Import new services to fix schema mismatch issue
import { segmentCriteriaService } from './services/segment-criteria-service';
import { fieldValidationService } from './services/field-validation-service';
import { simplePerformanceService } from './services/segment-performance-service-simple';
import { piiMaskingService } from './services/pii-masking-service';
import { secureLogger } from './utils/secure-logger';

/**
 * Storage Interface Definition
 *
 * Comprehensive interface defining all database operations for the Smart CDP Platform.
 * This interface ensures consistent data access patterns across the application and
 * enables easy testing with mock implementations.
 *
 * @interface IStorage
 * @purpose Abstract all database operations behind a clean, testable interface
 * @pattern Repository pattern for data access layer separation
 */
export interface IStorage {
  // Customer operations - Core customer lifecycle management
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer>;
  searchCustomers(query: string, limit?: number): Promise<Customer[]>; // Full-text search across customer data
  getCustomers(offset?: number, limit?: number): Promise<{ customers: Customer[], total: number }>; // Paginated customer listing
  getFilteredCustomers(filters: any): Promise<Customer[]>; // Advanced filtering with multiple criteria

  // Customer events
  createCustomerEvent(event: InsertCustomerEvent): Promise<CustomerEvent>;
  getCustomerEvents(customerId: string, limit?: number): Promise<CustomerEvent[]>;

  // Vector similarity search
  findSimilarCustomers(embedding: number[], threshold?: number, limit?: number): Promise<Array<Customer & { similarity: number }>>;
  getCustomerEmbedding(customerId: string): Promise<CustomerEmbedding | undefined>;
  upsertCustomerEmbedding(customerId: string, embedding: number[], embeddingType: string): Promise<CustomerEmbedding>;

  // Segments
  getSegments(): Promise<Segment[]>;
  createSegment(segment: InsertSegment): Promise<Segment>;
  updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment>;
  getCustomerSegments(customerId: string): Promise<Segment[]>;

  // Analytics
  getCustomerStats(): Promise<{
    totalCustomers: number;
    activeSegments: number;
    avgDataQuality: number;
    newCustomersThisMonth: number;
  }>;
  getSegmentDistribution(): Promise<Array<{ segment: string; count: number }>>;

  // Customer identifiers
  getCustomersByIdentifierType(identifierType: string): Promise<Customer[]>;

  // Enhanced customer queries for segments
  getCustomersWithEmail(): Promise<Customer[]>;
  getCustomersWithPhone(): Promise<Customer[]>;
  getCustomersByAgeRange(minAge: number, maxAge: number): Promise<Customer[]>;
  getCustomersByLocation(location: string): Promise<Customer[]>;
  getCustomersByCriteria(criteria: any): Promise<Customer[]>;
  getAllCustomersForAnalysis(): Promise<Customer[]>;
  
  // PERFORMANCE OPTIMIZATION: COUNT queries for segments (prevents full table scans)
  getCustomerCountByCriteria(criteria: any): Promise<number>;
  getCustomerCountWithEmail(): Promise<number>;
  getCustomerCountWithPhone(): Promise<number>;
  getCustomerCountByAgeRange(minAge: number, maxAge: number): Promise<number>;
  getCustomerCountBySegment(segmentName: string): Promise<number>;
  getSegmentAnalytics(segmentId: string, customers: Customer[]): Promise<{
    activityRate: number;
    avgLifetimeValue: number;
    avgDataQuality: number;
    genderDistribution: { male: number; female: number; unknown: number };
    topCities: string[];
    ageRange: { min: number; max: number; avg: number };
    recentlyActive: number;
  }>;

  // Phase 2: Raw Data Landing Zone operations
  getRawDataImports(importSessionId: string, limit?: number, offset?: number): Promise<RawDataImport[]>;
  createRawDataImport(rawData: InsertRawDataImport): Promise<RawDataImport>;
  getRawDataStats(importSessionId: string): Promise<{
    totalRows: number;
    pendingRows: number;
    processedRows: number;
    failedRows: number;
  }>;
  markRawDataProcessed(rawDataIds: string[], status?: 'processed' | 'failed' | 'skipped'): Promise<void>;

  // User management
  getUsers(offset?: number, limit?: number): Promise<{ users: User[], total: number }>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByActivationToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  activateUser(id: string): Promise<User>;
  updateUserActivationToken(id: string, token: string, expires: Date): Promise<User>;
  updateUserLastLogin(id: string): Promise<void>;
  deleteUser(id: string): Promise<boolean>;

  // User sessions
  createUserSession(session: InsertUserSession): Promise<UserSession>;
  getUserSession(sessionToken: string): Promise<UserSession | undefined>;
  deleteUserSession(sessionToken: string): Promise<boolean>;
  updateUserLastLogin(userId: string): Promise<void>;

  // Application logs
  getApplicationLogs(filters?: {
    level?: string;
    category?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    isArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: ApplicationLog[], total: number }>;
  createApplicationLog(log: InsertApplicationLog): Promise<ApplicationLog>;
  archiveApplicationLogs(logIds: string[]): Promise<void>;
  deleteApplicationLogs(logIds: string[]): Promise<void>;
  getLogStats(): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByCategory: Record<string, number>;
    recentErrors: number;
    archivedLogs: number;
  }>;

  // Enhanced Evidence-Based Logging Methods (Phase 2)

  // Error Groups Management
  findOrCreateErrorGroup(errorData: {
    fingerprint: string;
    level: string;
    category: string;
    service: string;
    messageTemplate: string;
    stackTraceHash?: string;
  }): Promise<string>; // Returns error group ID
  getErrorGroups(filters?: {
    level?: string;
    category?: string;
    service?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ errorGroups: ErrorGroup[], total: number }>;
  getErrorGroupById(id: string): Promise<ErrorGroup | undefined>;
  updateErrorGroupStatus(id: string, status: 'active' | 'resolved' | 'ignored'): Promise<ErrorGroup>;

  // Log Settings Management
  getLogSettings(settingKey?: string): Promise<LogSetting | LogSetting[] | undefined>;
  upsertLogSetting(setting: InsertLogSetting): Promise<LogSetting>;
  deleteLogSetting(settingKey: string): Promise<void>;

  // Log Alerts Management
  createLogAlert(alert: InsertLogAlert): Promise<LogAlert>;
  getLogAlerts(filters?: {
    isActive?: boolean;
    alertLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: LogAlert[], total: number }>;
  updateLogAlert(id: string, updates: Partial<InsertLogAlert>): Promise<LogAlert>;
  deleteLogAlert(id: string): Promise<void>;

  // Enhanced Analytics and Health Monitoring
  getLogAnalytics(timeRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByCategory: Record<string, number>;
    errorRate: number;
    errorGroups: number;
    topErrors: Array<{ fingerprint: string; count: number; message: string }>;
    timeSeriesData: Array<{ timestamp: Date; count: number; level: string }>;
    healthScore: number;
    trends: {
      errorTrend: 'increasing' | 'decreasing' | 'stable';
      volumeTrend: 'increasing' | 'decreasing' | 'stable';
    };
  }>;

  getLogHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    metrics: {
      errorRate: number;
      logVolume: number;
      avgResponseTime: number;
      failedLogsCount: number;
    };
    alerts: Array<{
      type: string;
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  }>;
}



export class DatabaseStorage extends AnalyticsStorageBase implements IStorage {
  // Phase 2: Raw data operations implementation
}

export const storage = new DatabaseStorage();
