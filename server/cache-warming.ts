import { storage } from './storage';
import { secureLogger } from './utils/secure-logger';

/**
 * Simple Circuit Breaker for Cache Warming
 * Prevents cascading failures when database is slow or unavailable
 */
class CacheWarmingCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT_MS = 60000; // 1 minute
  
  canAttempt(): boolean {
    const now = Date.now();
    
    if (this.state === 'open') {
      // Check if enough time has passed to try half-open
      if (now - this.lastFailureTime > this.RESET_TIMEOUT_MS) {
        this.state = 'half-open';
        secureLogger.info('Circuit breaker half-open, attempting recovery', {}, 'CACHE_WARMING');
        return true;
      }
      return false;
    }
    
    return true;
  }
  
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }
  
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.state = 'open';
      secureLogger.warn('Circuit breaker opened - cache warming suspended', {
        failureCount: this.failureCount,
        resetTimeMs: this.RESET_TIMEOUT_MS
      }, 'CACHE_WARMING');
    }
  }
  
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

export class CacheWarmingService {
  private static instance: CacheWarmingService;
  private warmingInProgress = false;
  private warmingInterval: NodeJS.Timeout | null = null;
  private circuitBreaker = new CacheWarmingCircuitBreaker();
  
  // PRODUCTION FIX: Environment-aware configuration
  private readonly WARMING_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 30000 : 10000;
  private readonly SLOW_THRESHOLD_MS = 5000;

  static getInstance(): CacheWarmingService {
    if (!CacheWarmingService.instance) {
      CacheWarmingService.instance = new CacheWarmingService();
    }
    return CacheWarmingService.instance;
  }

  async warmAnalyticsCache(): Promise<void> {
    // Skip if already warming
    if (this.warmingInProgress) {
      secureLogger.debug('Cache warming already in progress, skipping', {}, 'CACHE_WARMING');
      return;
    }

    // PRODUCTION FIX: Check circuit breaker before attempting
    if (!this.circuitBreaker.canAttempt()) {
      secureLogger.debug('Circuit breaker open, skipping cache warming', 
        this.circuitBreaker.getState(), 
        'CACHE_WARMING'
      );
      return;
    }

    this.warmingInProgress = true;
    
    try {
      const startTime = Date.now();

      // PRODUCTION FIX: Environment-aware timeout (30s in production, 10s in dev)
      const warmingPromise = Promise.all([
        storage.getCustomerStats(),
        storage.getSegmentDistribution()
      ]);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(
          () => reject(new Error('Cache warming timeout')), 
          this.WARMING_TIMEOUT_MS
        )
      );
      
      const [stats, distribution] = await Promise.race([
        warmingPromise,
        timeoutPromise
      ]) as [any, any];

      const duration = Date.now() - startTime;
      
      // Record success in circuit breaker
      this.circuitBreaker.recordSuccess();
      
      secureLogger.info('Analytics cache warmed successfully', { 
        duration, 
        totalCustomers: stats.totalCustomers, 
        segmentCount: distribution.length,
        timeoutMs: this.WARMING_TIMEOUT_MS
      }, 'CACHE_WARMING');

      // PERFORMANCE: Log if warming is taking too long
      if (duration > this.SLOW_THRESHOLD_MS) {
        secureLogger.warn('Slow cache warming detected', { 
          duration, 
          threshold: this.SLOW_THRESHOLD_MS,
          recommendation: 'Database may be under load or connection pool exhausted'
        }, 'CACHE_WARMING');
      }

    } catch (error) {
      // Record failure in circuit breaker
      this.circuitBreaker.recordFailure();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      secureLogger.error('Cache warming failed', { 
        error: errorMessage,
        circuitBreakerState: this.circuitBreaker.getState().state,
        timeoutMs: this.WARMING_TIMEOUT_MS,
        recommendation: 'Cache will be populated on next successful request'
      }, 'CACHE_WARMING');
      
      // CRITICAL: Don't throw - cache warming failures should NEVER block the application
      // Stale cache is better than no application
      
    } finally {
      this.warmingInProgress = false;
    }
  }

  async schedulePeriodicWarming(): Promise<void> {
    // Clear existing interval if any
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
    }

    // Warm cache every 4 minutes (before 5-minute cache expiry)
    this.warmingInterval = setInterval(async () => {
      await this.warmAnalyticsCache();
    }, 4 * 60 * 1000);

    secureLogger.info('📅 Scheduled periodic cache warming every 4 minutes');
  }

  stopPeriodicWarming(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
      secureLogger.info('🛑 Stopped periodic cache warming');
    }
  }
}
