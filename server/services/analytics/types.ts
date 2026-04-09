/**
 * Analytics Service Types - TypeScript Interfaces
 * 
 * Pure type definitions for analytics service modules
 * Extracted from analytics routes for better type safety and modularity
 * 
 * Last Updated: September 17, 2025
 * Code Quality: Type-safe definitions with comprehensive interfaces
 */

/**
 * Interface for embedding snapshot data
 * Used by getEmbeddingSnapshot() function
 */
export interface EmbeddingSnapshot {
  totalCustomers: number;
  customersWithEmbeddings: number;
  embeddingCompletionPercentage: number;
  activeProcessingJobs: number;
  systemStatus: 'ready' | 'processing' | 'completed' | 'partial' | 'cancelling' | 'cancelled';
  currentJob: CurrentJob | null;
  lastProcessedAt?: string;
}

/**
 * Interface for current job information
 */
export interface CurrentJob {
  jobId: string;
  status: string;
  processedCustomers: number;
  totalCustomers: number;
  estimatedTokensSaved?: number;
  progressPercentage: number;
  // ETA information
  etaSeconds?: number;
  etaHumanized?: string;
  currentThroughputPerMinute?: number;
}

/**
 * Interface for customer counts from database
 */
export interface CustomerCounts {
  totalCustomers: number;
  customersWithEmbeddings: number;
}

/**
 * Interface for recent import data
 */
export interface RecentImport {
  id: string;
  importStatus: string;
  completedAt: Date | null;
}

/**
 * Interface for job status from embedding services
 */
export interface JobStatus {
  jobId: string;
  status: string;
  processedCustomers: number;
  totalCustomers: number;
  estimatedTokensSaved?: number;
  createdAt?: string;
  isBatchJob?: boolean;
}

/**
 * Interface for real-time logs data structure
 * Used by getRecentApplicationLogs() function
 */
export interface RealTimeLogs {
  recent: ProcessedLogEntry[];
  duplicateDetection: DuplicateLogEntry[];
  errors: ErrorLogEntry[];
  summary: LogSummary;
}

/**
 * Interface for processed log entry (recent logs)
 */
export interface ProcessedLogEntry {
  id: string;
  level: string;
  category: string;
  message: string;
  timestamp: Date;
  userId?: string | null;
  metadata?: any;
  stackTrace?: string | null;
}

/**
 * Interface for duplicate detection log entry
 */
export interface DuplicateLogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: Date;
  metadata?: any;
}

/**
 * Interface for error log entry
 */
export interface ErrorLogEntry {
  id: string;
  level: string;
  category: string;
  message: string;
  timestamp: Date;
  errorFingerprint?: string | null;
}

/**
 * Interface for log summary statistics
 */
export interface LogSummary {
  totalRecentLogs: number;
  duplicateEventsCount: number;
  recentErrorsCount: number;
  lastLogTimestamp: string | null;
}

/**
 * Interface for system health metrics
 * Used by getSystemHealthMetrics() function
 */
export interface SystemHealth {
  systemActive: boolean;
  totalLogsToday: number;
  errorRate: number;
  warningRate: number;
  lastActivityAt: string | null;
  categories: Record<string, number>;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
}

/**
 * Interface for log statistics from storage
 */
export interface LogStats {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByCategory: Record<string, number>;
}

/**
 * Interface for log query parameters
 */
export interface LogQueryParams {
  startDate?: Date;
  category?: string;
  level?: string;
  isArchived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Interface for log query results from storage
 */
export interface LogQueryResult {
  logs: Array<{
    id: string;
    level: string;
    category: string;
    message: string;
    timestamp: Date;
    userId?: string | null;
    metadata?: any;
    stackTrace?: string | null;
    errorFingerprint?: string | null;
  }>;
  total: number;
}

/**
 * Interface for combined real-time logs response
 * Used by the real-time-logs endpoint
 */
export interface RealTimeLogsResponse {
  embeddingSystem: EmbeddingSnapshot;
  logs: RealTimeLogs;
  systemHealth: SystemHealth;
  monitoring: MonitoringMetadata;
  quickStatus: QuickStatusIndicators;
}

/**
 * Interface for monitoring metadata
 */
export interface MonitoringMetadata {
  dataFreshness: string;
  responseGenerated: string;
  cacheStatus: 'fresh' | 'cached' | 'error';
  nextRefresh: string;
}

/**
 * Interface for quick status indicators
 */
export interface QuickStatusIndicators {
  systemActive: boolean;
  hasRecentErrors: boolean;
  hasDuplicateEvents: boolean;
  embeddingProgress: number;
  overallHealth: 'healthy' | 'warning' | 'critical' | 'unknown';
}

/**
 * Interface for analytics service dependencies
 * Used for dependency injection in service functions
 */
export interface AnalyticsServiceDependencies {
  db: any;
  storage: any;
  cacheManager: any;
  cancellableEmbeddingService: any;
  batchOptimizedEmbeddingService: any;
}

/**
 * Interface for HTTP utility cache configuration
 */
export interface CacheConfig {
  key: string;
  ttlMs: number;
}

/**
 * Interface for HTTP error response shape
 */
export interface HttpErrorResponse {
  error: string;
  [key: string]: any;
}

/**
 * Type for HTTP route producer function
 */
export type HttpRouteProducer<T> = () => Promise<T>;

/**
 * Type for Express route handler with type safety
 */
export type TypedRouteHandler<T = any> = (req: any, res: any) => Promise<T>;

/**
 * Interface for cache key generator configuration
 */
export interface CacheKeyConfig {
  prefix: string;
  includeTimestamp?: boolean;
  separator?: string;
}

/**
 * Interface for parameterized cache key options
 */
export interface ParameterizedCacheOptions {
  baseKey: string;
  parameters: Record<string, any>;
  delimiter?: string;
  sort?: boolean;
}