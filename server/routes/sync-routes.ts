/**
 * Database Sync Routes
 * 
 * Background sync of customer_embeddings from dev to prod
 */

import { Express, Request, Response } from 'express';
import { requireAuth } from '../jwt-utils';
import { Pool } from 'pg';
import { secureLogger } from '../utils/secure-logger';

let syncInProgress = false;
let syncStatus = {
  isRunning: false,
  totalRows: 0,
  syncedRows: 0,
  currentBatch: 0,
  startTime: null as Date | null,
  endTime: null as Date | null,
  error: null as string | null,
  speed: 0
};

export function setupSyncRoutes(app: Express) {
  
  /**
   * Start background sync from dev to prod
   */
  app.post('/api/admin/sync-to-prod', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (syncInProgress) {
      return res.json({
        message: 'Sync already in progress',
        status: syncStatus
      });
    }
    
    // Start sync in background
    syncInProgress = true;
    syncStatus = {
      isRunning: true,
      totalRows: 0,
      syncedRows: 0,
      currentBatch: 0,
      startTime: new Date(),
      endTime: null,
      error: null,
      speed: 0
    };
    
    // Run sync asynchronously
    runSync().catch(error => {
      secureLogger.error('Sync error:', error);
      syncStatus.error = error.message;
    }).finally(() => {
      syncInProgress = false;
      syncStatus.isRunning = false;
      syncStatus.endTime = new Date();
    });
    
    res.json({
      message: 'Sync started in background',
      status: syncStatus
    });
  });
  
  /**
   * Get sync status
   */
  app.get('/api/admin/sync-to-prod/status', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Calculate progress percentage
    const progress = syncStatus.totalRows > 0 
      ? ((syncStatus.syncedRows / syncStatus.totalRows) * 100).toFixed(1)
      : 0;
    
    res.json({
      status: {
        ...syncStatus,
        progress: `${progress}%`,
        formattedSynced: syncStatus.syncedRows.toLocaleString(),
        formattedTotal: syncStatus.totalRows.toLocaleString()
      },
      isRunning: syncInProgress
    });
  });
}

async function runSync() {
  const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });

  const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5
  });

  const BATCH_SIZE = 5000;

  try {
    secureLogger.info('🔄 Background sync started');
    
    // Get total count
    const countResult = await devPool.query('SELECT COUNT(*) FROM customer_embeddings');
    syncStatus.totalRows = parseInt(countResult.rows[0].count);
    
    // Clear prod
    await prodPool.query('TRUNCATE TABLE customer_embeddings CASCADE');
    
    let offset = 0;
    const startTime = Date.now();
    
    while (offset < syncStatus.totalRows) {
      syncStatus.currentBatch++;
      
      // Fetch batch from dev
      const batch = await devPool.query(`
        SELECT 
          id, customer_id, embedding, embedding_vector,
          embedding_type, profile_text_hash, last_generated_at
        FROM customer_embeddings
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (batch.rows.length === 0) break;

      // Build bulk INSERT
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      batch.rows.forEach((row) => {
        const rowPlaceholders = [
          `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`, 
          `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`
        ];
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        values.push(
          row.id, row.customer_id, row.embedding, row.embedding_vector,
          row.embedding_type, row.profile_text_hash, row.last_generated_at
        );
      });

      // Execute bulk INSERT
      await prodPool.query(`
        INSERT INTO customer_embeddings (
          id, customer_id, embedding, embedding_vector,
          embedding_type, profile_text_hash, last_generated_at
        ) VALUES ${placeholders.join(', ')}
      `, values);

      syncStatus.syncedRows += batch.rows.length;
      offset += BATCH_SIZE;
      
      // Update speed
      const elapsed = (Date.now() - startTime) / 1000;
      syncStatus.speed = Math.round(syncStatus.syncedRows / elapsed);
      
      secureLogger.info(`✓ Synced ${syncStatus.syncedRows.toLocaleString()} / ${syncStatus.totalRows.toLocaleString()} (${((syncStatus.syncedRows / syncStatus.totalRows) * 100).toFixed(1)}%) - ${syncStatus.speed} rows/sec`);
    }
    
    secureLogger.info(`✅ Sync complete! Total: ${syncStatus.syncedRows.toLocaleString()} rows`);
    
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}
