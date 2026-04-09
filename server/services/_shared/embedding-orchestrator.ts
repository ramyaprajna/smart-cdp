/**
 * Embedding Orchestrator
 * 
 * Purpose: Unified orchestrator that composes all shared utilities for embedding operations
 * 
 * Key Features:
 * - Coordinates all embedding services through shared utilities
 * - Provides a single interface for embedding operations
 * - Manages the complete embedding lifecycle
 * - Integrates rate limiting, retry, batch processing, progress tracking, watchdog, and error handling
 * 
 * @module EmbeddingOrchestrator
 * @created September 23, 2025 - Consolidated from multiple embedding services
 */

import { db } from '../../db';
import { customers, customerEmbeddings, embeddingJobs, embeddingProgress } from '@shared/schema';
import { eq, and, sql, count, isNull, gt } from 'drizzle-orm';
import { getOpenAIClient } from '../../utils/openai-client';
import { applicationLogger } from '../application-logger';

// Import all shared utilities
import { retryWithBackoff, DEFAULT_RETRY_CONFIGS, CircuitBreaker } from './retry';
import { RateLimiter, DEFAULT_RATE_LIMITS, globalRateLimiter, initializeGlobalRateLimiter } from './rate-limiter';
import { AdaptiveBatchSizer, BatchQueueManager, DEFAULT_BATCH_CONFIGS } from './batch';
import { ProgressTracker, ProgressManager } from './progress';
import { JobWatchdog, globalWatchdog, initializeGlobalWatchdog, DEFAULT_WATCHDOG_CONFIGS } from './watchdog';
import { handleError, globalErrorAggregator, ErrorCategory, ErrorSeverity } from './error';

import OpenAI from 'openai';
import crypto from 'node:crypto';
import { setMaxListeners } from 'node:events';

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const MAX_PROFILE_TEXT_LENGTH = parseInt(process.env.MAX_PROFILE_TEXT_LENGTH || '8000');

export interface EmbeddingJobRequest {
  totalCustomers?: number;
  batchSize?: number;
  priority?: 'high' | 'normal' | 'low';
  options?: {
    useAdaptiveBatching?: boolean;
    enableProgressTracking?: boolean;
    enableWatchdog?: boolean;
    customRateLimits?: any;
  };
}

export interface EmbeddingJobStatus {
  jobId: string;
  importId: string;
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  totalCustomers: number;
  processedCustomers: number;
  generatedEmbeddings: number;
  failedEmbeddings: number;
  batchSize: number;
  progress: number; // 0-100
  
  // Performance metrics
  averageBatchTimeMs?: number;
  throughputPerSecond?: number;
  estimatedTimeRemainingMs?: number;
  
  // Health status
  isStalled: boolean;
  retryAttempts: number;
  errorCount: number;
  
  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

interface EmbeddingBatchData {
  customers: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    customerSegment: string | null;
    lifetimeValue: number | null;
    currentAddress: any;
  }>;
  batchNumber: number;
  totalBatches: number;
}

interface EmbeddingBatchResult {
  success: boolean;
  processedCount: number;
  generatedCount: number;
  failedCount: number;
  errors: any[];
  processingTimeMs: number;
}

/**
 * Unified Embedding Orchestrator that coordinates all embedding operations
 */
export class EmbeddingOrchestrator {
  private rateLimiter: RateLimiter;
  private batchSizer: AdaptiveBatchSizer;
  private batchManager: BatchQueueManager<EmbeddingBatchData, EmbeddingBatchResult>;
  private progressManager: ProgressManager;
  private watchdog: JobWatchdog;
  private circuitBreaker: CircuitBreaker;
  
  private activeJobs: Map<string, {
    jobId: string;
    importId: string;
    progressTracker: ProgressTracker;
    abortController: AbortController;
  }> = new Map();

  constructor() {
    // Initialize all components with optimized configurations
    this.rateLimiter = initializeGlobalRateLimiter(DEFAULT_RATE_LIMITS.embeddings);
    this.batchSizer = new AdaptiveBatchSizer(DEFAULT_BATCH_CONFIGS.embeddings);
    this.batchManager = new BatchQueueManager(DEFAULT_BATCH_CONFIGS.embeddings);
    this.progressManager = ProgressManager.getInstance();
    this.watchdog = initializeGlobalWatchdog(DEFAULT_WATCHDOG_CONFIGS.embedding);
    
    // Circuit breaker for OpenAI API calls
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeMs: 60000, // 1 minute
      halfOpenMaxCalls: 3
    });

    // Start watchdog monitoring
    this.watchdog.start();
    
    // Setup watchdog event handlers
    this.setupWatchdogHandlers();
    
    // Perform startup recovery for orphaned jobs
    this.performStartupRecovery();
  }

  /**
   * Perform startup recovery to handle orphaned jobs from previous session
   * 
   * SMART AUTO-RESUME SYSTEM:
   * When the server restarts, any embedding jobs that were "running" are considered orphaned.
   * This system automatically resumes them to ensure all customer embeddings eventually complete.
   * 
   * HOW IT WORKS:
   * 1. Detects orphaned jobs (status: 'running' but server just started)
   * 2. Applies safety checks (max attempts, cooldown period)
   * 3. Resumes eligible jobs IN-PLACE (same job record, no duplicates)
   * 4. Recreates in-memory state (progress tracker, abort controller)
   * 5. Calls processEmbeddingJob() with original job ID
   * 6. System automatically skips customers with existing embeddings (idempotent)
   * 
   * SAFETY GUARDS:
   * - Max 3 auto-restart attempts per job (tracked in auto_restart_count column)
   * - 5-minute cooldown after actual failures (using last_failed_at timestamp)
   * - Cooldown distinguishes between:
   *   • Server restarts (lastFailedAt is null or old) → Resume immediately
   *   • Rapid failures (lastFailedAt is recent) → Enforce cooldown
   * 
   * CRITICAL IMPLEMENTATION NOTES:
   * - lastFailedAt is ONLY updated in handleJobFailure() when job truly fails
   * - lastFailedAt is NOT updated during resume to preserve accurate cooldown detection
   * - auto_restart_count is reset to 0 when job completes successfully
   * - Jobs that exceed limits are marked as failed (require manual intervention)
   * 
   * DATABASE COLUMNS:
   * - auto_restart_count: integer, default 0 (incremented on each auto-restart)
   * - last_failed_at: timestamp, nullable (set only when job actually fails)
   */
  private async performStartupRecovery(): Promise<void> {
    try {
      await applicationLogger.info('vector', '🔄 Performing startup recovery check for orphaned jobs');
      
      // Find jobs that were running when server stopped
      const orphanedJobs = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.status, 'running'));

      if (orphanedJobs.length === 0) {
        await applicationLogger.info('vector', '✅ Startup recovery complete - no orphaned jobs found');
        return;
      }

      await applicationLogger.warn('vector', `🚨 Found ${orphanedJobs.length} orphaned job(s) from previous session`, {
        orphanedJobIds: orphanedJobs.map(job => job.id),
        totalJobs: orphanedJobs.length
      });

      const now = new Date();
      const COOLDOWN_MINUTES = 5;
      const MAX_AUTO_RESTART_ATTEMPTS = 3;
      
      let restartedCount = 0;
      let failedCount = 0;

      // Process each orphaned job with smart auto-resume logic
      for (const job of orphanedJobs) {
        const autoRestartCount = job.autoRestartCount || 0;
        const lastFailedAt = job.lastFailedAt ? new Date(job.lastFailedAt) : null;
        
        // Calculate time since last failure
        const minutesSinceLastFailure = lastFailedAt 
          ? (now.getTime() - lastFailedAt.getTime()) / (1000 * 60)
          : Infinity;

        // Safety check 1: Max restart attempts exceeded
        if (autoRestartCount >= MAX_AUTO_RESTART_ATTEMPTS) {
          await db
            .update(embeddingJobs)
            .set({
              status: 'failed',
              errorMessage: `Job exceeded maximum auto-restart attempts (${MAX_AUTO_RESTART_ATTEMPTS}). Possible systemic issue - manual intervention required.`,
              lastFailedAt: now,
              completedAt: now
            })
            .where(eq(embeddingJobs.id, job.id));

          await applicationLogger.warn('vector', `❌ Job ${job.id} exceeded max restart attempts (${autoRestartCount}/${MAX_AUTO_RESTART_ATTEMPTS}) - marked as failed`, {
            jobId: job.id,
            autoRestartCount,
            processedCustomers: job.processedCustomers,
            totalCustomers: job.totalCustomers
          });
          
          failedCount++;
          continue;
        }

        // Safety check 2: Cooldown period (job failed too quickly)
        if (minutesSinceLastFailure < COOLDOWN_MINUTES) {
          await db
            .update(embeddingJobs)
            .set({
              status: 'failed',
              errorMessage: `Job failed within ${COOLDOWN_MINUTES}-minute cooldown period (${Math.round(minutesSinceLastFailure)} min ago). Indicates systemic issue - manual intervention required.`,
              lastFailedAt: now,
              completedAt: now
            })
            .where(eq(embeddingJobs.id, job.id));

          await applicationLogger.warn('vector', `⏱️ Job ${job.id} failed within cooldown period (${Math.round(minutesSinceLastFailure)} min ago) - marked as failed`, {
            jobId: job.id,
            minutesSinceLastFailure: Math.round(minutesSinceLastFailure),
            cooldownMinutes: COOLDOWN_MINUTES,
            lastFailedAt: lastFailedAt?.toISOString()
          });
          
          failedCount++;
          continue;
        }

        // Safe to auto-restart: increment counter and resume the SAME job
        await db
          .update(embeddingJobs)
          .set({
            status: 'running', // Set to running (will be started below)
            errorMessage: null, // Clear previous error
            autoRestartCount: autoRestartCount + 1,
            // NOTE: Do NOT update lastFailedAt here - preserve the actual failure timestamp for cooldown logic
            completedAt: null, // Clear completion time for restart
            startedAt: now // Update start time for new attempt
          })
          .where(eq(embeddingJobs.id, job.id));

        await applicationLogger.info('vector', `🔄 Auto-resuming orphaned job ${job.id} (attempt ${autoRestartCount + 1}/${MAX_AUTO_RESTART_ATTEMPTS})`, {
          jobId: job.id,
          autoRestartCount: autoRestartCount + 1,
          processedCustomers: job.processedCustomers,
          totalCustomers: job.totalCustomers,
          originalStartTime: job.startedAt
        });

        // Resume the job by recreating its in-memory state
        try {
          const importId = crypto.randomUUID(); // Generate proper UUID for database compatibility

          // Create progress tracker
          const progressTracker = this.progressManager.createTracker(
            importId,
            job.totalCustomers,
            job.batchSize
          );

          // Register with watchdog
          this.watchdog.registerJob(job.id, 'vector');

          // Create abort controller for cancellation
          const abortController = new AbortController();
          
          // Increase max listeners to handle production load
          setMaxListeners(50, abortController.signal);

          // Store active job
          this.activeJobs.set(job.id, {
            jobId: job.id,
            importId,
            progressTracker,
            abortController
          });

          // Resume processing asynchronously (system will skip already-embedded customers)
          this.processEmbeddingJob(job.id, importId, job.totalCustomers, job.batchSize, abortController)
            .catch(async (error) => {
              await applicationLogger.error('vector', `Error in resumed job ${job.id}`, error instanceof Error ? error : undefined);
            });
          
          restartedCount++;
          
          await applicationLogger.info('vector', `✅ Successfully auto-resumed job ${job.id}`, {
            jobId: job.id,
            newAutoRestartCount: autoRestartCount + 1
          });
        } catch (restartError) {
          // If restart fails, mark job as failed with the error
          await db
            .update(embeddingJobs)
            .set({
              status: 'failed',
              errorMessage: `Auto-resume failed: ${restartError instanceof Error ? restartError.message : 'Unknown error'}`,
              completedAt: now
            })
            .where(eq(embeddingJobs.id, job.id));

          await applicationLogger.error('vector', `❌ Failed to auto-resume job ${job.id}`, restartError instanceof Error ? restartError : undefined, {
            jobId: job.id,
            error: restartError instanceof Error ? restartError.message : 'Unknown error'
          });
          
          failedCount++;
        }
      }

      await applicationLogger.info('vector', `✅ Startup recovery complete - restarted ${restartedCount}, failed ${failedCount} orphaned job(s)`, {
        totalOrphanedJobs: orphanedJobs.length,
        restartedJobs: restartedCount,
        failedJobs: failedCount
      });
      
    } catch (error) {
      await applicationLogger.error('vector', 'Failed to perform startup recovery', error instanceof Error ? error : undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - startup should continue even if recovery fails
    }
  }

  /**
   * Start a new embedding job with full orchestration
   * PRODUCTION FIX: Added pre-flight health checks
   */
  async startEmbeddingJob(request: EmbeddingJobRequest = {}): Promise<{ jobId: string; importId: string }> {
    try {
      // PRODUCTION FIX: Pre-flight health check before starting job
      const { healthCheckService } = await import('../../utils/health-check');
      const preflightCheck = await healthCheckService.preflightCheckForEmbedding();
      
      if (!preflightCheck.safe) {
        const error = new Error(preflightCheck.reason || 'System health check failed');
        await applicationLogger.error('vector', 'Pre-flight check failed for embedding job', undefined, {
          reason: preflightCheck.reason,
          healthStatus: preflightCheck.healthStatus.checks
        });
        throw error;
      }

      await applicationLogger.info('vector', 'Pre-flight check passed, starting embedding job', {
        healthStatus: 'healthy',
        availableSlots: preflightCheck.healthStatus.checks.embeddingCapacity.details?.availableSlots
      });

      // Get customers needing embeddings
      const customersNeedingEmbeddings = await db
        .select({ count: count() })
        .from(customers)
        .leftJoin(customerEmbeddings, eq(customers.id, customerEmbeddings.customerId))
        .where(isNull(customerEmbeddings.customerId));

      const totalCustomers = request.totalCustomers || customersNeedingEmbeddings[0]?.count || 0;

      if (totalCustomers === 0) {
        throw new Error('No customers need embeddings');
      }

      // Create job record
      const [job] = await db
        .insert(embeddingJobs)
        .values({
          status: 'idle',
          totalCustomers,
          processedCustomers: 0,
          batchSize: request.batchSize || DEFAULT_BATCH_CONFIGS.embeddings.initialBatchSize,
          cancelRequested: false,
        })
        .returning();

      const jobId = job.id;
      const importId = crypto.randomUUID(); // Generate proper UUID for database compatibility

      // Create progress tracker
      const progressTracker = this.progressManager.createTracker(
        importId,
        totalCustomers,
        job.batchSize
      );

      // Register with watchdog
      this.watchdog.registerJob(jobId, 'vector');

      // Create abort controller for cancellation
      const abortController = new AbortController();
      
      // PRODUCTION FIX: Increase max listeners to handle production load
      // Each embedding job may attach multiple async operations to the signal
      // Default is 10, we allow up to 50 for complex batch operations
      // Using Node.js events.setMaxListeners for EventTarget (AbortSignal)
      setMaxListeners(50, abortController.signal);

      // Store active job
      this.activeJobs.set(jobId, {
        jobId,
        importId,
        progressTracker,
        abortController
      });

      // Start processing asynchronously
      this.processEmbeddingJob(jobId, importId, totalCustomers, job.batchSize, abortController)
        .catch(error => {
          applicationLogger.error('system', `❌ [Embedding Orchestrator] Job ${jobId} failed:`, error instanceof Error ? error : new Error(String(error))).catch(() => {});
          this.handleJobFailure(jobId, error);
        });

      await applicationLogger.info('vector', `Started embedding job ${jobId} for ${totalCustomers} customers`, {
        jobId,
        importId,
        totalCustomers,
        batchSize: job.batchSize
      });

      return { jobId, importId };

    } catch (error) {
      const errorRecord = handleError(error as Error, {
        operation: 'start_embedding_job',
        timestamp: new Date()
      });

      await applicationLogger.error('vector', 'Failed to start embedding job', undefined, {
        error: errorRecord.classification.fingerprint,
        severity: errorRecord.classification.severity
      });

      throw error;
    }
  }

  /**
   * Cancel an embedding job with defensive handling for orphaned jobs
   */
  async cancelEmbeddingJob(jobId: string): Promise<{ ok: boolean }> {
    try {
      await this.logCancellationAttempt(jobId);
      
      const activeJob = this.activeJobs.get(jobId);
      if (activeJob) {
        return await this.performStandardCancellation(jobId, activeJob);
      }
      
      return await this.performDefensiveCancellation(jobId);
      
    } catch (error) {
      return await this.handleCancellationError(jobId, error);
    }
  }

  /**
   * Perform standard cancellation for jobs in activeJobs Map
   */
  private async performStandardCancellation(jobId: string, activeJob: any): Promise<{ ok: boolean }> {
    await applicationLogger.info('vector', `Job ${jobId} found in activeJobs, performing standard cancellation`, {
      jobId,
      importId: activeJob.importId
    });

    // Signal cancellation to all systems
    activeJob.abortController.abort();
    activeJob.progressTracker.cancel();

    // Update database and cleanup
    await this.updateJobStatusToCancelled(jobId);
    await this.cleanupJobResources(jobId);

    await applicationLogger.info('vector', `Successfully cancelled embedding job ${jobId}`, {
      jobId,
      importId: activeJob.importId,
      method: 'standard'
    });

    return { ok: true };
  }

  /**
   * Perform defensive cancellation for orphaned jobs not in activeJobs Map
   */
  private async performDefensiveCancellation(jobId: string): Promise<{ ok: boolean }> {
    await applicationLogger.warn('vector', `Job ${jobId} not found in activeJobs, checking database for orphaned job`, {
      jobId
    });

    const job = await this.findJobInDatabase(jobId);
    if (!job) {
      await applicationLogger.warn('vector', `Job ${jobId} not found in database`, { jobId });
      return { ok: false };
    }

    await this.logOrphanedJobDetails(jobId, job);

    if (this.isJobCancellable(job.status)) {
      return await this.cancelOrphanedJob(jobId, job);
    } else {
      return await this.handleAlreadyTerminatedJob(jobId, job.status);
    }
  }

  /**
   * Cancel an orphaned job through direct database update
   */
  private async cancelOrphanedJob(jobId: string, job: any): Promise<{ ok: boolean }> {
    await applicationLogger.info('vector', `Performing defensive cancellation for orphaned job ${jobId}`, {
      jobId,
      previousStatus: job.status,
      processedCustomers: job.processedCustomers,
      totalCustomers: job.totalCustomers
    });

    // Update database and perform defensive cleanup
    await this.updateJobStatusToCancelled(jobId);
    await this.performDefensiveCleanup(jobId);

    await applicationLogger.info('vector', `Successfully performed defensive cancellation for orphaned job ${jobId}`, {
      jobId,
      method: 'defensive',
      previousStatus: job.status
    });

    return { ok: true };
  }

  /**
   * Helper methods for cancellation operations
   */
  private async logCancellationAttempt(jobId: string): Promise<void> {
    await applicationLogger.info('vector', `Attempting to cancel embedding job ${jobId}`, {
      jobId,
      foundInActiveJobs: this.activeJobs.has(jobId),
      activeJobsCount: this.activeJobs.size,
      timestamp: new Date().toISOString()
    });
  }

  private async findJobInDatabase(jobId: string) {
    const dbJob = await db
      .select()
      .from(embeddingJobs)
      .where(eq(embeddingJobs.id, jobId))
      .limit(1);
    
    return dbJob.length > 0 ? dbJob[0] : null;
  }

  private async logOrphanedJobDetails(jobId: string, job: any): Promise<void> {
    await applicationLogger.info('vector', `Found orphaned job ${jobId} in database`, {
      jobId,
      dbStatus: job.status,
      processedCustomers: job.processedCustomers,
      totalCustomers: job.totalCustomers,
      createdAt: job.createdAt,
      cancellable: this.isJobCancellable(job.status)
    });
  }

  private isJobCancellable(status: string): boolean {
    return status === 'running' || status === 'cancelling';
  }

  private async handleAlreadyTerminatedJob(jobId: string, status: string): Promise<{ ok: boolean }> {
    await applicationLogger.info('vector', `Job ${jobId} already in terminal state: ${status}`, {
      jobId,
      status
    });
    return { ok: true }; // Consider already terminated jobs as successfully "cancelled"
  }

  private async updateJobStatusToCancelled(jobId: string): Promise<void> {
    await db
      .update(embeddingJobs)
      .set({
        status: 'cancelled',
        cancelRequested: true,
        cancelledAt: new Date()
      })
      .where(eq(embeddingJobs.id, jobId));
  }

  /**
   * PRODUCTION FIX: Properly cleanup AbortController to prevent memory leaks
   * This method ensures all resources are disposed and references are removed for GC
   */
  private async cleanupJobResources(jobId: string): Promise<void> {
    const activeJob = this.activeJobs.get(jobId);
    
    if (activeJob?.abortController) {
      // Abort any pending operations (idempotent - safe to call multiple times)
      // This signals all async operations to stop and cleanup their listeners
      activeJob.abortController.abort();
      
      // SECURITY NOTE: AbortSignal listeners are automatically cleaned up when aborted
      // The key is to remove our reference so the entire controller can be garbage collected
      // Setting max listeners to 50 (above) prevents the warning during heavy operation
    }
    
    // Unregister from watchdog before removing from map
    this.watchdog.unregisterJob(jobId);
    
    // Remove from active jobs map - this removes the last reference to AbortController
    // allowing Node.js garbage collector to reclaim memory
    this.activeJobs.delete(jobId);
    
    await applicationLogger.debug('vector', `Cleaned up job resources for ${jobId}`, {
      jobId,
      hadAbortController: !!activeJob?.abortController,
      remainingActiveJobs: this.activeJobs.size
    });
  }

  /**
   * Defensive cleanup for orphaned jobs
   */
  private async performDefensiveCleanup(jobId: string): Promise<void> {
    // Use the same robust cleanup as standard path
    await this.cleanupJobResources(jobId);
  }

  private async handleCancellationError(jobId: string, error: unknown): Promise<{ ok: boolean }> {
    const errorRecord = handleError(error as Error, {
      operation: 'cancel_embedding_job',
      jobId,
      timestamp: new Date()
    });

    await applicationLogger.error('vector', 'Failed to cancel embedding job', undefined, {
      jobId,
      error: errorRecord.classification.fingerprint,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    return { ok: false };
  }

  /**
   * Get status of all embedding jobs
   */
  async getEmbeddingJobsStatus(): Promise<EmbeddingJobStatus[]> {
    try {
      const jobs = await db
        .select()
        .from(embeddingJobs)
        .orderBy(sql`${embeddingJobs.createdAt} DESC`)
        .limit(10);

      return jobs.map(job => {
        const activeJob = this.activeJobs.get(job.id);
        const progressState = activeJob?.progressTracker.getState();
        
        return {
          jobId: job.id,
          importId: activeJob?.importId || 'unknown',
          status: job.status as any,
          totalCustomers: job.totalCustomers,
          processedCustomers: progressState?.processedCustomers || job.processedCustomers,
          generatedEmbeddings: progressState?.generatedEmbeddings || 0,
          failedEmbeddings: progressState?.failedEmbeddings || 0,
          batchSize: job.batchSize,
          progress: job.totalCustomers > 0 ? 
            Math.round(((progressState?.processedCustomers || job.processedCustomers) / job.totalCustomers) * 100) : 0,
          
          averageBatchTimeMs: progressState?.averageBatchTimeMs,
          throughputPerSecond: progressState?.throughputPerSecond,
          estimatedTimeRemainingMs: progressState?.estimatedTimeRemainingMs,
          
          isStalled: progressState?.isStalled || false,
          retryAttempts: progressState?.retryAttempts || 0,
          errorCount: progressState?.errors.length || 0,
          
          createdAt: job.createdAt!,
          startedAt: job.startedAt || undefined,
          completedAt: job.completedAt || undefined,
          cancelledAt: job.cancelledAt || undefined
        };
      });

    } catch (error) {
      applicationLogger.error('system', 'Failed to get embedding jobs status:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      return [];
    }
  }

  /**
   * Get comprehensive orchestrator metrics
   */
  getMetrics() {
    return {
      rateLimiter: this.rateLimiter.getMetrics(),
      batchManager: this.batchManager.getMetrics(),
      watchdog: this.watchdog.getMetrics(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
      errorAggregator: globalErrorAggregator.getMetrics(),
      activeJobs: this.activeJobs.size
    };
  }

  /**
   * Main job processing logic
   */
  private async processEmbeddingJob(
    jobId: string,
    importId: string,
    totalCustomers: number,
    batchSize: number,
    abortController: AbortController
  ): Promise<void> {
    const activeJob = this.activeJobs.get(jobId);
    if (!activeJob) {
      throw new Error(`Active job ${jobId} not found`);
    }

    const { progressTracker } = activeJob;

    try {
      // Update job status to running
      await db
        .update(embeddingJobs)
        .set({
          status: 'running',
          startedAt: new Date()
        })
        .where(eq(embeddingJobs.id, jobId));

      // Start progress tracking
      progressTracker.start();

      // Process customers in batches
      let offset = 0;
      let batchNumber = 0;
      const totalBatches = Math.ceil(totalCustomers / batchSize);

      while (offset < totalCustomers && !abortController.signal.aborted) {
        // Update watchdog heartbeat
        this.watchdog.heartbeat(jobId);

        // Get adaptive batch size recommendation
        const batchRecommendation = this.batchSizer.getRecommendation();
        const currentBatchSize = batchRecommendation.recommendedBatchSize;

        // Fetch batch of customers
        const batchCustomers = await this.fetchCustomerBatch(offset, currentBatchSize);
        
        if (batchCustomers.length === 0) {
          break;
        }

        batchNumber++;
        const batchData: EmbeddingBatchData = {
          customers: batchCustomers,
          batchNumber,
          totalBatches
        };

        // Process batch through batch manager
        const batchStartTime = Date.now();
        const result = await this.processBatch(batchData, abortController);
        const batchProcessingTime = Date.now() - batchStartTime;

        // Record performance for adaptive batch sizing
        this.batchSizer.recordPerformance(
          currentBatchSize,
          batchProcessingTime,
          result.success,
          result.generatedCount
        );

        // Update progress
        progressTracker.updateBatch(
          batchNumber,
          result.processedCount,
          result.generatedCount,
          result.failedCount,
          batchProcessingTime
        );

        // Handle errors
        result.errors.forEach(error => {
          progressTracker.addError(error);
        });

        offset += batchCustomers.length;
      }

      // Complete the job
      if (!abortController.signal.aborted) {
        await this.completeJob(jobId, progressTracker);
      }

    } catch (error) {
      await this.handleJobFailure(jobId, error);
    }
  }

  /**
   * Process a single batch of customers
   */
  private async processBatch(
    batchData: EmbeddingBatchData,
    abortController: AbortController
  ): Promise<EmbeddingBatchResult> {
    const startTime = Date.now();
    let processedCount = 0;
    let generatedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    try {
      // Rate limiting check
      const rateLimitResult = await this.rateLimiter.acquireToken();
      if (!rateLimitResult.allowed) {
        // Wait for rate limit to reset
        await new Promise(resolve => setTimeout(resolve, rateLimitResult.waitTimeMs));
      }

      // Process embeddings with circuit breaker and retry
      const result = await this.circuitBreaker.execute(async () => {
        return await retryWithBackoff(
          () => this.generateEmbeddingsForBatch(batchData.customers, abortController),
          DEFAULT_RETRY_CONFIGS.openai,
          abortController.signal
        );
      });

      if (result.success && result.data) {
        const embeddings = result.data;
        
        // OPTIMIZATION: Bulk upsert operation for maximum performance
        // Build array of values for single transaction instead of per-row operations
        const bulkValues: Array<{
          customerId: string;
          embedding: number[];
          embeddingVector: number[];
          embeddingType: string;
          lastGeneratedAt: Date;
        }> = [];

        // Prepare bulk data and track errors
        embeddings.forEach((embedding, index) => {
          const customer = batchData.customers[index];
          processedCount++;
          
          if (embedding && embedding.length > 0) {
            bulkValues.push({
              customerId: customer.id,
              embedding: embedding,
              embeddingVector: embedding, // OPTIMIZED: pgvector column for HNSW indexing
              embeddingType: 'customer_profile',
              lastGeneratedAt: new Date()
            });
            generatedCount++;
          } else {
            errors.push({ customerId: customer.id, error: 'No embedding generated' });
            failedCount++;
          }
        });

        // Execute bulk upsert in single transaction for atomicity and performance
        if (bulkValues.length > 0) {
          try {
            await db.transaction(async (tx) => {
              await tx
                .insert(customerEmbeddings)
                .values(bulkValues)
                .onConflictDoUpdate({
                  target: customerEmbeddings.customerId,
                  set: {
                    embedding: sql`excluded.embedding`,
                    embeddingVector: sql`excluded.embedding_vector`, // OPTIMIZED: Update pgvector column
                    lastGeneratedAt: sql`excluded.last_generated_at`
                  }
                });
            });
          } catch (error) {
            // If bulk operation fails, mark all as failed
            const bulkError = error instanceof Error ? error.message : String(error);
            bulkValues.forEach(value => {
              errors.push({ customerId: value.customerId, error: `Bulk upsert failed: ${bulkError}` });
            });
            failedCount += bulkValues.length;
            generatedCount -= bulkValues.length;
          }
        }
      } else {
        // Entire batch failed
        failedCount = batchData.customers.length;
        processedCount = batchData.customers.length;
        errors.push({ batchError: result.error?.message || 'Batch processing failed' });
      }

    } catch (error) {
      // Handle batch-level errors
      failedCount = batchData.customers.length;
      processedCount = batchData.customers.length;
      errors.push({ batchError: error instanceof Error ? error.message : String(error) });
    }

    return {
      success: generatedCount > 0,
      processedCount,
      generatedCount,
      failedCount,
      errors,
      processingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Generate embeddings for a batch of customers using OpenAI API
   */
  private async generateEmbeddingsForBatch(
    customers: any[],
    abortController: AbortController
  ): Promise<number[][]> {
    const openai = getOpenAIClient();
    
    // Prepare text inputs
    const textInputs = customers.map(customer => {
      const profileText = this.buildCustomerProfileText(customer);
      return profileText.substring(0, MAX_PROFILE_TEXT_LENGTH);
    });

    // Call OpenAI API with array input for efficiency
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: textInputs
    }, {
      signal: abortController.signal
    });

    // Extract embeddings in order
    return response.data.map(item => item.embedding);
  }

  /**
   * Build profile text for a customer
   */
  private buildCustomerProfileText(customer: any): string {
    const parts = [];

    if (customer.firstName) parts.push(`First Name: ${customer.firstName}`);
    if (customer.lastName) parts.push(`Last Name: ${customer.lastName}`);
    if (customer.email) parts.push(`Email: ${customer.email}`);
    if (customer.customerSegment) parts.push(`Segment: ${customer.customerSegment}`);
    if (customer.lifetimeValue) parts.push(`Lifetime Value: ${customer.lifetimeValue}`);
    
    if (customer.currentAddress) {
      const address = customer.currentAddress;
      if (typeof address === 'object') {
        Object.entries(address).forEach(([key, value]) => {
          if (value) parts.push(`${key}: ${value}`);
        });
      } else {
        parts.push(`Address: ${address}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Fetch a batch of customers needing embeddings
   */
  private async fetchCustomerBatch(offset: number, limit: number) {
    return await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        customerSegment: customers.customerSegment,
        lifetimeValue: customers.lifetimeValue,
        currentAddress: customers.currentAddress
      })
      .from(customers)
      .leftJoin(customerEmbeddings, eq(customers.id, customerEmbeddings.customerId))
      .where(isNull(customerEmbeddings.customerId))
      .offset(offset)
      .limit(limit);
  }

  /**
   * Complete a job successfully
   * ENHANCED: Reset auto-restart counter on successful completion
   * 
   * SMART AUTO-RESUME: When a job completes successfully, we reset the restart counters.
   * This gives future runs a clean slate with all 3 restart attempts available.
   */
  private async completeJob(jobId: string, progressTracker: ProgressTracker): Promise<void> {
    // Update job status and reset auto-restart tracking for future runs
    await db
      .update(embeddingJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        autoRestartCount: 0, // Reset restart counter (future restarts get fresh 3 attempts)
        lastFailedAt: null // Clear failure timestamp (no cooldown applies to future runs)
      })
      .where(eq(embeddingJobs.id, jobId));

    // Complete progress tracking
    progressTracker.complete();

    // PRODUCTION FIX: Use centralized cleanup to properly dispose AbortController
    await this.cleanupJobResources(jobId);

    await applicationLogger.info('vector', `Completed embedding job ${jobId}`, { jobId });
  }

  /**
   * Handle job failure
   * ENHANCED: Update lastFailedAt for cooldown tracking
   */
  private async handleJobFailure(jobId: string, error: any): Promise<void> {
    const errorRecord = handleError(error as Error, {
      operation: 'process_embedding_job',
      jobId,
      timestamp: new Date()
    });

    // Update job status and failure timestamp for cooldown logic
    await db
      .update(embeddingJobs)
      .set({
        status: 'failed',
        errorMessage: errorRecord.error.message,
        lastFailedAt: new Date() // Track actual failure time for cooldown
      })
      .where(eq(embeddingJobs.id, jobId));

    // Update progress tracker
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      activeJob.progressTracker.fail(errorRecord.error.message);
    }

    // PRODUCTION FIX: Use centralized cleanup to properly dispose AbortController
    await this.cleanupJobResources(jobId);

    await applicationLogger.error('vector', `Failed embedding job ${jobId}`, undefined, {
      jobId,
      error: errorRecord.classification.fingerprint,
      severity: errorRecord.classification.severity
    });
  }

  /**
   * Setup watchdog event handlers
   */
  private setupWatchdogHandlers(): void {
    this.watchdog.addEventListener((eventType, job) => {
      switch (eventType) {
        case 'stalled':
          applicationLogger.warn('vector', `Job ${job.jobId} is stalled`, {
            jobId: job.jobId,
            stallDuration: job.timeStallMs
          });
          break;
          
        case 'failed':
          applicationLogger.error('vector', `Job ${job.jobId} marked as failed by watchdog`, undefined, {
            jobId: job.jobId,
            stallDuration: job.timeStallMs
          });
          break;
          
        case 'recovered':
          applicationLogger.info('vector', `Job ${job.jobId} recovered`, {
            jobId: job.jobId
          });
          break;
          
        case 'cleanup':
          applicationLogger.info('vector', `Job ${job.jobId} cleaned up`, {
            jobId: job.jobId
          });
          break;
      }
    });
  }
}

/**
 * Global orchestrator instance
 */
export let globalEmbeddingOrchestrator: EmbeddingOrchestrator;

/**
 * Initialize global embedding orchestrator
 */
export function initializeEmbeddingOrchestrator(): EmbeddingOrchestrator {
  if (globalEmbeddingOrchestrator) {
    // Clean shutdown of existing orchestrator
    // (Add cleanup logic here if needed)
  }
  
  globalEmbeddingOrchestrator = new EmbeddingOrchestrator();
  return globalEmbeddingOrchestrator;
}

/**
 * Get the global orchestrator instance
 */
export function getEmbeddingOrchestrator(): EmbeddingOrchestrator {
  if (!globalEmbeddingOrchestrator) {
    return initializeEmbeddingOrchestrator();
  }
  return globalEmbeddingOrchestrator;
}