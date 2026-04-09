/**
 * Embedding Watchdog Service
 * 
 * Purpose: Monitor embedding progress timestamps and detect stalled jobs
 * 
 * REFACTORED: September 23, 2025 - Consolidated with EmbeddingOrchestrator
 * This service now delegates to the unified EmbeddingOrchestrator while maintaining
 * the original API for backward compatibility.
 * 
 * Original Features (now provided by orchestrator):
 * - Background monitoring of embedding progress
 * - Timeout detection for stalled jobs
 * - Automatic job failure marking
 * - WebSocket notification of status changes
 * - Configurable timeout thresholds
 * 
 * @module EmbeddingWatchdogService
 * @created September 22, 2025 - Initial implementation for timeout detection
 * @refactored September 23, 2025 - Consolidated with EmbeddingOrchestrator
 */

// Re-export types for backward compatibility
export interface WatchdogConfig {
  checkIntervalMs: number;        // How often to check for stalled jobs
  jobTimeoutMs: number;          // How long before a job is considered stalled
  heartbeatTimeoutMs: number;    // How long since last heartbeat before considering stalled
  maxRetryAttempts: number;      // Maximum retry attempts before marking as failed
  enabled: boolean;              // Whether watchdog is enabled
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
 * EmbeddingWatchdogService - Delegated to EmbeddingOrchestrator
 * 
 * This class maintains the original API while delegating all operations
 * to the consolidated EmbeddingOrchestrator for improved maintainability.
 */
export class EmbeddingWatchdogService {
  private static instance: EmbeddingWatchdogService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EmbeddingWatchdogService {
    if (!EmbeddingWatchdogService.instance) {
      EmbeddingWatchdogService.instance = new EmbeddingWatchdogService();
    }
    return EmbeddingWatchdogService.instance;
  }

  /**
   * Import adapter at runtime to avoid circular dependencies
   */
  private async getAdapter() {
    const { embeddingWatchdogServiceAdapter } = await import('./_shared/embedding-adapters');
    return embeddingWatchdogServiceAdapter;
  }

  /**
   * Start watchdog monitoring (delegated to orchestrator)
   */
  async start(): Promise<void> {
    const adapter = await this.getAdapter();
    adapter.start();
  }

  /**
   * Stop watchdog monitoring (delegated to orchestrator)
   */
  async stop(): Promise<void> {
    const adapter = await this.getAdapter();
    adapter.stop();
  }

  /**
   * Update watchdog configuration
   */
  async updateConfig(config: Partial<WatchdogConfig>): Promise<void> {
    const adapter = await this.getAdapter();
    adapter.updateConfig(config);
  }

  /**
   * Get watchdog metrics
   */
  async getMetrics(): Promise<WatchdogMetrics> {
    const adapter = await this.getAdapter();
    return adapter.getMetrics();
  }

  /**
   * Get current watchdog configuration
   */
  async getConfig(): Promise<WatchdogConfig> {
    // Default configuration for backward compatibility
    return {
      checkIntervalMs: 30000,
      jobTimeoutMs: 300000,
      heartbeatTimeoutMs: 120000,
      maxRetryAttempts: 3,
      enabled: true
    };
  }

  /**
   * Get stalled jobs
   */
  async getStalledJobs(): Promise<StalledJob[]> {
    const adapter = await this.getAdapter();
    return adapter.getStalledJobs();
  }

  /**
   * Check if watchdog service is running
   */
  async isActive(): Promise<boolean> {
    // Watchdog is managed by orchestrator, so it's always active
    return true;
  }
}