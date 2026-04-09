/**
 * Embedding Migration Script
 * 
 * Migrates legacy embeddings from `embedding` column to optimized `embedding_vector` column
 * for pgvector HNSW index support and improved similarity search performance.
 * 
 * Usage: npm run ts-node server/scripts/migrate-embeddings-to-vector.ts
 */

import { Pool } from 'pg';

const BATCH_SIZE = 5000;
const DELAY_BETWEEN_BATCHES_MS = 100;

async function migrateEmbeddings() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });

  try {
    console.log('🚀 Starting embedding migration...');
    console.log(`📊 Batch size: ${BATCH_SIZE} rows`);
    
    // Check current state
    const countResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding_vector) as already_optimized,
        COUNT(*) - COUNT(embedding_vector) as needs_migration
      FROM customer_embeddings
    `);
    
    const stats = countResult.rows[0];
    console.log(`\n📈 Current state:`);
    console.log(`   Total embeddings: ${stats.total}`);
    console.log(`   Already optimized: ${stats.already_optimized}`);
    console.log(`   Needs migration: ${stats.needs_migration}\n`);
    
    if (parseInt(stats.needs_migration) === 0) {
      console.log('✅ No migration needed - all embeddings already optimized!');
      await pool.end();
      return;
    }

    let totalUpdated = 0;
    let batchNum = 0;
    const startTime = Date.now();

    while (true) {
      batchNum++;
      
      // Update one batch
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
      totalUpdated += rowsUpdated;
      
      console.log(`✓ Batch ${batchNum}: Updated ${rowsUpdated} rows (Total: ${totalUpdated})`);
      
      // Exit when no more rows to update
      if (rowsUpdated === 0) {
        break;
      }
      
      // Small delay to prevent resource starvation
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Migration complete!`);
    console.log(`   Total rows updated: ${totalUpdated}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Average: ${(totalUpdated / parseFloat(duration)).toFixed(0)} rows/sec`);
    
    // Verify final state
    const finalResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding_vector) as optimized
      FROM customer_embeddings
    `);
    
    const finalStats = finalResult.rows[0];
    console.log(`\n📊 Final state:`);
    console.log(`   Total embeddings: ${finalStats.total}`);
    console.log(`   Optimized: ${finalStats.optimized}`);
    console.log(`   Coverage: ${((finalStats.optimized / finalStats.total) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
migrateEmbeddings()
  .then(() => {
    console.log('\n🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });
