import { LRUCache } from 'lru-cache';
import { secureLogger } from './utils/secure-logger';

// ARCHITECT FIX: Safe cache key generation that doesn't stringify Drizzle objects
function createCanonicalCacheKey(conditions: any): string {
  /**
   * Creates a deterministic cache key without stringifying Drizzle SQL objects
   * Uses a hash-based approach to avoid circular reference issues
   */
  try {
    if (!conditions || conditions.length === 0) {
      return 'no_conditions';
    }
    
    // Create a simple hash from the condition structure without full stringification
    // This avoids the Drizzle object serialization issues identified by architect
    const keyParts = [];
    
    if (Array.isArray(conditions)) {
      for (const condition of conditions) {
        keyParts.push(safeConditionKey(condition));
      }
    } else {
      keyParts.push(safeConditionKey(conditions));
    }
    
    // Use a simple hash instead of base64 encoding potentially circular objects
    const keyString = keyParts.sort().join('|');
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
      const char = keyString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `key_${Math.abs(hash).toString(36)}`;
  } catch (error) {
    // Fallback to timestamp-based key if anything fails
    secureLogger.warn('Failed to generate canonical key, using fallback', { error: error instanceof Error ? error.message : String(error) }, 'CACHE');
    return `fallback_${Date.now()}_${Math.random().toString(36)}`;
  }
}

function safeConditionKey(condition: any): string {
  /**
   * Extract a safe key from condition without full serialization
   */
  if (typeof condition === 'string') return condition;
  if (typeof condition === 'number') return String(condition);
  if (typeof condition === 'boolean') return String(condition);
  
  // For objects, try to extract meaningful identifiers without full serialization
  if (condition && typeof condition === 'object') {
    // If it has a SQL string representation, use a safe subset
    if (condition.sql || condition.queryChunks) {
      return 'sql_condition';
    }
    // For plain objects, use a safer approach
    try {
      const keys = Object.keys(condition).slice(0, 5).sort(); // Limit key count
      return `obj_${keys.join('_')}`;
    } catch {
      return 'unknown_obj';
    }
  }
  
  return 'unknown';
}

// Memory-efficient caching system for frequently accessed data
class CacheManager {
  private customerCache: LRUCache<string, any>;
  private queryCache: LRUCache<string, any>;
  private analyticsCache: LRUCache<string, any>;
  private databaseCountCache: LRUCache<string, any>;
  private requestDeduplication: Map<string, Promise<any>>;

  constructor() {
    // Customer profile cache - 1000 most accessed customers
    this.customerCache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 15, // 15 minutes
      fetchMethod: async (key: string) => {
        // Will be populated by storage layer
        return null;
      }
    });

    // Vector query cache - 500 most common searches
    this.queryCache = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 30, // 30 minutes
      maxSize: 50 * 1024 * 1024, // 50MB max
      sizeCalculation: (value: any) => JSON.stringify(value).length
    });

    // Analytics cache - dashboard data (optimized TTL for performance)
    // PERFORMANCE FIX: Increased TTL from 30s to 5 minutes for expensive operations
    // This prevents 1200-1500ms response times on analytics endpoints
    this.analyticsCache = new LRUCache({
      max: 100, // Increased back to handle more analytics queries
      ttl: 1000 * 60 * 5, // 5 minutes - balance between performance and freshness
    });

    // Database COUNT query cache - extended TTL for expensive operations
    this.databaseCountCache = new LRUCache({
      max: 50,
      ttl: 1000 * 60 * 60, // 1 hour - customer counts change infrequently, analytics_summary table handles freshness
    });

    // Request deduplication - prevent duplicate concurrent requests
    this.requestDeduplication = new Map();
  }

  // Customer caching
  getCustomer(id: string): any | undefined {
    return this.customerCache.get(id);
  }

  setCustomer(id: string, customer: any): void {
    this.customerCache.set(id, customer);
  }

  // Query result caching
  getQueryResult(queryHash: string): any | undefined {
    return this.queryCache.get(queryHash);
  }

  setQueryResult(queryHash: string, result: any): void {
    this.queryCache.set(queryHash, result);
  }

  // Analytics caching with configurable TTL
  getAnalytics(key: string): any | undefined {
    return this.analyticsCache.get(key);
  }

  setAnalytics(key: string, data: any, ttlMs?: number): void {
    if (ttlMs) {
      // Create temporary cache entry with custom TTL
      this.analyticsCache.set(key, data, { ttl: ttlMs });
    } else {
      this.analyticsCache.set(key, data);
    }
  }

  // Database COUNT caching - for expensive count operations
  getDatabaseCount(key: string): any | undefined {
    return this.databaseCountCache.get(key);
  }

  setDatabaseCount(key: string, count: any): void {
    this.databaseCountCache.set(key, count);
  }

  invalidateDatabaseCounts(): boolean {
    const sizeBefore = this.databaseCountCache.size;
    this.databaseCountCache.clear();
    const success = this.databaseCountCache.size === 0;

    if (!success) {
      secureLogger.warn('⚠️ Database counts cache invalidation failed - cache not empty after clear');
    }

    return success;
  }

  // Cache invalidation with verification
  invalidateCustomer(id: string): boolean {
    const hadEntry = this.customerCache.has(id);
    const deleted = this.customerCache.delete(id);
    const success = !this.customerCache.has(id);

    if (hadEntry && !success) {
      secureLogger.warn(`⚠️ Customer cache invalidation failed for ID: ${id}`);
    }

    return success;
  }

  invalidateAnalytics(): boolean {
    const sizeBefore = this.analyticsCache.size;
    this.analyticsCache.clear();
    const success = this.analyticsCache.size === 0;

    if (!success) {
      secureLogger.warn('⚠️ Analytics cache invalidation failed - cache not empty after clear');
    }

    return success;
  }

  // ARCHITECT FIX: Request deduplication - prevent duplicate concurrent requests  
  async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // Check if the same request is already in progress
    const existingPromise = this.requestDeduplication.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // Create new request and store the promise
    const promise = requestFn();
    this.requestDeduplication.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up after request completes (success or failure)
      this.requestDeduplication.delete(key);
    }
  }

  clearRequestDeduplication(): void {
    this.requestDeduplication.clear();
  }

  // Generate cache key for vector queries
  generateQueryHash(query: string, threshold: number, limit: number): string {
    return `${query.toLowerCase().trim()}_${threshold}_${limit}`;
  }

  // Enhanced cache statistics with health verification
  getCacheStats(): {
    customers: { size: number; maxSize: number; healthy: boolean };
    queries: { size: number; maxSize: number; healthy: boolean };
    analytics: { size: number; maxSize: number; healthy: boolean };
    databaseCounts: { size: number; maxSize: number; healthy: boolean };
    pendingRequests: number;
    overallHealth: boolean;
    expiredEntries: number;
  } {
    const customersHealthy = this.customerCache.size <= this.customerCache.max;
    const queriesHealthy = this.queryCache.size <= this.queryCache.max;
    const analyticsHealthy = this.analyticsCache.size <= this.analyticsCache.max;
    const databaseCountsHealthy = this.databaseCountCache.size <= this.databaseCountCache.max;

    // Check for expired entries (approximation by comparing calculated size)
    const expiredEntries = this.countExpiredEntries();

    const overallHealth = customersHealthy && queriesHealthy &&
                         analyticsHealthy && databaseCountsHealthy &&
                         expiredEntries < 10; // Allow some expired entries before flagging unhealthy

    return {
      customers: { size: this.customerCache.size, maxSize: this.customerCache.max, healthy: customersHealthy },
      queries: { size: this.queryCache.size, maxSize: this.queryCache.max, healthy: queriesHealthy },
      analytics: { size: this.analyticsCache.size, maxSize: this.analyticsCache.max, healthy: analyticsHealthy },
      databaseCounts: { size: this.databaseCountCache.size, maxSize: this.databaseCountCache.max, healthy: databaseCountsHealthy },
      pendingRequests: this.requestDeduplication.size,
      overallHealth,
      expiredEntries
    };
  }

  // Count expired entries across all caches (for health monitoring)
  private countExpiredEntries(): number {
    let expiredCount = 0;
    const now = Date.now();

    // LRUCache doesn't expose TTL info directly, so we approximate by checking some entries
    // This is a best-effort health check for monitoring purposes
    try {
      // Check a sample of entries by iteration (limited to prevent performance impact)
      const sampleKeys = Array.from(this.customerCache.keys()).slice(0, 10);
      sampleKeys.forEach(key => {
        if (!this.customerCache.has(key)) expiredCount++;
      });
    } catch (error) {
      // If cache iteration fails, assume some expired entries exist
      expiredCount = 1;
    }

    return expiredCount;
  }

  // Cache coherence verification - ensure related caches are synchronized
  verifyCacheCoherence(): { coherent: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if analytics and database count caches are properly synchronized
    const analyticsSize = this.analyticsCache.size;
    const dbCountSize = this.databaseCountCache.size;

    // If analytics cache is populated but database counts are empty, flag as potential issue
    if (analyticsSize > 0 && dbCountSize === 0) {
      issues.push('Analytics cache populated but database counts cache empty - potential synchronization issue');
    }

    // Check for excessive pending requests (potential deadlock)
    if (this.requestDeduplication.size > 50) {
      issues.push(`High number of pending requests (${this.requestDeduplication.size}) - potential deadlock`);
    }

    // Check cache sizes are within reasonable bounds
    if (this.queryCache.size > this.queryCache.max * 0.9) {
      issues.push('Query cache approaching max capacity - may cause performance degradation');
    }

    return {
      coherent: issues.length === 0,
      issues
    };
  }
}

export const cacheManager = new CacheManager();
export { createCanonicalCacheKey };
