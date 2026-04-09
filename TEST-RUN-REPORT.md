# Smart CDP Platform - Test Run Report
**Last verified:** March 27, 2026
**Test Framework:** Vitest v3.2.4
**Coverage Provider:** v8

---

## Test Run Results (March 27, 2026)

The full test suite was run in segments (the environment cannot run all 81 files in a single process within available time). Aggregated results:

| Segment | Passed | Failed | Skipped | Total |
|---------|--------|--------|---------|-------|
| `dev/tests/unit/` (22 files) | 258 | 101 | 14 | 373 |
| `dev/tests/integration/` (7 files) | 75 | 10 | 16 | 101 |
| `dev/tests/user-acceptance/` (7 files) | 51 | 14 | 30 | 95 |
| `dev/tests/e2e/` + `functional/` + `services/` + `components/` + `performance/` + `file-processors/` + `test/` + `server/tests/` | 179 | 42 | 14 | 235 |
| `dev/tests/*.test.*` (3 top-level files) | 20 | 16 | 0 | 36 |
| `development/testing/tests/` (28 files) | 220 | 239 | 35 | 494 |
| **Aggregated Total** | **803** | **422** | **109** | **1,334** |

**Summary:** 803 passed, 422 failed, 109 skipped across ~1,334 test specs in 81 test files.

**Note:** Running all files in a single `npx vitest run` is recommended for a canonical count, but requires more than 2 minutes of execution time. To reproduce:
```bash
npx vitest run --reporter=verbose
```

**Coverage percentages** were not re-measured in this run (segmented runs don't produce aggregate coverage). The last measured coverage (44.51% lines, from October 2025) has not been re-verified. To get current coverage:
```bash
npx vitest run --coverage
```

---

## Test Infrastructure Summary

| Metric | Value |
|--------|-------|
| **Total test files** | 81 |
| **Test specs (from segmented run)** | ~1,334 |
| **Test specs (from grep count)** | ~1,351 (minor difference due to dynamic/parameterized tests) |
| **Vitest coverage thresholds** | 10% (lines, functions, branches, statements) |

### Test File Distribution

| Directory | File Count |
|-----------|-----------|
| `dev/tests/` | 51 |
| `development/testing/tests/` | 28 |
| `server/tests/` | 1 |
| `test/` | 1 |

### Test Categories (by directory)

**Unit Tests (dev/tests/unit/)** — 22 files (18 top-level + 4 in flexible-cdp/)
- ai-segment-modal, ai-segment-service, api-integration, archive-edge-cases, archive-management
- auth, customer-management, data-import, data-lineage, error-handling, error-tracking
- import-history, routes, schema-mapper, smart-auto-resume, use-segments, vector-search, web-crawler-prevention
- flexible-cdp/ (4 files: dynamic-attribute-service, enhanced-import-service, flexible-ai-mapper, schema-registry)

**Integration Tests (dev/tests/integration/)** — 7 files
- ai-segment-api, api-endpoints, archive-api, auto-resume-coverage, flexible-cdp-endpoints, segment-refresh, smart-auto-resume.integration

**E2E Tests (dev/tests/e2e/)** — 4 files
- ai-segment-workflow, archive-workflows, complete-workflow, flexible-cdp-workflow

**User Acceptance Tests (dev/tests/user-acceptance/)** — 7 files
- component-integration, edit-segment-functional-validation, edit-segment-integration
- edit-segment-parameters, performance-validation, react-component-refactoring, refactoring-core

**Functional Tests (dev/tests/functional/)** — 4 files
- data-flow-validation, feature-coverage-validation, real-backend-integration, system-state-validation

**Performance Tests (dev/tests/performance/)** — 1 file
- load-testing

**Component Tests (dev/tests/components/)** — 1 file
- archive-management

**Services Tests (dev/tests/services/)** — 1 file
- refactored-services

**File Processor Tests (dev/tests/file-processors/)** — 1 file
- file-processors

**Other (dev/tests/)** — 3 files
- comprehensive-test-runner, import-history-ui, ai-integration-simple

*Subtotal dev/tests/: 51 files*

**Development Tests (development/testing/tests/)** — 28 files
- vector-search/ (5 files), stress/ (1 file), services/ (4 files), security/ (2 files)
- openai-api-robustness, middleware/ (1 file), integration/ (3 files), hooks/ (1 file)
- data-import/ (2 files), components/ (1 file), user-acceptance/ (3 files)
- performance/ (1 file), api/ (1 file), address-parser, utils/ (1 file)

**Server Tests** — 1 file
- server/tests/batch-optimized-embedding-service.test.ts

**Root Tests** — 1 file
- test/example.test.ts

---

## Previous Reports

The October 2, 2025 report listed 45 test files. Since then, Tasks #5–#10 added new test files and modified the test infrastructure significantly. The test file count grew from 45 to 81, and test spec count grew from ~486 to ~1,334.

**Verification method:** Test file count obtained via `ls | sort -u` across all test directories. Spec counts obtained both from actual Vitest runs (segmented) and from `grep -r` for `it(` / `test(` patterns.
