import { secureLogger } from '../utils/secure-logger';
/**
 * Cancellable Embedding Service
 *
 * Purpose: Production-ready embedding generation with cancellation support
 *
 * REFACTORED: September 23, 2025 - Consolidated with EmbeddingOrchestrator
 * This service now delegates to the unified EmbeddingOrchestrator while maintaining
 * the original API for backward compatibility.
 *
 * Original Features (now provided by orchestrator):
 * - Real-time job progress tracking
 * - Graceful cancellation with AbortController
 * - Transaction-safe customer processing
 * - Token savings calculation
 * - Persistent job state across restarts
 *
 * @module CancellableEmbeddingService
 * @created August 12, 2025
 * @refactored September 23, 2025 - Consolidated with EmbeddingOrchestrator
 */

// Re-export types for backward compatibility
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

/**
 * CancellableEmbeddingService - Delegated to EmbeddingOrchestrator
 * 
 * This class maintains the original API while delegating all operations
 * to the consolidated EmbeddingOrchestrator for improved maintainability.
 */
export class CancellableEmbeddingService {
  /**
   * Import adapter at runtime to avoid circular dependencies
   */
  private async getAdapter() {
    const { cancellableEmbeddingServiceAdapter } = await import('./_shared/embedding-adapters');
    return cancellableEmbeddingServiceAdapter;
  }

  /**
   * Start a new cancellable embedding job
   */
  async startJob(options: { totalCustomers?: number; batchSize?: number } = {}): Promise<{ jobId: string; importId: string }> {
    const adapter = await this.getAdapter();
    return adapter.startJob(options);
  }

  /**
   * Cancel an embedding job
   */
  async cancelJob(jobId: string): Promise<{ ok: boolean }> {
    const adapter = await this.getAdapter();
    return adapter.cancelJob(jobId);
  }

  async startEmbeddingJob(options: Parameters<typeof this.startJob>[0] = {}) { return this.startJob(options); }
  async cancelEmbeddingJob(jobId: string) { return this.cancelJob(jobId); }

  /**
   * Get status of all jobs
   */
  async getJobsStatus(): Promise<JobStatus[]> {
    const adapter = await this.getAdapter();
    return adapter.getJobsStatus();
  }

  /**
   * Get status of a specific job
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const adapter = await this.getAdapter();
    return adapter.getJobStatus(jobId);
  }

  /**
   * Get latest job status (for analytics compatibility)
   */
  async getLatestJobStatus(): Promise<JobStatus | null> {
    const adapter = await this.getAdapter();
    return adapter.getLatestJobStatus();
  }

  /**
   * Get all running jobs (for analytics compatibility)
   */
  async getAllRunningJobs(): Promise<JobStatus[]> {
    const adapter = await this.getAdapter();
    return adapter.getAllRunningJobs();
  }

  /**
   * Legacy test methods maintained for backward compatibility
   * These now provide stub implementations as the detailed logic is in the orchestrator
   */
  public async testGenerateEmbeddingWithCancellation(customer: any, signal: AbortSignal): Promise<number[]> {
    // Stub implementation for test compatibility
    // The actual logic is now in the orchestrator
    secureLogger.warn('testGenerateEmbeddingWithCancellation is deprecated - use orchestrator directly for testing');
    return [];
  }

  public testCreateCustomerProfileText(customer: any): string {
    // Stub implementation for test compatibility
    const parts = [];
    if (customer.firstName) parts.push(`First Name: ${customer.firstName}`);
    if (customer.lastName) parts.push(`Last Name: ${customer.lastName}`);
    if (customer.email) parts.push(`Email: ${customer.email}`);
    if (customer.customerSegment) parts.push(`Segment: ${customer.customerSegment}`);
    if (customer.lifetimeValue) parts.push(`Lifetime Value: ${customer.lifetimeValue}`);
    return parts.join('\n');
  }
}

// Export singleton instance for backward compatibility
export const cancellableEmbeddingService = new CancellableEmbeddingService();