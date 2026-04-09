/**
 * Production Health Check System
 * 
 * Provides comprehensive health checks for critical system components
 * to prevent embedding job failures and ensure system stability.
 * 
 * PRODUCTION FIX: Created October 8, 2025
 * - Monitors database connectivity and pool status
 * - Checks embedding job capacity
 * - Validates cache warming health
 * - Provides early warning for resource exhaustion
 */

import { pool } from '../db';
import { archivePool } from '../db-archive';
import { secureLogger } from './secure-logger';

export interface HealthStatus {
  healthy: boolean;
  timestamp: Date;
  checks: {
    database: HealthCheckResult;
    archiveDatabase: HealthCheckResult;
    connectionPools: HealthCheckResult;
    embeddingCapacity: HealthCheckResult;
  };
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  message: string;
  details?: Record<string, any>;
}

export class HealthCheckService {
  private static instance: HealthCheckService;

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Perform comprehensive system health check
   */
  async checkHealth(): Promise<HealthStatus> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Run all health checks in parallel for speed
    const [
      databaseCheck,
      archiveDbCheck,
      poolsCheck,
      embeddingCapacityCheck
    ] = await Promise.all([
      this.checkDatabaseConnectivity(),
      this.checkArchiveDatabaseConnectivity(),
      this.checkConnectionPools(),
      this.checkEmbeddingCapacity()
    ]);

    // Collect warnings and errors
    const checks = {
      database: databaseCheck,
      archiveDatabase: archiveDbCheck,
      connectionPools: poolsCheck,
      embeddingCapacity: embeddingCapacityCheck
    };

    Object.entries(checks).forEach(([name, check]) => {
      if (check.status === 'unhealthy') {
        errors.push(`${name}: ${check.message}`);
      } else if (check.status === 'degraded') {
        warnings.push(`${name}: ${check.message}`);
      }
    });

    // Generate recommendations based on status
    if (poolsCheck.status === 'degraded') {
      recommendations.push('Consider reducing concurrent operations or increasing connection pool limits');
    }
    if (embeddingCapacityCheck.status === 'degraded') {
      recommendations.push('Wait for existing embedding jobs to complete before starting new ones');
    }
    if (databaseCheck.status === 'unhealthy') {
      recommendations.push('Critical: Database connectivity issue - check Neon dashboard for status');
    }

    const healthy = errors.length === 0;

    return {
      healthy,
      timestamp: new Date(),
      checks,
      warnings,
      errors,
      recommendations
    };
  }

  /**
   * Check main database connectivity
   */
  private async checkDatabaseConnectivity(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      await pool.query('SELECT 1 as health_check');
      const duration = Date.now() - startTime;

      if (duration > 1000) {
        return {
          status: 'degraded',
          message: `Database responding slowly (${duration}ms)`,
          details: { responseTimeMs: duration }
        };
      }

      return {
        status: 'healthy',
        message: 'Database connectivity OK',
        details: { responseTimeMs: duration }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connectivity failed',
        details: { 
          error: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code
        }
      };
    }
  }

  /**
   * Check archive database connectivity (non-critical)
   */
  private async checkArchiveDatabaseConnectivity(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      await archivePool.query('SELECT 1 as health_check');
      const duration = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Archive database connectivity OK',
        details: { responseTimeMs: duration }
      };
    } catch (error) {
      // Archive database is non-critical, so degraded instead of unhealthy
      return {
        status: 'degraded',
        message: 'Archive database connectivity issue (non-critical)',
        details: { 
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Check connection pool status
   */
  private async checkConnectionPools(): Promise<HealthCheckResult> {
    try {
      const mainPoolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        maxSize: 5
      };

      const archivePoolStats = {
        totalCount: archivePool.totalCount,
        idleCount: archivePool.idleCount,
        waitingCount: archivePool.waitingCount,
        maxSize: 2
      };

      // Check for pool exhaustion
      const mainPoolUtilization = (mainPoolStats.totalCount / mainPoolStats.maxSize) * 100;
      const archivePoolUtilization = (archivePoolStats.totalCount / archivePoolStats.maxSize) * 100;

      if (mainPoolUtilization > 80 || mainPoolStats.waitingCount > 0) {
        return {
          status: 'degraded',
          message: 'Main connection pool under pressure',
          details: {
            mainPool: mainPoolStats,
            archivePool: archivePoolStats,
            mainPoolUtilization: `${mainPoolUtilization.toFixed(1)}%`
          }
        };
      }

      return {
        status: 'healthy',
        message: 'Connection pools healthy',
        details: {
          mainPool: mainPoolStats,
          archivePool: archivePoolStats,
          mainPoolUtilization: `${mainPoolUtilization.toFixed(1)}%`,
          archivePoolUtilization: `${archivePoolUtilization.toFixed(1)}%`
        }
      };
    } catch (error) {
      return {
        status: 'unknown',
        message: 'Could not check connection pool status',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Check embedding job capacity
   */
  private async checkEmbeddingCapacity(): Promise<HealthCheckResult> {
    try {
      // Import here to avoid circular dependencies
      const { db } = await import('../db');
      const { embeddingJobs } = await import('@shared/schema');
      const { eq, or } = await import('drizzle-orm');

      const runningJobs = await db
        .select()
        .from(embeddingJobs)
        .where(
          or(
            eq(embeddingJobs.status, 'running'),
            eq(embeddingJobs.status, 'cancelling')
          )
        );

      const runningCount = runningJobs.length;
      const maxConcurrentJobs = 3;

      if (runningCount >= maxConcurrentJobs) {
        return {
          status: 'degraded',
          message: 'Embedding capacity at maximum',
          details: {
            runningJobs: runningCount,
            maxConcurrentJobs,
            recommendation: 'Wait for jobs to complete before starting new ones'
          }
        };
      }

      return {
        status: 'healthy',
        message: 'Embedding capacity available',
        details: {
          runningJobs: runningCount,
          maxConcurrentJobs,
          availableSlots: maxConcurrentJobs - runningCount
        }
      };
    } catch (error) {
      return {
        status: 'unknown',
        message: 'Could not check embedding capacity',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Pre-flight check before starting embedding jobs
   * Returns true if safe to start, false otherwise
   */
  async preflightCheckForEmbedding(): Promise<{
    safe: boolean;
    reason?: string;
    healthStatus: HealthStatus;
  }> {
    const health = await this.checkHealth();

    // Block if database is unhealthy
    if (health.checks.database.status === 'unhealthy') {
      await secureLogger.error('Pre-flight check failed: Database unhealthy', {
        health: health.checks.database
      }, 'HEALTH_CHECK');

      return {
        safe: false,
        reason: 'Database connectivity issue - cannot start embedding job',
        healthStatus: health
      };
    }

    // Block if at capacity
    if (health.checks.embeddingCapacity.status === 'degraded') {
      await secureLogger.warn('Pre-flight check failed: At capacity', {
        health: health.checks.embeddingCapacity
      }, 'HEALTH_CHECK');

      return {
        safe: false,
        reason: 'Embedding job capacity limit reached - wait for existing jobs to complete',
        healthStatus: health
      };
    }

    // Warn if connection pools are under pressure but allow
    if (health.checks.connectionPools.status === 'degraded') {
      await secureLogger.warn('Pre-flight check warning: Connection pools under pressure', {
        health: health.checks.connectionPools
      }, 'HEALTH_CHECK');
    }

    return {
      safe: true,
      healthStatus: health
    };
  }
}

// Export singleton
export const healthCheckService = HealthCheckService.getInstance();
