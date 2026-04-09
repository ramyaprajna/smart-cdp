/**
 * Embedding Service Adapters
 * 
 * Purpose: Maintain backward compatibility while using the new EmbeddingOrchestrator
 * 
 * This adapter layer provides the same interfaces as existing embedding services
 * while delegating all operations to the consolidated EmbeddingOrchestrator.
 * This ensures existing code continues to work without modification.
 * 
 * @module EmbeddingAdapters
 * @created September 23, 2025 - Backward compatibility layer for embedding services
 */

import { getEmbeddingOrchestrator, EmbeddingJobStatus as OrchestratorJobStatus } from './embedding-orchestrator';
import { secureLogger } from '../../utils/secure-logger';

// Re-export original interfaces for backward compatibility
export interface JobStatus {
  jobId: string;
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  totalCustomers: number;
  processedCustomers: number;
  batchSize: number;
  estimatedTokensSaved?: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface BatchJobStatus {
  jobId: string;
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  totalCustomers: number;
  processedCustomers: number;
  batchSize: number;
  streamingPageSize: number;
  apiCallsCount: number;
  batchesProcessed: number;
  estimatedTokensSaved?: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  // Performance metrics
  avgBatchProcessingTime?: number;
  avgApiResponseTime?: number;
  totalEmbeddingsGenerated?: number;
  failedCustomersCount?: number;
  retriedCustomersCount?: number;
  memoryUsageMB?: number;
  // ETA calculation
  etaSeconds?: number;
  etaHumanized?: string;
  currentThroughputPerMinute?: number;
}

export interface WatchdogConfig {
  checkIntervalMs: number;
  jobTimeoutMs: number;
  heartbeatTimeoutMs: number;
  maxRetryAttempts: number;
  enabled: boolean;
}

export interface StalledJob {
  importId: string;
  jobId: string;
  status: string;
  lastUpdateAt: Date;
  watchdogLastSeen: Date | null;
  timeStallMs: number;
  retryAttempts: number;
}

export interface WatchdogMetrics {
  totalChecks: number;
  stalledJobsDetected: number;
  jobsMarkedFailed: number;
  averageCheckDurationMs: number;
  lastCheckAt: Date | null;
  uptime: number;
}

/**
 * Utility function to convert orchestrator status to legacy status format
 */
function convertOrchestratorStatus(orchestratorStatus: OrchestratorJobStatus): JobStatus {
  return {
    jobId: orchestratorStatus.jobId,
    status: orchestratorStatus.status,
    totalCustomers: orchestratorStatus.totalCustomers,
    processedCustomers: orchestratorStatus.processedCustomers,
    batchSize: orchestratorStatus.batchSize,
    estimatedTokensSaved: undefined, // Not available in new orchestrator
    error: orchestratorStatus.errorCount > 0 ? 'Multiple errors occurred' : undefined,
    createdAt: orchestratorStatus.createdAt,
    startedAt: orchestratorStatus.startedAt,
    completedAt: orchestratorStatus.completedAt,
    cancelledAt: orchestratorStatus.cancelledAt
  };
}

/**
 * Utility function to convert orchestrator status to batch status format
 */
function convertOrchestratorToBatchStatus(orchestratorStatus: OrchestratorJobStatus): BatchJobStatus {
  const batchCount = orchestratorStatus.batchSize > 0 ? 
    Math.ceil(orchestratorStatus.processedCustomers / orchestratorStatus.batchSize) : 0;
    
  // Format ETA in human readable format
  const formatETA = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `~${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `~${minutes}m`;
    } else {
      return `<1m`;
    }
  };

  return {
    jobId: orchestratorStatus.jobId,
    status: orchestratorStatus.status,
    totalCustomers: orchestratorStatus.totalCustomers,
    processedCustomers: orchestratorStatus.processedCustomers,
    batchSize: orchestratorStatus.batchSize,
    streamingPageSize: orchestratorStatus.batchSize, // Use batchSize as streamingPageSize
    apiCallsCount: batchCount,
    batchesProcessed: batchCount,
    estimatedTokensSaved: undefined, // Not available in new orchestrator
    error: orchestratorStatus.errorCount > 0 ? 'Multiple errors occurred' : undefined,
    createdAt: orchestratorStatus.createdAt,
    startedAt: orchestratorStatus.startedAt,
    completedAt: orchestratorStatus.completedAt,
    cancelledAt: orchestratorStatus.cancelledAt,
    
    // Performance metrics from orchestrator
    avgBatchProcessingTime: orchestratorStatus.averageBatchTimeMs,
    avgApiResponseTime: undefined, // Not separately tracked
    totalEmbeddingsGenerated: orchestratorStatus.generatedEmbeddings,
    failedCustomersCount: orchestratorStatus.failedEmbeddings,
    retriedCustomersCount: orchestratorStatus.retryAttempts,
    memoryUsageMB: undefined, // Not tracked in orchestrator
    
    // ETA calculation with proper formatting
    etaSeconds: orchestratorStatus.estimatedTimeRemainingMs ? 
      Math.round(orchestratorStatus.estimatedTimeRemainingMs / 1000) : undefined,
    etaHumanized: orchestratorStatus.estimatedTimeRemainingMs ? 
      formatETA(Math.round(orchestratorStatus.estimatedTimeRemainingMs / 1000)) : undefined,
    currentThroughputPerMinute: orchestratorStatus.throughputPerSecond ? 
      orchestratorStatus.throughputPerSecond * 60 : undefined
  };
}

/**
 * Adapter for CancellableEmbeddingService - maintains original API
 */
export class CancellableEmbeddingServiceAdapter {
  private orchestrator = getEmbeddingOrchestrator();

  /**
   * Start a new cancellable embedding job
   */
  async startJob(options: { totalCustomers?: number; batchSize?: number } = {}): Promise<{ jobId: string; importId: string }> {
    return await this.orchestrator.startEmbeddingJob({
      totalCustomers: options.totalCustomers,
      batchSize: options.batchSize,
      priority: 'normal'
    });
  }

  /**
   * Cancel an embedding job
   */
  async cancelJob(jobId: string): Promise<{ ok: boolean }> {
    return await this.orchestrator.cancelEmbeddingJob(jobId);
  }

  /**
   * Get status of all jobs
   */
  async getJobsStatus(): Promise<JobStatus[]> {
    const orchestratorStatuses = await this.orchestrator.getEmbeddingJobsStatus();
    return orchestratorStatuses.map(convertOrchestratorStatus);
  }

  /**
   * Get status of a specific job
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const allStatuses = await this.getJobsStatus();
    return allStatuses.find(status => status.jobId === jobId) || null;
  }

  /**
   * Get latest job status (for analytics compatibility)
   */
  async getLatestJobStatus(): Promise<JobStatus | null> {
    const allStatuses = await this.getJobsStatus();
    // Return the most recent job (first in array since they're ordered by creation date)
    return allStatuses.length > 0 ? allStatuses[0] : null;
  }

  /**
   * Get all running jobs (for analytics compatibility)
   */
  async getAllRunningJobs(): Promise<JobStatus[]> {
    const allStatuses = await this.getJobsStatus();
    return allStatuses.filter(status => status.status === 'running');
  }
}

/**
 * Adapter for BatchOptimizedEmbeddingService - maintains original API
 */
export class BatchOptimizedEmbeddingServiceAdapter {
  private orchestrator = getEmbeddingOrchestrator();

  /**
   * Start batch optimized embedding job
   */
  async startJob(options: { 
    totalCustomers?: number; 
    batchSize?: number;
    streamingPageSize?: number;
  } = {}): Promise<{ jobId: string; importId: string }> {
    return await this.orchestrator.startEmbeddingJob({
      totalCustomers: options.totalCustomers,
      batchSize: options.batchSize,
      priority: 'normal',
      options: {
        useAdaptiveBatching: true,
        enableProgressTracking: true,
        enableWatchdog: true
      }
    });
  }

  /**
   * Cancel a batch job
   */
  async cancelJob(jobId: string): Promise<{ ok: boolean }> {
    return await this.orchestrator.cancelEmbeddingJob(jobId);
  }

  /**
   * Get batch job statuses
   */
  async getBatchJobsStatus(): Promise<BatchJobStatus[]> {
    const orchestratorStatuses = await this.orchestrator.getEmbeddingJobsStatus();
    return orchestratorStatuses.map(convertOrchestratorToBatchStatus);
  }

  /**
   * Get specific batch job status
   */
  async getBatchJobStatus(jobId: string): Promise<BatchJobStatus | null> {
    const allStatuses = await this.getBatchJobsStatus();
    return allStatuses.find(status => status.jobId === jobId) || null;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.orchestrator.getMetrics();
  }

  /**
   * Get latest batch job status (for analytics compatibility)
   */
  async getLatestBatchJobStatus(): Promise<BatchJobStatus | null> {
    const allStatuses = await this.getBatchJobsStatus();
    // Return the most recent job (first in array since they're ordered by creation date)
    return allStatuses.length > 0 ? allStatuses[0] : null;
  }

  /**
   * Get all running batch jobs (for analytics compatibility)
   */
  async getAllRunningBatchJobs(): Promise<BatchJobStatus[]> {
    const allStatuses = await this.getBatchJobsStatus();
    return allStatuses.filter(status => status.status === 'running');
  }

  /**
   * Get count of running batch jobs (for system capacity checks)
   */
  async getRunningBatchJobsCount(): Promise<number> {
    const runningJobs = await this.getAllRunningBatchJobs();
    return runningJobs.length;
  }
}

/**
 * Adapter for EmbeddingWatchdogService - maintains original API
 */
export class EmbeddingWatchdogServiceAdapter {
  private orchestrator = getEmbeddingOrchestrator();
  private static instance: EmbeddingWatchdogServiceAdapter;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EmbeddingWatchdogServiceAdapter {
    if (!EmbeddingWatchdogServiceAdapter.instance) {
      EmbeddingWatchdogServiceAdapter.instance = new EmbeddingWatchdogServiceAdapter();
    }
    return EmbeddingWatchdogServiceAdapter.instance;
  }

  /**
   * Start watchdog monitoring
   */
  start(): void {
    // Watchdog is already started in orchestrator
    secureLogger.info('Watchdog monitoring started via orchestrator');
  }

  /**
   * Stop watchdog monitoring
   */
  stop(): void {
    secureLogger.info('Watchdog monitoring managed by orchestrator');
  }

  /**
   * Update watchdog configuration
   */
  updateConfig(config: Partial<WatchdogConfig>): void {
    secureLogger.info('Watchdog configuration managed by orchestrator', config);
  }

  /**
   * Get watchdog metrics
   */
  getMetrics(): WatchdogMetrics {
    const orchestratorMetrics = this.orchestrator.getMetrics();
    
    return {
      totalChecks: orchestratorMetrics.watchdog?.totalChecks || 0,
      stalledJobsDetected: orchestratorMetrics.watchdog?.stalledJobsDetected || 0,
      jobsMarkedFailed: orchestratorMetrics.watchdog?.jobsMarkedFailed || 0,
      averageCheckDurationMs: orchestratorMetrics.watchdog?.averageCheckDurationMs || 0,
      lastCheckAt: orchestratorMetrics.watchdog?.lastCheckAt || null,
      uptime: orchestratorMetrics.watchdog?.uptime || 0
    };
  }

  /**
   * Get stalled jobs
   */
  async getStalledJobs(): Promise<StalledJob[]> {
    // Would need to implement in orchestrator or extract from job statuses
    const jobStatuses = await this.orchestrator.getEmbeddingJobsStatus();
    
    return jobStatuses
      .filter(job => job.isStalled)
      .map(job => ({
        importId: job.importId,
        jobId: job.jobId,
        status: job.status,
        lastUpdateAt: job.startedAt || job.createdAt,
        watchdogLastSeen: null, // Not tracked separately
        timeStallMs: 0, // Would need calculation
        retryAttempts: job.retryAttempts
      }));
  }
}

/**
 * Create singleton instances for backward compatibility
 */
export const cancellableEmbeddingServiceAdapter = new CancellableEmbeddingServiceAdapter();
export const batchOptimizedEmbeddingServiceAdapter = new BatchOptimizedEmbeddingServiceAdapter();
export const embeddingWatchdogServiceAdapter = EmbeddingWatchdogServiceAdapter.getInstance();

/**
 * Legacy compatibility exports
 */
export const cancellableEmbeddingService = cancellableEmbeddingServiceAdapter;
export const batchOptimizedEmbeddingService = batchOptimizedEmbeddingServiceAdapter;
export const embeddingWatchdogService = embeddingWatchdogServiceAdapter;