/**
 * Batch Optimized Embedding Service
 *
 * Purpose: Batch embedding generation service using OpenAI array input for efficiency
 *
 * REFACTORED: September 23, 2025 - Consolidated with EmbeddingOrchestrator
 * This service now delegates to the unified EmbeddingOrchestrator while maintaining
 * the original API for backward compatibility.
 *
 * Original Features (now provided by orchestrator):
 * - OpenAI array input method for reduced API calls compared to individual requests
 * - Basic batch database operations with transaction safety
 * - Streaming customer processing with pagination
 * - Cancellation checks at batch boundaries
 * - Basic resource cleanup
 *
 * @module BatchOptimizedEmbeddingService
 * @created September 17, 2025
 * @refactored September 23, 2025 - Consolidated with EmbeddingOrchestrator
 */

// Re-export types for backward compatibility
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

/**
 * BatchOptimizedEmbeddingService - Delegated to EmbeddingOrchestrator
 * 
 * This class maintains the original API while delegating all operations
 * to the consolidated EmbeddingOrchestrator for improved maintainability.
 */
export class BatchOptimizedEmbeddingService {
  /**
   * Import adapter at runtime to avoid circular dependencies
   */
  private async getAdapter() {
    const { batchOptimizedEmbeddingServiceAdapter } = await import('./_shared/embedding-adapters');
    return batchOptimizedEmbeddingServiceAdapter;
  }

  /**
   * Start batch optimized embedding job
   */
  async startJob(options: { 
    totalCustomers?: number; 
    batchSize?: number;
    streamingPageSize?: number;
  } = {}): Promise<{ jobId: string; importId: string }> {
    const adapter = await this.getAdapter();
    return adapter.startJob(options);
  }

  /**
   * Cancel a batch job
   */
  async cancelJob(jobId: string): Promise<{ ok: boolean }> {
    const adapter = await this.getAdapter();
    return adapter.cancelJob(jobId);
  }

  async startBatchEmbeddingJob(options: Parameters<typeof this.startJob>[0] = {}) { return this.startJob(options); }
  async cancelBatchEmbeddingJob(jobId: string) { return this.cancelJob(jobId); }

  /**
   * Get batch job statuses
   */
  async getBatchJobsStatus(): Promise<BatchJobStatus[]> {
    const adapter = await this.getAdapter();
    return adapter.getBatchJobsStatus();
  }

  /**
   * Get specific batch job status
   */
  async getBatchJobStatus(jobId: string): Promise<BatchJobStatus | null> {
    const adapter = await this.getAdapter();
    return adapter.getBatchJobStatus(jobId);
  }

  /**
   * Get performance metrics
   */
  async getMetrics() {
    const adapter = await this.getAdapter();
    return adapter.getMetrics();
  }

  /**
   * Legacy compatibility methods
   */
  async getAllJobsStatus(): Promise<BatchJobStatus[]> {
    return this.getBatchJobsStatus();
  }

  async getJobStatus(jobId: string): Promise<BatchJobStatus | null> {
    return this.getBatchJobStatus(jobId);
  }

  /**
   * Get job status with legacy format
   */
  async getJobsStatus(): Promise<BatchJobStatus[]> {
    return this.getBatchJobsStatus();
  }

  /**
   * Get latest batch job status (for analytics compatibility)
   */
  async getLatestBatchJobStatus(): Promise<BatchJobStatus | null> {
    const adapter = await this.getAdapter();
    return adapter.getLatestBatchJobStatus();
  }

  /**
   * Get all running batch jobs (for analytics compatibility)
   */
  async getAllRunningBatchJobs(): Promise<BatchJobStatus[]> {
    const adapter = await this.getAdapter();
    return adapter.getAllRunningBatchJobs();
  }

  /**
   * Get count of running batch jobs (for system capacity checks)
   */
  async getRunningBatchJobsCount(): Promise<number> {
    const adapter = await this.getAdapter();
    return adapter.getRunningBatchJobsCount();
  }
}

// Export singleton instance for backward compatibility
export const batchOptimizedEmbeddingService = new BatchOptimizedEmbeddingService();