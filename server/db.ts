/**
 * ⚠️ CRITICAL FILE - DATABASE CONNECTION - DO NOT DELETE ⚠️
 *
 * Core database connection configuration for the Smart CDP Platform.
 * This file establishes the primary database connection used throughout
 * the entire application for all data operations.
 *
 * Dependencies: Neon serverless PostgreSQL, Drizzle ORM
 * Last Updated: September 15, 2025 - Added connection pooling limits
 * 
 * CONNECTION POOLING STRATEGY:
 * - Main pool: 5 connections (handles most application queries)
 * - Archive pool: 5 connections (isolated for archive operations)
 * - Embedding pool: 3 connections (background processing)
 * - Vector engine: 2 connections (specialized vector operations)
 * - Total: 15 connections (stays under Neon's 20 connection limit)
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Security: Never log the actual DATABASE_URL value
import { secureLogger } from './utils/secure-logger';

const dbUrlStatus = process.env.DATABASE_URL ? '[CONFIGURED]' : '[NOT_SET]';
secureLogger.info(`🔐 Database connection ${dbUrlStatus}`, 
  { 
    connectionPoolSize: 5,
    dbConfigured: !!process.env.DATABASE_URL 
  }, 
  'DB_CONNECTION'
);

// Main connection pool with optimized settings for Neon
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,                        // Maximum 5 connections in pool
  idleTimeoutMillis: 30000,       // Remove idle connections after 30 seconds
  connectionTimeoutMillis: 10000   // Connection timeout after 10 seconds
});

export const db = drizzle({ client: pool, schema });
