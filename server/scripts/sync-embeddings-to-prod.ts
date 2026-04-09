/**
 * Sync Customer Embeddings from Dev to Production (Optimized)
 * 
 * Syncs the customer_embeddings table from development database to production database.
 * Uses PROD_DATABASE_URL secret for production connection.
 * 
 * Usage: npx tsx server/scripts/sync-embeddings-to-prod.ts
 */

import { Pool } from 'pg';

const BATCH_SIZE = 5000;

async function syncEmbeddingsToProd() {
  const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });

  const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5
  });

  try {
    console.log('🔄 Starting customer_embeddings sync from dev to prod...\n');

    // Verify connections
    console.log('📡 Testing database connections...');
    await devPool.query('SELECT 1');
    await prodPool.query('SELECT 1');
    console.log('✅ Both databases connected\n');

    // Get dev data count
    const devCount = await devPool.query(`
      SELECT COUNT(*) as count FROM customer_embeddings
    `);
    const totalRows = parseInt(devCount.rows[0].count);
    console.log(`📊 Dev database has ${totalRows.toLocaleString()} embeddings\n`);

    // Truncate prod table
    console.log('🗑️  Clearing production table...');
    await prodPool.query('TRUNCATE TABLE customer_embeddings CASCADE');
    console.log('✅ Production table cleared\n');

    // Sync data in batches using bulk INSERT
    console.log(`📦 Syncing ${totalRows.toLocaleString()} rows in batches of ${BATCH_SIZE}...\n`);
    
    let offset = 0;
    let totalSynced = 0;
    const startTime = Date.now();

    while (offset < totalRows) {
      // Fetch batch from dev
      const batch = await devPool.query(`
        SELECT 
          id,
          customer_id,
          embedding,
          embedding_vector,
          embedding_type,
          profile_text_hash,
          last_generated_at
        FROM customer_embeddings
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (batch.rows.length === 0) break;

      // Build bulk INSERT query
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      batch.rows.forEach((row, idx) => {
        const rowPlaceholders = [
          `$${paramIndex++}`,   // id
          `$${paramIndex++}`,   // customer_id
          `$${paramIndex++}`,   // embedding
          `$${paramIndex++}`,   // embedding_vector
          `$${paramIndex++}`,   // embedding_type
          `$${paramIndex++}`,   // profile_text_hash
          `$${paramIndex++}`    // last_generated_at
        ];
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        
        values.push(
          row.id,
          row.customer_id,
          row.embedding,
          row.embedding_vector,
          row.embedding_type,
          row.profile_text_hash,
          row.last_generated_at
        );
      });

      // Execute bulk INSERT
      await prodPool.query(`
        INSERT INTO customer_embeddings (
          id,
          customer_id,
          embedding,
          embedding_vector,
          embedding_type,
          profile_text_hash,
          last_generated_at
        ) VALUES ${placeholders.join(', ')}
      `, values);

      totalSynced += batch.rows.length;
      offset += BATCH_SIZE;

      const progress = ((totalSynced / totalRows) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (totalSynced / parseFloat(elapsed)).toFixed(0);
      console.log(`✓ Synced ${totalSynced.toLocaleString()} / ${totalRows.toLocaleString()} (${progress}%) - ${rate} rows/sec`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Sync complete!`);
    console.log(`   Total rows synced: ${totalSynced.toLocaleString()}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Average: ${(totalSynced / parseFloat(duration)).toFixed(0)} rows/sec`);

    // Verify sync
    console.log('\n🔍 Verifying sync...');
    const prodCount = await prodPool.query('SELECT COUNT(*) as count FROM customer_embeddings');
    const prodTotal = parseInt(prodCount.rows[0].count);

    const prodOptimized = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding_vector) as optimized
      FROM customer_embeddings
    `);
    
    console.log(`\n📊 Production database stats:`);
    console.log(`   Total embeddings: ${prodTotal.toLocaleString()}`);
    console.log(`   Optimized (embedding_vector): ${prodOptimized.rows[0].optimized}`);
    console.log(`   Coverage: ${((prodOptimized.rows[0].optimized / prodTotal) * 100).toFixed(1)}%`);

    if (prodTotal === totalRows) {
      console.log('\n✅ Verification passed! Row counts match.');
    } else {
      console.log(`\n⚠️  Warning: Row count mismatch!`);
      console.log(`   Dev: ${totalRows}, Prod: ${prodTotal}`);
    }

  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

// Run sync
syncEmbeddingsToProd()
  .then(() => {
    console.log('\n🎉 Sync script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Sync script failed:', error);
    process.exit(1);
  });
