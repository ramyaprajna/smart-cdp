import { secureLogger } from '../../utils/secure-logger';
/**
 * Shared Watchdog Monitoring Utilities
 * 
 * Purpose: Centralized job monitoring and health checking extracted from embedding-watchdog-service.ts
 * 
 * Key Features:
 * - Configurable timeout detection
 * - Automatic stalled job recovery
 * - Health monitoring with metrics
 * - Integration with progress tracking
 * - Graceful job cleanup
 * 
 * @module SharedWatchdog
 * @created September 23, 2025 - Extracted from embedding-watchdog-service.ts
 */

export interface WatchdogConfig {
  checkIntervalMs: number;        // How often to check for stalled jobs
  jobTimeoutMs: number;          // How long before a job is considered stalled
  heartbeatTimeoutMs: number;    // How long since last heartbeat before considering stalled
  maxRetryAttempts: number;      // Maximum retry attempts before marking as failed
  enabled: boolean;              // Whether watchdog is enabled
  autoCleanup: boolean;          // Auto cleanup completed/failed jobs
  cleanupAfterMs: number;        // Time to wait before cleanup
}

export interface StalledJob {
  jobId: string;
  importId?: string;
  status: string;
  lastUpdateAt: Date;
  heartbeatAt: Date | null;
  timeStallMs: number;
  retryAttempts: number;
  jobType: string;
}

export interface WatchdogMetrics {
  totalChecks: number;
  stalledJobsDetected: number;
  jobsMarkedFailed: number;
  jobsRecovered: number;
  averageCheckDurationMs: number;
  lastCheckAt: Date | null;
  uptime: number;
  activeJobs: number;
  healthyJobs: number;
  stalledJobs: number;
}

export interface JobHealth {
  jobId: string;
  isHealthy: boolean;
  lastSeen: Date;
  stalledDuration?: number;
  recommendedAction?: 'continue' | 'retry' | 'fail' | 'cleanup';
}

export type WatchdogEventType = 'stalled' | 'recovered' | 'failed' | 'cleanup';
export type WatchdogEventHandler = (event: WatchdogEventType, job: StalledJob) => void;

/**
 * Job Watchdog Monitor
 */
export class JobWatchdog {
  private config: WatchdogConfig;
  private metrics: WatchdogMetrics;
  private checkInterval: NodeJS.Timeout | null = null;
  private eventHandlers: Set<WatchdogEventHandler> = new Set();
  private monitoredJobs: Map<string, JobHealth> = new Map();
  private isRunning = false;
  private startTime: Date;

  constructor(config: Partial<WatchdogConfig> = {}) {
    this.startTime = new Date();
    this.config = {
      checkIntervalMs: 30000,        // Check every 30 seconds
      jobTimeoutMs: 300000,          // 5 minutes timeout
      heartbeatTimeoutMs: 120000,    // 2 minutes heartbeat timeout
      maxRetryAttempts: 3,           // Maximum 3 retry attempts
      enabled: true,                 // Enabled by default
      autoCleanup: true,             // Auto cleanup completed jobs
      cleanupAfterMs: 300000,        // Cleanup after 5 minutes
      ...config
    };
    
    this.metrics = {
      totalChecks: 0,
      stalledJobsDetected: 0,
      jobsMarkedFailed: 0,
      jobsRecovered: 0,
      averageCheckDurationMs: 0,
      lastCheckAt: null,
      uptime: 0,
      activeJobs: 0,
      healthyJobs: 0,
      stalledJobs: 0
    };
  }

  /**
   * Start watchdog monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      return;
    }

    this.isRunning = true;
    
    // Perform initial check
    this.performHealthCheck();
    
    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop watchdog monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Register a job for monitoring
   */
  registerJob(jobId: string, jobType: string = 'generic'): void {
    this.monitoredJobs.set(jobId, {
      jobId,
      isHealthy: true,
      lastSeen: new Date()
    });
    this.updateJobMetrics();
  }

  /**
   * Update job heartbeat
   */
  heartbeat(jobId: string): void {
    const job = this.monitoredJobs.get(jobId);
    if (job) {
      job.lastSeen = new Date();
      job.isHealthy = true;
      delete job.stalledDuration;
      delete job.recommendedAction;
    }
  }

  /**
   * Unregister a job from monitoring
   */
  unregisterJob(jobId: string): void {
    this.monitoredJobs.delete(jobId);
    this.updateJobMetrics();
  }

  /**
   * Add event handler for watchdog events
   */
  addEventListener(handler: WatchdogEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Get current watchdog metrics
   */
  getMetrics(): WatchdogMetrics {
    this.metrics.uptime = Date.now() - this.startTime.getTime();
    return { ...this.metrics };
  }

  /**
   * Get health status of all monitored jobs
   */
  getJobsHealth(): JobHealth[] {
    return Array.from(this.monitoredJobs.values());
  }

  /**
   * Get health status of a specific job
   */
  getJobHealth(jobId: string): JobHealth | undefined {
    return this.monitoredJobs.get(jobId);
  }

  /**
   * Force health check for a specific job
   */
  checkJobHealth(jobId: string): JobHealth | undefined {
    const job = this.monitoredJobs.get(jobId);
    if (!job) return undefined;

    const now = Date.now();
    const timeSinceLastSeen = now - job.lastSeen.getTime();
    
    if (timeSinceLastSeen > this.config.heartbeatTimeoutMs) {
      job.isHealthy = false;
      job.stalledDuration = timeSinceLastSeen;
      
      if (timeSinceLastSeen > this.config.jobTimeoutMs) {
        job.recommendedAction = 'fail';
      } else {
        job.recommendedAction = 'retry';
      }
    } else {
      job.isHealthy = true;
      delete job.stalledDuration;
      delete job.recommendedAction;
    }

    return job;
  }

  private async performHealthCheck(): Promise<void> {
    const checkStartTime = Date.now();
    
    try {
      this.metrics.totalChecks++;
      
      const stalledJobs: StalledJob[] = [];
      const now = Date.now();
      
      // Check each monitored job
      for (const [jobId, jobHealth] of Array.from(this.monitoredJobs.entries())) {
        const timeSinceLastSeen = now - jobHealth.lastSeen.getTime();
        
        if (timeSinceLastSeen > this.config.heartbeatTimeoutMs) {
          // Job is potentially stalled
          if (jobHealth.isHealthy) {
            // First time detecting stall
            jobHealth.isHealthy = false;
            jobHealth.stalledDuration = timeSinceLastSeen;
            
            const stalledJob: StalledJob = {
              jobId,
              status: 'stalled',
              lastUpdateAt: jobHealth.lastSeen,
              heartbeatAt: jobHealth.lastSeen,
              timeStallMs: timeSinceLastSeen,
              retryAttempts: 0,
              jobType: 'generic'
            };
            
            stalledJobs.push(stalledJob);
            this.metrics.stalledJobsDetected++;
            
            // Emit stalled event
            this.emitEvent('stalled', stalledJob);
            
          } else if (timeSinceLastSeen > this.config.jobTimeoutMs) {
            // Job has been stalled too long - mark as failed
            const stalledJob: StalledJob = {
              jobId,
              status: 'failed',
              lastUpdateAt: jobHealth.lastSeen,
              heartbeatAt: jobHealth.lastSeen,
              timeStallMs: timeSinceLastSeen,
              retryAttempts: 0,
              jobType: 'generic'
            };
            
            this.metrics.jobsMarkedFailed++;
            
            // Emit failed event
            this.emitEvent('failed', stalledJob);
            
            // Remove from monitoring if auto cleanup enabled
            if (this.config.autoCleanup) {
              this.scheduleCleanup(jobId, this.config.cleanupAfterMs);
            }
          }
        } else if (!jobHealth.isHealthy) {
          // Job has recovered
          jobHealth.isHealthy = true;
          delete jobHealth.stalledDuration;
          delete jobHealth.recommendedAction;
          
          const recoveredJob: StalledJob = {
            jobId,
            status: 'recovered',
            lastUpdateAt: jobHealth.lastSeen,
            heartbeatAt: jobHealth.lastSeen,
            timeStallMs: 0,
            retryAttempts: 0,
            jobType: 'generic'
          };
          
          this.metrics.jobsRecovered++;
          
          // Emit recovered event
          this.emitEvent('recovered', recoveredJob);
        }
      }
      
      // Update metrics
      this.updateJobMetrics();
      
      const checkDuration = Date.now() - checkStartTime;
      this.updateAverageCheckDuration(checkDuration);
      this.metrics.lastCheckAt = new Date();
      
    } catch (error) {
      secureLogger.error('Watchdog health check failed:', { error: String(error) });
    }
  }

  private updateJobMetrics(): void {
    this.metrics.activeJobs = this.monitoredJobs.size;
    this.metrics.healthyJobs = Array.from(this.monitoredJobs.values())
      .filter(job => job.isHealthy).length;
    this.metrics.stalledJobs = this.metrics.activeJobs - this.metrics.healthyJobs;
  }

  private updateAverageCheckDuration(duration: number): void {
    const totalChecks = this.metrics.totalChecks;
    this.metrics.averageCheckDurationMs = 
      (this.metrics.averageCheckDurationMs * (totalChecks - 1) + duration) / totalChecks;
  }

  private emitEvent(eventType: WatchdogEventType, job: StalledJob): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(eventType, job);
      } catch (error) {
        secureLogger.error('Error in watchdog event handler:', { error: String(error) });
      }
    });
  }

  private scheduleCleanup(jobId: string, delayMs: number): void {
    setTimeout(() => {
      const job = this.monitoredJobs.get(jobId);
      if (job) {
        const cleanupJob: StalledJob = {
          jobId,
          status: 'cleanup',
          lastUpdateAt: job.lastSeen,
          heartbeatAt: job.lastSeen,
          timeStallMs: Date.now() - job.lastSeen.getTime(),
          retryAttempts: 0,
          jobType: 'generic'
        };
        
        this.emitEvent('cleanup', cleanupJob);
        this.unregisterJob(jobId);
      }
    }, delayMs);
  }
}

/**
 * Global watchdog instance
 */
export let globalWatchdog: JobWatchdog;

/**
 * Initialize global watchdog with configuration
 */
export function initializeGlobalWatchdog(config?: Partial<WatchdogConfig>): JobWatchdog {
  if (globalWatchdog) {
    globalWatchdog.stop();
  }
  
  globalWatchdog = new JobWatchdog(config);
  return globalWatchdog;
}

/**
 * Default watchdog configurations
 */
export const DEFAULT_WATCHDOG_CONFIGS = {
  embedding: {
    checkIntervalMs: 30000,      // 30 seconds
    jobTimeoutMs: 600000,        // 10 minutes
    heartbeatTimeoutMs: 120000,  // 2 minutes
    maxRetryAttempts: 3,
    enabled: true,
    autoCleanup: true,
    cleanupAfterMs: 300000       // 5 minutes
  },
  
  import: {
    checkIntervalMs: 45000,      // 45 seconds
    jobTimeoutMs: 900000,        // 15 minutes
    heartbeatTimeoutMs: 180000,  // 3 minutes
    maxRetryAttempts: 2,
    enabled: true,
    autoCleanup: true,
    cleanupAfterMs: 600000       // 10 minutes
  },
  
  conservative: {
    checkIntervalMs: 60000,      // 1 minute
    jobTimeoutMs: 1800000,       // 30 minutes
    heartbeatTimeoutMs: 300000,  // 5 minutes
    maxRetryAttempts: 1,
    enabled: true,
    autoCleanup: false,
    cleanupAfterMs: 0
  }
} as const;