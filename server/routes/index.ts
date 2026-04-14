/**
 * Smart CDP Platform - Main Routes Configuration
 *
 * Central routing hub for the Smart Customer Data Platform API. This file contains
 * route definitions and middleware configuration, with domain-specific routes
 * extracted into separate modules for better organization.
 *
 * @module MainRoutes
 * @created Initial implementation
 * @last_updated September 18, 2025 - Comments updated to reflect current state
 *
 * @architecture
 * - Modular route organization with domain separation
 * - Centralized middleware configuration and error handling
 * - Basic caching middleware (some endpoints still slow - see performance issues)
 * - Role-based access control (admin, analyst, viewer, marketing)
 * - Rate limiting and anti-crawler protection
 *
 * @current_performance_issues
 * - Analytics endpoints frequently exceed 1000ms (embedding-status: ~1200-1700ms)
 * - Database COUNT queries taking 1000-1200ms due to table size (348K+ records)
 * - TODO: Add database indexing and query optimization for analytics routes
 * - TODO: Implement more aggressive caching for expensive operations
 *
 * @dependencies
 * - storage - Database access layer for customer data operations
 * - performance-middleware - Basic caching, rate limiting, performance monitoring
 * - auth-middleware - JWT authentication and role-based access control
 * - enhanced-error-handler - Centralized error logging with correlation IDs
 * - chatbot-service - AI-powered data analytics consultant
 * - various route modules - Domain-specific route handlers (extracted for maintainability)
 *
 * @refactoring_achievements
 * - Extracted reusable utility modules (validation-utils, response-utils)
 * - Moved domain-specific routes to separate modules
 * - Improved error handling patterns and logging
 * - Maintained backward compatibility with existing API endpoints
 */
import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { embeddingProgressWebSocket } from '../services/embedding-progress-websocket';
import { storage } from "../storage";
import { insertCustomerSchema, insertCustomerEventSchema, insertSegmentSchema, insertDataImportSchema, insertUserSchema, Customer } from "@shared/schema";
import { z } from "zod";
import { performanceMiddleware, cacheMiddleware, rateLimitMiddleware } from "../performance-middleware";
import { chatbot } from "../chatbot-service";
import { dataLineageService } from "../data-lineage-service";
import { authMiddleware } from "../auth-middleware";
import { secureLogger } from '../utils/secure-logger';
import { generateToken, verifyToken, extractTokenFromRequest, requireAuth, requireRole } from "../jwt-utils";
import { cacheManager } from "../cache";
import { errorHandler, createImportError } from "../enhanced-error-handler";
import { importErrorService } from "../services/import-error-service";
import { filePreviewService } from "../file-preview-service";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";

// Modular route handlers (extracted during refactoring for better organization)
import aiMappingRoutes from "./ai-mapping-routes";
import flexibleCdpRoutes from "./flexible-cdp-routes";
import archiveRoutes from "./archive-routes";
import validationRoutes from "./validation-routes";
import duplicateDetectionRoutes from "./duplicate-detection-routes";
import { nullRecordRoutes } from "./null-record-routes";
import importErrorRoutes from "./import-error-routes";
import fileUploadRoutes from "./file-upload-routes";
import dataLineageRoutes from "./data-lineage-routes";
import importProgressRoutes from "./import-progress-routes";
import * as logsRoutes from "./logs-routes";
import enhancedJsonImportRoutes from "./enhanced-json-import-routes";
import archiveLoggingRoutes from "./archive-logging-routes";
import { mappingReviewRoutes } from "./mapping-review-routes";
import templateRoutes from "./template-routes";
import liteCdpRoutes from "./lite-cdp-routes";
import liteCdpUploadRoutes from "./lite-cdp-upload-routes";
import { applicationLogger } from "../services/application-logger";
import { aiSegmentService } from "../services/ai-segment-service";

/**
 * Anti-Crawler Middleware
 *
 * Prevents search engine indexing and web crawler access to private customer data.
 * Essential for protecting sensitive customer information from being indexed by search engines
 * and accessed by automated web crawlers that could compromise data privacy.
 *
 * @middleware antiCrawlerMiddleware
 * @purpose Data privacy protection and crawler prevention
 * @security Prevents unauthorized data harvesting by search engines and bots
 *
 * @features
 * - Sets HTTP headers to prevent search engine indexing
 * - Blocks known crawler user agents from accessing sensitive endpoints
 * - Implements cache prevention headers for added security
 * - Returns 403 Forbidden for detected crawlers on non-API endpoints
 */
const antiCrawlerMiddleware = (req: any, res: any, next: any) => {
  // Set HTTP headers to prevent indexing
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Block known crawler user agents
  const userAgent = req.get('User-Agent') || '';
  const crawlerPatterns = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /crawler/i,
    /spider/i,
    /bot/i
  ];

  const isCrawler = crawlerPatterns.some(pattern => pattern.test(userAgent));

  if (isCrawler && !req.path.startsWith('/api/')) {
    // Return 403 for crawler requests to non-API routes
    return res.status(403).send('Access denied for web crawlers');
  }

  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoints MUST be first, before any middleware that might interfere
  // These are critical for deployment monitoring and must respond correctly

  // API health check endpoint - handles HEAD and GET requests to /api
  // This prevents authentication errors for health monitoring systems
  app.head('/api', (req, res) => {
    res.status(200).end();
  });

  app.get('/api', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'Smart CDP Platform API',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Primary health check endpoint for deployment systems
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'Smart CDP Platform',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // PRODUCTION FIX: Comprehensive health check endpoint with system diagnostics
  app.get('/api/health', async (req, res) => {
    try {
      const { healthCheckService } = await import('../utils/health-check');
      const healthStatus = await healthCheckService.checkHealth();
      
      const statusCode = healthStatus.healthy ? 200 : 503;
      
      res.status(statusCode).json({
        ...healthStatus,
        service: 'Smart CDP Platform',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      });
    } catch (error) {
      res.status(500).json({
        healthy: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // Root endpoint health check - respond to deployment monitoring but fall through for browsers
  app.get('/', (req, res, next) => {
    // Check if this is a health check request (common deployment monitoring patterns)
    const userAgent = req.get('User-Agent') || '';
    const accept = req.get('Accept') || '';

    // Health check indicators: no browser user agent, accepts JSON, or specific monitoring tools
    const isHealthCheck = !userAgent.includes('Mozilla') ||
                         accept.includes('application/json') ||
                         userAgent.includes('curl') ||
                         userAgent.includes('wget') ||
                         userAgent.includes('health') ||
                         userAgent.includes('monitor');

    if (isHealthCheck && process.env.NODE_ENV === 'production') {
      return res.status(200).json({
        status: 'healthy',
        service: 'Smart CDP Platform',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    }

    // For browsers or development mode, continue to next handler (Vite/static files)
    next();
  });

  // Apply anti-crawler middleware globally (highest priority)
  app.use(antiCrawlerMiddleware);

  // Apply performance middleware globally
  app.use(performanceMiddleware);

  // Add cookie parser middleware for JWT tokens
  app.use(cookieParser());

  // Apply enhanced error handler middleware globally
  app.use(errorHandler.middleware());

  // AI-powered column mapping routes
  app.use("/api/ai-mapping", aiMappingRoutes);

  // Flexible CDP routes for industry-specific data handling
  app.use("/api/flexible-cdp", flexibleCdpRoutes);

  // Enhanced JSON import routes (unmapped fields storage as JSON)
  app.use("/api/enhanced-json-import", enhancedJsonImportRoutes);

  // Archive Management Logging Routes
  app.use("/api/admin/logs", archiveLoggingRoutes);

  // NULL record diagnosis and fixing
  app.use("/api/null-records", nullRecordRoutes);

  // Archive management routes (admin-only)
  app.use("/api/archives", archiveRoutes);

  // Archive validation routes (admin-only)
  app.use("/api/validation", validationRoutes);

  // Duplicate Detection API Routes
  app.use("/api/duplicates", duplicateDetectionRoutes);

  // Import Error Tracking API Routes
  app.use("/api/import-errors", importErrorRoutes);

  // Embedding Management Routes
  const embeddingRoutes = await import('./embedding-routes');
  embeddingRoutes.setupEmbeddingRoutes(app);

  // Error Recovery Management Routes  
  const errorRecoveryRoutes = await import('./error-recovery-routes');
  errorRecoveryRoutes.setupErrorRecoveryRoutes(app);

  // File Upload and Processing Routes
  app.use("/api/files", fileUploadRoutes);

  // Intelligent Mapping Review Routes
  app.use("/api/mapping-review", mappingReviewRoutes);

  // Template Generation Routes
  app.use("/api/templates", templateRoutes);


  // =====================================================
  // DOMAIN ROUTE MODULES
  // Segment routes MUST come before segmentPreviewRoutes
  // =====================================================
  const { setupSegmentRoutes } = await import('./segment-routes');
  setupSegmentRoutes(app);


  // Deterministic Segmentation Engine Routes
  const { setupSegmentationEngineRoutes } = await import('./segmentation-engine-routes');
  setupSegmentationEngineRoutes(app);

  // Segment Preview Routes - Real-time segment counter for admin UI
  // IMPORTANT: Must come AFTER individual segment endpoints to prevent routing conflicts
  const segmentPreviewRoutes = await import('./segments-preview');
  app.use("/api/segments", segmentPreviewRoutes.default);

  // Data Lineage and Import Management Routes
  app.use("/api/data-lineage", dataLineageRoutes);
  app.use("/api/imports", importProgressRoutes);

  // Lite CDP v2 — Data-First Architecture routes
  app.use("/api/lite-cdp", liteCdpRoutes);
  app.use("/api/lite-cdp", liteCdpUploadRoutes);





  // Serve robots.txt with explicit anti-crawler directive
  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.send(`# Smart CDP Platform - Web Crawler Prevention
# This application contains private customer data and should not be indexed

User-agent: *
Disallow: /

# Explicitly disallow major search engine crawlers
User-agent: Googlebot
Disallow: /

User-agent: Bingbot
Disallow: /

User-agent: Slurp
Disallow: /

User-agent: DuckDuckBot
Disallow: /

User-agent: Baiduspider
Disallow: /

User-agent: YandexBot
Disallow: /

User-agent: facebookexternalhit
Disallow: /

User-agent: Twitterbot
Disallow: /

User-agent: LinkedInBot
Disallow: /

# No sitemap provided as we don't want any indexing`);
  });


  // Auth, Customer, Chatbot, User, and Import domain routes
  const { setupAuthRoutes } = await import('./auth-routes');
  setupAuthRoutes(app);

  const { setupCustomerRoutes } = await import('./customer-routes');
  setupCustomerRoutes(app);

  const { setupChatbotRoutes } = await import('./chatbot-routes');
  setupChatbotRoutes(app);

  const { setupUserRoutes } = await import('./user-routes');
  setupUserRoutes(app);

  const { setupImportRoutes } = await import('./import-routes');
  setupImportRoutes(app);

  const { setupIngestRoutes } = await import('./ingest-routes');
  setupIngestRoutes(app);

  // Universal Data Landing Zone — accepts ANY data without customer anchor
  const { setupRawIngestRoutes } = await import('./raw-ingest-routes');
  setupRawIngestRoutes(app);

  // AI Schema Proposer, Dynamic Tables, Late Binding, Anonymous Analytics
  const { setupSchemaRoutes } = await import('./schema-routes');
  setupSchemaRoutes(app);

  // CDP Phase 2A: Consent & Suppression routes
  const { setupConsentRoutes } = await import('./consent-routes');
  setupConsentRoutes(app);

  // CDP Phase 2B: Point Ledger & Loyalty routes
  const { setupLoyaltyRoutes } = await import('./loyalty-routes');
  setupLoyaltyRoutes(app);

  // CDP Phase 2C: Campaign Management routes
  const { setupCampaignRoutes } = await import('./campaign-routes');
  setupCampaignRoutes(app);

  // CDP Phase 2D: WABA Channel Integration routes
  const { setupWabaWebhookRoutes } = await import('./waba-webhook-routes');
  setupWabaWebhookRoutes(app);

  // CDP Phase 2E: Scoring & Analytics Engine routes
  const { setupScoringRoutes } = await import('./scoring-routes');
  setupScoringRoutes(app);

  // CDP Phase 2E: Start batch scoring scheduler (recalculates every 6 hours)
  const { scoringEngine } = await import('./scoring-scheduler');
  scoringEngine.startScheduler();



  // SECURITY: Legacy vector endpoints disabled for security compliance
  // These endpoints have been deprecated due to security vulnerabilities:
  // - Missing input validation and sanitization
  // - No rate limiting or DoS protection
  // - Lack of comprehensive audit logging
  // - Missing data masking and privacy controls
  // - Insufficient error handling with potential information disclosure
  
  // Return 410 Gone for all legacy vector endpoints with migration guidance
  const legacyVectorEndpointHandler = (req: any, res: any) => {
    res.status(410).json({
      error: 'Legacy vector endpoint discontinued',
      code: 'ENDPOINT_DEPRECATED',
      message: 'This endpoint has been permanently disabled due to security vulnerabilities.',
      migration: {
        reason: 'Security hardening: Legacy endpoints lacked proper input validation, rate limiting, and audit logging.',
        newEndpoints: {
          'POST /api/vector/find-similar/:id': 'POST /api/vector-secure/find-similar/:customerId',
          'GET /api/vector/segment-analysis': 'GET /api/vector-secure/segment-analysis',
          'GET /api/vector/cluster-analysis': 'GET /api/vector-secure/cluster-analysis',
          'POST /api/vector/search': 'POST /api/vector-secure/search'
        },
        documentation: 'See secure vector API documentation for proper authentication and input validation requirements.',
        securityFeatures: [
          'Comprehensive input validation with Zod schemas',
          'Specialized rate limiting for vector operations',
          'Secure error handling with unique tracking IDs',
          'Data masking and privacy controls',
          'Audit logging for security events',
          'Request timeout and DoS protection'
        ]
      },
      timestamp: new Date().toISOString(),
      supportContact: 'Please update your client to use the secure endpoints under /api/vector-secure/*'
    });
  };
  
  app.get("/api/vector/segment-analysis", legacyVectorEndpointHandler);
  app.post("/api/vector/find-similar/:id", legacyVectorEndpointHandler);
  app.get("/api/vector/cluster-analysis", legacyVectorEndpointHandler);
  app.post("/api/vector/search", legacyVectorEndpointHandler);
  
  // ENTERPRISE SECURITY: Secure Vector Search Routes
  // Comprehensive security hardening with input validation, rate limiting,
  // data masking, audit logging, and protection against common attack vectors
  const { setupSecureVectorRoutes } = await import('./secure-vector-routes');
  setupSecureVectorRoutes(app);



  // Comprehensive logging system test endpoint (development only)
  if (process.env.NODE_ENV === 'development') {
    app.post('/api/test/logs/comprehensive', requireAuth, async (req, res) => {
      try {

        // Test 1: Basic logging levels
        await applicationLogger.debug('system', 'Debug level test message', { test: 'debug_validation' });
        await applicationLogger.info('system', 'Info level test message', { test: 'info_validation' });
        await applicationLogger.warn('system', 'Warning level test message', { test: 'warn_validation' });

        // Test 2: Error logging with stack trace
        const testError = new Error('Test error for logging validation');
        await applicationLogger.error('system', 'Error level test message', testError, { test: 'error_validation' });
        await applicationLogger.error('system', 'Critical level test message', testError, { test: 'critical_validation' }, req);

        // Test 3: Category-specific logs
        await applicationLogger.info('email', 'Test email log', { recipient: 'test@example.com', template: 'activation' });
        await applicationLogger.info('authentication', 'Test authentication log', { email: 'test@example.com', ip: '127.0.0.1' });
        await applicationLogger.info('database', 'Database test operation completed', { operation: 'SELECT', table: 'customers', duration: '25ms' });
        await applicationLogger.info('api', 'API test log', { endpoint: '/api/test', method: 'POST', status: 200, responseTime: '150ms' });
        await applicationLogger.info('import', 'Import processing test', { filename: 'test.xlsx', records: 100, status: 'processing' });
        await applicationLogger.info('vector', 'Vector similarity search test', { operation: 'similarity_search', query: 'test query', results: 5 });
        await applicationLogger.info('security', 'Test security event', { event: 'suspicious_activity', ip: '192.168.1.1' });

        // Test 4: User-specific logs with session context
        const userId = req.user?.id || null;
        await applicationLogger.info('system', 'User-specific test log', {
          test: 'user_association',
          hasUser: !!req.user,
          userRole: req.user?.role
        }, req);

        // Test 5: Complex metadata
        await applicationLogger.info('system', 'Complex metadata test', {
          nested: {
            data: {
              level1: 'test',
              level2: {
                numbers: [1, 2, 3],
                boolean: true,
                timestamp: new Date().toISOString()
              }
            }
          },
          array: ['item1', 'item2', 'item3'],
          metrics: {
            duration: 150,
            memory_usage: '45MB',
            cpu_usage: '12%'
          }
        });


        res.json({
          success: true,
          message: 'Comprehensive test logs created successfully',
          logs_created: 13,
          categories_tested: ['system', 'email', 'authentication', 'database', 'api', 'import', 'vector', 'security'],
          levels_tested: ['debug', 'info', 'warn', 'error', 'critical']
        });

      } catch (error) {
        secureLogger.error('❌ Failed to create test logs:', { error: String(error) });
        await applicationLogger.error('system', 'Failed to create comprehensive test logs', error as Error, {
          test: 'test_creation_error'
        });

        res.status(500).json({
          success: false,
          error: 'Failed to create test logs',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
  // Cache health check endpoint
  app.get('/api/health/cache', async (req, res) => {
    try {
      const startTime = Date.now();

      // Test cache performance
      const [stats, distribution] = await Promise.all([
        storage.getCustomerStats(),
        storage.getSegmentDistribution()
      ]);

      const responseTime = Date.now() - startTime;

      res.json({
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        cacheStatus: responseTime < 100 ? 'warmed' : 'cold',
        timestamp: new Date().toISOString(),
        data: {
          totalCustomers: stats.totalCustomers,
          segmentCount: distribution.length
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });



  // Setup analytics routes
  const { setupAnalyticsRoutes } = await import('./analytics-routes');
  setupAnalyticsRoutes(app);

  // Setup migration routes (admin-only)
  const { setupMigrationRoutes } = await import('./migration-routes');
  setupMigrationRoutes(app);

  // Setup sync routes (admin-only)
  const { setupSyncRoutes } = await import('./sync-routes');
  setupSyncRoutes(app);

  // Admin-only application logs routes
  app.get("/api/admin/logs", requireAuth, requireRole(['admin']), logsRoutes.getApplicationLogs);
  app.get("/api/admin/logs/stats", requireAuth, requireRole(['admin']), logsRoutes.getLogStats);
  app.post("/api/admin/logs/archive", requireAuth, requireRole(['admin']), logsRoutes.archiveLogs);
  app.delete("/api/admin/logs", requireAuth, requireRole(['admin']), logsRoutes.deleteLogs);

  // Enhanced Evidence-Based Logging Routes (Phase 2)
  // Error Groups Management
  app.get("/api/admin/logs/error-groups", requireAuth, requireRole(['admin']), logsRoutes.getErrorGroups);
  app.get("/api/admin/logs/error-groups/:id", requireAuth, requireRole(['admin']), logsRoutes.getErrorGroupById);
  app.put("/api/admin/logs/error-groups/:id", requireAuth, requireRole(['admin']), logsRoutes.updateErrorGroup);

  // Log Settings Management
  app.get("/api/admin/logs/settings", requireAuth, requireRole(['admin']), logsRoutes.getLogSettings);
  app.post("/api/admin/logs/settings", requireAuth, requireRole(['admin']), logsRoutes.upsertLogSetting);
  app.delete("/api/admin/logs/settings/:settingKey", requireAuth, requireRole(['admin']), logsRoutes.deleteLogSetting);

  // Log Alerts Management
  app.get("/api/admin/logs/alerts", requireAuth, requireRole(['admin']), logsRoutes.getLogAlerts);
  app.post("/api/admin/logs/alerts", requireAuth, requireRole(['admin']), logsRoutes.createLogAlert);
  app.put("/api/admin/logs/alerts/:id", requireAuth, requireRole(['admin']), logsRoutes.updateLogAlert);
  app.delete("/api/admin/logs/alerts/:id", requireAuth, requireRole(['admin']), logsRoutes.deleteLogAlert);

  // Enhanced Analytics and Health Monitoring
  app.get("/api/admin/logs/analytics", requireAuth, requireRole(['admin']), logsRoutes.getLogAnalytics);
  app.get("/api/admin/logs/health", requireAuth, requireRole(['admin']), logsRoutes.getLogHealthStatus);

  // Development-only test logs endpoint
  if (process.env.NODE_ENV !== 'production') {
    app.post("/api/admin/logs/test", requireAuth, requireRole(['admin']), logsRoutes.createTestLogs);
  }

  // Performance monitoring routes - Phase 3 Memory Optimization
  const { addPerformanceRoutes } = await import('./performance-routes');
  addPerformanceRoutes(app);


  /**
   * Catch-all handler for unknown API routes
   * 
   * CRITICAL: This MUST be placed after all API route definitions but BEFORE
   * the static file handler to properly handle 404s for API endpoints.
   * 
   * Without this handler, unknown API routes would fall through to the static
   * file handler and return HTML instead of JSON error responses.
   * 
   * @returns {Object} JSON error response with 404 status
   */
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      message: `The requested API endpoint '${req.originalUrl}' does not exist`,
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  const httpServer = createServer(app);
  
  // Initialize WebSocket service for real-time embedding progress streaming
  try {
    embeddingProgressWebSocket.initialize(httpServer);
  } catch (error) {
    secureLogger.error('❌ Failed to initialize WebSocket service:', { error: error instanceof Error ? error.message : String(error) });
  }
  
  return httpServer;
}
