/**
 * Simple Segment Performance Service - Focused on Core Performance Issues
 * 
 * SIMPLIFIED APPROACH: This replaces the overengineered performance service
 * with a focused solution that addresses the actual performance bottlenecks:
 * - 2000ms+ query times
 * - 0% cache hit rates  
 * - Expensive database operations
 * 
 * @module SimpleSegmentPerformanceService
 * @created September 19, 2025
 * @purpose Performance optimization for segment queries without overengineering
 */

import { cacheManager } from '../cache';
import { secureLogger } from '../utils/secure-logger';

/**
 * Simple performance metrics
 */
interface SimplePerformanceMetrics {
  totalQueries: number;
  slowQueries: number;
  cacheHitRate: number;
  avgExecutionTime: number;
}

export class SimpleSegmentPerformanceService {
  private metrics: SimplePerformanceMetrics = {
    totalQueries: 0,
    slowQueries: 0,
    cacheHitRate: 0,
    avgExecutionTime: 0
  };

  /**
   * Execute a cached query with simple performance tracking
   */
  async executeWithCache<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttlMs: number = 300000 // 5 minutes default
  ): Promise<T> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = cacheManager.getQueryResult(cacheKey);
    if (cached) {
      this.recordQuery(Date.now() - startTime, true);
      secureLogger.debug('Cache hit', { cacheKey }, 'SEGMENT_PERFORMANCE');
      return cached;
    }

    // Execute query
    secureLogger.debug('Cache miss, executing query', { cacheKey }, 'SEGMENT_PERFORMANCE');
    
    try {
      const result = await queryFn();
      
      // Cache result
      cacheManager.setQueryResult(cacheKey, result);
      
      const executionTime = Date.now() - startTime;
      this.recordQuery(executionTime, false);
      
      // Log slow queries
      if (executionTime > 500) {
        secureLogger.warn('Slow query detected', { cacheKey, executionTimeMs: executionTime }, 'SEGMENT_PERFORMANCE');
        secureLogger.warn('[Performance] Optimization suggestions:', [
          'Consider adding database indexes for query fields',
          'Consider adding more selective filters'
        ]);
      }
      
      return result;
      
    } catch (error) {
      secureLogger.error('Query execution failed', { cacheKey, error: error instanceof Error ? error.message : String(error) }, 'SEGMENT_PERFORMANCE');
      throw error;
    }
  }

  /**
   * Record query execution metrics
   */
  private recordQuery(executionTime: number, fromCache: boolean): void {
    this.metrics.totalQueries++;
    
    // Update average execution time
    this.metrics.avgExecutionTime = (
      (this.metrics.avgExecutionTime * (this.metrics.totalQueries - 1)) + executionTime
    ) / this.metrics.totalQueries;
    
    // Count slow queries
    if (executionTime > 500) {
      this.metrics.slowQueries++;
    }
    
    // Calculate cache hit rate
    const hits = fromCache ? 1 : 0;
    this.metrics.cacheHitRate = (
      (this.metrics.cacheHitRate * (this.metrics.totalQueries - 1)) + hits
    ) / this.metrics.totalQueries;
    
    // Log performance warnings periodically
    if (this.metrics.totalQueries % 10 === 0) {
      if (this.metrics.avgExecutionTime > 1000) {
        secureLogger.warn(`[Performance] Average execution time high: ${this.metrics.avgExecutionTime.toFixed(1)} ms`);
      }
      
      if (this.metrics.cacheHitRate < 0.3) {
        secureLogger.warn(`[Performance] Cache hit rate low: ${(this.metrics.cacheHitRate * 100).toFixed(1)} %`);
      }
    }
  }

  /**
   * Get current performance metrics  
   */
  getMetrics(): SimplePerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics for fresh tracking
   */
  resetMetrics(): void {
    this.metrics = {
      totalQueries: 0,
      slowQueries: 0,
      cacheHitRate: 0,
      avgExecutionTime: 0
    };
  }
}

// Export singleton instance
export const simplePerformanceService = new SimpleSegmentPerformanceService();