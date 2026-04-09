# Vector Index Migration Plan

## Current Issue

The `customer_embeddings.embedding` column is currently defined as `real[]` (array of real numbers) instead of the proper pgvector `vector` type. This prevents creation of optimal HNSW indexes.

## Current Data Type
```sql
embedding real[] NOT NULL
```

## Required Data Type for HNSW
```sql
embedding vector(1536) NOT NULL  -- 1536 dimensions for text-embedding-3-small
```

## Migration Steps Required

### 1. Create New Column
```sql
ALTER TABLE customer_embeddings 
ADD COLUMN embedding_vector vector(1536);
```

### 2. Migrate Data
```sql
UPDATE customer_embeddings 
SET embedding_vector = embedding::vector;
```

### 3. Create HNSW Index
```sql
CREATE INDEX CONCURRENTLY customer_embeddings_embedding_cosine_idx 
ON customer_embeddings 
USING hnsw (embedding_vector vector_cosine_ops);
```

### 4. Update Application Code
Update `server/vector-engine.ts` to use `embedding_vector` column instead of `embedding`.

### 5. Drop Old Column (after validation)
```sql
ALTER TABLE customer_embeddings DROP COLUMN embedding;
ALTER TABLE customer_embeddings RENAME COLUMN embedding_vector TO embedding;
```

## Performance Impact
- Current: Sequential scan of 348k+ rows (>3 seconds)
- With HNSW: Sub-second similarity search (<1 second target)

## Risk Mitigation
- Use CONCURRENTLY to avoid table locks
- Test migration on dev environment first
- Keep old column until migration is validated
- Monitor query performance before and after