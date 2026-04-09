/**
 * Shared Batch Processing Utilities
 * 
 * Purpose: Centralized batch processing logic extracted from multiple embedding services
 * 
 * Key Features:
 * - Configurable batch size management
 * - Adaptive batch sizing based on performance
 * - Concurrent batch processing with limits
 * - Queue management with priority support
 * - Performance monitoring and optimization
 * 
 * @module SharedBatch
 * @created September 23, 2025 - Extracted from adaptive-batch-sizing and concurrent-batch-manager
 */

export interface BatchConfig {
  minBatchSize: number;
  maxBatchSize: number;
  initialBatchSize: number;
  maxConcurrentBatches: number;
  queueMaxSize: number;
  timeoutMs: number;
}

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
  retryCount: number;
}

export interface BatchMetrics {
  averageProcessingTime: number;
  successRate: number;
  optimalBatchSize: number;
  performanceTrend: 'improving' | 'stable' | 'degrading';
  currentConcurrency: number;
  queueSize: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  throughputPerMinute: number;
}

export interface AdaptiveBatchRecommendation {
  recommendedBatchSize: number;
  confidence: number; // 0-1
  reasoning: string;
  adaptationApplied: 'increase' | 'decrease' | 'maintain' | 'recover';
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

interface PerformanceRecord {
  batchSize: number;
  responseTimeMs: number;
  success: boolean;
  timestamp: Date;
  tokensProcessed?: number;
  errorType?: string;
}

/**
 * Adaptive Batch Size Manager
 */
export class AdaptiveBatchSizer {
  private config: BatchConfig;
  private currentBatchSize: number;
  private performanceHistory: PerformanceRecord[] = [];
  private readonly historySize = 50;

  constructor(config: BatchConfig) {
    this.config = config;
    this.currentBatchSize = config.initialBatchSize;
  }

  /**
   * Record performance metrics for a batch operation
   */
  recordPerformance(
    batchSize: number,
    responseTimeMs: number,
    success: boolean,
    tokensProcessed?: number,
    errorType?: string
  ): void {
    const record: PerformanceRecord = {
      batchSize,
      responseTimeMs,
      success,
      timestamp: new Date(),
      tokensProcessed,
      errorType
    };

    this.performanceHistory.push(record);
    
    // Keep only recent history
    if (this.performanceHistory.length > this.historySize) {
      this.performanceHistory.shift();
    }
  }

  /**
   * Get recommended batch size based on performance history
   */
  getRecommendation(): AdaptiveBatchRecommendation {
    if (this.performanceHistory.length < 3) {
      return {
        recommendedBatchSize: this.currentBatchSize,
        confidence: 0.3,
        reasoning: 'Insufficient performance data',
        adaptationApplied: 'maintain',
        performanceTrend: 'stable'
      };
    }

    const recentMetrics = this.analyzeRecentPerformance();
    const trend = this.calculatePerformanceTrend();
    
    let recommendedSize = this.currentBatchSize;
    let adaptationApplied: 'increase' | 'decrease' | 'maintain' | 'recover' = 'maintain';
    let reasoning = 'Performance is stable';
    
    // Decision logic based on recent performance
    if (recentMetrics.averageResponseTime < 3000 && recentMetrics.successRate > 0.95) {
      // Very good performance - increase batch size
      recommendedSize = Math.min(
        this.config.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.25)
      );
      adaptationApplied = 'increase';
      reasoning = 'Fast response times, increasing batch size';
    } else if (recentMetrics.averageResponseTime > 10000 || recentMetrics.successRate < 0.8) {
      // Poor performance - decrease batch size
      recommendedSize = Math.max(
        this.config.minBatchSize,
        Math.ceil(this.currentBatchSize * 0.75)
      );
      adaptationApplied = 'decrease';
      reasoning = 'Slow response times or failures, decreasing batch size';
    } else if (recentMetrics.successRate < 0.9) {
      // Some failures - small decrease
      recommendedSize = Math.max(
        this.config.minBatchSize,
        Math.ceil(this.currentBatchSize * 0.9)
      );
      adaptationApplied = 'decrease';
      reasoning = 'Some failures detected, slight decrease';
    }

    const confidence = this.calculateConfidence(recentMetrics);
    
    if (recommendedSize !== this.currentBatchSize) {
      this.currentBatchSize = recommendedSize;
    }

    return {
      recommendedBatchSize: recommendedSize,
      confidence,
      reasoning,
      adaptationApplied,
      performanceTrend: trend
    };
  }

  /**
   * Get current batch size
   */
  getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }

  /**
   * Force set batch size (for manual overrides)
   */
  setBatchSize(size: number): void {
    this.currentBatchSize = Math.max(
      this.config.minBatchSize,
      Math.min(this.config.maxBatchSize, size)
    );
  }

  private analyzeRecentPerformance() {
    const recentRecords = this.performanceHistory.slice(-10);
    const successfulRecords = recentRecords.filter(r => r.success);
    
    const averageResponseTime = recentRecords.length > 0
      ? recentRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / recentRecords.length
      : 0;
      
    const successRate = recentRecords.length > 0
      ? successfulRecords.length / recentRecords.length
      : 1;

    return {
      averageResponseTime,
      successRate,
      sampleSize: recentRecords.length
    };
  }

  private calculatePerformanceTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.performanceHistory.length < 6) return 'stable';
    
    const firstHalf = this.performanceHistory.slice(0, Math.floor(this.performanceHistory.length / 2));
    const secondHalf = this.performanceHistory.slice(Math.floor(this.performanceHistory.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.responseTimeMs, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.responseTimeMs, 0) / secondHalf.length;
    
    const improvement = (firstHalfAvg - secondHalfAvg) / firstHalfAvg;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'degrading';
    return 'stable';
  }

  private calculateConfidence(metrics: { averageResponseTime: number; successRate: number; sampleSize: number }): number {
    let confidence = 0.5; // Base confidence
    
    // More samples = higher confidence
    confidence += Math.min(0.3, metrics.sampleSize / 20 * 0.3);
    
    // High success rate = higher confidence
    confidence += metrics.successRate * 0.2;
    
    // Stable response times = higher confidence
    if (metrics.averageResponseTime > 0 && metrics.averageResponseTime < 15000) {
      confidence += 0.2;
    }
    
    return Math.min(1, confidence);
  }
}

/**
 * Batch Queue Manager with priority and concurrency control
 */
export class BatchQueueManager<T = any, R = any> {
  private activeTasks: Map<string, {
    task: BatchTask<T, R>;
    startTime: number;
    abortController: AbortController;
  }> = new Map();
  
  private queue: BatchTask<T, R>[] = [];
  private metrics: BatchMetrics;
  private config: BatchConfig;

  constructor(config: BatchConfig) {
    this.config = config;
    this.metrics = {
      averageProcessingTime: 0,
      successRate: 1,
      optimalBatchSize: config.initialBatchSize,
      performanceTrend: 'stable',
      currentConcurrency: 0,
      queueSize: 0,
      processingTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      throughputPerMinute: 0
    };
  }

  /**
   * Submit a batch task for processing
   */
  async submitBatch(task: Omit<BatchTask<T, R>, 'id' | 'createdAt'>): Promise<string> {
    if (this.queue.length >= this.config.queueMaxSize) {
      throw new Error(`Batch queue is full (max: ${this.config.queueMaxSize})`);
    }

    const batchTask: BatchTask<T, R> = {
      ...task,
      id: this.generateTaskId(),
      createdAt: new Date()
    };

    // Insert based on priority
    this.insertByPriority(batchTask);
    this.metrics.queueSize = this.queue.length;

    // Process queue if capacity available
    this.processQueue();

    return batchTask.id;
  }

  /**
   * Cancel a specific batch task
   */
  async cancelBatch(taskId: string): Promise<boolean> {
    // Check active tasks
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      activeTask.abortController.abort();
      this.activeTasks.delete(taskId);
      this.metrics.currentConcurrency = this.activeTasks.size;
      return true;
    }

    // Check queue
    const queueIndex = this.queue.findIndex(task => task.id === taskId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      this.metrics.queueSize = this.queue.length;
      return true;
    }

    return false;
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.queue.length,
      activeTasks: this.activeTasks.size,
      capacity: this.config.maxConcurrentBatches
    };
  }

  private async processQueue(): Promise<void> {
    while (
      this.queue.length > 0 && 
      this.activeTasks.size < this.config.maxConcurrentBatches
    ) {
      const task = this.queue.shift()!;
      this.metrics.queueSize = this.queue.length;
      
      const abortController = new AbortController();
      const activeTask = {
        task,
        startTime: Date.now(),
        abortController
      };
      
      this.activeTasks.set(task.id, activeTask);
      this.metrics.currentConcurrency = this.activeTasks.size;
      this.metrics.processingTasks++;

      // Process task asynchronously
      this.processTask(task, abortController).finally(() => {
        this.activeTasks.delete(task.id);
        this.metrics.currentConcurrency = this.activeTasks.size;
        this.processQueue(); // Continue processing queue
      });
    }
  }

  private async processTask(
    task: BatchTask<T, R>, 
    abortController: AbortController
  ): Promise<BatchResult<R>> {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = task.maxRetries || 3;

    while (retryCount <= maxRetries) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Task timeout')), task.timeoutMs || this.config.timeoutMs);
        });

        const result = await Promise.race([
          task.processor(task.data, abortController.signal),
          timeoutPromise
        ]);

        const duration = Date.now() - startTime;
        this.updateMetrics(duration, true);

        return {
          taskId: task.id,
          success: true,
          data: result,
          duration,
          retryCount
        };

      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries || abortController.signal.aborted) {
          const duration = Date.now() - startTime;
          this.updateMetrics(duration, false);
          
          return {
            taskId: task.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration,
            retryCount
          };
        }

        // Exponential backoff for retries
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
      }
    }

    // Should not reach here, but TypeScript requires a return
    throw new Error('Unexpected end of processTask');
  }

  private insertByPriority(task: BatchTask<T, R>): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const taskPriority = priorityOrder[task.priority];

    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (priorityOrder[this.queue[i].priority] > taskPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, task);
  }

  private updateMetrics(duration: number, success: boolean): void {
    if (success) {
      this.metrics.completedTasks++;
    } else {
      this.metrics.failedTasks++;
    }

    const totalTasks = this.metrics.completedTasks + this.metrics.failedTasks;
    this.metrics.successRate = this.metrics.completedTasks / totalTasks;
    
    // Update average processing time
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (totalTasks - 1) + duration) / totalTasks;
  }

  private generateTaskId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Default batch configurations
 */
export const DEFAULT_BATCH_CONFIGS = {
  embeddings: {
    minBatchSize: 1,
    maxBatchSize: 100,
    initialBatchSize: 25,
    maxConcurrentBatches: 3,
    queueMaxSize: 100,
    timeoutMs: 300000 // 5 minutes
  },
  conservative: {
    minBatchSize: 1,
    maxBatchSize: 50,
    initialBatchSize: 10,
    maxConcurrentBatches: 2,
    queueMaxSize: 50,
    timeoutMs: 180000 // 3 minutes
  }
} as const;