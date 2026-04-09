/**
 * Fast Sync using PostgreSQL COPY command with temp file
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function fastSyncWithCopy() {
  const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });

  const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5
  });

  const tempFile = path.join('/tmp', `embeddings_${Date.now()}.csv`);

  try {
    console.log('🚀 Fast sync using COPY command\n');

    // Verify connections
    console.log('📡 Testing connections...');
    await devPool.query('SELECT 1');
    await prodPool.query('SELECT 1');
    console.log('✅ Connected to both databases\n');

    // Get row count
    const devCount = await devPool.query('SELECT COUNT(*) FROM customer_embeddings');
    const totalRows = parseInt(devCount.rows[0].count);
    console.log(`📊 Dev database: ${totalRows.toLocaleString()} rows\n`);

    // Export from dev to file
    console.log(`📤 Exporting from dev to temp file...`);
    const startExport = Date.now();
    
    const devClient = await devPool.connect();
    try {
      const copyStream = devClient.query(
        `COPY customer_embeddings (
          id, customer_id, embedding, embedding_vector,
          embedding_type, profile_text_hash, last_generated_at
        ) TO STDOUT WITH (FORMAT CSV, HEADER false)`
      );

      const writeStream = fs.createWriteStream(tempFile);
      
      // Write to file
      for await (const chunk of (copyStream as any)) {
        writeStream.write(chunk);
      }
      
      writeStream.end();
      await new Promise(resolve => writeStream.on('finish', resolve));
      
      const exportDuration = ((Date.now() - startExport) / 1000).toFixed(2);
      const fileSize = (fs.statSync(tempFile).size / 1024 / 1024).toFixed(2);
      console.log(`✅ Exported in ${exportDuration}s (${fileSize} MB)\n`);
      
    } finally {
      devClient.release();
    }

    // Clear prod table
    console.log('🗑️  Clearing production table...');
    await prodPool.query('TRUNCATE TABLE customer_embeddings CASCADE');
    console.log('✅ Cleared\n');

    // Import to prod from file
    console.log('📥 Importing to prod...');
    const startImport = Date.now();
    
    const prodClient = await prodPool.connect();
    try {
      const fileContent = fs.readFileSync(tempFile);
      
      await prodClient.query(
        `COPY customer_embeddings (
          id, customer_id, embedding, embedding_vector,
          embedding_type, profile_text_hash, last_generated_at
        ) FROM STDIN WITH (FORMAT CSV, HEADER false)`,
        [fileContent]
      );
      
      const importDuration = ((Date.now() - startImport) / 1000).toFixed(2);
      console.log(`✅ Imported in ${importDuration}s\n`);
      
    } finally {
      prodClient.release();
    }

    const totalDuration = ((Date.now() - startExport) / 1000).toFixed(2);
    console.log(`⚡ Total time: ${totalDuration}s (${(totalRows / parseFloat(totalDuration)).toFixed(0)} rows/sec)`);

    // Verify
    console.log('\n🔍 Verifying...');
    const prodCount = await prodPool.query('SELECT COUNT(*) FROM customer_embeddings');
    const prodTotal = parseInt(prodCount.rows[0].count);

    const prodStats = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding_vector) as optimized
      FROM customer_embeddings
    `);

    console.log(`\n📊 Production stats:`);
    console.log(`   Total: ${prodTotal.toLocaleString()}`);
    console.log(`   Optimized: ${prodStats.rows[0].optimized}`);
    console.log(`   Coverage: ${((prodStats.rows[0].optimized / prodTotal) * 100).toFixed(1)}%`);

    if (prodTotal === totalRows) {
      console.log('\n✅ SUCCESS! Counts match perfectly.');
    } else {
      console.log(`\n⚠️  Warning: Count mismatch (Dev: ${totalRows}, Prod: ${prodTotal})`);
    }

  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
      console.log('\n🧹 Cleaned up temp file');
    }
    
    await devPool.end();
    await prodPool.end();
  }
}

fastSyncWithCopy()
  .then(() => {
    console.log('\n🎉 Fast sync completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });
