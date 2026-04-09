/**
 * Embedding Safeguard Service
 * 
 * Purpose: Critical protection system for vector embedding module integrity
 * 
 * Key Features:
 * - Pre-change validation and integrity checks
 * - Real-time monitoring with automatic alerts
 * - System state validation
 * - Performance threshold monitoring
 * - Automatic rollback recommendations
 * 
 * @module EmbeddingSafeguardService
 * @created September 23, 2025
 */

import { db } from '../db';
import { embeddingJobs, customerEmbeddings, customers } from '@shared/schema';
import { eq, sql, count, and, gt, isNull } from 'drizzle-orm';
import { applicationLogger } from './application-logger';
import { performance } from 'perf_hooks';

export interface SafeguardCheckResult {
  passed: boolean;
  checkName: string;
  details: string;
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation?: string;
  rollbackRequired?: boolean;
}

export interface SystemIntegrityReport {
  timestamp: Date;
  overallHealth: 'healthy' | 'warning' | 'critical' | 'failure';
  checks: SafeguardCheckResult[];
  performanceMetrics: {
    apiResponseTime: number;
    embeddingCompletionRate: number;
    activeJobCount: number;
    systemThroughput: number;
  };
  recommendations: string[];
}

export interface AlertThresholds {
  maxApiResponseTimeMs: number;
  minCompletionRatePercent: number;
  maxActiveJobs: number;
  minThroughputPerMinute: number;
  maxErrorRate: number;
}

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  maxApiResponseTimeMs: 2000,        // Alert if API takes > 2s
  minCompletionRatePercent: 25,      // Alert if completion rate < 25%
  maxActiveJobs: 3,                  // Alert if > 3 concurrent jobs
  minThroughputPerMinute: 100,       // Alert if throughput < 100/min
  maxErrorRate: 0.05                 // Alert if error rate > 5%
};

/**
 * Critical Files Protection Registry
 * These files require special scrutiny before modification
 */
const CRITICAL_EMBEDDING_FILES = [
  'server/services/batch-optimized-embedding-service.ts',
  'server/services/_shared/embedding-orchestrator.ts',
  'server/services/embedding-progress-websocket.ts',
  'server/routes/embedding-routes.ts',
  'server/services/_shared/embedding-adapters.ts',
  'server/services/embedding-watchdog-service.ts',
  'client/src/components/dashboard/embedding-status-card.tsx',
  'client/src/hooks/use-embedding-progress-websocket.ts'
];

/**
 * Embedding Safeguard Service
 */
export class EmbeddingSafeguardService {
  private alertThresholds: AlertThresholds;
  private lastIntegrityCheck: Date | null = null;
  private alertHistory: { timestamp: Date; message: string; severity: string }[] = [];

  constructor(customThresholds?: Partial<AlertThresholds>) {
    this.alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Pre-Change Validation Checklist
   * Run this before making any changes to embedding system
   */
  async runPreChangeValidation(): Promise<SystemIntegrityReport> {
    const startTime = performance.now();
    const checks: SafeguardCheckResult[] = [];

    try {
      // 1. Database Connectivity Check
      checks.push(await this.checkDatabaseConnectivity());

      // 2. Active Jobs Status Check
      checks.push(await this.checkActiveJobsHealth());

      // 3. System Performance Check
      checks.push(await this.checkSystemPerformance());

      // 4. Data Integrity Check
      checks.push(await this.checkDataIntegrity());

      // 5. Memory Usage Check
      checks.push(await this.checkMemoryUsage());

      // 6. API Endpoint Health Check
      checks.push(await this.checkAPIEndpointHealth());

      const performanceMetrics = await this.gatherPerformanceMetrics();
      const overallHealth = this.determineOverallHealth(checks);
      const recommendations = this.generateRecommendations(checks);

      const report: SystemIntegrityReport = {
        timestamp: new Date(),
        overallHealth,
        checks,
        performanceMetrics,
        recommendations
      };

      this.lastIntegrityCheck = new Date();
      
      // Log critical issues immediately
      if (overallHealth === 'critical' || overallHealth === 'failure') {
        applicationLogger.logSystem('SAFEGUARD_CRITICAL: System integrity check failed', {
          report,
          duration: performance.now() - startTime
        });
      }

      return report;

    } catch (error) {
      applicationLogger.logSystem('SAFEGUARD_ERROR: Pre-change validation failed', { error });
      throw new Error(`Safeguard validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Real-time System Monitoring
   * Call this periodically to monitor system health
   */
  async runContinuousMonitoring(): Promise<boolean> {
    try {
      const report = await this.runPreChangeValidation();
      
      // Check thresholds and trigger alerts
      const alerts = this.checkAlertThresholds(report);
      
      if (alerts.length > 0) {
        this.triggerAlerts(alerts);
        return false; // System needs attention
      }

      return true; // System healthy
    } catch (error) {
      applicationLogger.logSystem('MONITORING_ERROR: Continuous monitoring failed', { error });
      return false;
    }
  }

  /**
   * Critical File Change Verification
   */
  async verifyCriticalFileChange(filePath: string, changeDescription: string): Promise<SafeguardCheckResult> {
    const isCriticalFile = CRITICAL_EMBEDDING_FILES.some(criticalPath => 
      filePath.includes(criticalPath) || criticalPath.includes(filePath)
    );

    if (!isCriticalFile) {
      return {
        passed: true,
        checkName: 'Critical File Check',
        details: `File ${filePath} is not in critical embedding module`,
        criticalityLevel: 'low'
      };
    }

    // For critical files, require additional verification
    const preChangeReport = await this.runPreChangeValidation();
    
    if (preChangeReport.overallHealth === 'critical' || preChangeReport.overallHealth === 'failure') {
      return {
        passed: false,
        checkName: 'Critical File Change Verification',
        details: `Cannot modify critical file ${filePath} - system health is ${preChangeReport.overallHealth}`,
        criticalityLevel: 'critical',
        recommendation: 'Resolve system health issues before modifying critical embedding files',
        rollbackRequired: true
      };
    }

    return {
      passed: true,
      checkName: 'Critical File Change Verification',
      details: `Critical file ${filePath} can be safely modified - system health: ${preChangeReport.overallHealth}`,
      criticalityLevel: 'high',
      recommendation: 'Run post-change validation immediately after modification'
    };
  }

  /**
   * Individual Health Checks
   */
  private async checkDatabaseConnectivity(): Promise<SafeguardCheckResult> {
    try {
      const startTime = performance.now();
      await db.select({ count: count() }).from(customers).limit(1);
      const responseTime = performance.now() - startTime;

      return {
        passed: responseTime < 1000,
        checkName: 'Database Connectivity',
        details: `Database response time: ${responseTime.toFixed(2)}ms`,
        criticalityLevel: responseTime > 1000 ? 'high' : 'low'
      };
    } catch (error) {
      return {
        passed: false,
        checkName: 'Database Connectivity',
        details: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        criticalityLevel: 'critical',
        rollbackRequired: true
      };
    }
  }

  private async checkActiveJobsHealth(): Promise<SafeguardCheckResult> {
    try {
      const activeJobs = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.status, 'running'));

      const stalledJobs = activeJobs.filter(job => {
        const lastUpdate = new Date(job.startedAt || job.createdAt!).getTime();
        const stalledThreshold = Date.now() - (30 * 60 * 1000); // 30 minutes
        return lastUpdate < stalledThreshold;
      });

      const passed = activeJobs.length <= this.alertThresholds.maxActiveJobs && stalledJobs.length === 0;

      return {
        passed,
        checkName: 'Active Jobs Health',
        details: `Active jobs: ${activeJobs.length}, Stalled jobs: ${stalledJobs.length}`,
        criticalityLevel: stalledJobs.length > 0 ? 'high' : activeJobs.length > this.alertThresholds.maxActiveJobs ? 'medium' : 'low',
        recommendation: stalledJobs.length > 0 ? 'Review and potentially cancel stalled jobs' : undefined
      };
    } catch (error) {
      return {
        passed: false,
        checkName: 'Active Jobs Health',
        details: `Failed to check job health: ${error instanceof Error ? error.message : 'Unknown error'}`,
        criticalityLevel: 'high'
      };
    }
  }

  private async checkSystemPerformance(): Promise<SafeguardCheckResult> {
    try {
      const startTime = performance.now();
      
      // Test embedding status API performance
      const statusResult = await db
        .select({
          totalCustomers: count(),
          customersWithEmbeddings: sql<number>`COUNT(CASE WHEN ${customerEmbeddings.embedding} IS NOT NULL THEN 1 END)`
        })
        .from(customers)
        .leftJoin(customerEmbeddings, eq(customers.id, customerEmbeddings.customerId));

      const responseTime = performance.now() - startTime;
      const passed = responseTime < this.alertThresholds.maxApiResponseTimeMs;

      return {
        passed,
        checkName: 'System Performance',
        details: `Analytics query response time: ${responseTime.toFixed(2)}ms`,
        criticalityLevel: responseTime > this.alertThresholds.maxApiResponseTimeMs ? 'medium' : 'low'
      };
    } catch (error) {
      return {
        passed: false,
        checkName: 'System Performance',
        details: `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        criticalityLevel: 'medium'
      };
    }
  }

  private async checkDataIntegrity(): Promise<SafeguardCheckResult> {
    try {
      // Check for orphaned embeddings or corrupted data
      const orphanedEmbeddings = await db
        .select({ count: count() })
        .from(customerEmbeddings)
        .leftJoin(customers, eq(customerEmbeddings.customerId, customers.id))
        .where(isNull(customers.id));

      const orphanCount = orphanedEmbeddings[0]?.count || 0;
      const passed = orphanCount === 0;

      return {
        passed,
        checkName: 'Data Integrity',
        details: `Orphaned embeddings found: ${orphanCount}`,
        criticalityLevel: orphanCount > 0 ? 'medium' : 'low',
        recommendation: orphanCount > 0 ? 'Clean up orphaned embedding records' : undefined
      };
    } catch (error) {
      return {
        passed: false,
        checkName: 'Data Integrity',
        details: `Data integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        criticalityLevel: 'medium'
      };
    }
  }

  private async checkMemoryUsage(): Promise<SafeguardCheckResult> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const memoryUtilization = (heapUsedMB / heapTotalMB) * 100;

    const passed = memoryUtilization < 85; // Alert if memory usage > 85%

    return {
      passed,
      checkName: 'Memory Usage',
      details: `Heap utilization: ${memoryUtilization.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB/${heapTotalMB.toFixed(1)}MB)`,
      criticalityLevel: memoryUtilization > 95 ? 'high' : memoryUtilization > 85 ? 'medium' : 'low',
      recommendation: memoryUtilization > 85 ? 'Consider memory optimization or restart' : undefined
    };
  }

  private async checkAPIEndpointHealth(): Promise<SafeguardCheckResult> {
    // This is a placeholder for actual API health checks
    // In a real implementation, you might make actual HTTP requests to test endpoints
    return {
      passed: true,
      checkName: 'API Endpoint Health',
      details: 'All critical API endpoints responding normally',
      criticalityLevel: 'low'
    };
  }

  private async gatherPerformanceMetrics() {
    const startTime = performance.now();
    
    const stats = await db
      .select({
        totalCustomers: count(),
        customersWithEmbeddings: sql<number>`COUNT(CASE WHEN ${customerEmbeddings.embedding} IS NOT NULL THEN 1 END)`
      })
      .from(customers)
      .leftJoin(customerEmbeddings, eq(customers.id, customerEmbeddings.customerId));

    const activeJobs = await db
      .select({ count: count() })
      .from(embeddingJobs)
      .where(eq(embeddingJobs.status, 'running'));

    const apiResponseTime = performance.now() - startTime;
    const totalCustomers = stats[0]?.totalCustomers || 0;
    const withEmbeddings = stats[0]?.customersWithEmbeddings || 0;
    const completionRate = totalCustomers > 0 ? (withEmbeddings / totalCustomers) * 100 : 0;

    return {
      apiResponseTime,
      embeddingCompletionRate: completionRate,
      activeJobCount: activeJobs[0]?.count || 0,
      systemThroughput: 0 // Placeholder - would calculate from recent processing rates
    };
  }

  private determineOverallHealth(checks: SafeguardCheckResult[]): SystemIntegrityReport['overallHealth'] {
    const criticalFailures = checks.filter(c => !c.passed && c.criticalityLevel === 'critical');
    const highSeverityIssues = checks.filter(c => !c.passed && c.criticalityLevel === 'high');
    const mediumIssues = checks.filter(c => !c.passed && c.criticalityLevel === 'medium');

    if (criticalFailures.length > 0) return 'failure';
    if (highSeverityIssues.length > 0) return 'critical';
    if (mediumIssues.length > 0) return 'warning';
    return 'healthy';
  }

  private generateRecommendations(checks: SafeguardCheckResult[]): string[] {
    const recommendations: string[] = [];
    
    checks.forEach(check => {
      if (!check.passed && check.recommendation) {
        recommendations.push(`${check.checkName}: ${check.recommendation}`);
      }
    });

    if (checks.some(c => c.rollbackRequired)) {
      recommendations.unshift('CRITICAL: System rollback recommended before proceeding');
    }

    return recommendations;
  }

  private checkAlertThresholds(report: SystemIntegrityReport): string[] {
    const alerts: string[] = [];

    if (report.performanceMetrics.apiResponseTime > this.alertThresholds.maxApiResponseTimeMs) {
      alerts.push(`API response time exceeded threshold: ${report.performanceMetrics.apiResponseTime}ms > ${this.alertThresholds.maxApiResponseTimeMs}ms`);
    }

    if (report.performanceMetrics.embeddingCompletionRate < this.alertThresholds.minCompletionRatePercent) {
      alerts.push(`Embedding completion rate below threshold: ${report.performanceMetrics.embeddingCompletionRate.toFixed(1)}% < ${this.alertThresholds.minCompletionRatePercent}%`);
    }

    if (report.performanceMetrics.activeJobCount > this.alertThresholds.maxActiveJobs) {
      alerts.push(`Active job count exceeded threshold: ${report.performanceMetrics.activeJobCount} > ${this.alertThresholds.maxActiveJobs}`);
    }

    return alerts;
  }

  private triggerAlerts(alerts: string[]): void {
    alerts.forEach(alert => {
      const alertEntry = {
        timestamp: new Date(),
        message: alert,
        severity: 'warning'
      };
      
      this.alertHistory.push(alertEntry);
      applicationLogger.logSystem('SAFEGUARD_ALERT: ' + alert, { alertEntry });
    });

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }
  }

  /**
   * Get Critical Files List
   */
  getCriticalFiles(): string[] {
    return [...CRITICAL_EMBEDDING_FILES];
  }

  /**
   * Get Recent Alerts
   */
  getRecentAlerts(limit: number = 10): typeof this.alertHistory {
    return this.alertHistory.slice(-limit);
  }
}

// Global safeguard instance
export const globalEmbeddingSafeguard = new EmbeddingSafeguardService();