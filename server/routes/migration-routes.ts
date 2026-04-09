/**
 * Migration Routes
 * 
 * Admin-only routes for running database migrations
 */

import { Express, Request, Response } from 'express';
import { requireAuth } from '../jwt-utils';
import { Pool } from 'pg';
import { secureLogger } from '../utils/secure-logger';

let migrationInProgress = false;
let migrationStatus = {
  isRunning: false,
  totalUpdated: 0,
  currentBatch: 0,
  startTime: null as Date | null,
  endTime: null as Date | null,
  error: null as string | null
};

export function setupMigrationRoutes(app: Express) {
  
  /**
   * Start embedding migration
   * POST /api/admin/migrate-embeddings
   */
  app.post('/api/admin/migrate-embeddings', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    // Admin only
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (migrationInProgress) {
      return res.json({
        message: 'Migration already in progress',
        status: migrationStatus
      });
    }
    
    // Start migration in background
    migrationInProgress = true;
    migrationStatus = {
      isRunning: true,
      totalUpdated: 0,
      currentBatch: 0,
      startTime: new Date(),
      endTime: null,
      error: null
    };
    
    // Run migration asynchronously
    runMigration().catch(error => {
      secureLogger.error('Migration error:', error);
      migrationStatus.error = error.message;
    }).finally(() => {
      migrationInProgress = false;
      migrationStatus.isRunning = false;
      migrationStatus.endTime = new Date();
    });
    
    res.json({
      message: 'Migration started',
      status: migrationStatus
    });
  });
  
  /**
   * Get migration status
   * GET /api/admin/migrate-embeddings/status
   */
  app.get('/api/admin/migrate-embeddings/status', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    res.json({
      status: migrationStatus,
      isRunning: migrationInProgress
    });
  });
}

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });

  const BATCH_SIZE = 5000;
  const DELAY_MS = 100;

  try {
    secureLogger.info('🚀 Background migration started');
    
    while (true) {
      migrationStatus.currentBatch++;
      
      const result = await pool.query(`
        UPDATE customer_embeddings
        SET embedding_vector = embedding::vector
        WHERE id IN (
          SELECT id 
          FROM customer_embeddings
          WHERE embedding_vector IS NULL 
            AND embedding IS NOT NULL
          LIMIT $1
        )
      `, [BATCH_SIZE]);
      
      const rowsUpdated = result.rowCount || 0;
      migrationStatus.totalUpdated += rowsUpdated;
      
      secureLogger.info(`✓ Batch ${migrationStatus.currentBatch}: Updated ${rowsUpdated} rows (Total: ${migrationStatus.totalUpdated})`);
      
      if (rowsUpdated === 0) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
    
    secureLogger.info(`✅ Migration complete! Total: ${migrationStatus.totalUpdated} rows`);
    
  } finally {
    await pool.end();
  }
}
