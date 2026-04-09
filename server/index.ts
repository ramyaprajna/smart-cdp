/**
 * Smart CDP Platform - Main Application Entry Point
 *
 * This is the primary server entry point for the Smart Customer Data Platform.
 * Initializes the Express application, middleware stack, request logging,
 * and all core services required for the CDP to function.
 *
 * @module ServerIndex
 * @created Initial implementation
 * @last_updated August 5, 2025
 *
 * @dependencies
 * - routes - Application route registration and API endpoints
 * - vite - Development server setup and static file serving
 *
 * @services_initialized
 * - Express web server on port 5000 (only non-firewalled port)
 * - Request/response logging middleware for API debugging
 * - Development mode: Vite dev server with HMR
 * - Production mode: Static file serving
 * - Cache warming service for analytics performance
 * - Archive schema and flexible CDP initialization
 *
 * @architecture_notes
 * - Single port setup (5000) serves both API and frontend
 * - Request logging captures API calls with timing and response data
 * - Error handling middleware for consistent error responses
 * - Vite integration only in development for optimal production builds
 */
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { registerRoutes } from "./routes";
// Import serveStatic dynamically to avoid vite.config.ts loading
// import { serveStatic, log } from "./vite";
import { apiMonitoringService } from "./services/api-monitoring-service";
import { productionGuardMiddleware } from "./middleware/production-guard";
import { EnvironmentSecurity } from "./utils/environment-security";
import { secureLogger } from "./utils/secure-logger";

// ========================================================================
// CRITICAL SECURITY VALIDATION - MUST RUN BEFORE ANY SERVER INITIALIZATION
// ========================================================================

const validationResult = EnvironmentSecurity.validateEnvironment();

if (!validationResult.isValid) {
  secureLogger.error('🚨 CRITICAL SECURITY FAILURE - APPLICATION STARTUP BLOCKED', {
    environment: validationResult.environment,
    securityLevel: validationResult.securityLevel.toUpperCase(),
    criticalIssues: validationResult.errors,
    warnings: validationResult.warnings,
    requiredActions: [
      'Set all required environment variables',
      'Use secure values for JWT_SECRET (minimum 32 characters)',
      'Set NODE_ENV=production for production deployment',
      'Run security validation: node scripts/production-security-validator.cjs'
    ]
  });
  
  process.exit(1); // Fail-fast for security issues
}

// Log successful security validation
if (validationResult.securityLevel === 'safe') {
  secureLogger.info(`Security validation passed`, { environment: validationResult.environment });
} else if (validationResult.securityLevel === 'warning') {
  secureLogger.warn(`Security validation passed with warnings`, {
    environment: validationResult.environment,
    warnings: validationResult.warnings
  });
}

// ========================================================================
// EXPRESS APPLICATION INITIALIZATION
// ========================================================================

import { createBaseApp } from "./app";
const app = createBaseApp();

// Safe static file serving that doesn't depend on server/vite.ts
function safeServeStatic(app: express.Express) {
  // Try different potential distribution directories
  const distPaths = [
    path.resolve(import.meta.dirname, 'public'),
    path.resolve(import.meta.dirname, '..', 'client', 'dist'),
    path.resolve(import.meta.dirname, '..', 'dist', 'public')
  ];

  let distPath: string | null = null;
  for (const candidate of distPaths) {
    if (fs.existsSync(candidate)) {
      distPath = candidate;
      break;
    }
  }

  if (distPath) {
    secureLogger.info(`Serving static files`, { path: distPath });
    app.use(express.static(distPath));
    
    // Serve index.html for SPA routes
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      app.use('*', (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      app.use('*', (req, res) => {
        res.status(200).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Application</title></head>
            <body>
              <h1>Backend is running</h1>
              <p>Frontend assets not found. Please build the client or install devDependencies.</p>
            </body>
          </html>
        `);
      });
    }
  } else {
    secureLogger.warn(`No static files found, serving minimal fallback`);
    app.use('*', (req, res) => {
      res.status(503).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Service Unavailable</title></head>
          <body>
            <h1>Service Temporarily Unavailable</h1>
            <p>Frontend not built and Vite unavailable.</p>
            <p>Please install devDependencies or run a build.</p>
          </body>
        </html>
      `);
    });
  }
}

// Security Headers - Critical for Customer Data Platform protection
app.use(helmet({
  // Content Security Policy - Protects against XSS attacks
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Allow inline scripts for Vite development and production builds
        "'unsafe-inline'",
        // Allow eval for Vite HMR in development
        ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : [])
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'" // Required for Tailwind CSS and component styles
      ],
      imgSrc: [
        "'self'",
        "data:", // Allow data URLs for inline images
        "https:" // Allow HTTPS images
      ],
      connectSrc: [
        "'self'",
        // Allow WebSocket connections for development HMR
        ...(process.env.NODE_ENV === "development" ? ["ws:", "wss:"] : [])
      ],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"], // Block object/embed/applet
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"], // Prevent iframe embedding completely
      childSrc: ["'none'"], // Block web workers and nested contexts
      formAction: ["'self'"], // Restrict form submissions
      baseUri: ["'self'"], // Prevent base tag injection
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  // HTTP Strict Transport Security - Force HTTPS in production
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  // Prevent clickjacking attacks
  frameguard: {
    action: 'deny' // Completely deny iframe embedding
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Hide Express.js version information
  hidePoweredBy: true,
  // Control referrer information leakage
  referrerPolicy: {
    policy: ['same-origin'] // Only send referrer to same origin
  },
  // Prevent DNS prefetching
  dnsPrefetchControl: {
    allow: false
  },
  // Prevent IE from executing downloads in site's context
  ieNoOpen: true
}));

// Production environment protection
app.use(productionGuardMiddleware);

// API monitoring middleware for performance tracking and diagnostics
app.use(apiMonitoringService.monitor());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      secureLogger.info(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize application logger with storage
  const { applicationLogger } = await import('./services/application-logger');
  const { storage } = await import('./storage');

  await applicationLogger.initialize(storage);

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
      applicationLogger.info('system', 'Vite development server started with HMR');
    } catch (error) {
      applicationLogger.warn('system', `Vite not available, falling back to static file serving: ${error instanceof Error ? error.message : String(error)}`);
      safeServeStatic(app);
    }
  } else {
    try {
      const { serveStatic } = await import("./vite");
      serveStatic(app);
      applicationLogger.info('system', 'Production static files served via Vite');
    } catch (error) {
      applicationLogger.warn('system', `Vite serveStatic not available, using fallback: ${error instanceof Error ? error.message : String(error)}`);
      safeServeStatic(app);
    }
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    applicationLogger.info('system', `Server listening on port ${port}`);

    // Initialize cache warming after server starts
    try {
      const { CacheWarmingService } = await import('./cache-warming');
      const cacheWarmer = CacheWarmingService.getInstance();

      // Warm cache immediately on startup
      await cacheWarmer.warmAnalyticsCache();

      // Schedule periodic warming
      await cacheWarmer.schedulePeriodicWarming();

      applicationLogger.info('system', 'Cache warming service initialized');
    } catch (error) {
      applicationLogger.error('system', `Failed to initialize cache warming: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize Flexible CDP Schema Registry
    try {
      const { schemaRegistryService } = await import('./services/schema-registry-service');
      await schemaRegistryService.initializeSchemas();
    } catch (error) {
      applicationLogger.error('system', `Failed to initialize schema registry: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize Embedding Watchdog Service
    try {
      const { EmbeddingWatchdogService } = await import('./services/embedding-watchdog-service');
      const watchdogService = EmbeddingWatchdogService.getInstance();
      await watchdogService.start();
      applicationLogger.info('system', 'Embedding Watchdog Service initialized');
    } catch (error) {
      applicationLogger.error('system', `Failed to initialize embedding watchdog: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize Token Bucket Rate Limiter
    try {
      const { initializeRateLimiter } = await import('./services/token-bucket-rate-limiter');
      await initializeRateLimiter();
      applicationLogger.info('system', 'Token Bucket Rate Limiter initialized');
    } catch (error) {
      applicationLogger.error('system', `Failed to initialize rate limiter: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize Concurrent Batch Manager
    try {
      const { initializeConcurrentBatchManager } = await import('./services/concurrent-batch-manager');
      await initializeConcurrentBatchManager();
      applicationLogger.info('system', 'Concurrent Batch Manager initialized');
    } catch (error) {
      applicationLogger.error('system', `Failed to initialize concurrent batch manager: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
})();
