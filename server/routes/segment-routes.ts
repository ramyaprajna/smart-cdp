import type { Express } from "express";
import { storage } from "../storage";
import { insertSegmentSchema } from "@shared/schema";
import { z } from "zod";
import { applicationLogger } from "../services/application-logger";
import { aiSegmentService } from "../services/ai-segment-service";
import { secureLogger } from "../utils/secure-logger";

function getSegmentDescription(segmentName: string): string {
  const descriptions: Record<string, string> = {
    'Professional': 'Working professionals with steady income and high engagement',
    'Student': 'Young audience seeking entertainment and educational content',
    'Entrepreneur': 'Business owners and self-employed individuals',
    'Regular Listener': 'Loyal customers with consistent activity patterns',
    'Unclassified': 'Customers without assigned segment classification'
  };
  return descriptions[segmentName] || 'Customer segment with specific characteristics';
}

export function setupSegmentRoutes(app: Express): void {
  app.get("/api/segments/metrics/:segmentId", async (req, res) => {
    try {
      const rawSegmentId = req.params.segmentId;
      const segmentId = decodeURIComponent(rawSegmentId);

      if (!segmentId || segmentId.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid segment ID provided',
          details: 'Segment ID cannot be empty'
        });
      }

      secureLogger.debug('Segments API: Looking for segment', { segmentId, rawSegmentId }, 'SEGMENTS_API');

      let segment;
      try {
        const segments = await storage.getSegments();
        secureLogger.debug('Segments API: Available segments', { segmentCount: segments.length, segmentNames: segments.map(s => s.name) }, 'SEGMENTS_API');
        segment = segments.find(s => s.id === segmentId) ||
                 segments.find(s => s.name === segmentId);
      } catch (error: any) {
        secureLogger.error('Segments API: Error fetching segments', { error: error?.message || String(error) }, 'SEGMENTS_API');
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch segments from database',
          details: error?.message || 'Internal server error'
        });
      }

      if (!segment) {
        secureLogger.debug('Segments API: Segment not found', { segmentId }, 'SEGMENTS_API');
        return res.status(404).json({
          success: false,
          error: `Segment not found: ${segmentId}`,
          details: "The segment may have been deleted, renamed, or the ID/name is incorrect",
          segmentId
        });
      }

      let customerCount = 0;
      let segmentCustomers: any[] = [];

      if (segment.criteria) {
        try {
          const criteria = typeof segment.criteria === 'string'
            ? JSON.parse(segment.criteria)
            : segment.criteria;

          customerCount = await storage.getCustomerCountByCriteria(criteria);

          if (customerCount > 0) {
            segmentCustomers = await storage.getCustomersByCriteria(criteria);
            segmentCustomers = segmentCustomers.slice(0, 1000);
          }
        } catch (error: any) {
          secureLogger.error('Error parsing or applying segment criteria', { error: error?.message || String(error) }, 'SEGMENTS_API');
          segmentCustomers = [];
        }
      } else {
        customerCount = await storage.getCustomerCountBySegment(segment.name);
        if (customerCount > 0) {
          segmentCustomers = await storage.getCustomersByCriteria({ segment: segment.name });
          segmentCustomers = segmentCustomers.slice(0, 1000);
        }
      }

      const analytics = await storage.getSegmentAnalytics(segment.id, segmentCustomers);

      const metrics = {
        id: segment.id,
        name: segment.name,
        description: segment.description || getSegmentDescription(segment.name),
        customerCount: customerCount,
        avgDataQuality: analytics.avgDataQuality,
        genderDistribution: analytics.genderDistribution,
        topCities: analytics.topCities,
        ageRange: analytics.ageRange,
        activityRate: analytics.activityRate,
        recentlyActive: analytics.recentlyActive,
        avgLifetimeValue: analytics.avgLifetimeValue,
        isActive: segment.isActive ?? true,
        lastUpdated: segment.updatedAt || new Date().toISOString()
      };

      res.json(metrics);
    } catch (error: any) {
      applicationLogger.error('segment', 'Error calculating individual segment metrics', error instanceof Error ? error : undefined);
      res.status(500).json({
        success: false,
        error: "Failed to calculate segment metrics",
        details: error.message
      });
    }
  });

  app.get("/api/segments/metrics", async (req, res) => {
    try {
      const segments = await storage.getSegments();
      const segmentMetrics: Record<string, any> = {};

      await Promise.all(segments.map(async (segment) => {
        const segmentName = segment.name || 'Unclassified';
        let totalCustomers = 0;
        let segmentCustomers: any[] = [];

        if (segment.criteria) {
          try {
            const criteria = typeof segment.criteria === 'string' ? JSON.parse(segment.criteria) : segment.criteria;
            totalCustomers = await storage.getCustomerCountByCriteria(criteria);
            if (totalCustomers > 0) {
              segmentCustomers = await storage.getCustomersByCriteria(criteria);
              segmentCustomers = segmentCustomers.slice(0, 1000);
            }
          } catch (error) {
            applicationLogger.error('segment', `Error processing segment ${segmentName}`, error instanceof Error ? error : undefined);
          }
        } else {
          totalCustomers = await storage.getCustomerCountBySegment(segmentName);
          if (totalCustomers > 0) {
            segmentCustomers = await storage.getCustomersByCriteria({ segment: segmentName });
            segmentCustomers = segmentCustomers.slice(0, 1000);
          }
        }

        const analytics = await storage.getSegmentAnalytics(segment.id, segmentCustomers);

        segmentMetrics[segmentName] = {
          description: segment.description || `Customer segment with ${totalCustomers} members`,
          customerCount: totalCustomers,
          genderDistribution: analytics.genderDistribution,
          avgDataQuality: analytics.avgDataQuality,
          topCities: analytics.topCities,
          ageRange: analytics.ageRange,
          activityRate: analytics.activityRate,
          recentlyActive: analytics.recentlyActive,
          avgLifetimeValue: analytics.avgLifetimeValue
        };
      }));

      res.json(segmentMetrics);
    } catch (error) {
      applicationLogger.error('segment', 'Error calculating segment metrics', error instanceof Error ? error : undefined);
      res.status(500).json({ error: "Failed to calculate segment metrics" });
    }
  });

  app.get("/api/segments", async (req, res) => {
    const requestStartTime = Date.now();
    let totalQueryTime = 0;
    let queryCount = 0;
    const criteriaCache = new Map<string, any>();
    let cacheHits = 0;
    let cacheMisses = 0;

    try {
      const segments = await storage.getSegments();
      applicationLogger.info('segment', `Fetched ${segments.length} segments for processing`);

      const segmentsWithCounts = await Promise.all(segments.map(async (segment) => {
        let customerCount = 0;
        const queryStartTime = Date.now();

        if (segment.criteria) {
          try {
            const criteria = typeof segment.criteria === 'string'
              ? JSON.parse(segment.criteria)
              : segment.criteria;

            const criteriaKey = JSON.stringify(criteria || {});

            if (criteriaCache.has(criteriaKey)) {
              const cachedCount = criteriaCache.get(criteriaKey);
              customerCount = Array.isArray(cachedCount) ? cachedCount.length : cachedCount;
              cacheHits++;
            } else {
              customerCount = await storage.getCustomerCountByCriteria(criteria);
              criteriaCache.set(criteriaKey, customerCount);
              cacheMisses++;
            }
          } catch (error: any) {
            applicationLogger.error('segment', 'Error parsing segment criteria', error instanceof Error ? error : undefined);
            customerCount = 0;
          }
        } else {
          try {
            customerCount = await storage.getCustomerCountBySegment(segment.name);
          } catch (error: any) {
            applicationLogger.error('segment', 'Error counting customers for legacy segment', error instanceof Error ? error : undefined);
            customerCount = 0;
          }
        }

        const queryTime = Date.now() - queryStartTime;
        totalQueryTime += queryTime;
        queryCount++;

        if (queryTime > 500) {
          applicationLogger.info('segment', `Slow segment query for ${segment.id}: ${queryTime}ms`);
        }

        return {
          ...segment,
          customerCount,
          isActive: segment.isActive ?? true,
          lastUpdated: segment.updatedAt || new Date().toISOString()
        };
      }));

      const totalTime = Date.now() - requestStartTime;
      const avgQueryTime = queryCount > 0 ? totalQueryTime / queryCount : 0;
      const cacheEfficiency = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100) : 0;

      applicationLogger.info('segment', 'Segments API completed');

      res.json(segmentsWithCounts);
    } catch (error: any) {
      applicationLogger.error('segment', 'Error fetching segments', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: "Failed to fetch segments",
        details: error?.message || "Unknown error occurred"
      });
    }
  });

  app.post("/api/segments", async (req, res) => {
    try {
      const segmentData = insertSegmentSchema.parse(req.body);
      const segment = await storage.createSegment(segmentData);
      res.json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid segment data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create segment" });
    }
  });

  app.patch("/api/segments/:id", async (req, res) => {
    try {
      const segmentId = req.params.id;
      const updateData = req.body;
      const updatedSegment = await storage.updateSegment(segmentId, updateData);
      res.json(updatedSegment);
    } catch (error) {
      applicationLogger.error('segment', 'Segment update failed', error instanceof Error ? error : undefined);
      applicationLogger.info('segment', 'Failed update data', { body: req.body });
      applicationLogger.info('segment', 'Failed segment ID', { id: req.params.id });

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid segment data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update segment", details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/segments/from-ai", async (req, res) => {
    const startTime = performance.now();
    try {
      const segmentData = req.body;

      await applicationLogger.logAISuggestionSelection(
        req.user?.id || 'anonymous',
        segmentData,
        'selected_for_creation',
        req
      );

      if (!segmentData.name || !segmentData.description || !segmentData.criteria) {
        await applicationLogger.logAI('warn', 'AI segment creation failed due to missing required fields', {
          userId: req.user?.id,
          providedFields: Object.keys(segmentData),
          missingFields: [
            !segmentData.name && 'name',
            !segmentData.description && 'description',
            !segmentData.criteria && 'criteria'
          ].filter(Boolean),
          requestData: segmentData,
          timestamp: new Date().toISOString()
        }, req);
        return res.status(400).json({ error: "Missing required fields: name, description, criteria" });
      }

      const segment = await storage.createSegment({
        name: segmentData.name,
        description: segmentData.description,
        criteria: segmentData.criteria,
        isActive: true
      });

      const endTime = performance.now();
      const totalDuration = Math.round(endTime - startTime);

      await applicationLogger.logAI('info', 'AI segment successfully created and saved to database', {
        userId: req.user?.id,
        segmentId: segment.id,
        segmentName: segment.name,
        segmentDescription: segment.description,
        criteria: segment.criteria,
        totalCreationTime: totalDuration,
        responseTimestamp: new Date().toISOString()
      }, req);

      res.json(segment);
    } catch (error) {
      applicationLogger.error('segment', 'Error creating segment from AI suggestion', error instanceof Error ? error : undefined);

      const endTime = performance.now();
      const failureDuration = Math.round(endTime - startTime);

      await applicationLogger.logAIError(
        req.user?.id || 'anonymous',
        'ai_segment_creation',
        error as Error,
        {
          requestDuration: failureDuration,
          apiEndpoint: '/api/segments/from-ai',
          operationStep: 'segment_creation'
        },
        req
      );

      res.status(500).json({ error: "Failed to create segment from AI suggestion" });
    }
  });

  app.post("/api/ai/test", async (req, res) => {
    try {
      res.json({
        success: true,
        message: "AI endpoint authentication working",
        user: req.user ? { id: req.user.id, email: req.user.email } : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      applicationLogger.error('segment', 'AI Test API error', error instanceof Error ? error : undefined);
      res.status(500).json({ error: "Test failed", details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/ai/segment-suggestions", async (req, res) => {
    const startTime = performance.now();
    try {
      await applicationLogger.logAI('info', 'AI segment suggestions API request initiated', {
        userId: req.user?.id,
        userEmail: req.user?.email,
        requestId: req.headers['x-request-id'],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestTimestamp: new Date().toISOString()
      }, req);

      const suggestions = await aiSegmentService.generateSegmentSuggestions(req.user?.id);

      const endTime = performance.now();
      const totalDuration = Math.round(endTime - startTime);

      await applicationLogger.logAI('info', 'AI segment suggestions API completed successfully', {
        userId: req.user?.id,
        userEmail: req.user?.email,
        suggestionsCount: suggestions.length,
        totalResponseTime: totalDuration,
        avgSuggestionConfidence: Math.round(suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length),
        businessValueBreakdown: suggestions.reduce((acc, s) => {
          acc[s.businessValue] = (acc[s.businessValue] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        totalEstimatedCustomers: suggestions.reduce((sum, s) => sum + s.estimatedSize, 0),
        responseTimestamp: new Date().toISOString()
      }, req);

      res.json({ suggestions });
    } catch (error) {
      applicationLogger.error('segment', 'Error generating AI segment suggestions', error instanceof Error ? error : undefined);

      const endTime = performance.now();
      const failureDuration = Math.round(endTime - startTime);

      await applicationLogger.logAIError(
        req.user?.id || 'anonymous',
        'ai_segment_suggestions_api',
        error as Error,
        {
          requestDuration: failureDuration,
          apiEndpoint: '/api/ai/segment-suggestions',
          operationStep: 'api_request_processing'
        },
        req
      );

      res.status(500).json({ error: "Failed to generate AI segment suggestions" });
    }
  });
}
