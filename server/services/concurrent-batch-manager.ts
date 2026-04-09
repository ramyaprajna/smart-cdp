/**
 * Concurrent Batch Manager Service
 *
 * Purpose: Manages concurrent batch processing with configurable limits and intelligent queuing
 *
 * FEATURES:
 * - Configurable concurrent batch processing (default: 3 concurrent batches)
 * - Priority-based batch queue management
 * - Integration with token bucket rate limiting
 * - Adaptive concurrency based on system performance
 * - Comprehensive monitoring and metrics
 * - Graceful error handling and recovery
 *
 * DESIGN PRINCIPLES:
 * - Maximize throughput within API rate limits
 * - Prevent system overload with controlled concurrency
 * - Fair queuing with priority support
 * - Real-time performance monitoring
 * - Fail-safe operation with automatic recovery
 *
 * @module ConcurrentBatchManager
 * @created September 22, 2025
 */

import { applicationLogger } from './application-logger';
import { globalRateLimiter, RateLimitResult } from './token-bucket-rate-limiter';
import { adaptiveBatchSizingService } from './adaptive-batch-sizing-service';

// Environment configuration
const MAX_CONCURRENT_BATCHES = parseInt(process.env.MAX_CONCURRENT_BATCHES || '3');
const BATCH_QUEUE_MAX_SIZE = parseInt(process.env.BATCH_QUEUE_MAX_SIZE || '100');
const BATCH_TIMEOUT_MS = parseInt(process.env.BATCH_TIMEOUT_MS || '300000'); // 5 minutes
const CONCURRENCY_ADJUSTMENT_INTERVAL_MS = parseInt(process.env.CONCURRENCY_ADJUSTMENT_INTERVAL_MS || '30000');
const MIN_CONCURRENT_BATCHES = parseInt(process.env.MIN_CONCURRENT_BATCHES || '1');
const PERFORMANCE_THRESHOLD_MS = parseInt(process.env.PERFORMANCE_THRESHOLD_MS || '10000'); // 10 seconds

export interface BatchTask<T = any, R = any> {
  id: string;
  priority: 'high' | 'normal' | 'low';
  data: T;
  processor: (data: T, signal: AbortSignal) => Promise<R>;
  jobId?: string;
  createdAt: Date;
  timeoutMs?: number;
  retries?: number;
  maxRetries?: number;
}

export interface BatchResult<R = any> {
  taskId: string;
  success: boolean;
  data?: R;
  error?: string;
  duration: number;
  tokensUsed: number;
  retryCount: number;
}

export interface ConcurrencyMetrics {
  currentConcurrency: number;
  maxConcurrency: number;
  queueSize: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
  adaptiveAdjustments: number;
  lastAdjustmentTime: Date;
  systemLoad: 'low' | 'normal' | 'high' | 'overloaded';
}

interface ProcessingState {
  activeTasks: Map<string, { 
    task: BatchTask, 
    startTime: number, 
    abortController: AbortController 
  }>;
  queue: BatchTask[];
  metrics: ConcurrencyMetrics;
  adjustmentTimer: NodeJS.Timeout | null;
}

/**
 * ConcurrentBatchManager - Enterprise-grade concurrent batch processing
 */
export class ConcurrentBatchManager {
  private state: ProcessingState;
  private shutdownSignal: boolean = false;

  constructor() {
    this.state = {
      activeTasks: new Map(),
      queue: [],
      metrics: {
        currentConcurrency: 0,
        maxConcurrency: MAX_CONCURRENT_BATCHES,
        queueSize: 0,
        processingTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
        throughputPerMinute: 0,
        adaptiveAdjustments: 0,
        lastAdjustmentTime: new Date(),
        systemLoad: 'low'
      },
      adjustmentTimer: null
    };

    this.startAdaptiveConcurrencyAdjustment();
  }

  /**
   * Submit a batch task for processing
   */
  async submitBatch<T, R>(task: Omit<BatchTask<T, R>, 'id' | 'createdAt'>): Promise<string> {
    if (this.shutdownSignal) {
      throw new Error('Batch manager is shutting down');
    }

    if (this.state.queue.length >= BATCH_QUEUE_MAX_SIZE) {
      throw new Error(`Batch queue is full (max: ${BATCH_QUEUE_MAX_SIZE})`);
    }

    const batchTask: BatchTask<T, R> = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      timeoutMs: BATCH_TIMEOUT_MS,
      retries: 0,
      maxRetries: 3,
      ...task
    };

    // Insert task in priority order
    this.insertTaskByPriority(batchTask);
    this.state.metrics.queueSize = this.state.queue.length;

    await applicationLogger.info('system', `📥 Batch task queued`, {
      taskId: batchTask.id,
      priority: batchTask.priority,
      queueSize: this.state.queue.length,
      jobId: batchTask.jobId
    });

    // Try to process immediately if slots available
    this.processNextBatch();

    return batchTask.id;
  }

  /**
   * Get current batch processing metrics
   */
  getMetrics(): ConcurrencyMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Get status of specific batch task
   */
  getTaskStatus(taskId: string): 'queued' | 'processing' | 'completed' | 'not_found' {
    if (this.state.activeTasks.has(taskId)) {
      return 'processing';
    }
    
    if (this.state.queue.some(task => task.id === taskId)) {
      return 'queued';
    }
    
    return 'not_found';
  }

  /**
   * Cancel a specific batch task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Check if task is currently processing
    const activeTask = this.state.activeTasks.get(taskId);
    if (activeTask) {
      activeTask.abortController.abort();
      await applicationLogger.info('system', `❌ Processing batch task cancelled`, { taskId });
      return true;
    }

    // Remove from queue if present
    const queueIndex = this.state.queue.findIndex(task => task.id === taskId);
    if (queueIndex !== -1) {
      this.state.queue.splice(queueIndex, 1);
      this.state.metrics.queueSize = this.state.queue.length;
      await applicationLogger.info('system', `❌ Queued batch task cancelled`, { taskId });
      return true;
    }

    return false;
  }

  /**
   * Update concurrency limits dynamically
   */
  updateConcurrencyLimits(maxConcurrency: number): void {
    const oldLimit = this.state.metrics.maxConcurrency;
    this.state.metrics.maxConcurrency = Math.max(MIN_CONCURRENT_BATCHES, maxConcurrency);
    
    applicationLogger.info('system', `⚙️ Concurrency limit updated`, {
      oldLimit,
      newLimit: this.state.metrics.maxConcurrency,
      currentConcurrency: this.state.metrics.currentConcurrency
    });

    // Try to process more batches if limit increased
    if (this.state.metrics.maxConcurrency > oldLimit) {
      this.processNextBatch();
    }
  }

  /**
   * Shutdown the batch manager gracefully
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    this.shutdownSignal = true;
    
    if (this.state.adjustmentTimer) {
      clearInterval(this.state.adjustmentTimer);
      this.state.adjustmentTimer = null;
    }

    await applicationLogger.info('system', '🛑 Shutting down concurrent batch manager', {
      activeTasks: this.state.activeTasks.size,
      queuedTasks: this.state.queue.length
    });

    // Abort all active tasks
    Array.from(this.state.activeTasks.entries()).forEach(([taskId, taskState]) => {
      const { abortController } = taskState;
      abortController.abort();
    });

    // Wait for tasks to complete or timeout
    const startTime = Date.now();
    while (this.state.activeTasks.size > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear queue
    this.state.queue = [];
    this.state.metrics.queueSize = 0;

    await applicationLogger.info('system', '✅ Concurrent batch manager shutdown complete');
  }

  /**
   * Private: Insert task in priority order (high -> normal -> low)
   */
  private insertTaskByPriority(task: BatchTask): void {
    const priorities = { high: 0, normal: 1, low: 2 };
    const taskPriority = priorities[task.priority];
    
    let insertIndex = this.state.queue.length;
    for (let i = 0; i < this.state.queue.length; i++) {
      const existingPriority = priorities[this.state.queue[i].priority];
      if (taskPriority < existingPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.state.queue.splice(insertIndex, 0, task);
  }

  /**
   * Private: Process next batch if concurrency allows
   */
  private async processNextBatch(): Promise<void> {
    if (this.shutdownSignal) return;
    
    // Check if we can process more batches
    if (this.state.activeTasks.size >= this.state.metrics.maxConcurrency) {
      return;
    }
    
    // Get next task from queue
    const task = this.state.queue.shift();
    if (!task) {
      return;
    }
    
    this.state.metrics.queueSize = this.state.queue.length;
    
    // Check rate limiting
    const rateLimitResult = await globalRateLimiter.acquireToken(task.priority);
    if (!rateLimitResult.allowed) {
      // Put task back at front of queue and wait
      this.state.queue.unshift(task);
      this.state.metrics.queueSize = this.state.queue.length;
      
      await applicationLogger.warn('system', `⏰ Rate limited, task re-queued`, {
        taskId: task.id,
        waitTimeMs: rateLimitResult.waitTimeMs,
        reason: rateLimitResult.reason
      });
      
      // Schedule retry after wait time
      setTimeout(() => this.processNextBatch(), rateLimitResult.waitTimeMs || 1000);
      return;
    }
    
    // Start processing the task
    this.startTaskProcessing(task, rateLimitResult);
    
    // Try to process another batch
    setTimeout(() => this.processNextBatch(), 10);
  }

  /**
   * Private: Start processing a batch task
   */
  private async startTaskProcessing(task: BatchTask, rateLimitResult: RateLimitResult): Promise<void> {
    const abortController = new AbortController();
    const startTime = Date.now();
    
    this.state.activeTasks.set(task.id, {
      task,
      startTime,
      abortController
    });
    
    this.state.metrics.currentConcurrency = this.state.activeTasks.size;
    this.state.metrics.processingTasks++;
    
    await applicationLogger.info('system', `🚀 Starting batch task processing`, {
      taskId: task.id,
      priority: task.priority,
      currentConcurrency: this.state.metrics.currentConcurrency,
      tokensRemaining: rateLimitResult.tokensRemaining,
      jobId: task.jobId
    });

    try {
      // Set timeout for the task
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timeout')), task.timeoutMs || BATCH_TIMEOUT_MS);
      });

      // Process the task with timeout
      const result = await Promise.race([
        task.processor(task.data, abortController.signal),
        timeoutPromise
      ]);

      // Task completed successfully
      await this.handleTaskCompletion(task.id, true, result, startTime, rateLimitResult.tokensRemaining || 0);

    } catch (error) {
      // Task failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.handleTaskCompletion(task.id, false, undefined, startTime, rateLimitResult.tokensRemaining || 0, errorMessage);
      
      // Consider retry if not cancelled and retries available
      if (!abortController.signal.aborted && task.retries! < (task.maxRetries || 3)) {
        await this.retryTask(task, errorMessage);
      }
    }
  }

  /**
   * Private: Handle task completion
   */
  private async handleTaskCompletion(
    taskId: string, 
    success: boolean, 
    result: any, 
    startTime: number,
    tokensUsed: number,
    error?: string
  ): Promise<void> {
    const activeTask = this.state.activeTasks.get(taskId);
    if (!activeTask) return;
    
    this.state.activeTasks.delete(taskId);
    
    const duration = Date.now() - startTime;
    this.state.metrics.currentConcurrency = this.state.activeTasks.size;
    
    if (success) {
      this.state.metrics.completedTasks++;
    } else {
      this.state.metrics.failedTasks++;
    }
    
    // Update average processing time
    const totalTasks = this.state.metrics.completedTasks + this.state.metrics.failedTasks;
    this.state.metrics.averageProcessingTime = 
      (this.state.metrics.averageProcessingTime * (totalTasks - 1) + duration) / totalTasks;
    
    // Update throughput
    this.updateThroughputMetrics();
    
    // Update system load assessment
    this.updateSystemLoad();
    
    await applicationLogger.info('system', `${success ? '✅' : '❌'} Batch task ${success ? 'completed' : 'failed'}`, {
      taskId,
      success,
      duration,
      tokensUsed,
      error,
      currentConcurrency: this.state.metrics.currentConcurrency,
      averageProcessingTime: this.state.metrics.averageProcessingTime,
      jobId: activeTask.task.jobId
    });
    
    // Try to process next batch
    this.processNextBatch();
  }

  /**
   * Private: Retry a failed task
   */
  private async retryTask(task: BatchTask, lastError: string): Promise<void> {
    task.retries = (task.retries || 0) + 1;
    
    // Exponential backoff for retry
    const backoffMs = Math.min(1000 * Math.pow(2, task.retries), 30000);
    
    await applicationLogger.info('system', `🔄 Retrying batch task`, {
      taskId: task.id,
      retryCount: task.retries,
      maxRetries: task.maxRetries,
      backoffMs,
      lastError
    });
    
    setTimeout(() => {
      this.insertTaskByPriority(task);
      this.state.metrics.queueSize = this.state.queue.length;
      this.processNextBatch();
    }, backoffMs);
  }

  /**
   * Private: Start adaptive concurrency adjustment
   */
  private startAdaptiveConcurrencyAdjustment(): void {
    this.state.adjustmentTimer = setInterval(() => {
      this.adjustConcurrencyBasedOnPerformance();
    }, CONCURRENCY_ADJUSTMENT_INTERVAL_MS);
  }

  /**
   * Private: Adjust concurrency based on system performance
   */
  private adjustConcurrencyBasedOnPerformance(): void {
    const metrics = this.state.metrics;
    const rateLimiterStatus = globalRateLimiter.getStatus();
    
    let shouldIncrease = false;
    let shouldDecrease = false;
    
    // Increase concurrency if:
    // - Average processing time is good (< threshold)
    // - High token availability
    // - Low queue size
    // - System load is not high
    if (metrics.averageProcessingTime < PERFORMANCE_THRESHOLD_MS &&
        rateLimiterStatus.currentTokens > rateLimiterStatus.maxTokens * 0.5 &&
        metrics.queueSize < 10 &&
        metrics.systemLoad !== 'high' && metrics.systemLoad !== 'overloaded') {
      shouldIncrease = true;
    }
    
    // Decrease concurrency if:
    // - Average processing time is too high
    // - Low token availability
    // - System overloaded
    if (metrics.averageProcessingTime > PERFORMANCE_THRESHOLD_MS * 2 ||
        rateLimiterStatus.currentTokens < rateLimiterStatus.maxTokens * 0.2 ||
        metrics.systemLoad === 'overloaded') {
      shouldDecrease = true;
    }
    
    if (shouldIncrease && metrics.maxConcurrency < MAX_CONCURRENT_BATCHES) {
      const newLimit = Math.min(metrics.maxConcurrency + 1, MAX_CONCURRENT_BATCHES);
      this.updateConcurrencyLimits(newLimit);
      metrics.adaptiveAdjustments++;
      metrics.lastAdjustmentTime = new Date();
    } else if (shouldDecrease && metrics.maxConcurrency > MIN_CONCURRENT_BATCHES) {
      const newLimit = Math.max(metrics.maxConcurrency - 1, MIN_CONCURRENT_BATCHES);
      this.updateConcurrencyLimits(newLimit);
      metrics.adaptiveAdjustments++;
      metrics.lastAdjustmentTime = new Date();
    }
  }

  /**
   * Private: Update throughput metrics
   */
  private updateThroughputMetrics(): void {
    const totalTasks = this.state.metrics.completedTasks + this.state.metrics.failedTasks;
    const runtimeMinutes = (Date.now() - this.state.metrics.lastAdjustmentTime.getTime()) / 60000;
    
    if (runtimeMinutes > 0) {
      this.state.metrics.throughputPerMinute = totalTasks / runtimeMinutes;
    }
  }

  /**
   * Private: Update system load assessment
   */
  private updateSystemLoad(): void {
    const metrics = this.state.metrics;
    const rateLimiterStatus = globalRateLimiter.getStatus();
    
    // Simple load assessment based on multiple factors
    const queuePressure = metrics.queueSize / BATCH_QUEUE_MAX_SIZE;
    const concurrencyPressure = metrics.currentConcurrency / metrics.maxConcurrency;
    const tokenPressure = 1 - (rateLimiterStatus.currentTokens / rateLimiterStatus.maxTokens);
    const timePressure = metrics.averageProcessingTime / PERFORMANCE_THRESHOLD_MS;
    
    const overallLoad = (queuePressure + concurrencyPressure + tokenPressure + timePressure) / 4;
    
    if (overallLoad > 0.8) {
      metrics.systemLoad = 'overloaded';
    } else if (overallLoad > 0.6) {
      metrics.systemLoad = 'high';
    } else if (overallLoad > 0.3) {
      metrics.systemLoad = 'normal';
    } else {
      metrics.systemLoad = 'low';
    }
  }
}

// Singleton instance for global use
export const globalBatchManager = new ConcurrentBatchManager();

// Export service startup
export async function initializeConcurrentBatchManager(): Promise<void> {
  await applicationLogger.info('system', '🚀 Concurrent batch manager initialized', {
    maxConcurrency: MAX_CONCURRENT_BATCHES,
    queueMaxSize: BATCH_QUEUE_MAX_SIZE,
    batchTimeout: BATCH_TIMEOUT_MS
  });
}