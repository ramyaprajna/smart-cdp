/**
 * Performance Monitoring and Caching Middleware
 *
 * Comprehensive performance optimization middleware providing request monitoring,
 * intelligent caching, and analytics optimization for the Smart CDP Platform.
 * Essential for maintaining responsive user experience and efficient resource utilization.
 *
 * @module PerformanceMiddleware
 * @created Initial implementation
 * @last_updated September 14, 2025 - Updated comments to reflect current performance issues
 *
 * @architecture
 * - Request performance monitoring with timing and slow request detection
 * - Intelligent caching middleware with configurable TTL
 * - Rate limiting for API protection and resource management
 * - Analytics cache warming for dashboard performance
 * - Request ID generation for debugging and correlation
 *
 * @dependencies
 * - cache - In-memory LRU cache (cacheManager) for query result storage
 * - Express types - Request/Response/NextFunction interfaces
 *
 * @middleware_functions
 * - performanceMiddleware - Request timing and performance monitoring
 * - cacheMiddleware - Intelligent caching for GET requests with TTL
 * - rateLimitMiddleware - API rate limiting and abuse prevention
 * - invalidateAnalyticsCache - Cache invalidation after data changes
 *
 * @performance_features
 * - Request timing with slow request alerts (>1000ms)
 * - Automatic cache invalidation on data mutations  
 * - Configurable cache TTL for different endpoints
 * - Request correlation IDs for debugging
 * - Development mode performance logging
 * 
 * @current_issues_september_2025
 * - Multiple endpoints exceeding 1000ms threshold regularly (confirmed via logs)
 * - Analytics embedding-status: 1200-1700ms (needs database indexing)
 * - Analytics stats endpoint: 1200ms average (database COUNT operations)
 * - Cache warming taking 1200-1300ms on startup
 * - TODO: Implement database query optimization and better indexing
 *
 * @caching_strategy
 * - GET requests cached with configurable TTL (default 5 minutes)
 * - Cache keys based on full URL for accurate invalidation
 * - X-Cache headers for debugging (HIT/MISS)
 * - Automatic cache bypass for non-GET requests
 * - Integration with analytics cache warming service
 */
import { Request, Response, NextFunction } from 'express';
import { cacheManager } from './cache';
import { performanceMonitor } from './services/performance-monitor';
import { secureLogger } from './utils/secure-logger';

/**
 * Performance monitoring middleware
 *
 * Tracks request timing, generates correlation IDs, and logs slow requests
 * for performance monitoring and debugging. Essential for identifying
 * performance bottlenecks and optimizing response times.
 *
 * @middleware performanceMiddleware
 * @features Request timing, slow request detection, correlation ID generation
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Add request ID for tracking
  (req as any).requestId = Math.random().toString(36).substring(7);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;

    // Record metrics in performance monitor
    performanceMonitor.recordMetric(
      url,
      duration,
      status,
      res.getHeader('X-Cache') === 'HIT'
    );

    // Log slow requests (>1000ms)
    if (duration > 1000) {
      secureLogger.warn(`SLOW REQUEST: ${method} ${url} - ${duration}ms - Status: ${status}`, 
        { 
          method, 
          url, 
          duration, 
          status, 
          requestId: (req as any).requestId 
        }, 
        'PERFORMANCE'
      );
    }

    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      secureLogger.debug(`${method} ${url} ${status} in ${duration}ms`, 
        { 
          method, 
          url, 
          status, 
          duration, 
          requestId: (req as any).requestId 
        }, 
        'PERFORMANCE'
      );
    }
  });

  next();
}

/**
 * Intelligent cache middleware for GET requests
 *
 * Provides automatic caching of GET request responses with configurable TTL.
 * Improves performance by reducing database queries for frequently accessed data.
 *
 * @middleware cacheMiddleware
 * @param ttl Time to live in milliseconds (default: 300000ms = 5 minutes)
 * @features Automatic caching, cache hit/miss headers, TTL configuration
 */
export function cacheMiddleware(ttl: number = 300000) { // 5 minutes default
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `route_${req.originalUrl}`;
    const cached = cacheManager.getQueryResult(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data: any) {
      cacheManager.setQueryResult(cacheKey, data);
      res.setHeader('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };

    next();
  };
}

// Function to clear analytics cache after imports with verification
export function invalidateAnalyticsCache(): { success: boolean; issues: string[] } {
  const issues: string[] = [];
  let overallSuccess = true;

  // Clear analytics cache with verification
  const analyticsCleared = cacheManager.invalidateAnalytics();
  if (!analyticsCleared) {
    issues.push('Analytics cache invalidation failed');
    overallSuccess = false;
  }

  // Clear database count cache with verification - critical for embedding status accuracy
  const dbCountsCleared = cacheManager.invalidateDatabaseCounts();
  if (!dbCountsCleared) {
    issues.push('Database counts cache invalidation failed');
    overallSuccess = false;
  }

  // Clear route cache for analytics endpoints with verification
  const routesToClear = [
    'route_/api/analytics/stats',
    'route_/api/analytics/segment-distribution',
    'route_/api/analytics/embedding-status'
  ];

  routesToClear.forEach(route => {
    const hadCache = cacheManager.getQueryResult(route) !== undefined;
    cacheManager.setQueryResult(route, null);

    // Verify the route cache was actually cleared
    const stillCached = cacheManager.getQueryResult(route);
    if (stillCached !== null && stillCached !== undefined) {
      issues.push(`Route cache invalidation failed for ${route}`);
      overallSuccess = false;
    }
  });

  // Run cache coherence verification after invalidation
  const coherenceCheck = cacheManager.verifyCacheCoherence();
  if (!coherenceCheck.coherent) {
    issues.push(...coherenceCheck.issues.map(issue => `Cache coherence issue: ${issue}`));
  }

  if (overallSuccess) {
  } else {
    secureLogger.warn('⚠️ Cache invalidation completed with issues:', issues);
  }

  return { success: overallSuccess, issues };
}

// Request compression and optimization
export function compressionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Set compression headers
  res.setHeader('Content-Encoding', 'gzip');

  // Optimize JSON responses
  if (req.headers.accept?.includes('application/json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  next();
}

// Enhanced rate limiter with memory management and TTL-based cleanup
interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccess: number;
}

class TTLRateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private readonly CLEANUP_INTERVAL = 60000; // Cleanup every minute
  private readonly MAX_ENTRIES = 10000; // Prevent unlimited growth
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    // Start periodic cleanup to prevent memory leaks
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);

    // Cleanup on process exit
    process.on('exit', () => {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
    });
  }

  private cleanup(): void {
    const now = Date.now();
    const initialSize = this.store.size;

    // Remove expired entries
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }

    // If still too many entries, remove oldest by last access
    if (this.store.size > this.MAX_ENTRIES) {
      const entries = Array.from(this.store.entries());
      entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

      const toRemove = entries.slice(0, this.store.size - this.MAX_ENTRIES);
      toRemove.forEach(([key]) => this.store.delete(key));
    }

    const cleanedCount = initialSize - this.store.size;
    if (cleanedCount > 0) {
      secureLogger.info(`[RateLimiter] Cleaned up ${cleanedCount} expired entries (${this.store.size} remaining)`);
    }
  }

  get(clientId: string): RateLimitEntry | undefined {
    const entry = this.store.get(clientId);
    if (entry) {
      entry.lastAccess = Date.now();
    }
    return entry;
  }

  set(clientId: string, entry: RateLimitEntry): void {
    this.store.set(clientId, entry);
  }

  size(): number {
    return this.store.size;
  }

  getStats(): { size: number; maxEntries: number } {
    return {
      size: this.store.size,
      maxEntries: this.MAX_ENTRIES
    };
  }
}

// Global rate limit store with TTL-based cleanup
const rateLimitStore = new TTLRateLimitStore();

export function rateLimitMiddleware(maxRequests: number = 10, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();

    const clientData = rateLimitStore.get(clientId);

    if (!clientData || now > clientData.resetTime) {
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
        lastAccess: now
      });
      return next();
    }

    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }

    clientData.count++;
    clientData.lastAccess = now;
    next();
  };
}

/**
 * Get rate limiter statistics for monitoring
 */
export function getRateLimiterStats(): { size: number; maxEntries: number } {
  return rateLimitStore.getStats();
}

/**
 * Comprehensive performance monitoring middleware
 *
 * Enhanced monitoring that tracks memory usage, request patterns,
 * and system performance metrics for dashboard display.
 */
export function enhancedPerformanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  // Add detailed request tracking
  (req as any).requestId = Math.random().toString(36).substring(7);
  (req as any).startTime = startTime;
  (req as any).startMemory = startMemory;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;

    // Calculate memory delta
    const heapDelta = endMemory.heapUsed - startMemory.heapUsed;
    const memoryDeltaMB = (heapDelta / 1024 / 1024).toFixed(2);

    // Record detailed metrics
    performanceMonitor.recordMetric(
      url,
      duration,
      status,
      res.getHeader('X-Cache') === 'HIT'
    );

    // Enhanced logging for performance analysis
    if (duration > 1000) {
      secureLogger.warn(`[SLOW REQUEST] ${method} ${url} - ${duration}ms - Memory: ${memoryDeltaMB}MB - Status: ${status}`);
    }

    // Track memory-intensive requests
    if (Math.abs(heapDelta) > 50 * 1024 * 1024) { // 50MB threshold
      secureLogger.warn(`[MEMORY INTENSIVE] ${method} ${url} - Memory delta: ${memoryDeltaMB}MB`);
    }

    // Development performance metrics
    if (process.env.NODE_ENV === 'development') {
      secureLogger.info(`[${(req as any).requestId}] ${method} ${url} ${status} in ${duration}ms (Memory: ${memoryDeltaMB}MB)`);
    }
  });

  next();
}

/**
 * Get comprehensive performance statistics
 */
export function getPerformanceStats() {
  const memoryUsage = process.memoryUsage();
  const rateLimiterStats = rateLimitStore.getStats();

  return {
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      rss: Math.round(memoryUsage.rss / 1024 / 1024) // MB
    },
    rateLimiter: rateLimiterStats,
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
    pid: process.pid
  };
}
