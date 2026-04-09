/**
 * Shared Retry and Backoff Utilities
 * 
 * Purpose: Centralized exponential backoff and retry logic for all embedding services
 * 
 * Key Features:
 * - Configurable exponential backoff
 * - Rate limit detection and recovery
 * - Circuit breaker patterns
 * - Comprehensive error classification
 * 
 * @module SharedRetry
 * @created September 23, 2025 - Extracted from multiple embedding services
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryCondition?: (error: any) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
  finalDelay?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  halfOpenMaxCalls: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private nextAttempt = 0;
  private halfOpenCalls = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = CircuitBreakerState.HALF_OPEN;
      this.halfOpenCalls = 0;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new Error('Circuit breaker HALF_OPEN limit exceeded');
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.config.recoveryTimeMs;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt
    };
  }
}

/**
 * Exponential backoff with jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = exponentialDelay * config.jitterFactor * Math.random();
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep utility with optional cancellation
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Sleep aborted'));
      });
    }
  });
}

/**
 * Classify errors for retry decisions
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // OpenAI rate limiting
  if (error.status === 429 || error.message?.includes('rate limit')) {
    return true;
  }
  
  // Server errors (but not client errors)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  return false;
}

/**
 * Main retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  signal?: AbortSignal
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: Error;
  let attempt = 0;
  
  for (attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }
      
      const result = await operation();
      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const shouldRetry = config.retryCondition 
        ? config.retryCondition(error)
        : isRetryableError(error);
        
      if (!shouldRetry || attempt === config.maxRetries) {
        break;
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt, config);
      await sleep(delay, signal);
    }
  }
  
  return {
    success: false,
    error: lastError!,
    attempts: attempt + 1,
    totalTimeMs: Date.now() - startTime
  };
}

/**
 * Default retry configurations for different scenarios
 */
export const DEFAULT_RETRY_CONFIGS = {
  openai: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryCondition: isRetryableError
  },
  database: {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.2,
    retryCondition: (error: any) => {
      // Database connection errors, lock timeouts, etc.
      return error.code === 'ECONNRESET' || 
             error.message?.includes('connection') ||
             error.message?.includes('timeout');
    }
  },
  network: {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
    retryCondition: isRetryableError
  }
} as const;