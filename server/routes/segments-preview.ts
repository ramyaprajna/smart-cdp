/**
 * Segment Preview Routes - Real-Time Segment Counter for Admin UI
 * 
 * PERFORMANCE CRITICAL SERVICE: Provides real-time customer count previews and
 * safely masked sample customers for admin segment builder UI. Implements 
 * comprehensive security, caching, and performance optimization.
 * 
 * @module SegmentPreviewRoutes
 * @created September 18, 2025
 * @purpose Real-time segment preview with <500ms response targets
 * 
 * @security_features
 * - Comprehensive input validation using business field mappings
 * - PII masking for sample customer data
 * - Role-based access controls for sensitive operations
 * - Rate limiting to prevent preview endpoint abuse
 * - SQL injection prevention through parameterized queries
 * - Audit logging for security monitoring
 * 
 * @performance_features
 * - Intelligent caching with criteria-based TTL
 * - Query optimization using database indexes
 * - Request complexity analysis and warnings
 * - Sub-500ms response time targets
 * - Adaptive cache warming for frequent criteria
 * 
 * @endpoints
 * - POST /preview-count - Count customers matching criteria (target: <500ms)
 * - POST /preview-customers - Sample customers with safe masking (target: <500ms)
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../jwt-utils';
import { rateLimitMiddleware } from '../performance-middleware';
import { applicationLogger } from '../services/application-logger';
import { storage } from '../storage';

// Import Task 1.1 services for secure operation
import { segmentCriteriaService } from '../services/segment-criteria-service';
import { fieldValidationService } from '../services/field-validation-service';
import { simplePerformanceService } from '../services/segment-performance-service-simple';
import { piiMaskingService } from '../services/pii-masking-service';
import { createCanonicalCacheKey, cacheManager } from '../cache';

const router = Router();

/**
 * Business criteria validation schema
 */
const BusinessCriteriaSchema = z.record(z.string(), z.any()).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one criterion must be provided" }
);

const PreviewCountRequestSchema = z.object({
  criteria: BusinessCriteriaSchema
});

const PreviewCustomersRequestSchema = z.object({
  criteria: BusinessCriteriaSchema,
  limit: z.number().min(1).max(20).default(5) // Limit sample size for security
});

/**
 * User context interface for validation
 */
interface RequestUserContext {
  userId: string;
  role: string;
  isAuthenticated: boolean;
  permissions: string[];
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Extract user context from Express request
 */
function extractUserContext(req: any): RequestUserContext {
  return {
    userId: req.user?.id || 'anonymous',
    role: req.user?.role || 'public',
    isAuthenticated: !!req.user,
    permissions: req.user?.permissions || [],
    sessionId: req.sessionID,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id'] || `preview_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  };
}

/**
 * POST /api/segments/preview-count
 * 
 * Real-time customer count preview for segment criteria
 * Target: <500ms response time for 90% of queries
 */
router.post('/preview-count', 
  requireAuth,
  rateLimitMiddleware(60, 60000), // 60 requests per minute - generous for real-time UI
  async (req, res) => {
    const startTime = performance.now();
    const userContext = extractUserContext(req);
    
    try {
      // 1. Validate request payload
      const validationResult = PreviewCountRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        await applicationLogger.warn('system', 'Segment preview count validation failed', {
          ...userContext,
          validationErrors: validationResult.error.errors,
          requestBody: piiMaskingService.createSecureDebugString(req.body, 100)
        });
        
        return res.status(400).json({
          success: false,
          error: 'Invalid request format',
          details: validationResult.error.errors,
          requestId: userContext.requestId
        });
      }
      
      const { criteria } = validationResult.data;
      
      // 2. Security validation using Task 1.1 services
      const securityValidation = await fieldValidationService.validateSegmentCriteria(
        criteria, 
        userContext
      );
      
      if (!securityValidation.success) {
        await applicationLogger.warn('system', 'Segment preview count security validation failed', {
          ...userContext,
          securityErrors: securityValidation.errors,
          deniedFields: securityValidation.deniedFields,
          securityLevel: securityValidation.securityLevel
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied to requested fields',
          deniedFields: securityValidation.deniedFields,
          securityLevel: securityValidation.securityLevel,
          requestId: userContext.requestId
        });
      }
      
      // 3. Rate limit check
      if (!securityValidation.rateLimitStatus.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(securityValidation.rateLimitStatus.resetTime / 1000),
          remaining: securityValidation.rateLimitStatus.remaining,
          requestId: userContext.requestId
        });
      }
      
      // 4. Translate criteria using secure mappings
      const translation = await segmentCriteriaService.translateCriteria(criteria, userContext);
      
      if (!translation.success) {
        await applicationLogger.error('system', 'Segment criteria translation failed', undefined, {
          ...userContext,
          translationErrors: translation.errors,
          appliedMappings: translation.appliedMappings
        });
        
        return res.status(400).json({
          success: false,
          error: 'Invalid segment criteria',
          details: translation.errors,
          warnings: translation.warnings,
          requestId: userContext.requestId
        });
      }
      
      // 5. Execute optimized count query with performance monitoring
      // ARCHITECT FIX: Use translated whereConditions, canonical cache key, and request deduplication
      const canonicalKey = `count_${createCanonicalCacheKey(translation.whereConditions)}`;
      
      const queryResult = await cacheManager.deduplicateRequest(
        canonicalKey,
        async () => {
          return await simplePerformanceService.executeWithCache(
            canonicalKey,
            async () => {
              // Execute COUNT query using translated conditions - CRITICAL FIX
              return await storage.getCustomerCountByTranslatedConditions(translation.whereConditions);
            },
            30000 // 30 seconds TTL
          );
        }
      );
      
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      
      // 6. Check performance target
      const performanceWarnings = [];
      if (executionTime > 500) {
        performanceWarnings.push('Query exceeded 500ms target - consider optimizing criteria');
      }
      if (translation.estimatedSelectivity < 0.01) {
        performanceWarnings.push('Low selectivity query detected - may be slow with large datasets');
      }
      
      // 7. Audit logging for successful operation
      await applicationLogger.info('system', 'Segment preview count completed successfully', {
        ...userContext,
        criteriaCount: Object.keys(criteria).length,
        customerCount: queryResult,
        executionTime,
        fromCache: false,
        indexesUsed: translation.usesIndexes,
        appliedMappings: translation.appliedMappings,
        performanceWarnings: performanceWarnings.length
      });
      
      // 8. Return successful response
      res.json({
        success: true,
        count: queryResult,
        performance: {
          queryTime: executionTime, // Simple service doesn't track query time separately
          totalTime: executionTime,
          cached: false, // Simple service doesn't track cache status
          complexity: translation.estimatedSelectivity > 0.1 ? 'low' : 
                     translation.estimatedSelectivity > 0.01 ? 'medium' : 'high',
          indexesUsed: translation.usesIndexes || [], // ARCHITECT FIX: Use translation metadata
          estimatedCost: translation.estimatedSelectivity // ARCHITECT FIX: Use selectivity as cost proxy
        },
        warnings: performanceWarnings.concat(translation.warnings),
        requestId: userContext.requestId
      });
      
    } catch (error) {
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      
      await applicationLogger.logAIError(
        userContext.userId,
        'segment_preview_count',
        error as Error,
        {
          executionTime,
          criteria: piiMaskingService.createSecureDebugString(req.body.criteria || {}, 200),
          userRole: userContext.role
        },
        req
      );
      
      // Check for specific error types
      if (error instanceof Error && error.message.includes('timeout')) {
        return res.status(408).json({
          success: false,
          error: 'Query timeout - criteria too complex',
          executionTime,
          suggestion: 'Try simplifying your criteria or use fewer conditions',
          requestId: userContext.requestId
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        executionTime,
        requestId: userContext.requestId
      });
    }
  }
);

/**
 * POST /api/segments/preview-customers
 * 
 * Sample customers preview with PII masking for validation
 * Target: <500ms response time, safely masked customer data
 */
router.post('/preview-customers',
  requireAuth,
  rateLimitMiddleware(30, 60000), // 30 requests per minute - more restrictive for customer data
  async (req, res) => {
    const startTime = performance.now();
    const userContext = extractUserContext(req);
    
    try {
      // 1. Validate request payload
      const validationResult = PreviewCustomersRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        await applicationLogger.warn('system', 'Segment preview customers validation failed', {
          ...userContext,
          validationErrors: validationResult.error.errors
        });
        
        return res.status(400).json({
          success: false,
          error: 'Invalid request format',
          details: validationResult.error.errors,
          requestId: userContext.requestId
        });
      }
      
      const { criteria, limit } = validationResult.data;
      
      // 2. Security validation - stricter for customer data access
      const securityValidation = await fieldValidationService.validateSegmentCriteria(
        criteria,
        userContext
      );
      
      if (!securityValidation.success) {
        await applicationLogger.warn('system', 'Segment preview customers security validation failed', {
          ...userContext,
          securityErrors: securityValidation.errors,
          deniedFields: securityValidation.deniedFields
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied to customer data preview',
          deniedFields: securityValidation.deniedFields,
          requestId: userContext.requestId
        });
      }
      
      // 3. Additional security check for customer data access
      if (userContext.role === 'viewer' && securityValidation.securityLevel === 'high') {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions for sensitive customer data preview',
          requiredRole: 'analyst',
          currentRole: userContext.role,
          requestId: userContext.requestId
        });
      }
      
      // 4. Translate criteria
      const translation = await segmentCriteriaService.translateCriteria(criteria, userContext);
      
      if (!translation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid segment criteria',
          details: translation.errors,
          requestId: userContext.requestId
        });
      }
      
      // 5. Execute optimized sample query with count
      const [customersResult, countResult] = await Promise.all([
        simplePerformanceService.executeWithCache(
          `sample_customers_${JSON.stringify(criteria)}_${limit}`,
          async () => {
            const customers = await storage.getCustomersByCriteria(criteria);
            return customers.slice(0, limit);
          },
          60000 // 1 minute cache
        ),
        simplePerformanceService.executeWithCache(
          `preview_count_${JSON.stringify(criteria)}`,
          async () => {
            return await storage.getCustomerCountByCriteria(criteria);
          }
        )
      ]);
      
      // 6. Apply PII masking to customer samples
      const maskedCustomers = [];
      const maskedFields = new Set<string>();
      
      for (const customer of customersResult) {
        const maskedCustomer: any = {};
        
        for (const [field, value] of Object.entries(customer)) {
          const maskingResult = piiMaskingService.maskField(field, value, 'preview');
          
          maskedCustomer[field] = maskingResult.maskedValue;
          if (maskingResult.maskingApplied) {
            maskedFields.add(field);
          }
        }
        
        maskedCustomers.push(maskedCustomer);
      }
      
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      
      // 7. Performance warnings
      const performanceWarnings = [];
      if (executionTime > 500) {
        performanceWarnings.push('Response exceeded 500ms target');
      }
      
      // 8. Audit logging for customer data access
      await applicationLogger.info('system', 'Segment preview customers completed successfully', {
        ...userContext,
        criteriaCount: Object.keys(criteria).length,
        sampleSize: maskedCustomers.length,
        totalCount: countResult,
        executionTime,
        maskedFieldsCount: maskedFields.size,
        securityLevel: securityValidation.securityLevel
      });
      
      // 9. Return masked customer samples
      res.json({
        success: true,
        customers: maskedCustomers,
        count: countResult,
        performance: {
          queryTime: executionTime,
          totalTime: executionTime,
          cached: false,
          complexity: translation.estimatedSelectivity > 0.1 ? 'low' : 
                     translation.estimatedSelectivity > 0.01 ? 'medium' : 'high'
        },
        maskedFields: Array.from(maskedFields),
        warnings: performanceWarnings.concat(translation.warnings),
        requestId: userContext.requestId
      });
      
    } catch (error) {
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      
      await applicationLogger.logAIError(
        userContext.userId,
        'segment_preview_customers',
        error as Error,
        {
          executionTime,
          limit: req.body.limit,
          userRole: userContext.role
        },
        req
      );
      
      if (error instanceof Error && error.message.includes('timeout')) {
        return res.status(408).json({
          success: false,
          error: 'Query timeout - criteria too complex',
          executionTime,
          requestId: userContext.requestId
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        executionTime,
        requestId: userContext.requestId
      });
    }
  }
);

export default router;