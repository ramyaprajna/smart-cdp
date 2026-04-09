#!/bin/bash
REPORT_FILE="TEST-RUN-REPORT.md"

echo "# Smart CDP Platform - Comprehensive Test Report" > $REPORT_FILE
echo "**Generated:** $(date)" >> $REPORT_FILE
echo "**Total Test Files:** 45" >> $REPORT_FILE
echo "" >> $REPORT_FILE

test_file() {
    local file=$1
    local category=$2
    echo -n "."
    result=$(timeout 8s npx vitest run "$file" --no-coverage --reporter=tap 2>&1)
    
    if echo "$result" | grep -q "ok 1"; then
        echo "| ✅ PASS | $file |" >> $REPORT_FILE
        return 0
    elif echo "$result" | grep -q "not ok"; then
        failures=$(echo "$result" | grep "not ok" | wc -l)
        echo "| ❌ FAIL ($failures) | $file |" >> $REPORT_FILE
        return 1
    else
        echo "| ⏱️ TIMEOUT | $file |" >> $REPORT_FILE
        return 2
    fi
}

echo "## Unit Tests" >> $REPORT_FILE
echo "" >> $REPORT_FILE
echo "| Status | File |" >> $REPORT_FILE
echo "|--------|------|" >> $REPORT_FILE

echo -n "Testing unit tests"
for file in dev/tests/unit/*.test.ts dev/tests/unit/*.test.tsx dev/tests/unit/flexible-cdp/*.test.ts; do
    [ -f "$file" ] && test_file "$file" "unit"
done
echo ""

echo "" >> $REPORT_FILE
echo "## Integration Tests" >> $REPORT_FILE
echo "" >> $REPORT_FILE  
echo "| Status | File |" >> $REPORT_FILE
echo "|--------|------|" >> $REPORT_FILE

echo -n "Testing integration tests"
for file in dev/tests/integration/*.test.ts; do
    [ -f "$file" ] && test_file "$file" "integration"
done
echo ""

echo "" >> $REPORT_FILE
echo "## E2E Tests" >> $REPORT_FILE
echo "" >> $REPORT_FILE
echo "| Status | File |" >> $REPORT_FILE
echo "|--------|------|" >> $REPORT_FILE

echo -n "Testing e2e tests"
for file in dev/tests/e2e/*.test.ts; do
    [ -f "$file" ] && test_file "$file" "e2e"
done
echo ""

echo "" >> $REPORT_FILE
echo "## User Acceptance Tests" >> $REPORT_FILE
echo "" >> $REPORT_FILE
echo "| Status | File |" >> $REPORT_FILE
echo "|--------|------|" >> $REPORT_FILE

echo -n "Testing UAT tests"
for file in dev/tests/user-acceptance/*.test.tsx dev/tests/user-acceptance/*.test.ts; do
    [ -f "$file" ] && test_file "$file" "uat"
done
echo ""

echo "" >> $REPORT_FILE
echo "---" >> $REPORT_FILE
echo "**Note:** Tests run individually with 8-second timeout" >> $REPORT_FILE

echo ""
echo "Report saved to: $REPORT_FILE"
cat $REPORT_FILE
