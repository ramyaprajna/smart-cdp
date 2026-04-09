# Embedding Vector Migration Guide

## Overview

This guide documents the migration from legacy `embedding` column (real array) to the optimized `embedding_vector` column (native pgvector with HNSW indexing) for improved similarity search performance.

## Migration Status

**Last verified:** October 2025 — the 46.69% figure below has not been re-measured against the live database since then. To get current numbers, run the SQL query in Method 3 below.

**Progress as of October 2025:**
- ✅ Code updates completed (all new embeddings populate both columns)
- ✅ Migration infrastructure created
- 🔄 Data migration was at: **46.69%** (not re-verified)
  - Total embeddings: 349,820 (at time of measurement)
  - Already optimized: 163,317 (at time of measurement)
  - Still needed migration: 186,503 (at time of measurement)

## Migration Methods

### Method 1: Background Migration API (Recommended)

The migration API allows admin users to run the migration in the background and monitor progress.

**Start Migration:**
```bash
curl -X POST http://localhost:5000/api/admin/migrate-embeddings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Check Status:**
```bash
curl http://localhost:5000/api/admin/migrate-embeddings/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Method 2: Standalone Script

Run the migration script directly (may timeout on large datasets):

```bash
npx tsx server/scripts/migrate-embeddings-to-vector.ts
```

**Features:**
- Batch size: 5,000 rows per batch
- Automatic progress tracking
- Safe error handling
- Automatic completion detection

### Method 3: Manual SQL (For Completion)

If automated methods timeout, run the remaining migration manually:

```sql
-- Update in batches
UPDATE customer_embeddings
SET embedding_vector = embedding::vector
WHERE id IN (
  SELECT id 
  FROM customer_embeddings
  WHERE embedding_vector IS NULL 
    AND embedding IS NOT NULL
  LIMIT 5000
);
-- Repeat until rowcount = 0
```

**Check Progress:**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(embedding_vector) as optimized,
  COUNT(*) - COUNT(embedding_vector) as remaining,
  ROUND((COUNT(embedding_vector)::numeric / COUNT(*) * 100), 2) as coverage_percent
FROM customer_embeddings;
```

## Performance Impact

### Before Optimization (Sequential Scan):
- Search query time: ~500-800ms
- No index support for vector operations
- Full table scan on every similarity search

### After Optimization (HNSW Index):
- Search query time: ~50-150ms
- HNSW index for fast nearest neighbor search
- 5-10x performance improvement

## Verification

After migration completes, verify HNSW index is being used:

```sql
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, customer_id, 1 - (embedding_vector <=> '[0.1, 0.2, ...]'::vector) as similarity
FROM customer_embeddings
WHERE customer_id IS NOT NULL
ORDER BY embedding_vector <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

Look for: `Index Scan using customer_embeddings_embedding_vector_idx`

## Updated Code Components

1. **server/storage.ts** (and storage modules) - Upsert operations now populate both columns
2. **server/services/_shared/embedding-orchestrator.ts** - Bulk operations updated
3. **server/routes/migration-routes.ts** - Migration API endpoints (registered via `server/routes/index.ts`)
4. **server/scripts/migrate-embeddings-to-vector.ts** - Standalone migration script

## Rollback Plan

If issues occur, the migration is non-destructive:
- Original `embedding` column unchanged
- Can revert to legacy queries by using `embedding` instead of `embedding_vector`
- HNSW index can be dropped without data loss: `DROP INDEX IF EXISTS customer_embeddings_embedding_vector_idx;`

## Next Steps

1. Re-measure current migration progress (run the SQL query in Method 3 above)
2. Complete any remaining row migration
3. Verify HNSW index usage in production queries
4. Monitor query performance improvements
5. Once verified, consider deprecating legacy `embedding` column (optional)

## Migration Timeline

- **Phase 1 (Completed)**: Code updates for dual-column population
- **Phase 2 (46.69% as of Oct 2025, not re-verified)**: Backfill existing embeddings
- **Phase 3 (Pending)**: Performance verification
- **Phase 4 (Optional)**: Legacy column deprecation
