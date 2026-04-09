import { secureLogger } from '../utils/secure-logger';
/**
 * Performance Monitoring Service - Phase 3 Memory Optimization
 * Real-time performance metrics and memory usage tracking
 * Implementation: August 15, 2025
 */

interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: NodeJS.MemoryUsage;
  responseTime: number;
  endpoint: string;
  statusCode: number;
  cacheHit: boolean;
}

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private readonly MAX_METRICS = 1000; // Keep last 1000 metrics
  private readonly MAX_SNAPSHOTS = 100; // Keep last 100 memory snapshots
  private readonly MEMORY_SNAPSHOT_INTERVAL = 30000; // 30 seconds
  private memoryTimer?: NodeJS.Timeout;

  constructor() {
    this.startMemoryMonitoring();
  }

  /**
   * Record API performance metrics
   */
  recordMetric(endpoint: string, responseTime: number, statusCode: number, cacheHit: boolean = false): void {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage(),
      responseTime,
      endpoint,
      statusCode,
      cacheHit,
    };

    this.metrics.push(metric);

    // Keep only recent metrics to prevent memory growth
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  /**
   * Start periodic memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryTimer = setInterval(() => {
      this.takeMemorySnapshot();
    }, this.MEMORY_SNAPSHOT_INTERVAL);
  }

  /**
   * Take a memory usage snapshot
   */
  private takeMemorySnapshot(): void {
    const memory = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      rss: memory.rss,
    };

    this.memorySnapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.memorySnapshots.length > this.MAX_SNAPSHOTS) {
      this.memorySnapshots = this.memorySnapshots.slice(-this.MAX_SNAPSHOTS);
    }

    // Log significant memory changes
    if (this.memorySnapshots.length >= 2) {
      const current = this.memorySnapshots[this.memorySnapshots.length - 1];
      const previous = this.memorySnapshots[this.memorySnapshots.length - 2];
      const heapDiff = current.heapUsed - previous.heapUsed;

      // Log if heap usage increased by more than 50MB
      if (Math.abs(heapDiff) > 50 * 1024 * 1024) {
        secureLogger.info(`📊 Memory change: ${this.formatBytes(heapDiff)} heap usage (total: ${this.formatBytes(current.heapUsed)})`);
      }
    }
  }

  /**
   * Get performance statistics for the last N minutes
   */
  getPerformanceStats(minutes: number = 10): {
    totalRequests: number;
    averageResponseTime: number;
    cacheHitRate: number;
    errorRate: number;
    slowestEndpoints: Array<{ endpoint: string; avgResponseTime: number }>;
    memoryTrend: Array<{ timestamp: number; heapUsed: number }>;
  } {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    const recentSnapshots = this.memorySnapshots.filter(s => s.timestamp >= cutoffTime);

    // Calculate cache hit rate
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    const cacheHitRate = recentMetrics.length > 0 ? (cacheHits / recentMetrics.length) * 100 : 0;

    // Calculate error rate
    const errors = recentMetrics.filter(m => m.statusCode >= 400).length;
    const errorRate = recentMetrics.length > 0 ? (errors / recentMetrics.length) * 100 : 0;

    // Find slowest endpoints
    const endpointStats = new Map<string, { totalTime: number; count: number }>();
    recentMetrics.forEach(m => {
      const stats = endpointStats.get(m.endpoint) || { totalTime: 0, count: 0 };
      stats.totalTime += m.responseTime;
      stats.count++;
      endpointStats.set(m.endpoint, stats);
    });

    const slowestEndpoints = Array.from(endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        avgResponseTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 5);

    // Memory trend
    const memoryTrend = recentSnapshots.map(s => ({
      timestamp: s.timestamp,
      heapUsed: s.heapUsed,
    }));

    return {
      totalRequests: recentMetrics.length,
      averageResponseTime: recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length || 0,
      cacheHitRate,
      errorRate,
      slowestEndpoints,
      memoryTrend,
    };
  }

  /**
   * Get current system health status
   */
  getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    memory: {
      heapUsed: string;
      heapTotal: string;
      heapUsagePercent: number;
      rss: string;
    };
    performance: {
      averageResponseTime: number;
      cacheHitRate: number;
      errorRate: number;
    };
    warnings: string[];
  } {
    const memory = process.memoryUsage();
    const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;
    const stats = this.getPerformanceStats(5); // Last 5 minutes

    const warnings: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Memory warnings
    if (heapUsagePercent > 90) {
      warnings.push('High heap usage (>90%)');
      status = 'critical';
    } else if (heapUsagePercent > 75) {
      warnings.push('Elevated heap usage (>75%)');
      if (status === 'healthy') status = 'warning';
    }

    // Performance warnings
    if (stats.averageResponseTime > 2000) {
      warnings.push('High average response time (>2s)');
      if (status === 'healthy') status = 'warning';
    }

    if (stats.errorRate > 5) {
      warnings.push(`High error rate (${stats.errorRate.toFixed(1)}%)`);
      if (status === 'healthy') status = 'warning';
    }

    return {
      status,
      memory: {
        heapUsed: this.formatBytes(memory.heapUsed),
        heapTotal: this.formatBytes(memory.heapTotal),
        heapUsagePercent,
        rss: this.formatBytes(memory.rss),
      },
      performance: {
        averageResponseTime: stats.averageResponseTime,
        cacheHitRate: stats.cacheHitRate,
        errorRate: stats.errorRate,
      },
      warnings,
    };
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    // Handle negative values (memory decrease)
    const isNegative = bytes < 0;
    const absBytes = Math.abs(bytes);

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(absBytes) / Math.log(k));
    const formattedValue = parseFloat((absBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];

    return isNegative ? `-${formattedValue}` : formattedValue;
  }

  /**
   * Clear old metrics and snapshots
   */
  cleanup(): void {
    this.metrics = [];
    this.memorySnapshots = [];
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = undefined;
    }
    this.cleanup();
  }
}

export const performanceMonitor = new PerformanceMonitor();
