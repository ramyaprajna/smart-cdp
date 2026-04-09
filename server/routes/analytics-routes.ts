/**
 * Analytics Routes - Performance-Critical Analytics API Endpoints
 * 
 * Last Updated: September 17, 2025
 * Code Quality: ✅ SONARCLOUD COMPLIANT - Refactored with pure analytics service modules
 * 
 * Recent Improvements:
 * - Extracted complex nested logic into pure analytics service modules
 * - Created analyticsSnapshot.ts for embedding snapshot logic
 * - Created applicationLogs.ts for log processing logic
 * - Created systemHealth.ts for health metrics logic
 * - Maintained backward compatibility and performance optimizations
 * - All functions now modular, testable, and follow single responsibility
 * 
 * Performance Notes:
 * - Embedding status endpoint: 1200-1500ms response time (target: <500ms)
 * - Uses aggressive caching (2-minute cache + 10-minute database count cache)
 * - Handles 348,402+ customer records with optimized COUNT queries
 */

import { Express } from 'express';
import { db } from '../db';
import { customers, customerEmbeddings } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAuth } from '../jwt-utils';
import { vectorEngine } from '../vector-engine';
import { cacheManager } from '../cache';
import { secureLogger } from '../utils/secure-logger';

// Import new analytics service modules
import { getEmbeddingSnapshot } from '../services/analytics/analyticsSnapshot';
import { getRecentApplicationLogs } from '../services/analytics/applicationLogs';
import { getSystemHealthMetrics } from '../services/analytics/systemHealth';
import type { RealTimeLogsResponse } from '../services/analytics/types';

// Import HTTP utilities for cache deduplication and error handling
import { withDedupAndCache, analyticsRoute, AnalyticsErrorResponses } from '../utils/http';

/**
 * Background embedding generation function
 * Processes customers in batches without blocking the API response
 */
async function processEmbeddingsInBackground(
  customersToProcess: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>,
  jobId: string
) {
  secureLogger.info(`🔄 [Background] Starting embedding generation for ${customersToProcess.length} customers (Job: ${jobId})`);

  let processedCount = 0;
  const batchSize = 5; // Process in smaller batches

  for (let i = 0; i < customersToProcess.length; i += batchSize) {
    const batch = customersToProcess.slice(i, i + batchSize);

    // Process batch concurrently using real OpenAI embeddings
    const batchPromises = batch.map(async (customer) => {
      try {
        // Get full customer data for embedding generation
        const fullCustomer = await db.select().from(customers).where(eq(customers.id, customer.id)).limit(1);
        if (fullCustomer.length === 0) {
          throw new Error(`Customer ${customer.id} not found`);
        }

        // Generate real OpenAI embedding
        const embedding = await vectorEngine.generateCustomerEmbedding(fullCustomer[0]);

        // Upsert embedding (insert or update if exists) - removing id field since it's auto-generated
        // OPTIMIZED: Write to embeddingVector for performance + embedding for backward compatibility
        await db.insert(customerEmbeddings).values({
          customerId: customer.id,
          embedding: embedding,
          embeddingVector: embedding, // NEW: Optimized pgvector column for performance
          embeddingType: 'customer_profile',
          lastGeneratedAt: new Date()
        }).onConflictDoUpdate({
          target: customerEmbeddings.customerId,
          set: {
            embedding: embedding,
            embeddingVector: embedding, // NEW: Ensure vector search uses optimized column
            lastGeneratedAt: new Date()
          }
        });

        return { success: true, customerId: customer.id };
      } catch (error) {
        secureLogger.error(`Failed to generate embedding for customer ${customer.id}:`, { error: String(error) });
        return { success: false, customerId: customer.id, error: error instanceof Error ? error.message : String(error) };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    // Count successful operations
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        processedCount++;
      }
    });

    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < customersToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    secureLogger.info(`🔄 [Background] Processed batch ${Math.ceil((i + batchSize) / batchSize)} of ${Math.ceil(customersToProcess.length / batchSize)} (${processedCount}/${customersToProcess.length} completed)`);
  }

  secureLogger.info(`✅ [Background] Completed embedding generation: ${processedCount}/${customersToProcess.length} successful (Job: ${jobId})`);
}


export function setupAnalyticsRoutes(app: Express) {

  /**
   * Trigger bulk embedding generation for all customers without embeddings
   * Runs as background process - returns immediately while processing continues
   */
  app.post("/api/analytics/trigger-embeddings", requireAuth, async (req, res) => {
    try {
      // Get customers without embeddings
      const customersWithoutEmbeddings = await db
        .select({
          id: customers.id,
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName
        })
        .from(customers)
        .leftJoin(customerEmbeddings, eq(customers.id, customerEmbeddings.customerId))
        .where(sql`${customerEmbeddings.customerId} IS NULL`);

      if (customersWithoutEmbeddings.length === 0) {
        return res.json({
          success: true,
          message: "All customers already have embeddings",
          customersProcessed: 0,
          backgroundProcess: false
        });
      }

      // Start background embedding generation - don't wait for completion
      const backgroundJobId = `bulk-embeddings-${Date.now()}`;

      // Return immediately to user
      res.json({
        success: true,
        message: `Started background generation for ${customersWithoutEmbeddings.length} customers`,
        customersToProcess: customersWithoutEmbeddings.length,
        backgroundProcess: true,
        jobId: backgroundJobId
      });

      // Process embeddings in background (don't await)
      processEmbeddingsInBackground(customersWithoutEmbeddings, backgroundJobId)
        .catch(error => {
          secureLogger.error('Background embedding generation error:', { error: String(error) });
        });

    } catch (error) {
      secureLogger.error('Bulk embedding trigger error:', { error: String(error) });
      res.status(500).json({
        error: "Failed to trigger embedding generation",
        success: false,
        backgroundProcess: false
      });
    }
  });

  /**
   * Get overall embedding system status for dashboard - PERFORMANCE CRITICAL
   * 
   * Current Issues (September 2025):
   * - Response time: 1200-1500ms (target: <500ms)
   * - Polled every 3-30s by frontend causing system strain
   * - Database count queries on 15,000+ records without proper indexing
   * 
   * Caching Strategy:
   * - 30-second cache for real-time feel (insufficient for expensive operations)
   * - 10-minute database count cache for expensive count operations
   * 
   * Optimization Needed:
   * - Add database indexes for customers.id and customer_embeddings.customerId counts
   * - Consider increasing cache TTL or implementing server-sent events
   * - Optimize database queries with proper indexing
   */
  app.get("/api/analytics/embedding-status", analyticsRoute(
    async (req, res) => {
      // Use withDedupAndCache utility for clean cache deduplication
      return await withDedupAndCache(
        'embedding-status', // Same cache key as before
        2 * 60 * 1000, // Same 2-minute TTL as before
        getEmbeddingSnapshot // Use analytics snapshot service
      );
    },
    AnalyticsErrorResponses.embeddingStatus(),
    'Embedding status'
  ));

  /**
   * Get real-time logs combining embedding status with database application logs
   * Focus on duplicate detection events and system health monitoring
   * 
   * Features:
   * - Combines embedding system status with actual database logs
   * - Special focus on duplicate detection events from import category
   * - Real-time system health metrics
   * - Optimized caching for performance (30-60 second cache)
   * - Error logs and warning prioritization
   * - Compatible with existing log monitoring components
   */
  app.get("/api/analytics/real-time-logs", requireAuth, analyticsRoute(
    async (req, res) => {
      // Use withDedupAndCache utility for clean cache deduplication
      return await withDedupAndCache(
        'real-time-logs-combined', // Same cache key as before
        60 * 1000, // Same 1-minute TTL as before
        async () => {
          secureLogger.info('🔄 [Real-time Logs] Fetching fresh data from database');

          // Get data in parallel for optimal performance using analytics service modules
          const [embeddingStatus, applicationLogs, systemHealth] = await Promise.all([
            // Get current embedding system status using analytics snapshot service
            getEmbeddingSnapshot(),
            
            // Get recent application logs using application logs service
            getRecentApplicationLogs(),
            
            // Get system health metrics using system health service
            getSystemHealthMetrics()
          ]);

          // Combine all data into unified response
          const combinedResponse: RealTimeLogsResponse = {
            // Embedding system status
            embeddingSystem: embeddingStatus,
            
            // Application logs categorized by priority
            logs: applicationLogs,
            
            // System health and monitoring
            systemHealth,
            
            // Real-time monitoring metadata
            monitoring: {
              dataFreshness: new Date().toISOString(),
              responseGenerated: new Date().toISOString(),
              cacheStatus: 'fresh',
              nextRefresh: new Date(Date.now() + 60 * 1000).toISOString(),
            },
            
            // Quick status indicators for dashboard
            quickStatus: {
              systemActive: systemHealth.systemActive,
              hasRecentErrors: applicationLogs.errors.length > 0,
              hasDuplicateEvents: applicationLogs.duplicateDetection.length > 0,
              embeddingProgress: embeddingStatus.embeddingCompletionPercentage,
              overallHealth: systemHealth.healthStatus
            }
          };

          secureLogger.info(`✅ [Real-time Logs] Generated fresh response: ${applicationLogs.summary.totalRecentLogs} logs, ${applicationLogs.duplicateDetection.length} duplicate events, ${applicationLogs.errors.length} errors`);

          return combinedResponse;
        }
      );
    },
    AnalyticsErrorResponses.realTimeLogs(),
    'Real-time logs'
  ));

  app.get("/api/analytics/stats", async (req, res) => {
    try {
      const dedupeKey = 'stats-request';
      const result = await cacheManager.deduplicateRequest(dedupeKey, async () => {
        const cacheKey = 'dashboard-stats';
        const cached = cacheManager.getAnalytics(cacheKey);
        if (cached) return cached;

        const { storage } = await import('../storage');
        const stats = await storage.getCustomerStats();
        cacheManager.setAnalytics(cacheKey, stats);
        return stats;
      });
      res.json(result);
    } catch (error) {
      secureLogger.error('Analytics stats error:', { error: String(error) });
      res.status(500).json({
        error: "Failed to fetch analytics stats",
        totalCustomers: 0,
        activeSegments: 0,
        avgDataQuality: 0,
        newCustomersThisMonth: 0,
        totalEmbeddings: 0
      });
    }
  });

  app.get("/api/analytics/segment-distribution", async (req, res) => {
    try {
      const cacheKey = 'segment-distribution';
      const cached = cacheManager.getAnalytics(cacheKey);
      if (cached) return res.json(cached);

      const { storage } = await import('../storage');
      const distribution = await storage.getSegmentDistribution();
      cacheManager.setAnalytics(cacheKey, distribution);
      res.json(distribution);
    } catch (error) {
      secureLogger.error('Segment distribution error:', { error: String(error) });
      res.status(500).json({ error: "Failed to fetch segment distribution", result: [] });
    }
  });
}
