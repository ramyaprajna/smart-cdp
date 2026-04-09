/**
 * Token Bucket Rate Limiter Service
 *
 * Purpose: Enterprise-grade token bucket rate limiting for OpenAI API requests
 *
 * FEATURES:
 * - Classic token bucket algorithm with configurable capacity and refill rate
 * - Multi-tier rate limiting (requests per second, minute, hour)
 * - Burst handling with token accumulation
 * - Graceful degradation when limits are exceeded
 * - Real-time metrics and monitoring
 * - Thread-safe atomic operations
 *
 * DESIGN PRINCIPLES:
 * - Prevent API quota exhaustion and 429 rate limit errors
 * - Allow burst traffic within reasonable limits
 * - Fail fast when capacity is exceeded
 * - Provide detailed metrics for optimization
 *
 * @module TokenBucketRateLimiter
 * @created September 22, 2025
 */

import { applicationLogger } from './application-logger';

// Environment configuration with OpenAI API defaults
const REQUESTS_PER_SECOND = parseInt(process.env.OPENAI_REQUESTS_PER_SECOND || '10');
const REQUESTS_PER_MINUTE = parseInt(process.env.OPENAI_REQUESTS_PER_MINUTE || '500');
const BURST_CAPACITY_MULTIPLIER = parseFloat(process.env.BURST_CAPACITY_MULTIPLIER || '2.0');
const TOKEN_REFILL_INTERVAL_MS = parseInt(process.env.TOKEN_REFILL_INTERVAL_MS || '100');

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstCapacity: number;
  refillIntervalMs: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefillTime: number;
  requestCount: number;
  windowStartTime: number;
}

interface RateLimitMetrics {
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

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  waitTimeMs: number;
  retryAfterMs?: number;
  reason?: string;
}

/**
 * TokenBucketRateLimiter - Enterprise-grade API rate limiting
 * 
 * Implementation of token bucket algorithm with multi-tier limits
 */
export class TokenBucketRateLimiter {
  private config: RateLimitConfig;
  private state: TokenBucketState;
  private metrics: RateLimitMetrics;
  private refillTimer: NodeJS.Timeout | null = null;
  
  constructor(overrides: Partial<RateLimitConfig> = {}) {
    this.config = {
      requestsPerSecond: REQUESTS_PER_SECOND,
      requestsPerMinute: REQUESTS_PER_MINUTE,
      burstCapacity: Math.ceil(REQUESTS_PER_SECOND * BURST_CAPACITY_MULTIPLIER),
      refillIntervalMs: TOKEN_REFILL_INTERVAL_MS,
      ...overrides
    };

    this.state = {
      tokens: this.config.burstCapacity,
      lastRefillTime: Date.now(),
      requestCount: 0,
      windowStartTime: Date.now()
    };

    this.metrics = {
      totalRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      currentTokens: this.config.burstCapacity,
      maxTokens: this.config.burstCapacity,
      refillRate: this.config.requestsPerSecond,
      averageWaitTime: 0,
      burstsHandled: 0,
      lastResetTime: Date.now()
    };

    this.startTokenRefill();
  }

  /**
   * Attempt to acquire a token for API request
   * Returns immediately with allow/deny decision
   */
  async acquireToken(priority: 'high' | 'normal' | 'low' = 'normal'): Promise<RateLimitResult> {
    const startTime = Date.now();
    
    // Update token bucket state
    this.refillTokens();
    this.resetWindowIfNeeded();
    
    // Check minute-level rate limiting first
    if (this.state.requestCount >= this.config.requestsPerMinute) {
      const timeToReset = 60000 - (Date.now() - this.state.windowStartTime);
      this.metrics.rejectedRequests++;
      
      return {
        allowed: false,
        tokensRemaining: 0,
        waitTimeMs: timeToReset,
        retryAfterMs: timeToReset,
        reason: 'minute_rate_limit_exceeded'
      };
    }
    
    // Check token bucket availability
    if (this.state.tokens < 1) {
      const waitTime = this.calculateWaitTime();
      this.metrics.rejectedRequests++;
      
      return {
        allowed: false,
        tokensRemaining: 0,
        waitTimeMs: waitTime,
        retryAfterMs: waitTime,
        reason: 'token_bucket_empty'
      };
    }
    
    // Consume token and update metrics
    this.state.tokens -= 1;
    this.state.requestCount += 1;
    this.metrics.totalRequests++;
    this.metrics.acceptedRequests++;
    this.metrics.currentTokens = this.state.tokens;
    
    // Handle burst detection
    if (this.state.tokens < this.config.burstCapacity * 0.5) {
      this.metrics.burstsHandled++;
    }
    
    // Update average wait time
    const waitTime = Date.now() - startTime;
    this.metrics.averageWaitTime = 
      (this.metrics.averageWaitTime * (this.metrics.acceptedRequests - 1) + waitTime) / 
      this.metrics.acceptedRequests;
    
    await applicationLogger.info('system', `✅ Token acquired`, {
      tokensRemaining: this.state.tokens,
      requestCount: this.state.requestCount,
      priority,
      waitTime
    });
    
    return {
      allowed: true,
      tokensRemaining: this.state.tokens,
      waitTimeMs: waitTime
    };
  }

  /**
   * Wait for token availability and acquire
   * Use for non-urgent requests that can wait
   */
  async waitForToken(timeoutMs: number = 30000, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<RateLimitResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await this.acquireToken(priority);
      
      if (result.allowed) {
        return result;
      }
      
      // Wait before retry (adaptive wait based on current load)
      const adaptiveWaitMs = Math.min(result.waitTimeMs || 1000, 5000);
      await new Promise(resolve => setTimeout(resolve, adaptiveWaitMs));
    }
    
    // Timeout exceeded
    return {
      allowed: false,
      tokensRemaining: 0,
      waitTimeMs: timeoutMs,
      reason: 'wait_timeout_exceeded'
    };
  }

  /**
   * Check current rate limit status without consuming tokens
   */
  getStatus(): RateLimitMetrics & { config: RateLimitConfig } {
    this.refillTokens();
    this.resetWindowIfNeeded();
    
    return {
      ...this.metrics,
      currentTokens: this.state.tokens,
      config: { ...this.config }
    };
  }

  /**
   * Reset rate limiter state (useful for testing or manual intervention)
   */
  reset(): void {
    this.state = {
      tokens: this.config.burstCapacity,
      lastRefillTime: Date.now(),
      requestCount: 0,
      windowStartTime: Date.now()
    };
    
    this.metrics = {
      ...this.metrics,
      currentTokens: this.config.burstCapacity,
      lastResetTime: Date.now()
    };
    
    applicationLogger.info('system', '🔄 Rate limiter state reset');
  }

  /**
   * Update rate limiting configuration dynamically
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Adjust current tokens if capacity changed
    if (newConfig.burstCapacity && newConfig.burstCapacity < this.state.tokens) {
      this.state.tokens = newConfig.burstCapacity;
    }
    
    this.metrics.maxTokens = this.config.burstCapacity;
    this.metrics.refillRate = this.config.requestsPerSecond;
    
    applicationLogger.info('system', '⚙️ Rate limiter configuration updated', { 
      newConfig: this.config 
    });
  }

  /**
   * Cleanup resources when shutting down
   */
  shutdown(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    
    applicationLogger.info('system', '🛑 Token bucket rate limiter shutdown complete');
  }

  /**
   * Private: Start automatic token refill process
   */
  private startTokenRefill(): void {
    this.refillTimer = setInterval(() => {
      this.refillTokens();
    }, this.config.refillIntervalMs);
  }

  /**
   * Private: Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.state.lastRefillTime;
    
    if (timeSinceLastRefill < this.config.refillIntervalMs) {
      return; // Too early to refill
    }
    
    // Calculate tokens to add based on elapsed time
    const refillIntervals = Math.floor(timeSinceLastRefill / this.config.refillIntervalMs);
    const tokensToAdd = (this.config.requestsPerSecond / (1000 / this.config.refillIntervalMs)) * refillIntervals;
    
    // Add tokens up to burst capacity
    const newTokenCount = Math.min(
      this.state.tokens + tokensToAdd,
      this.config.burstCapacity
    );
    
    this.state.tokens = newTokenCount;
    this.state.lastRefillTime = now;
    this.metrics.currentTokens = this.state.tokens;
  }

  /**
   * Private: Reset minute window if needed
   */
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    const windowAge = now - this.state.windowStartTime;
    
    if (windowAge >= 60000) { // Reset every minute
      this.state.requestCount = 0;
      this.state.windowStartTime = now;
    }
  }

  /**
   * Private: Calculate wait time for next available token
   */
  private calculateWaitTime(): number {
    const tokensNeeded = 1;
    const refillRate = this.config.requestsPerSecond / 1000; // tokens per ms
    const timeForTokens = tokensNeeded / refillRate;
    
    return Math.ceil(timeForTokens);
  }
}

// Singleton instance for global use
export const globalRateLimiter = new TokenBucketRateLimiter();

// Export service startup
export async function initializeRateLimiter(): Promise<void> {
  await applicationLogger.info('system', '🚀 Token bucket rate limiter initialized', {
    config: globalRateLimiter.getStatus().config
  });
}