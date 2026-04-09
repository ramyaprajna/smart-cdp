/**
 * Archive Performance Optimizer
 *
 * Simple performance optimizations for existing archive operations:
 * - Batch processing configuration
 * - Query optimization hints
 * - Performance monitoring and alerting
 * - Memory management for large operations
 *
 * Addresses the 12-16 second archive operation times identified in Evidence-Based Analysis
 *
 * Created: August 11, 2025
 */

import { applicationLogger } from './application-logger';

interface PerformanceConfig {
  batchSize: number;
  maxConcurrency: number;
  memoryThreshold: number; // MB
  timeoutThreshold: number; // milliseconds
}

interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  recordsProcessed: number;
  memoryUsed: number;
  peakMemory: number;
}

export class ArchivePerformanceOptimizer {
  private readonly config: PerformanceConfig = {
    batchSize: 1000,
    maxConcurrency: 3,
    memoryThreshold: 512, // 512MB
    timeoutThreshold: 10000 // 10 seconds
  };

  private activeOperations = new Map<string, PerformanceMetrics>();

  /**
   * Start performance tracking for an operation
   */
  startOperation(operationId: string, operationType: string): void {
    const metrics: PerformanceMetrics = {
      operation: operationType,
      startTime: Date.now(),
      recordsProcessed: 0,
      memoryUsed: this.getMemoryUsage(),
      peakMemory: this.getMemoryUsage()
    };

    this.activeOperations.set(operationId, metrics);

    applicationLogger.info(
      'archive',
      `Archive operation started: ${operationType} (ID: ${operationId})`
    );
  }

  /**
   * Update operation progress
   */
  updateProgress(operationId: string, recordsProcessed: number): void {
    const metrics = this.activeOperations.get(operationId);
    if (!metrics) return;

    metrics.recordsProcessed = recordsProcessed;
    const currentMemory = this.getMemoryUsage();
    metrics.memoryUsed = currentMemory;
    metrics.peakMemory = Math.max(metrics.peakMemory, currentMemory);

    // Check for performance issues
    const currentDuration = Date.now() - metrics.startTime;
    if (currentDuration > this.config.timeoutThreshold) {
      this.alertSlowOperation(operationId, metrics, currentDuration);
    }

    if (currentMemory > this.config.memoryThreshold) {
      this.alertHighMemoryUsage(operationId, metrics, currentMemory);
    }
  }

  /**
   * Complete operation tracking
   */
  completeOperation(operationId: string): PerformanceMetrics | null {
    const metrics = this.activeOperations.get(operationId);
    if (!metrics) return null;

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;

    // Log completion
    applicationLogger.info(
      'archive',
      `Archive operation completed: ${metrics.operation} in ${metrics.duration}ms (${metrics.recordsProcessed} records)`
    );

    // Check if operation was slow
    if (metrics.duration > this.config.timeoutThreshold) {
      applicationLogger.warn(
        'archive',
        `Slow archive operation detected: ${metrics.operation} took ${metrics.duration}ms`,
        {
          operationId,
          duration: metrics.duration,
          recordsProcessed: metrics.recordsProcessed,
          peakMemory: metrics.peakMemory,
          operation: metrics.operation
        }
      );
    }

    this.activeOperations.delete(operationId);
    return metrics;
  }

  /**
   * Get optimized batch size based on current memory usage
   */
  getOptimalBatchSize(estimatedRecordSize: number = 1024): number {
    const currentMemory = this.getMemoryUsage();
    const availableMemory = this.config.memoryThreshold - currentMemory;

    if (availableMemory < 100) {
      // Low memory, use smaller batches
      return Math.max(100, Math.floor(this.config.batchSize / 4));
    } else if (availableMemory > 300) {
      // Plenty of memory, can use larger batches
      return Math.min(5000, this.config.batchSize * 2);
    }

    return this.config.batchSize;
  }

  /**
   * Get database query hints for better performance
   */
  getQueryOptimizations(): {
    useIndex: boolean;
    parallelWorkers: number;
    workMem: string;
  } {
    return {
      useIndex: true,
      parallelWorkers: this.config.maxConcurrency,
      workMem: '256MB'
    };
  }

  /**
   * Create optimized WHERE clause for date range queries
   */
  createOptimizedDateFilter(
    dateField: string,
    startDate?: Date,
    endDate?: Date
  ): string | null {
    if (!startDate && !endDate) return null;

    let filter = '';
    if (startDate) {
      filter += `${dateField} >= '${startDate.toISOString()}'`;
    }
    if (endDate) {
      if (filter) filter += ' AND ';
      filter += `${dateField} <= '${endDate.toISOString()}'`;
    }

    return filter;
  }

  /**
   * Monitor active operations
   */
  getActiveOperations(): Array<{
    id: string;
    operation: string;
    duration: number;
    recordsProcessed: number;
    memoryUsed: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeOperations.entries()).map(([id, metrics]) => ({
      id,
      operation: metrics.operation,
      duration: now - metrics.startTime,
      recordsProcessed: metrics.recordsProcessed,
      memoryUsed: metrics.memoryUsed
    }));
  }

  /**
   * Force cleanup of stale operations
   */
  cleanupStaleOperations(): void {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    const staleOperations = Array.from(this.activeOperations.entries()).filter(
      ([id, metrics]) => now - metrics.startTime > staleThreshold
    );

    staleOperations.forEach(([id, metrics]) => {
      applicationLogger.warn(
        'archive',
        `Cleaning up stale archive operation: ${metrics.operation}`,
        { operationId: id, operation: metrics.operation }
      );
      this.activeOperations.delete(id);
    });
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const memoryUsage = this.getMemoryUsage();
    const activeOps = this.activeOperations.size;

    if (memoryUsage > this.config.memoryThreshold * 0.8) {
      recommendations.push('High memory usage detected. Consider reducing batch sizes.');
    }

    if (activeOps > this.config.maxConcurrency) {
      recommendations.push('Too many concurrent operations. Consider queuing some operations.');
    }

    // Check for database locks or slow queries
    recommendations.push('Ensure database indexes are optimized for date range queries.');
    recommendations.push('Consider running VACUUM ANALYZE on archive tables for better performance.');

    return recommendations;
  }

  private getMemoryUsage(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  private alertSlowOperation(operationId: string, metrics: PerformanceMetrics, duration: number): void {
    applicationLogger.warn(
      'archive',
      `Archive operation running slowly: ${metrics.operation}`,
      {
        operationId,
        duration,
        recordsProcessed: metrics.recordsProcessed,
        operation: metrics.operation,
        threshold: this.config.timeoutThreshold
      }
    );
  }

  private alertHighMemoryUsage(operationId: string, metrics: PerformanceMetrics, memoryUsed: number): void {
    applicationLogger.warn(
      'archive',
      `High memory usage during archive operation: ${metrics.operation}`,
      {
        operationId,
        memoryUsed,
        threshold: this.config.memoryThreshold,
        operation: metrics.operation
      }
    );
  }
}

// Export singleton instance
export const archivePerformanceOptimizer = new ArchivePerformanceOptimizer();
