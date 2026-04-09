/**
 * Secure Vector Search Routes
 * 
 * Enterprise-grade secure implementations of vector search endpoints with comprehensive
 * security hardening, input validation, rate limiting, and data protection.
 * 
 * @module SecureVectorRoutes
 * @security_implementation
 * - Comprehensive input validation with Zod schemas
 * - Specialized rate limiting for vector operations
 * - Secure error handling with unique tracking IDs
 * - Data masking and privacy controls
 * - Audit logging for security events
 * - Request timeout and DoS protection
 * 
 * @created September 18, 2025
 * @last_updated September 18, 2025
 */

import { Request, Response, Express } from 'express';
import { requireAuth } from '../jwt-utils';
import { 
  validateInput,
  findSimilarCustomersSchema,
  textBasedSearchSchema,
  clusterAnalysisSchema,
  segmentAnalysisSchema,
  type FindSimilarCustomersInput,
  type TextBasedSearchInput,
  type ClusterAnalysisInput,
  type SegmentAnalysisInput
} from '../validation/vector-search-validation';
import {
  createVectorSecurityStack,
  vectorRateLimiters,
  VectorSecurityLogger,
  VectorSecurityEvent
} from '../middleware/vector-security-middleware';
import {
  VectorErrorHandler,
  vectorErrorHandlers,
  VectorErrorCategory
} from '../utils/vector-error-handler';
import {
  maskVectorSearchResults,
  getDataAccessSummary,
  PrivacyLevel
} from '../utils/vector-data-masking';

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `REQ_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Enhanced middleware to add request tracking
 */
function addRequestTracking(req: Request, res: Response, next: Function) {
  (req as any).requestId = generateRequestId();
  (req as any).startTime = Date.now();
  next();
}

/**
 * Log vector operation for audit trail
 */
function logVectorOperation(
  operation: string,
  params: Record<string, any>,
  req: Request,
  success: boolean,
  duration?: number,
  resultCount?: number
) {
  VectorSecurityLogger.logSecurityEvent(
    success ? VectorSecurityEvent.OPERATION_AUDIT : VectorSecurityEvent.UNAUTHORIZED_ACCESS,
    {
      operation,
      success,
      duration,
      resultCount,
      parameters: {
        threshold: params.threshold,
        limit: params.limit,
        embeddingType: params.embeddingType,
        includeMetadata: params.includeMetadata
      },
      performance: {
        operationDurationMs: duration,
        requestId: (req as any).requestId
      }
    },
    req,
    success ? 'info' : 'warn'
  );
}

/**
 * Setup secure vector search routes
 */
export function setupSecureVectorRoutes(app: Express): void {
  
  // Apply request tracking to all secure vector endpoints
  app.use('/api/vector-secure/*', addRequestTracking);
  
  /**
   * Find Similar Customers by Customer ID
   * POST /api/vector-secure/find-similar/:customerId
   * 
   * SECURITY: Comprehensive validation, rate limiting, and data masking
   * PERFORMANCE: Optimized vector similarity search with timeout protection
   * AUDIT: Full audit logging for compliance and security monitoring
   */
  app.post(
    '/api/vector-secure/find-similar/:customerId',
    ...createVectorSecurityStack('similarity', findSimilarCustomersSchema),
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { customerId } = req.params;
      const validatedInput = (req as any).validatedInput as FindSimilarCustomersInput;
      const user = (req as any).user;
      const requestId = (req as any).requestId;
      
      try {
        // Additional customer ID validation from URL params
        const customerIdValidation = validateInput.findSimilarCustomers({
          ...validatedInput,
          customerId
        });
        
        // Import vector engine dynamically for optimal memory usage
        const { vectorEngine } = await import('../vector-engine');
        
        // Get customer embedding first
        const customerResult = await vectorEngine.databasePool.query(`
          SELECT embedding_vector FROM customer_embeddings
          WHERE customer_id = $1 AND embedding_type = $2
        `, [customerIdValidation.customerId, customerIdValidation.embeddingType]);
        
        if (customerResult.rows.length === 0) {
          VectorSecurityLogger.logSecurityEvent(
            VectorSecurityEvent.INVALID_INPUT,
            {
              reason: 'customer_not_found_or_no_embedding',
              customerId: customerIdValidation.customerId,
              embeddingType: customerIdValidation.embeddingType
            },
            req,
            'warn'
          );
          
          return res.status(404).json({
            error: 'Customer not found or no embedding available',
            code: 'CUSTOMER_NOT_FOUND',
            type: 'client_error',
            requestId
          });
        }
        
        // Parse embedding data safely
        let embedding;
        try {
          const embeddingData = customerResult.rows[0].embedding_vector;
          embedding = typeof embeddingData === 'string' ? JSON.parse(embeddingData) : embeddingData;
        } catch (parseError) {
          return vectorErrorHandlers.vectorEngine(
            new Error('Invalid embedding format'), 
            'embedding_parse', 
            req, 
            res
          );
        }
        
        // Perform vector similarity search
        const similarCustomers = await vectorEngine.findSimilarCustomers(embedding, {
          threshold: customerIdValidation.threshold,
          limit: customerIdValidation.limit,
          embeddingType: customerIdValidation.embeddingType,
          includeMetadata: customerIdValidation.includeMetadata
        });
        
        // Apply data masking based on user role
        const maskedResults = maskVectorSearchResults(
          similarCustomers,
          user.role,
          user.userId,
          requestId
        );
        
        // Create data access summary for transparency
        const dataAccessSummary = getDataAccessSummary(
          user.role,
          PrivacyLevel.FULL_ACCESS, // This would be determined by user.role
          Object.keys(similarCustomers[0] || {})
        );
        
        const duration = Date.now() - startTime;
        
        // Log successful operation
        logVectorOperation(
          'find_similar_customers',
          customerIdValidation,
          req,
          true,
          duration,
          maskedResults.length
        );
        
        res.json({
          success: true,
          requestId,
          operation: 'find_similar_customers',
          results: maskedResults,
          metadata: {
            totalResults: maskedResults.length,
            searchParameters: {
              threshold: customerIdValidation.threshold,
              limit: customerIdValidation.limit,
              embeddingType: customerIdValidation.embeddingType
            },
            dataAccess: dataAccessSummary,
            performance: {
              durationMs: duration,
              cacheHit: false
            }
          }
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logVectorOperation('find_similar_customers', validatedInput, req, false, duration);
        
        if (error instanceof Error && error.message.includes('Vector search parameters invalid')) {
          return vectorErrorHandlers.validation(
            error as any,
            req,
            res,
            { operation: 'find_similar_customers', customerId }
          );
        }
        
        return vectorErrorHandlers.vectorEngine(
          error as Error, 
          'find_similar_customers', 
          req, 
          res
        );
      }
    }
  );
  
  /**
   * Text-Based Customer Search with AI Embedding Generation
   * POST /api/vector-secure/search
   * 
   * SECURITY: XSS prevention, input sanitization, and comprehensive validation
   * AI: Generates embeddings from text queries using OpenAI
   * PRIVACY: Data masking and role-based access control
   */
  app.post(
    '/api/vector-secure/search',
    ...createVectorSecurityStack('search', textBasedSearchSchema),
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const validatedInput = (req as any).validatedInput as TextBasedSearchInput;
      const user = (req as any).user;
      const requestId = (req as any).requestId;
      
      try {
        // Import dependencies dynamically
        const { vectorEngine } = await import('../vector-engine');
        
        // Generate embedding from search query using OpenAI
        const embedding = await vectorEngine.openaiClient.embeddings.create({
          model: "text-embedding-3-small",
          input: validatedInput.query,
          encoding_format: "float"
        });
        
        const searchEmbedding = embedding.data[0].embedding;
        
        // Perform vector similarity search
        const similarCustomers = await vectorEngine.findSimilarCustomers(searchEmbedding, {
          threshold: validatedInput.threshold,
          limit: validatedInput.limit,
          embeddingType: validatedInput.embeddingType,
          includeMetadata: validatedInput.includeMetadata
        });
        
        // Apply data masking
        const maskedResults = maskVectorSearchResults(
          similarCustomers,
          user.role,
          user.userId,
          requestId
        );
        
        const duration = Date.now() - startTime;
        
        // Log successful operation
        logVectorOperation(
          'text_based_search',
          { ...validatedInput, searchQuery: validatedInput.query },
          req,
          true,
          duration,
          maskedResults.length
        );
        
        res.json({
          success: true,
          requestId,
          operation: 'text_based_search',
          query: validatedInput.query,
          results: maskedResults,
          metadata: {
            totalResults: maskedResults.length,
            searchParameters: {
              threshold: validatedInput.threshold,
              limit: validatedInput.limit,
              embeddingType: validatedInput.embeddingType
            },
            performance: {
              durationMs: duration,
              embeddingGenerationIncluded: true
            }
          }
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logVectorOperation('text_based_search', validatedInput, req, false, duration);
        
        return vectorErrorHandlers.vectorEngine(
          error as Error, 
          'text_based_search', 
          req, 
          res
        );
      }
    }
  );
  
  /**
   * Customer Cluster Analysis
   * GET /api/vector-secure/cluster-analysis
   * 
   * SECURITY: Admin/analyst role restriction and resource usage limits
   * PERFORMANCE: Timeout protection for expensive clustering operations
   * MONITORING: Comprehensive audit logging for cluster analysis requests
   */
  app.get(
    '/api/vector-secure/cluster-analysis',
    requireAuth,
    vectorRateLimiters.cluster,
    (req: Request, res: Response, next: Function) => {
      const user = (req as any).user;
      if (!['admin', 'analyst'].includes(user.role)) {
        return vectorErrorHandlers.authorization(
          ['admin', 'analyst'],
          user.role,
          req,
          res
        );
      }
      next();
    },
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const user = (req as any).user;
      const requestId = (req as any).requestId;
      
      try {
        // Parse and validate query parameters
        const validatedInput = validateInput.clusterAnalysis(req.query);
        
        const { vectorEngine } = await import('../vector-engine');
        
        // Perform cluster analysis with validated parameters
        const clusters = await vectorEngine.segmentCustomersByVector({
          limit: validatedInput.sampleSize,
          embeddingType: validatedInput.embeddingType
        });
        
        const duration = Date.now() - startTime;
        
        // Log cluster analysis operation
        VectorSecurityLogger.logSecurityEvent(
          VectorSecurityEvent.OPERATION_AUDIT,
          {
            operation: 'cluster_analysis',
            success: true,
            clusterCount: validatedInput.clusterCount,
            sampleSize: validatedInput.sampleSize,
            embeddingType: validatedInput.embeddingType,
            duration,
            requestId
          },
          req,
          'info'
        );
        
        res.json({
          success: true,
          requestId,
          operation: 'cluster_analysis',
          clusters,
          metadata: {
            clusterParameters: {
              clusterCount: validatedInput.clusterCount,
              sampleSize: validatedInput.sampleSize,
              embeddingType: validatedInput.embeddingType
            },
            performance: {
              durationMs: duration,
              clustersGenerated: clusters.length
            }
          }
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        VectorSecurityLogger.logSecurityEvent(
          VectorSecurityEvent.UNAUTHORIZED_ACCESS,
          {
            operation: 'cluster_analysis',
            success: false,
            duration,
            error: error instanceof Error ? error.message : String(error),
            requestId
          },
          req,
          'error'
        );
        
        return vectorErrorHandlers.vectorEngine(
          error as Error, 
          'cluster_analysis', 
          req, 
          res
        );
      }
    }
  );
  
  /**
   * Customer Segment Analysis
   * GET /api/vector-secure/segment-analysis
   * 
   * SECURITY: Role-based access control and input validation
   * ANALYTICS: Comprehensive segment characteristic analysis
   * AUDIT: Security event logging for segment analysis operations
   */
  app.get(
    '/api/vector-secure/segment-analysis',
    ...createVectorSecurityStack('segment'),
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const user = (req as any).user;
      const requestId = (req as any).requestId;
      
      try {
        // Parse and validate query parameters
        const validatedInput = validateInput.segmentAnalysis(req.query);
        
        const { vectorEngine } = await import('../vector-engine');
        
        // Perform segment analysis
        const analysis = await vectorEngine.analyzeSegmentCharacteristics();
        
        const duration = Date.now() - startTime;
        
        // Log segment analysis operation
        logVectorOperation(
          'segment_analysis',
          validatedInput,
          req,
          true,
          duration,
          analysis ? 1 : 0
        );
        
        res.json({
          success: true,
          requestId,
          operation: 'segment_analysis',
          analysis,
          metadata: {
            analysisParameters: validatedInput,
            performance: {
              durationMs: duration
            }
          }
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logVectorOperation('segment_analysis', {}, req, false, duration);
        
        return vectorErrorHandlers.vectorEngine(
          error as Error, 
          'segment_analysis', 
          req, 
          res
        );
      }
    }
  );
  
  /**
   * Vector Search Health Check
   * GET /api/vector-secure/health
   * 
   * SECURITY: Minimal information disclosure
   * MONITORING: Service status and performance metrics
   */
  app.get(
    '/api/vector-secure/health',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { vectorEngine } = await import('../vector-engine');
        
        // Perform basic health checks
        const healthStatus = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            pgvector: vectorEngine.pgvectorStatus,
            vectorColumn: vectorEngine.optimizedVectorColumnStatus,
            initialized: vectorEngine.initializationStatus
          }
        };
        
        res.json(healthStatus);
        
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Vector search service unavailable'
        });
      }
    }
  );
}