#!/bin/bash
#
# Chunked sync to avoid timeouts
# Splits the table into chunks and syncs them one at a time
#

set -e

CHUNK_SIZE=50000  # 50k rows per chunk

echo "🔄 Chunked sync: customer_embeddings (dev → prod)"
echo ""

# Get total row count
echo "📊 Counting rows..."
TOTAL_ROWS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM customer_embeddings;")
TOTAL_ROWS=$(echo $TOTAL_ROWS | xargs)  # trim whitespace

echo "   Total rows: $TOTAL_ROWS"
echo "   Chunk size: $CHUNK_SIZE"

# Calculate number of chunks
NUM_CHUNKS=$(( ($TOTAL_ROWS + $CHUNK_SIZE - 1) / $CHUNK_SIZE ))
echo "   Will create $NUM_CHUNKS chunks"
echo ""

# Clear production table
echo "🗑️  Clearing production table..."
psql "$PROD_DATABASE_URL" -c "TRUNCATE TABLE customer_embeddings CASCADE;" >/dev/null
echo "✅ Cleared"
echo ""

# Process each chunk
OFFSET=0
CHUNK_NUM=1

while [ $OFFSET -lt $TOTAL_ROWS ]; do
    echo "📦 Chunk $CHUNK_NUM/$NUM_CHUNKS (offset: $OFFSET, limit: $CHUNK_SIZE)"
    
    # Export chunk from dev
    psql "$DATABASE_URL" -c "
        COPY (
            SELECT * FROM customer_embeddings 
            ORDER BY id 
            LIMIT $CHUNK_SIZE OFFSET $OFFSET
        ) TO STDOUT WITH (FORMAT BINARY)
    " | psql "$PROD_DATABASE_URL" -c "
        COPY customer_embeddings FROM STDIN WITH (FORMAT BINARY)
    " 2>&1 | grep -v "^$" || true
    
    echo "   ✓ Synced chunk $CHUNK_NUM"
    
    OFFSET=$(( $OFFSET + $CHUNK_SIZE ))
    CHUNK_NUM=$(( $CHUNK_NUM + 1 ))
done

echo ""
echo "🔍 Verifying sync..."
DEV_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM customer_embeddings;")
PROD_COUNT=$(psql "$PROD_DATABASE_URL" -t -c "SELECT COUNT(*) FROM customer_embeddings;")

DEV_COUNT=$(echo $DEV_COUNT | xargs)
PROD_COUNT=$(echo $PROD_COUNT | xargs)

echo "   Dev rows:  $DEV_COUNT"
echo "   Prod rows: $PROD_COUNT"

if [ "$DEV_COUNT" == "$PROD_COUNT" ]; then
    echo ""
    echo "✅ SUCCESS! Counts match perfectly."
    
    # Check optimized column coverage
    OPTIMIZED=$(psql "$PROD_DATABASE_URL" -t -c "SELECT COUNT(embedding_vector) FROM customer_embeddings;")
    OPTIMIZED=$(echo $OPTIMIZED | xargs)
    COVERAGE=$(echo "scale=1; $OPTIMIZED * 100 / $PROD_COUNT" | bc)
    
    echo ""
    echo "📊 Production stats:"
    echo "   Total: $PROD_COUNT"
    echo "   Optimized: $OPTIMIZED"
    echo "   Coverage: ${COVERAGE}%"
else
    echo ""
    echo "⚠️  Warning: Counts do not match!"
fi

echo ""
echo "🎉 Chunked sync completed!"
