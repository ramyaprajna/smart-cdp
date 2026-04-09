# Test Coverage Improvement Plan
## Smart CDP Platform - Strategic Roadmap to 70% Coverage

**Document Version:** 1.0  
**Created:** October 1, 2025  
**Last verified:** October 1, 2025 — figures below (486 test specs, 77 test files, coverage percentages) have not been re-measured. As of March 2026 the codebase has 81 test files and ~1,334 test specs. Coverage thresholds in `vitest.config.ts` are 10%.  
**Target Completion:** Q1 2026  

---

## Current State Summary

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Overall Coverage | **0-9.64%** | **70%** | **~60%** |
| Test Files | 77 | 100+ | 23+ |
| Passing Tests | **349/486** | **486/486** | **137** |
| Test Execution | ⚠️ Partial | ✅ Passing | Fix required |

**Critical Issues Identified:**
1. ✅ **RESOLVED:** Browser API polyfills (ResizeObserver, IntersectionObserver) - Added to test/setup.ts
2. ✅ **RESOLVED:** Fetch base URL configuration - Added to vitest.config.ts
3. ⚠️ **REMAINING:** Test mocks incomplete - API endpoints need proper mocking for waitFor() operations

---

## Phase 1: Foundation Fix (Week 1)
**Goal:** Get existing tests running successfully

### Action Items

#### 1.1 Test Scripts Configuration ✅ COMPLETE
**Status:** Already configured in package.json  
**Verified Scripts:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```
**Timeline:** Complete  

#### 1.2 Configure Test Database
**Status:** Not configured  
**Action:**
```bash
# Create .env.test file
cat > .env.test << EOF
DATABASE_URL=postgresql://test:test@localhost:5432/smart_cdp_test
NODE_ENV=test
SKIP_AUTH=true
EOF
```
**Files to modify:**
- Create `.env.test`
- Update `vitest.config.ts` to load test env

**Timeline:** 30 minutes  

#### 1.3 Fix Failing Tests
**Current:** 111 failed tests (verified)  
**Root Causes Identified:**
1. ✅ **FIXED:** ResizeObserver not defined (Radix UI components) - Polyfill added
2. ✅ **FIXED:** Fetch URL parsing errors - Base URL configured
3. ⚠️ **TODO:** Incomplete API mocks causing waitFor() timeouts

**Action Plan:**
1. Fix test mocks to return proper API responses
2. Review and update test data fixtures
3. Fix async operation handling in tests

**Commands:**
```bash
# Run specific test file to debug
npx vitest run dev/tests/unit/auth.test.ts --reporter=verbose

# Fix and re-run
npx vitest run --coverage
```
**Timeline:** 2-3 days  

#### 1.4 Update .gitignore
**Action:** Exclude coverage reports
```bash
echo "coverage/" >> .gitignore
echo "*.lcov" >> .gitignore
```
**Timeline:** 2 minutes  

### Phase 1 Success Criteria
- ⚠️ All 486 tests execute successfully (349 passing, 111 failing, 26 skipped)
- ✅ Coverage report generates without errors
- ✅ CI/CD pipeline configured (GitHub Actions + SonarQube)
- ⚠️ Browser API polyfills resolved, API mocking remains

---

## Phase 2: Critical Path Coverage (Weeks 2-4)
**Goal:** Achieve 30% coverage on business-critical code

### Priority 1: Core Services (Target: 50% coverage)

#### 2.1 Customer Management
**Files:**
- `server/routes/customer-routes.ts`
- `server/services/customer-service.ts`

**Test Requirements:**
```typescript
// Create: server/routes/__tests__/customer-routes.test.ts
describe('Customer Routes', () => {
  it('should create customer with valid data')
  it('should prevent duplicate customers')
  it('should update customer attributes')
  it('should soft delete customer')
  it('should handle bulk import')
})
```
**Coverage Goal:** 60%  
**Timeline:** 3 days  

#### 2.2 Data Import Pipeline
**Files:**
- `server/routes/import-routes.ts`
- `server/file-processors/*.ts`
- `server/services/ai-enhanced-import-service.ts`

**Test Requirements:**
```typescript
// Test CSV, Excel, JSON imports
describe('Data Import', () => {
  it('should import CSV with 10,000 rows')
  it('should detect duplicates')
  it('should map fields using AI')
  it('should handle malformed data')
  it('should rollback on error')
})
```
**Coverage Goal:** 70%  
**Timeline:** 5 days  

#### 2.3 Vector Embeddings (AI/ML)
**Files:**
- `server/services/batch-optimized-embedding-service.ts`
- `server/services/embedding-service.ts`
- `server/services/vector-search-service.ts`

**Test Requirements:**
```typescript
describe('Vector Embeddings', () => {
  it('should generate embeddings in batches')
  it('should handle OpenAI API failures')
  it('should support cancellation')
  it('should perform similarity search')
  it('should deduplicate embeddings')
})
```
**Coverage Goal:** 65%  
**Timeline:** 4 days  

### Priority 2: API Endpoints (Target: 60% coverage)

#### 2.4 All REST Endpoints
**Test Strategy:**
```typescript
// Use supertest for API testing
describe('API Endpoints', () => {
  describe('GET /api/customers', () => {
    it('returns 200 with customer list')
    it('supports pagination')
    it('filters by segment')
  })
  
  describe('POST /api/customers', () => {
    it('creates customer with 201')
    it('validates required fields')
    it('returns 400 for invalid data')
  })
})
```

**Endpoints to Cover:**
- `/api/customers` (6 tests)
- `/api/segments` (8 tests)
- `/api/analytics` (10 tests)
- `/api/embeddings` (7 tests)
- `/api/imports` (9 tests)

**Coverage Goal:** 60%  
**Timeline:** 1 week  

### Phase 2 Success Criteria
- ✅ 30% overall coverage achieved
- ✅ All critical paths have >50% coverage
- ✅ API endpoints have >60% coverage
- ✅ Zero critical bugs in covered code

---

## Phase 3: Comprehensive Coverage (Weeks 5-8)
**Goal:** Achieve 50% overall coverage

### 3.1 Frontend Components (133 components)
**Current:** 0% coverage  
**Strategy:** Focus on critical user flows

**Priority Components:**
1. **Customer List/Detail** (10 tests)
2. **Data Import Wizard** (15 tests)
3. **Segment Builder** (12 tests)
4. **Analytics Dashboard** (8 tests)
5. **Archive Management** (6 tests)

**Test Framework:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react'

describe('CustomerList', () => {
  it('renders customer table')
  it('handles pagination')
  it('supports search/filter')
  it('exports to CSV')
})
```

**Coverage Goal:** 40% of frontend  
**Timeline:** 2 weeks  

### 3.2 Database Operations
**Files:**
- `server/storage.ts`
- `server/db/*.ts`
- `shared/schema.ts`

**Test Requirements:**
```typescript
describe('Database Operations', () => {
  it('handles concurrent writes')
  it('maintains referential integrity')
  it('supports transactions')
  it('handles connection pool exhaustion')
})
```
**Coverage Goal:** 55%  
**Timeline:** 1 week  

### 3.3 Archive System
**Files:**
- `server/services/archive-service.ts`
- `server/routes/archive-routes.ts`

**Test Requirements:**
```typescript
describe('Archive System', () => {
  it('archives old data to separate schema')
  it('maintains data lineage')
  it('supports restore operations')
  it('handles large dataset archives')
})
```
**Coverage Goal:** 70%  
**Timeline:** 3 days  

### Phase 3 Success Criteria
- ✅ 50% overall coverage
- ✅ Frontend coverage >40%
- ✅ Database layer coverage >55%
- ✅ All user flows tested

---

## Phase 4: Target Achievement (Weeks 9-12)
**Goal:** Reach 70% coverage threshold

### 4.1 Edge Cases & Error Handling
**Focus Areas:**
- Input validation edge cases
- Network failure scenarios
- Race conditions
- Memory leak prevention
- SQL injection prevention

**Test Requirements:**
```typescript
describe('Edge Cases', () => {
  it('handles malformed JSON')
  it('prevents SQL injection')
  it('limits request size')
  it('handles database connection loss')
  it('prevents memory leaks')
})
```
**Coverage Goal:** 80% of error handlers  
**Timeline:** 1 week  

### 4.2 Integration Test Expansion
**Strategy:** Test multi-service workflows

**Key Workflows:**
1. Complete data import → AI mapping → embedding generation
2. Customer segmentation → analytics → export
3. Archive creation → restore → validation

**Coverage Goal:** 75% of integrations  
**Timeline:** 1.5 weeks  

### 4.3 Performance & Load Tests
**Files:** Create new test suite
```typescript
describe('Performance', () => {
  it('handles 100K customer import in <2min')
  it('generates embeddings at 50/sec')
  it('supports 100 concurrent users')
  it('maintains <100ms API response time')
})
```
**Timeline:** 1 week  

### Phase 4 Success Criteria
- ✅ 70% overall coverage achieved
- ✅ All error scenarios covered
- ✅ Performance benchmarks established
- ✅ SonarQube quality gate passes

---

## Technical Implementation Details

### Test Database Setup
```typescript
// vitest.config.ts - Add test database
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    environment: 'node',
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL
    }
  }
});
```

```typescript
// test/global-setup.ts
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

export async function setup() {
  // Create test database schema
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS test`);
  // Run migrations
  await db.migrate();
}

export async function teardown() {
  // Clean up test database
  await db.execute(sql`DROP SCHEMA IF EXISTS test CASCADE`);
}
```

### Mocking Strategy

#### Mock External Services
```typescript
// test/mocks/openai.ts
import { vi } from 'vitest';

export const mockOpenAI = {
  embeddings: {
    create: vi.fn().mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1) }]
    })
  }
};
```

#### Mock Database for Unit Tests
```typescript
// test/mocks/database.ts
import { vi } from 'vitest';

export const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([])
};
```

### CI/CD Integration

#### Update GitHub Actions
```yaml
# .github/workflows/build.yml
- name: Run Tests
  run: npm run test:coverage
  env:
    DATABASE_URL: postgresql://test:test@localhost:5432/test
    
- name: Upload Coverage to SonarQube
  uses: sonarsource/sonarqube-scan-action@v5
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## Resource Requirements

### Team Allocation
- **Senior Developer:** 40% time (lead, review)
- **Mid Developer:** 80% time (implementation)
- **QA Engineer:** 50% time (test design, validation)

### Infrastructure
- **Test Database:** PostgreSQL 16 (separate instance)
- **CI/CD Minutes:** ~500 min/month
- **SonarQube:** Cloud subscription

### Budget Estimate
- **Development Time:** 240 hours
- **Infrastructure:** $50/month
- **Total Cost:** ~$20,000 (3 months)

---

## Monitoring & Metrics

### Weekly Tracking
```bash
# Generate coverage report
npm run test:coverage

# Track metrics
echo "Week $(date +%U): $(grep -o 'Lines.*%' coverage/lcov-report/index.html)"
```

### KPIs
1. **Coverage Trend:** +5% per week
2. **Test Execution Time:** <5 minutes
3. **Flaky Test Rate:** <2%
4. **Bug Detection Rate:** 80% caught by tests

### Dashboard Metrics
- Total coverage %
- Lines covered
- Uncovered critical paths
- Test execution time
- Failure rate

---

## Risk Mitigation

### Risk 1: Timeline Slippage
**Mitigation:** 
- Prioritize critical paths first
- Accept 60% coverage if 70% unreachable
- Defer non-critical features

### Risk 2: Test Maintenance Overhead
**Mitigation:**
- Write maintainable tests (DRY principle)
- Use test factories for data
- Implement proper mocking strategy

### Risk 3: Performance Impact
**Mitigation:**
- Run only changed tests in dev
- Use test database, not production
- Parallelize test execution

---

## Success Metrics

### Definition of Done
- ✅ 70% line coverage
- ✅ 70% function coverage  
- ✅ 70% branch coverage
- ✅ 70% statement coverage
- ✅ All tests passing
- ✅ CI/CD integrated
- ✅ SonarQube quality gate passing
- ✅ Zero critical uncovered code

### Celebration Milestones
- 🎯 30% coverage: Team lunch
- 🎯 50% coverage: Half-day off
- 🎯 70% coverage: Team dinner + bonus

---

## Immediate Next Steps (Today)

**✅ Completed:**
1. ✅ Test scripts verified in package.json
2. ✅ Browser API polyfills added (ResizeObserver, IntersectionObserver)
3. ✅ Fetch base URL configured for tests
4. ✅ Documentation corrected (replit.md)

**⚠️ Priority Actions:**
1. **Fix API mocking** - Update test files to properly mock API responses (2-3 hours)
2. **Create .env.test** - Add test-specific environment configuration (10 min)
3. **Fix hanging tests** - Resolve waitFor() timeout issues in UAT tests (2 hours)
4. **Re-run full test suite** - Verify all 486 tests execute (30 min)

**Start Command:**
```bash
# Test infrastructure fixes complete, now fix mocks:
npm run test:coverage
```

---

**Document Owner:** Development Team  
**Review Frequency:** Weekly  
**Last Updated:** October 1, 2025
