#!/bin/bash

# Execute dblink-based sync (server-side, no client timeout)

set -e

echo "🚀 Starting Server-Side Sync using dblink"
echo "============================================================"

# Validate environment
if [ -z "$DATABASE_URL" ] || [ -z "$PROD_DATABASE_URL" ]; then
    echo "❌ ERROR: Missing DATABASE_URL or PROD_DATABASE_URL"
    exit 1
fi

echo "✅ Environment validated"
echo ""

# Substitute DEV_DATABASE_URL into SQL template
echo "📝 Preparing SQL script..."
sed "s|DEV_DATABASE_URL_PLACEHOLDER|$DATABASE_URL|g" scripts/dblink-sync-embeddings.sql > /tmp/dblink-sync-final.sql

echo "📤 Executing server-side sync on production database..."
echo "   (This may take several minutes for large datasets)"
echo ""

# Execute on production database
psql "$PROD_DATABASE_URL" -f /tmp/dblink-sync-final.sql

echo ""
echo "============================================================"
echo "🎉 Sync completed!"
echo "============================================================"

# Cleanup
rm -f /tmp/dblink-sync-final.sql
