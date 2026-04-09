#!/bin/bash
#
# Fast Sync of customer_embeddings table from dev to prod
# Uses PostgreSQL's native pg_dump/pg_restore for maximum speed
#
# Usage: bash server/scripts/sync-embeddings-fast.sh
#

set -e

echo "🔄 Fast sync: customer_embeddings (dev → prod)"
echo ""

# Check if secrets are available
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not set"
    exit 1
fi

if [ -z "$PROD_DATABASE_URL" ]; then
    echo "❌ Error: PROD_DATABASE_URL not set"
    exit 1
fi

echo "📡 Source (dev): $DATABASE_URL"
echo "📡 Target (prod): $PROD_DATABASE_URL"
echo ""

# Create temp file for the dump
DUMP_FILE="/tmp/customer_embeddings_$(date +%s).sql"

echo "📦 Step 1: Dumping customer_embeddings from dev..."
pg_dump "$DATABASE_URL" \
  --table=customer_embeddings \
  --data-only \
  --no-owner \
  --no-privileges \
  --file="$DUMP_FILE"

echo "✅ Dumped to: $DUMP_FILE"
echo ""

echo "🗑️  Step 2: Clearing production table..."
psql "$PROD_DATABASE_URL" -c "TRUNCATE TABLE customer_embeddings CASCADE;"
echo "✅ Production table cleared"
echo ""

echo "📥 Step 3: Restoring to production..."
psql "$PROD_DATABASE_URL" -f "$DUMP_FILE"
echo "✅ Data restored to production"
echo ""

echo "🔍 Step 4: Verifying sync..."
DEV_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM customer_embeddings;")
PROD_COUNT=$(psql "$PROD_DATABASE_URL" -t -c "SELECT COUNT(*) FROM customer_embeddings;")

echo "   Dev rows: $DEV_COUNT"
echo "   Prod rows: $PROD_COUNT"

if [ "$DEV_COUNT" == "$PROD_COUNT" ]; then
    echo ""
    echo "✅ Verification passed! Counts match."
else
    echo ""
    echo "⚠️  Warning: Counts do not match!"
fi

# Clean up
rm -f "$DUMP_FILE"
echo ""
echo "🎉 Fast sync completed!"
