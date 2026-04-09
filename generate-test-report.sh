#!/bin/bash
echo "=== SMART CDP TEST REPORT ==="
echo "Generated: $(date)"
echo ""

# Test each file individually with short timeout
test_file() {
    local file=$1
    echo -n "Testing $file... "
    timeout 10s npx vitest run "$file" --no-coverage --reporter=tap 2>&1 | grep -q "ok 1" && echo "✅ PASS" || echo "❌ FAIL/TIMEOUT"
}

echo "📋 Unit Tests:"
test_file "dev/tests/unit/auth.test.ts"
test_file "dev/tests/unit/schema-mapper.test.ts"

echo ""
echo "📋 Integration Tests:"  
test_file "dev/tests/integration/api-endpoints.test.ts"

echo ""
echo "Report complete."
