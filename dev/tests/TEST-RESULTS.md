# Test Suite Results Report

**Date:** March 23, 2026  
**Runner:** Vitest 3.1.1  
**Environment:** jsdom (Node.js)  
**Command:** `npx vitest run --coverage`  
**Duration:** 75.81s (transform 12.98s, setup 87.27s, collect 42.35s, tests 1.28s, environment 140.37s, prepare 21.27s)  
**Raw Log:** [`dev/tests/logs/test-coverage-20260323.log`](./logs/test-coverage-20260323.log)

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Test Files** | 80 |
| **Failed Files** | 77 |
| **Skipped Files** | 3 |
| **Passed Files** | 0 |
| **Total Tests** | 817 |
| **Tests Passed** | 0 |
| **Tests Failed** | 0 |
| **Tests Skipped** | 817 |

> **Note:** All 77 "failed" test files failed during the **collection/setup phase** (import resolution, environment setup, or transform errors) — not during actual test execution. The 817 tests were skipped because their parent suites could not be loaded. No individual test assertions were reached.

---

## Per-Category Pass/Fail Summary

| Category | Files | Status | Root Cause |
|----------|-------|--------|------------|
| **Unit** (`dev/tests/unit/`) | 22 | ❌ All Failed | Path resolution, env conflicts, mock init errors |
| **Integration** (`dev/tests/integration/`) | 7 | ❌ All Failed | Path resolution, env conflicts |
| **E2E** (`dev/tests/e2e/`) | 4 | ❌ All Failed | Path resolution, missing `@server/app` alias |
| **Functional** (`dev/tests/functional/`) | 4 | ❌ All Failed | Path resolution, env conflicts |
| **Performance** (`dev/tests/performance/`) | 1 | ❌ Failed | Environment conflict (browser-like env) |
| **User Acceptance** (`dev/tests/user-acceptance/`) | 7 | ❌ All Failed | Path resolution, env conflicts |
| **Components** (`dev/tests/components/`) | 1 | ❌ Failed | Path resolution |
| **File Processors** (`dev/tests/file-processors/`) | 1 | ❌ Failed | Path resolution |
| **Services** (`dev/tests/services/`) | 1 | ❌ Failed | Path resolution |
| **Root-level** (`dev/tests/*.test.ts`) | 3 | ❌ All Failed | Path resolution, mock init |
| **development/testing/tests/** | 28 | ❌ All Failed | Incorrect relative path depth |
| **test/** | 1 | ❌ Failed | Path resolution |
| **Skipped Files** | 3 | ⏭️ Skipped | Tests marked as `skip` |

### Skipped Test Files
- `dev/tests/unit/data-import.test.ts` (14 tests)
- `dev/tests/user-acceptance/edit-segment-parameters.test.tsx` (23 tests)
- `dev/tests/user-acceptance/edit-segment-integration.test.tsx` (7 tests)

---

## Failure Root Cause Analysis

### Category 1: Incorrect Relative Path Depth in Imports (22 files)

The source files referenced by these tests **do exist** in the repository, but the relative import paths use the wrong number of `../` segments to reach them. Vite's import analysis then reports "Failed to resolve import ... Does the file exist?" even though the target module is present.

**Example:** `dev/tests/unit/flexible-cdp/enhanced-import-service.test.ts` imports `../../../server/services/enhanced-import-service`. From 4 directories deep (`dev/tests/unit/flexible-cdp/`), three `../` only reaches `dev/` — not the project root. The correct path would require `../../../../server/services/enhanced-import-service`.

Similarly, tests in `development/testing/tests/` (also 3-4 levels deep) use relative paths with insufficient depth. The vitest `resolve.alias` config provides `@server` and `@shared` aliases, but most of these test files use raw relative paths instead.

| Test File | Unresolved Import | Target File (Exists) |
|-----------|-------------------|---------------------|
| `dev/tests/unit/flexible-cdp/enhanced-import-service.test.ts` | `../../../server/services/enhanced-import-service` | `server/services/enhanced-import-service.ts` ✅ |
| `dev/tests/unit/flexible-cdp/schema-registry.test.ts` | `../../../server/services/schema-registry-service` | `server/services/schema-registry-service.ts` ✅ |
| `dev/tests/unit/flexible-cdp/dynamic-attribute-service.test.ts` | `../../../server/services/dynamic-attribute-service` | `server/services/dynamic-attribute-service.ts` ✅ |
| `dev/tests/e2e/flexible-cdp-workflow.test.ts` | `@server/app` | `server/app.ts` ❌ (truly missing) |
| `development/testing/tests/components/mapping-review-modal.test.tsx` | `../../client/src/components/mapping-review-modal` | `client/src/components/mapping-review-modal.tsx` ✅ |
| `development/testing/tests/hooks/use-mapping-review.test.tsx` | `../../client/src/hooks/use-mapping-review` | `client/src/hooks/use-mapping-review.ts` ✅ |
| `development/testing/tests/data-import/comprehensive-data-import.test.ts` | `../../server/utils/security-sanitizer` | `server/utils/security-sanitizer.ts` ✅ |
| `development/testing/tests/utils/http.test.ts` | `../../../server/utils/http` | `server/utils/http.ts` ✅ |
| `development/testing/tests/openai-api-robustness.test.ts` | `../server/services/cancellable-embedding-service` | `server/services/cancellable-embedding-service.ts` ✅ |
| `development/testing/tests/middleware/rate-limiting-ipv6.test.ts` | `../../server/middleware/vector-security-middleware` | `server/middleware/vector-security-middleware.ts` ✅ |
| `development/testing/tests/integration/analytics-endpoints.test.ts` | `../../server/db` | `server/db.ts` ✅ |
| `development/testing/tests/integration/real-database-pgvector.test.ts` | `../../shared/schema` | `shared/schema.ts` ✅ |
| `development/testing/tests/stress/production-scale-performance.test.ts` | `../../shared/schema` | `shared/schema.ts` ✅ |
| `development/testing/tests/services/analytics/analyticsSnapshot.test.ts` | `../../../server/services/analytics/analyticsSnapshot` | `server/services/analytics/analyticsSnapshot.ts` ✅ |
| `development/testing/tests/services/analytics/applicationLogs.test.ts` | `../../../server/services/analytics/applicationLogs` | `server/services/analytics/applicationLogs.ts` ✅ |
| `development/testing/tests/services/analytics/systemHealth.test.ts` | `../../../server/services/analytics/systemHealth` | `server/services/analytics/systemHealth.ts` ✅ |
| `development/testing/tests/vector-search/vector-search-*.test.ts` (5 files) | `../../server/routes/secure-vector-routes` | `server/routes/secure-vector-routes.ts` ✅ |
| `development/testing/tests/security/vector-search-security.test.ts` | `../../server/routes/secure-vector-routes` | `server/routes/secure-vector-routes.ts` ✅ |

**Reproduction:** Run any of these test files individually (e.g., `npx vitest run dev/tests/unit/flexible-cdp/schema-registry.test.ts`) to see the `Failed to resolve import` error. Only `server/app.ts` is truly missing; all other targets exist.

### Category 2: Environment Conflicts (2 files)

```
TypeError: Cannot assign to read only property 'XMLHttpRequest' of object '#<Object>'
```

The test setup file (`dev/tests/setup.ts`) defines `XMLHttpRequest` using `Object.defineProperty` with default `writable: false`. When a second setup file or test tries to redefine it, the assignment fails.

**Affected files:** Multiple test files that load after the setup re-assignment.

### Category 3: Browser-Like Environment Detection (2 files)

```
Error: It looks like you're running in a browser-like environment.
```

Some server-side modules (e.g., OpenAI SDK) detect the jsdom environment as a browser and refuse to run. These tests need a `node` environment override.

**Affected files:** Tests importing server-side SDKs that check for browser globals.

### Category 4: Mock Initialization Order (1 file)

```
ReferenceError: Cannot access 'mockOpenAIInstance' before initialization
```

A `vi.mock()` factory function references a variable (`mockOpenAIInstance`) that hasn't been initialized yet due to hoisting.

**Affected files:** `dev/tests/ai-integration-simple.test.ts`

### Category 5: Regex Syntax Error (1 file)

```
SyntaxError: Invalid regular expression: /[\u{1F600}-\\u{1F64F}]|.../ Range out of order in character class
```

A Unicode emoji regex pattern has an escaped brace that breaks the character class range.

**Affected files:** Tests importing modules with malformed emoji regex patterns.

### Category 6: Transform/Compilation Errors (4 files)

```
Error: Transform failed with 4 errors
```

TypeScript/ESBuild transform failures in test files, likely due to syntax issues or unsupported features.

---

## Coverage Summary

Coverage was generated via V8 provider despite all tests being skipped. Coverage reflects code loaded during import/setup phases only.

| Directory | Statements % | Branches % | Functions % | Lines % |
|-----------|-------------|------------|-------------|---------|
| **All files** | **6.61** | **35.54** | **4.61** | **6.61** |
| `client/src` | 0.00 | 0.00 | 0.00 | 0.00 |
| `client/src/hooks` | 1.33 | 0.00 | 0.00 | 1.33 |
| `client/src/lib` | 34.27 | 100.00 | 4.00 | 34.27 |
| `client/src/pages` | 1.90 | 0.00 | 0.00 | 1.90 |
| `client/src/types` | 0.00 | 0.00 | 0.00 | 0.00 |
| `client/src/utils` | 3.28 | 75.00 | 10.00 | 3.28 |
| `server` | 3.35 | 33.33 | 9.23 | 3.35 |
| `server/config` | 0.00 | 0.00 | 0.00 | 0.00 |
| `server/middleware` | 0.00 | 0.00 | 0.00 | 0.00 |
| `server/routes` | 0.62 | 0.00 | 0.00 | 0.62 |
| `server/scripts` | 0.00 | 0.00 | 0.00 | 0.00 |
| `server/services` | 6.62 | 38.63 | 5.18 | 6.62 |
| `server/storage` | 13.86 | 100.00 | 2.94 | 13.86 |
| `server/tests` | 0.00 | 0.00 | 0.00 | 0.00 |
| `server/utils` | 8.95 | 52.08 | 9.21 | 8.95 |
| `server/validation` | 8.15 | 66.66 | 10.00 | 8.15 |
| `shared` | 69.30 | 95.55 | 4.54 | 69.30 |

### Coverage Threshold Failures

| Metric | Actual | Threshold | Status |
|--------|--------|-----------|--------|
| Lines | 6.61% | 10% | ❌ FAIL |
| Functions | 4.61% | 10% | ❌ FAIL |
| Branches | 35.54% | 10% | ✅ PASS |
| Statements | 6.61% | 10% | ❌ FAIL |

---

## Performance Metrics

### Test Execution Timing

| Phase | Duration |
|-------|----------|
| Transform | 12.98s |
| Setup | 87.27s |
| Collect | 42.35s |
| Tests (actual execution) | 1.28s |
| Environment | 140.37s |
| Prepare | 21.27s |
| **Total** | **75.81s** |

### Performance Test Files (Not Executed)

The following performance test files were discovered but could not execute due to collection-phase failures:

| Test File | Tests | Status |
|-----------|-------|--------|
| `dev/tests/performance/load-testing.test.ts` | 17 tests | ❌ Skipped (env conflict) |
| `development/testing/tests/performance/mapping-performance.test.ts` | — | ❌ Failed (import error) |
| `development/testing/tests/stress/production-scale-performance.test.ts` | — | ❌ Failed (import error) |

No performance baseline numbers could be extracted because none of the performance tests executed.

---

## TypeScript Build Status

```
$ npx tsc --noEmit
(no errors)
```

**Status:** ✅ PASS — The previously reported TS2802 error in `segmentation-engine-service.ts` (Set spread incompatible with target) was fixed by replacing `[...ALLOWED_FIELDS]` with `Array.from(ALLOWED_FIELDS)`.

---

## Known Issues & Recommendations

### KI-1: Incorrect Relative Import Paths (Critical — 22 files)
Test files use relative import paths (`../../../server/...`) with the wrong number of `../` segments. The target source files exist but cannot be resolved due to incorrect path depth. Only `server/app.ts` is truly missing. **Recommendation:** Fix relative paths to use the correct depth, or preferably switch to the `@server`/`@shared`/`@` path aliases already configured in `vitest.config.ts`.

### KI-2: Test Environment Mismatch (Medium — ~5 files)
Server-side tests running in the `jsdom` environment trigger browser-detection errors in Node.js-only SDKs (e.g., OpenAI). **Recommendation:** Add `// @vitest-environment node` directives to server-side test files or configure separate vitest projects for client vs server tests.

### KI-3: Setup File Conflicts (Medium — 2 files)
The `XMLHttpRequest` mock in `dev/tests/setup.ts` uses `Object.defineProperty` without `writable: true`, causing subsequent assignments to fail. **Recommendation:** Add `{ configurable: true, writable: true }` to the property descriptor.

### KI-4: Mock Hoisting Issues (Low — 1 file)
`vi.mock()` factory in `dev/tests/ai-integration-simple.test.ts` references a variable before initialization. **Recommendation:** Use `vi.hoisted()` to define mock variables or move mock setup above the factory.

### KI-5: Unicode Regex Error (Low — 1 file)
A malformed Unicode emoji regex causes a `SyntaxError` during module loading. **Recommendation:** Fix the regex pattern in the source file to properly escape Unicode ranges.

### KI-6: TypeScript Build Error (RESOLVED)
`segmentation-engine-service.ts` used `[...ALLOWED_FIELDS]` (Set spread) without `downlevelIteration`. **Fix applied:** Replaced with `Array.from(ALLOWED_FIELDS)`. TypeScript build now passes clean.

---

## Build Verdict

| Check | Status |
|-------|--------|
| Test Suite | ❌ **FAIL** — 77/80 test files failed (collection phase) |
| Coverage Thresholds | ❌ **FAIL** — Lines 6.61% < 10%, Functions 4.61% < 10%, Statements 6.61% < 10% |
| TypeScript Build | ✅ **PASS** — 0 errors after fix |
| **Overall** | ❌ **NOT PASSING** |

The test suite is currently non-functional primarily due to incorrect relative import paths in test files — the source modules exist but the `../` depth is wrong, causing Vite's import resolution to fail. Both the test infrastructure configuration and the source files are present; the test files need their import paths corrected (either fix the relative depth or use the `@server`/`@shared` aliases from `vitest.config.ts`). Secondary issues include jsdom/node environment mismatches for server-side tests and mock initialization order problems.
