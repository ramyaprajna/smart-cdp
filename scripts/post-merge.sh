#!/bin/bash
set -e
npm install
npx drizzle-kit push --force
# Run idempotent SQL migrations for tables that require special handling
# (e.g., unique indexes on nullable columns not supported by drizzle-kit)
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -f scripts/migrations/001_consent_suppression_layer.sql 2>/dev/null || true
  psql "$DATABASE_URL" -f scripts/migrations/002_point_ledger_loyalty.sql 2>/dev/null || true
fi
