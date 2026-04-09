/**
 * Analytics Snapshot Service - Embedding system status logic
 * 
 * Extracted from analytics routes for modularity and testability
 * Provides embedding system status snapshot with basic caching
 * 
 * Last Updated: September 18, 2025 - Updated comments to reflect current performance reality
 * Code Quality: Modular design with pure helper functions
 * 
 * Current Performance Characteristics:
 * - Uses basic caching (2-minute cache + 10-minute database count cache)
 * - Handles 348,402+ customer records but COUNT queries are slow (1000-1200ms)
 * - TODO: Optimize COUNT queries with better indexing strategies
 * - TODO: Implement materialized views for frequently accessed counts
 * - TODO: Add request deduplication to prevent concurrent expensive operations
 */

import { db } from '../../db';
import { customers, customerEmbeddings, dataImports, embeddingJobs } from '@shared/schema';
import { eq, desc, count, sql } from 'drizzle-orm';
import { cacheManager } from '../../cache';
import { batchOptimizedEmbeddingService } from '../batch-optimized-embedding-service';
import { secureLogger } from '../../utils/secure-logger';
import type { 
  EmbeddingSnapshot, 
  CustomerCounts, 
  RecentImport, 
  JobStatus, 
  CurrentJob,
  AnalyticsServiceDependencies 
} from './types';

/**
 * Helper function to get cached or fresh customer counts
 * OPTIMIZED: Uses analytics_summary table to avoid expensive COUNT queries
 */
export async function getCustomerCounts(): Promise<CustomerCounts> {
  const totalCustomersKey = 'count:customers:total';
  const embeddingsCountKey = 'count:customer_embeddings:total';

  let totalCustomers = cacheManager.getDatabaseCount(totalCustomersKey);
  let customersWithEmbeddings = cacheManager.getDatabaseCount(embeddingsCountKey);

  // Only query database if counts are not cached
  if (totalCustomers === undefined || customersWithEmbeddings === undefined) {
    secureLogger.info('🔄 [PERF] Cache miss - fetching from analytics summary table');
    const startTime = Date.now();
    
    try {
      // PERFORMANCE OPTIMIZATION: Use analytics_summary table instead of expensive COUNT queries
      const summaryData = await db.execute(sql`
        SELECT metric_name, metric_value, last_updated, next_refresh 
        FROM analytics_summary 
        WHERE metric_name IN ('total_customers', 'customers_with_embeddings')
      `);
      
      const summaryMap = new Map();
      (summaryData.rows as any[]).forEach(row => {
        summaryMap.set(row.metric_name, {
          value: Number(row.metric_value),
          lastUpdated: new Date(row.last_updated),
          nextRefresh: new Date(row.next_refresh)
        });
      });
      
      const now = new Date();
      let needsRefresh = false;
      
      // Check if we need to refresh stale data
      if (!summaryMap.has('total_customers') || !summaryMap.has('customers_with_embeddings')) {
        needsRefresh = true;
      } else {
        const customerMetric = summaryMap.get('total_customers');
        const embeddingMetric = summaryMap.get('customers_with_embeddings');
        
        if (now > customerMetric.nextRefresh || now > embeddingMetric.nextRefresh) {
          needsRefresh = true;
        }
      }
      
      if (needsRefresh) {
        secureLogger.info('🔄 [PERF] Summary data stale, refreshing analytics_summary table');
        
        // Refresh the summary table with current counts
        await db.execute(sql`
          INSERT INTO analytics_summary (metric_name, metric_value, last_updated, next_refresh) 
          VALUES 
            ('total_customers', (SELECT COUNT(*) FROM customers), NOW(), NOW() + INTERVAL '1 hour'),
            ('customers_with_embeddings', (SELECT COUNT(DISTINCT customer_id) FROM customer_embeddings), NOW(), NOW() + INTERVAL '1 hour')
          ON CONFLICT (metric_name) DO UPDATE SET 
            metric_value = EXCLUDED.metric_value,
            last_updated = EXCLUDED.last_updated,
            next_refresh = EXCLUDED.next_refresh
        `);
        
        // Re-fetch the updated data
        const updatedData = await db.execute(sql`
          SELECT metric_name, metric_value 
          FROM analytics_summary 
          WHERE metric_name IN ('total_customers', 'customers_with_embeddings')
        `);
        
        (updatedData.rows as any[]).forEach(row => {
          summaryMap.set(row.metric_name, { value: Number(row.metric_value) });
        });
      }
      
      totalCustomers = summaryMap.get('total_customers')?.value || 0;
      customersWithEmbeddings = summaryMap.get('customers_with_embeddings')?.value || 0;
      
      // Cache for longer since counts change infrequently (1 hour vs 10 minutes)
      cacheManager.setDatabaseCount(totalCustomersKey, totalCustomers);
      cacheManager.setDatabaseCount(embeddingsCountKey, customersWithEmbeddings);
      
      secureLogger.info(`✅ [PERF] Analytics summary query completed in ${Date.now() - startTime}ms (was 2000-3000ms with COUNT queries)`);
      
    } catch (error) {
      secureLogger.warn('⚠️ [PERF] Analytics summary table failed, falling back to COUNT queries:', { error: String(error) });
      
      // Fallback to original COUNT queries if summary table fails
      const [customerStats, embeddingStats] = await Promise.all([
        totalCustomers === undefined ? db.select({ totalCustomers: count(customers.id) }).from(customers) : Promise.resolve([{ totalCustomers }]),
        customersWithEmbeddings === undefined ? db.select({ customersWithEmbeddings: count(sql`DISTINCT ${customerEmbeddings.customerId}`) }).from(customerEmbeddings) : Promise.resolve([{ customersWithEmbeddings }])
      ]);
      
      if (totalCustomers === undefined) {
        totalCustomers = Number(customerStats[0]?.totalCustomers) || 0;
        cacheManager.setDatabaseCount(totalCustomersKey, totalCustomers);
      }

      if (customersWithEmbeddings === undefined) {
        customersWithEmbeddings = Number(embeddingStats[0]?.customersWithEmbeddings) || 0;
        cacheManager.setDatabaseCount(embeddingsCountKey, customersWithEmbeddings);
      }
      
      secureLogger.info(`🔄 [PERF] Fallback COUNT queries completed in ${Date.now() - startTime}ms`);
    }
  }

  return { totalCustomers, customersWithEmbeddings };
}

/**
 * Helper function to get recent imports with caching
 * Preserves exact existing functionality
 */
export async function getRecentImports(): Promise<RecentImport[]> {
  const recentImportsKey = 'recent-imports';
  let recentImports = cacheManager.getAnalytics(recentImportsKey);
  
  if (!recentImports) {
    recentImports = await db
      .select({
        id: dataImports.id,
        importStatus: dataImports.importStatus,
        completedAt: dataImports.completedAt
      })
      .from(dataImports)
      .orderBy(desc(dataImports.importedAt))
      .limit(5);
    
    // Cache for 1 minute - imports don't change frequently
    cacheManager.setAnalytics(recentImportsKey, recentImports, 60 * 1000);
  }
  
  return recentImports;
}

/**
 * Helper function to determine system status
 * Pure function with no side effects
 */
export function determineSystemStatus(
  latestJob: JobStatus | null,
  embeddingCompletionPercentage: number,
  activeProcessingJobs: number
): 'ready' | 'processing' | 'completed' | 'partial' | 'cancelling' | 'cancelled' {
  
  if (latestJob) {
    return getStatusFromJob(latestJob, embeddingCompletionPercentage);
  }
  
  return getFallbackStatus(embeddingCompletionPercentage, activeProcessingJobs);
}

/**
 * Helper function to get status from job
 * Pure function with no side effects
 */
export function getStatusFromJob(latestJob: JobStatus, embeddingCompletionPercentage: number) {
  if (latestJob.status === 'running') return 'processing';
  if (latestJob.status === 'cancelling') return 'cancelling';
  if (latestJob.status === 'cancelled') return 'cancelled';
  if (embeddingCompletionPercentage === 100) return 'completed';
  if (embeddingCompletionPercentage > 0) return 'partial';
  return 'ready';
}

/**
 * Helper function to get fallback status
 * Pure function with no side effects
 */
export function getFallbackStatus(embeddingCompletionPercentage: number, activeProcessingJobs: number) {
  if (activeProcessingJobs > 0) return 'processing';
  if (embeddingCompletionPercentage === 100) return 'completed';
  if (embeddingCompletionPercentage > 0) return 'partial';
  return 'ready';
}

/**
 * SIMPLIFIED: Determine system status from batch jobs only
 * Pure function with no side effects - unified batch embedding architecture
 */
export function determineSystemStatusFromBatchJobs(
  runningBatchJobs: any[],
  embeddingCompletionPercentage: number,
  activeProcessingJobs: number
): 'ready' | 'processing' | 'completed' | 'partial' | 'cancelling' | 'cancelled' {
  
  // Filter to only actually running jobs
  const actuallyRunningBatch = runningBatchJobs.filter(job => job.status === 'running');
  
  // Check for cancelling jobs
  const cancellingBatch = runningBatchJobs.filter(job => job.status === 'cancelling');
  
  // If any jobs are running, system is processing
  if (actuallyRunningBatch.length > 0) {
    return 'processing';
  }
  
  // If any jobs are cancelling, system is cancelling
  if (cancellingBatch.length > 0) {
    return 'cancelling';
  }
  
  // No active jobs, fall back to completion status
  return getFallbackStatus(embeddingCompletionPercentage, activeProcessingJobs);
}


/**
 * Calculate fallback ETA when batch metrics are not available
 * Uses basic job progress and runtime data, fetching creation time from database
 */
async function calculateFallbackETA(job: JobStatus): Promise<{
  etaSeconds?: number;
  etaHumanized?: string;
  currentThroughputPerMinute?: number;
}> {
  if (job.processedCustomers <= 0 || job.totalCustomers <= job.processedCustomers) {
    return {}; // Not enough data or job completed
  }

  let createdAt: Date | null = null;

  // Try to get creation time from job data first
  if (job.createdAt) {
    createdAt = new Date(job.createdAt);
  } else {
    // Fallback: fetch creation time from database
    try {
      const result = await db.select({
        createdAt: embeddingJobs.createdAt
      }).from(embeddingJobs).where(eq(embeddingJobs.id, job.jobId)).limit(1);
      
      if (result[0]?.createdAt) {
        createdAt = new Date(result[0].createdAt);
      }
    } catch (error) {
      secureLogger.warn('[ANALYTICS] Failed to fetch job creation time:', { error: String(error) });
      return {}; // Can't calculate ETA without creation time
    }
  }

  if (!createdAt) {
    return {}; // No creation time available
  }

  // Calculate runtime in minutes
  const runtimeMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);

  if (runtimeMinutes <= 0) {
    return {}; // Invalid runtime
  }

  // Calculate current throughput (customers per minute)
  const throughputPerMinute = job.processedCustomers / runtimeMinutes;
  const remainingCustomers = job.totalCustomers - job.processedCustomers;
  const etaMinutes = remainingCustomers / throughputPerMinute;
  const etaSeconds = Math.max(0, etaMinutes * 60);

  // Format human-readable ETA
  let etaHumanized = '';
  if (etaMinutes < 1) {
    etaHumanized = `${Math.ceil(etaSeconds)}s`;
  } else if (etaMinutes < 60) {
    etaHumanized = `${Math.ceil(etaMinutes)}m`;
  } else {
    const hours = Math.floor(etaMinutes / 60);
    const minutes = Math.ceil(etaMinutes % 60);
    etaHumanized = `${hours}h ${minutes}m`;
  }

  return {
    etaSeconds: Math.ceil(etaSeconds),
    etaHumanized: `~${etaHumanized} (based on processing logs)`,
    currentThroughputPerMinute: Math.round(throughputPerMinute * 10) / 10 // Round to 1 decimal
  };
}

/**
 * Helper function to create current job object with ETA calculation
 * Enhanced to include rolling ETA calculation for active jobs
 */
export async function createCurrentJobObject(latestJob: JobStatus | null): Promise<CurrentJob | null> {
  if (!latestJob) return null;
  
  const baseJob = {
    jobId: latestJob.jobId,
    status: latestJob.status,
    processedCustomers: latestJob.processedCustomers,
    totalCustomers: latestJob.totalCustomers,
    estimatedTokensSaved: latestJob.estimatedTokensSaved,
    progressPercentage: latestJob.totalCustomers > 0
      ? Math.round((latestJob.processedCustomers / latestJob.totalCustomers) * 100)
      : 0
  };

  // Add ETA calculation for running batch jobs
  secureLogger.info('[ANALYTICS] ETA Check - Job status:', { status: latestJob.status, isBatchJob: latestJob.isBatchJob });
  
  if (latestJob.status === 'running' && latestJob.isBatchJob) {
    try {
      secureLogger.info('[ANALYTICS] Attempting to get ETA for batch job:', { jobId: latestJob.jobId });
      // Get enhanced job info with ETA from batch service
      const { batchOptimizedEmbeddingService } = await import('../batch-optimized-embedding-service');
      const enhancedJob = await batchOptimizedEmbeddingService.getLatestBatchJobStatus();
      
      secureLogger.info('[ANALYTICS] Enhanced job data:', enhancedJob ? {
        jobId: enhancedJob.jobId,
        hasETA: !!enhancedJob.etaHumanized,
        etaHumanized: enhancedJob.etaHumanized,
        currentThroughputPerMinute: enhancedJob.currentThroughputPerMinute
      } : { status: 'null' });
      
      if (enhancedJob && enhancedJob.jobId === latestJob.jobId) {
        // If batch service has ETA data, use it
        if (enhancedJob.etaHumanized && enhancedJob.currentThroughputPerMinute) {
          secureLogger.info('[ANALYTICS] Adding batch service ETA to job response');
          return {
            ...baseJob,
            etaSeconds: enhancedJob.etaSeconds,
            etaHumanized: enhancedJob.etaHumanized,
            currentThroughputPerMinute: enhancedJob.currentThroughputPerMinute
          };
        } else {
          // Fallback: Calculate basic ETA from job runtime and progress
          secureLogger.info('[ANALYTICS] Batch metrics unavailable, calculating fallback ETA');
          secureLogger.info('[ANALYTICS] Job data for fallback:', {
            jobId: latestJob.jobId,
            createdAt: latestJob.createdAt,
            processedCustomers: latestJob.processedCustomers,
            totalCustomers: latestJob.totalCustomers
          });
          const fallbackETA = await calculateFallbackETA(latestJob);
          secureLogger.info('[ANALYTICS] Fallback ETA result:', fallbackETA);
          if (fallbackETA.etaHumanized) {
            secureLogger.info('[ANALYTICS] Adding fallback ETA to job response');
            return {
              ...baseJob,
              etaSeconds: fallbackETA.etaSeconds,
              etaHumanized: fallbackETA.etaHumanized,
              currentThroughputPerMinute: fallbackETA.currentThroughputPerMinute
            };
          } else {
            secureLogger.info('[ANALYTICS] Fallback ETA calculation failed - no valid ETA generated');
          }
        }
      }
    } catch (error) {
      secureLogger.warn('[ANALYTICS] Failed to get ETA for batch job:', { error: String(error) });
    }
  }

  return baseJob;
}

/**
 * Main function to get embedding system snapshot
 * Consolidates the current IIFE logic from real-time-logs endpoint
 * Pure function with injected dependencies for testability
 * 
 * Returns exact same payload structure as current embeddingSystem object
 * Preserves all existing caching behavior and database queries
 */
export async function getEmbeddingSnapshot(): Promise<EmbeddingSnapshot> {
  // Get customer counts with caching
  const { totalCustomers, customersWithEmbeddings } = await getCustomerCounts();

  // Calculate completion percentage (cap at 100%)
  const embeddingCompletionPercentage = totalCustomers > 0
    ? Math.min(Math.round((customersWithEmbeddings / totalCustomers) * 100 * 10) / 10, 100)
    : 0;

  // Get recent imports with caching
  const recentImports = await getRecentImports();

  // Count active processing jobs
  const activeProcessingJobs = recentImports.filter(
    (imp: RecentImport) => imp.importStatus === 'processing' || imp.importStatus === 'embedding'
  ).length;

  // Get latest job status from optimized batch service only
  const batchJob = await batchOptimizedEmbeddingService.getLatestBatchJobStatus();
  
  // Get all running jobs from optimized batch service only
  const runningBatchJobs = await batchOptimizedEmbeddingService.getAllRunningBatchJobs();
  
  // Use the batch job as latest job
  const latestJob = batchJob ? {
    jobId: batchJob.jobId,
    status: batchJob.status,
    processedCustomers: batchJob.processedCustomers,
    totalCustomers: batchJob.totalCustomers,
    estimatedTokensSaved: batchJob.estimatedTokensSaved,
    isBatchJob: true
  } : null;

  // Determine system status based on batch jobs only
  const systemStatus = determineSystemStatusFromBatchJobs(
    runningBatchJobs, 
    embeddingCompletionPercentage, 
    activeProcessingJobs
  );

  // Get last processed timestamp
  const lastProcessedAt = recentImports.find((imp: RecentImport) => imp.completedAt)?.completedAt;

  // Return embedding snapshot data
  return {
    totalCustomers,
    customersWithEmbeddings,
    embeddingCompletionPercentage,
    activeProcessingJobs,
    systemStatus,
    currentJob: await createCurrentJobObject(latestJob),
    lastProcessedAt: lastProcessedAt?.toISOString()
  };
}