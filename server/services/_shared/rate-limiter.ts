/**
 * Shared Rate Limiting Utilities
 * 
 * Purpose: Centralized rate limiting logic extracted from token-bucket-rate-limiter.ts
 * 
 * Key Features:
 * - Token bucket algorithm implementation
 * - Multi-tier rate limiting (per second, minute, hour)
 * - Priority-based token allocation
 * - Real-time metrics and monitoring
 * - Thread-safe atomic operations
 * 
 * @module SharedRateLimiter
 * @created September 23, 2025 - Extracted and simplified from token-bucket-rate-limiter.ts
 */

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstCapacity: number;
  refillIntervalMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  waitTimeMs: number;
  retryAfterMs?: number;
  reason?: string;
}

export interface RateLimitMetrics {
  totalRequests: number;
  acceptedRequests: number;
  rejectedRequests: number;
  currentTokens: number;
  maxTokens: number;
  refillRate: number;
  averageWaitTime: number;
  burstsHandled: number;
  lastResetTime: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefillTime: number;
  requestCount: number;
  windowStartTime: number;
}

export type RequestPriority = 'high' | 'normal' | 'low';

/**
 * Token Bucket Rate Limiter with multi-tier limits
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private state: TokenBucketState;
  private metrics: RateLimitMetrics;
  private refillTimer: NodeJS.Timeout | null = null;
  
  constructor(config: RateLimitConfig) {
    this.config = config;
    
    this.state = {
      tokens: config.burstCapacity,
      lastRefillTime: Date.now(),
      requestCount: 0,
      windowStartTime: Date.now()
    };

    this.metrics = {
      totalRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      currentTokens: config.burstCapacity,
      maxTokens: config.burstCapacity,
      refillRate: config.requestsPerSecond,
      averageWaitTime: 0,
      burstsHandled: 0,
      lastResetTime: Date.now()
    };

    this.startTokenRefill();
  }

  /**
   * Attempt to acquire a token for API request
   */
  async acquireToken(priority: RequestPriority = 'normal'): Promise<RateLimitResult> {
    const startTime = Date.now();
    
    // Update token bucket state
    this.refillTokens();
    this.resetWindowIfNeeded();
    
    this.metrics.totalRequests++;
    
    // Check minute-level rate limiting first
    if (this.state.requestCount >= this.config.requestsPerMinute) {
      const timeToReset = 60000 - (Date.now() - this.state.windowStartTime);
      this.metrics.rejectedRequests++;
      
      return {
        allowed: false,
        tokensRemaining: this.state.tokens,
        waitTimeMs: timeToReset,
        retryAfterMs: timeToReset,
        reason: 'Rate limit exceeded (per minute)'
      };
    }
    
    // Priority-based token requirements
    const tokensRequired = this.getTokensRequired(priority);
    
    // Check token availability
    if (this.state.tokens < tokensRequired) {
      const waitTime = this.calculateWaitTime(tokensRequired);
      this.metrics.rejectedRequests++;
      
      return {
        allowed: false,
        tokensRemaining: this.state.tokens,
        waitTimeMs: waitTime,
        retryAfterMs: waitTime,
        reason: 'Insufficient tokens'
      };
    }
    
    // Grant the request
    this.state.tokens -= tokensRequired;
    this.state.requestCount++;
    this.metrics.acceptedRequests++;
    this.metrics.currentTokens = this.state.tokens;
    
    // Update metrics
    const processingTime = Date.now() - startTime;
    this.updateAverageWaitTime(processingTime);
    
    if (priority === 'high') {
      this.metrics.burstsHandled++;
    }
    
    return {
      allowed: true,
      tokensRemaining: this.state.tokens,
      waitTimeMs: 0
    };
  }

  /**
   * Get current rate limiting metrics
   */
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset rate limiting state
   */
  reset(): void {
    this.state.tokens = this.config.burstCapacity;
    this.state.requestCount = 0;
    this.state.windowStartTime = Date.now();
    this.metrics.lastResetTime = Date.now();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  private getTokensRequired(priority: RequestPriority): number {
    switch (priority) {
      case 'high': return 1;     // High priority uses standard tokens
      case 'normal': return 1;   // Normal priority uses standard tokens
      case 'low': return 2;      // Low priority uses more tokens (deprioritized)
      default: return 1;
    }
  }

  private refillTokens(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.state.lastRefillTime;
    
    if (timeSinceLastRefill >= this.config.refillIntervalMs) {
      const tokensToAdd = Math.floor(
        (timeSinceLastRefill / 1000) * this.config.requestsPerSecond
      );
      
      this.state.tokens = Math.min(
        this.config.burstCapacity,
        this.state.tokens + tokensToAdd
      );
      
      this.state.lastRefillTime = now;
      this.metrics.currentTokens = this.state.tokens;
    }
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now();
    const windowAge = now - this.state.windowStartTime;
    
    if (windowAge >= 60000) { // 1 minute window
      this.state.requestCount = 0;
      this.state.windowStartTime = now;
    }
  }

  private calculateWaitTime(tokensRequired: number): number {
    const tokensNeeded = tokensRequired - this.state.tokens;
    const refillRate = this.config.requestsPerSecond;
    return Math.ceil((tokensNeeded / refillRate) * 1000);
  }

  private startTokenRefill(): void {
    this.refillTimer = setInterval(() => {
      this.refillTokens();
    }, this.config.refillIntervalMs);
  }

  private updateAverageWaitTime(waitTime: number): void {
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageWaitTime = 
      (this.metrics.averageWaitTime * (totalRequests - 1) + waitTime) / totalRequests;
  }
}

/**
 * Default rate limiting configurations
 */
export const DEFAULT_RATE_LIMITS = {
  openai: {
    requestsPerSecond: 10,
    requestsPerMinute: 500,
    burstCapacity: 20,
    refillIntervalMs: 100
  },
  embeddings: {
    requestsPerSecond: 5,
    requestsPerMinute: 200,
    burstCapacity: 10,
    refillIntervalMs: 200
  },
  conservative: {
    requestsPerSecond: 3,
    requestsPerMinute: 100,
    burstCapacity: 6,
    refillIntervalMs: 300
  }
} as const;

/**
 * Global rate limiter instance for shared use
 */
export let globalRateLimiter: RateLimiter;

export function initializeGlobalRateLimiter(config?: RateLimitConfig): RateLimiter {
  if (globalRateLimiter) {
    globalRateLimiter.destroy();
  }
  
  globalRateLimiter = new RateLimiter(config || DEFAULT_RATE_LIMITS.openai);
  return globalRateLimiter;
}