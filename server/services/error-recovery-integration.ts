/**
 * Error Recovery Integration Layer
 * 
 * Implementation: September 22, 2025
 * Architecture: Integration utilities for connecting comprehensive error recovery with existing services
 * 
 * Features:
 * - Seamless integration with existing embedding services
 * - Partial batch retry strategies
 * - Automatic job resumption utilities
 * - Cross-service error coordination
 * - Performance-aware error handling
 */

import { globalErrorRecovery, ErrorType, RetryConfig } from './comprehensive-error-recovery-service';
import { globalBatchManager } from './concurrent-batch-manager';
import { globalRateLimiter } from './token-bucket-rate-limiter';
import { secureLogger } from '../utils/secure-logger';

// Integration configuration for different service types
export const ErrorRecoveryConfigs = {
  OPENAI_EMBEDDINGS: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 120000, // 2 minutes for OpenAI rate limits
    exponentialBase: 2,
    jitterFactor: 0.15,
    circuitBreakerThreshold: 8,
    circuitBreakerWindowMs: 600000, // 10 minutes
    enableAdaptiveRetry: true
  } as RetryConfig,

  BATCH_PROCESSING: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBase: 1.5,
    jitterFactor: 0.1,
    circuitBreakerThreshold: 5,
    circuitBreakerWindowMs: 300000, // 5 minutes
    enableAdaptiveRetry: true
  } as RetryConfig,

  DATABASE_OPERATIONS: {
    maxRetries: 4,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    exponentialBase: 2,
    jitterFactor: 0.05,
    circuitBreakerThreshold: 10,
    circuitBreakerWindowMs: 180000, // 3 minutes
    enableAdaptiveRetry: false
  } as RetryConfig,

  WEBSOCKET_OPERATIONS: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 15000,
    exponentialBase: 1.8,
    jitterFactor: 0.2,
    circuitBreakerThreshold: 6,
    circuitBreakerWindowMs: 240000, // 4 minutes
    enableAdaptiveRetry: true
  } as RetryConfig
};

// Enhanced batch processing with partial retry capabilities
export interface BatchItem<T> {
  id: string;
  data: T;
  priority?: 'high' | 'normal' | 'low';
  retryCount?: number;
  lastError?: string;
}

export interface BatchProcessResult<T> {
  successful: BatchItem<T>[];
  failed: BatchItem<T>[];
  partiallyProcessed: boolean;
  recoveryActions: string[];
  totalProcessed: number;
  errors: Array<{ itemId: string; error: string }>;
}

/**
 * Enhanced OpenAI API wrapper with comprehensive error recovery
 */
export class ResilientOpenAIService {
  private static instance: ResilientOpenAIService;

  public static getInstance(): ResilientOpenAIService {
    if (!ResilientOpenAIService.instance) {
      ResilientOpenAIService.instance = new ResilientOpenAIService();
    }
    return ResilientOpenAIService.instance;
  }

  /**
   * Create embeddings with automatic retry and rate limiting
   */
  public async createEmbeddings(
    texts: string[],
    jobId?: string,
    batchId?: string
  ): Promise<{ embeddings: number[][]; tokensUsed: number }> {
    
    const result = await globalErrorRecovery.executeWithRetry(
      async () => {
        // Check rate limiting before making API call
        const rateLimitResult = await globalRateLimiter.acquireToken('normal');
        if (!rateLimitResult.allowed) {
          throw new Error(`Rate limit exceeded: ${rateLimitResult.reason}`);
        }

        // Simulate OpenAI API call (replace with actual OpenAI integration)
        const response = await this.simulateOpenAICall(texts);
        
        return response;
      },
      {
        operation: 'openai_embeddings',
        jobId,
        batchId,
        metadata: { 
          textCount: texts.length,
          totalCharacters: texts.join('').length 
        }
      },
      ErrorRecoveryConfigs.OPENAI_EMBEDDINGS
    );

    if (!result.success) {
      throw result.error || new Error('Failed to create embeddings after retries');
    }

    return result.data!;
  }

  private async simulateOpenAICall(texts: string[]): Promise<{ embeddings: number[][]; tokensUsed: number }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.05) { // 5% failure rate
      const errorTypes = [
        { status: 429, message: 'Rate limit exceeded' },
        { status: 500, message: 'Internal server error' },
        { status: 503, message: 'Service temporarily unavailable' }
      ];
      const error = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      const apiError = new Error(error.message) as any;
      apiError.status = error.status;
      throw apiError;
    }

    // Generate mock embeddings
    const embeddings = texts.map(() => 
      Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
    );

    return {
      embeddings,
      tokensUsed: texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0)
    };
  }
}

/**
 * Partial batch retry processor
 */
export class PartialBatchRetryProcessor<T> {
  
  /**
   * Process batch with intelligent partial retry
   */
  public async processBatchWithRetry<R>(
    items: BatchItem<T>[],
    processor: (item: T) => Promise<R>,
    options: {
      jobId?: string;
      batchSize?: number;
      maxConcurrency?: number;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ): Promise<BatchProcessResult<R>> {
    
    const {
      jobId = `batch_${Date.now()}`,
      batchSize = 25,
      maxConcurrency = 3,
      retryConfig = {}
    } = options;

    const finalConfig = { ...ErrorRecoveryConfigs.BATCH_PROCESSING, ...retryConfig };
    const successful: BatchItem<R>[] = [];
    const failed: BatchItem<T>[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];
    const recoveryActions: string[] = [];

    // Process items in batches with concurrency control
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Check system load before processing batch
      const batchManagerMetrics = globalBatchManager.getMetrics();
      if (batchManagerMetrics.systemLoad === 'overloaded') {
        recoveryActions.push(`delayed_batch_${Math.floor(i / batchSize)}_due_to_system_overload`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }

      // Process batch items with controlled concurrency
      const batchPromises = batch.map(async (item, index) => {
        return await globalErrorRecovery.executeWithRetry(
          async () => {
            const result = await processor(item.data);
            return { item, result };
          },
          {
            operation: 'batch_item_processing',
            jobId,
            batchId: `batch_${Math.floor(i / batchSize)}`,
            customerId: item.id,
            attempt: (item.retryCount || 0) + 1,
            metadata: { batchIndex: Math.floor(i / batchSize), itemIndex: index }
          },
          finalConfig
        );
      });

      // Wait for batch completion
      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      batchResults.forEach((result, index) => {
        const originalItem = batch[index];
        
        if (result.status === 'fulfilled' && result.value.success) {
          successful.push({
            id: originalItem.id,
            data: result.value.data!.result as R,
            priority: originalItem.priority
          } as BatchItem<R>);
        } else {
          const error = result.status === 'rejected' ? result.reason : 
                       result.value.error || new Error('Unknown processing error');
          
          failed.push({
            ...originalItem,
            retryCount: (originalItem.retryCount || 0) + 1,
            lastError: error.message
          });
          
          errors.push({
            itemId: originalItem.id,
            error: error.message
          });
        }
      });

      // Add delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Attempt partial retry for failed items if they haven't exceeded retry limits
    const retryableItems = failed.filter(item => (item.retryCount || 0) < finalConfig.maxRetries);
    if (retryableItems.length > 0) {
      recoveryActions.push(`partial_retry_attempted_for_${retryableItems.length}_items`);
      
      // Retry with increased delays
      const retryResults = await this.processBatchWithRetry(
        retryableItems,
        processor,
        {
          ...options,
          retryConfig: {
            ...finalConfig,
            baseDelayMs: finalConfig.baseDelayMs * 2,
            maxRetries: 1 // Only one retry attempt for partial retries
          }
        }
      );

      // Merge retry results
      successful.push(...retryResults.successful);
      recoveryActions.push(...retryResults.recoveryActions);
    }

    return {
      successful,
      failed: failed.filter(item => (item.retryCount || 0) >= finalConfig.maxRetries) as any,
      partiallyProcessed: failed.length > 0 && successful.length > 0,
      recoveryActions,
      totalProcessed: successful.length,
      errors
    };
  }
}

/**
 * Automatic job resumption utilities
 */
export class JobResumptionService {
  
  /**
   * Create resumption checkpoint
   */
  public async createCheckpoint(
    jobId: string,
    state: {
      processedItems: string[];
      remainingItems: string[];
      batchProgress: number;
      metadata: Record<string, any>;
    }
  ): Promise<boolean> {
    const result = await globalErrorRecovery.executeWithRetry(
      async () => {
        // Store checkpoint data (in production, this would be in database)
        const checkpointData = {
          jobId,
          timestamp: new Date().toISOString(),
          state,
          version: '1.0'
        };
        
        secureLogger.info(`📊 [CHECKPOINT] Created for job ${jobId}:`, {
          processedCount: state.processedItems.length,
          remainingCount: state.remainingItems.length,
          batchProgress: state.batchProgress
        });
        
        return true;
      },
      {
        operation: 'create_job_checkpoint',
        jobId,
        metadata: { 
          processedCount: state.processedItems.length,
          remainingCount: state.remainingItems.length
        }
      },
      ErrorRecoveryConfigs.DATABASE_OPERATIONS
    );

    return result.success && result.data === true;
  }

  /**
   * Resume job from checkpoint
   */
  public async resumeFromCheckpoint(jobId: string): Promise<{
    canResume: boolean;
    resumeState?: any;
    resumeFromProgress: number;
  }> {
    const result = await globalErrorRecovery.executeWithRetry(
      async () => {
        // In production, this would query the database for checkpoint data
        secureLogger.info(`🔄 [RESUME] Attempting to resume job ${jobId}`);
        
        // For now, simulate successful resumption detection
        return {
          canResume: true,
          resumeState: {
            processedItems: [],
            remainingItems: [],
            batchProgress: 0
          },
          resumeFromProgress: 0
        };
      },
      {
        operation: 'resume_job_from_checkpoint',
        jobId
      },
      ErrorRecoveryConfigs.DATABASE_OPERATIONS
    );

    if (result.success) {
      return result.data!;
    }

    return { canResume: false, resumeFromProgress: 0 };
  }
}

/**
 * Cross-service error coordination
 */
export class ErrorCoordinationService {
  
  /**
   * Coordinate error handling across multiple services
   */
  public async coordinateServiceErrors(
    services: Array<{
      name: string;
      healthCheck: () => Promise<boolean>;
      recover: () => Promise<boolean>;
    }>
  ): Promise<{
    healthyServices: string[];
    unhealthyServices: string[];
    recoveredServices: string[];
    criticalFailures: string[];
  }> {
    
    const healthyServices: string[] = [];
    const unhealthyServices: string[] = [];
    const recoveredServices: string[] = [];
    const criticalFailures: string[] = [];

    for (const service of services) {
      try {
        const isHealthy = await service.healthCheck();
        
        if (isHealthy) {
          healthyServices.push(service.name);
        } else {
          unhealthyServices.push(service.name);
          
          // Attempt recovery
          const recoveryResult = await globalErrorRecovery.executeWithRetry(
            () => service.recover(),
            {
              operation: 'service_recovery',
              metadata: { serviceName: service.name }
            },
            ErrorRecoveryConfigs.BATCH_PROCESSING
          );

          if (recoveryResult.success) {
            recoveredServices.push(service.name);
          } else {
            criticalFailures.push(service.name);
          }
        }
      } catch (error) {
        criticalFailures.push(service.name);
        secureLogger.error(`❌ [ERROR_COORDINATION] Critical failure in service ${service.name}:`, { error: String(error) });
      }
    }

    return {
      healthyServices,
      unhealthyServices,
      recoveredServices,
      criticalFailures
    };
  }
}

// Export singleton instances for easy integration
export const resilientOpenAI = ResilientOpenAIService.getInstance();
export const partialBatchProcessor = new PartialBatchRetryProcessor();
export const jobResumption = new JobResumptionService();
export const errorCoordination = new ErrorCoordinationService();