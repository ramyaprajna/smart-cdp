# Smart CDP Platform

## Overview

Smart CDP Platform is a comprehensive Customer Data Platform built with a modern full-stack architecture. The application provides customer management, segmentation, analytics, and data import capabilities with AI-powered features for segment analysis and vector-based customer search. The platform includes real-time embedding generation, advanced data archiving, and comprehensive logging systems for enterprise-level customer data operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (March 2026)

### Missing Module UIs & Help Center (Task #18)

**New Frontend Pages:**
- **Campaigns** (`/campaigns`) — List, create, and manage marketing campaigns with status lifecycle (draft → scheduled → sending → completed). Shows per-campaign delivery analytics. Accessible to admin/marketing roles.
- **Loyalty** (`/loyalty`) — Look up customer point balances, view transaction history, and perform earn/burn/redeem actions. Accessible to admin/marketing roles.
- **Consent & Suppression** (`/consent`) — Two-tab page: manage per-customer consent records by channel, and view/manage the global suppression list with add/remove capability. Accessible to admin role.
- **Scoring** (`/scoring`) — View score distribution across engagement bands, scoring rules/methodology, calculate individual customer scores, browse high-value and churn-risk profiles, and trigger batch scoring. Accessible to admin/analyst roles.
- **WABA Management** (`/waba`) — View cached WhatsApp templates, sync from Meta API, and send test text/template messages. Accessible to admin/marketing roles.
- **Help & API Reference** (`/help`) — Comprehensive documentation page with tabs for WABA webhook setup, Event Ingestion API, Campaign API, WABA Send APIs, and third-party integration examples (Zapier, n8n, custom CRM).

**Sidebar Updates:**
- Navigation items grouped into logical sections: Analytics, Engagement, Compliance, Data, Admin
- Help & API Docs link added as standalone section at bottom of nav
- Group headers displayed as uppercase labels

**Routing:**
- All new pages added to `App.tsx` with appropriate role-based `ProtectedRoute` guards
- Help page accessible to all authenticated users

### CDP Phase 2D — WABA Channel Integration (Task #15)

**WhatsApp Business API Integration:**
- `shared/schema.ts` — Added `waba_template` table (Drizzle schema + WabaTemplateRecord type) for local template cache
- `server/services/waba-service.ts` — WABA API client wrapping Meta Cloud API v20.0:
  - `sendTemplate` — send HSM template messages with optional component personalization
  - `sendText` — send plain text messages (within 24h conversation window)
  - `sendInteractive` — send interactive button/list messages
  - `getTemplates` — fetch approved templates from WABA account and cache locally
  - `getCachedTemplates` — return cached templates without API call
  - `broadcastCampaign` — batch execute campaign_message records with configurable concurrency + rate limiting delay
  - All send methods write status back to campaign_message records atomically
- `server/routes/waba-webhook-routes.ts` — Webhook + management routes:
  - `GET /api/webhooks/waba` — Meta hub challenge verification with verify_token check
  - `POST /api/webhooks/waba` — HMAC-SHA256 signature verification + status/message/WA Flow handler
  - `GET /api/waba/templates` — list cached templates (analyst/marketing/admin)
  - `POST /api/waba/templates/sync` — force refresh from Meta API (admin only)
  - `POST /api/waba/send/template|text|interactive` — direct send endpoints
  - `POST /api/waba/campaigns/:id/broadcast` — trigger campaign broadcast
- `scripts/migrations/004_waba_templates.sql` — Idempotent DDL for waba_template + 4 indexes; applied to DB
- Closed-loop tracking: delivery status updates → campaign_message + CDP event_store via ingestEventService
- WA Flow handler: nfm_reply type → wa_flow.submission event ingested to CDP pipeline
- campaign-service: added public `refreshAnalytics` method exposing private `refreshCampaignAnalytics`

### CDP Phase 2C — Campaign Management Module (Task #14)

**Campaign Management Module:**
- `shared/schema.ts` — Added `campaign` and `campaign_message` tables with Drizzle schemas, insert schemas, and TypeScript types
- `server/services/campaign-service.ts` — Full campaign lifecycle: CRUD, audience resolution (segment eval + consent filter + suppression filter), execution (generates `campaign_message` records), delivery status updates, analytics aggregation, CDP event logging
- `server/routes/campaign-routes.ts` — 12 REST endpoints under `/api/campaigns/*` with auth + role enforcement (admin/marketing write, analyst read)
- `scripts/migrations/003_campaign_management.sql` — Idempotent DDL for `campaign` and `campaign_message` tables + 14 indexes; migration applied to database
- Status lifecycle: draft → scheduled → sending → completed | cancelled
- Audience resolution pipeline: SegmentationEngine.evaluateSegment → ConsentService.checkBulkConsent → SuppressionService.filterAudience

### CDP Phase 2B — Point Ledger & Loyalty Core (Task #13)

**Loyalty Points System:**
- `shared/schema.ts` — Added `point_ledger`, `point_balance`, and `redemption` tables
- `server/services/loyalty-service.ts` — FIFO lot-aware expiration via SQL CTE, atomic redemption, admin adjustments, referral bonuses
- `server/routes/loyalty-routes.ts` — Points balance, ledger history, earn/burn/redeem endpoints

### CDP Phase 2A — Consent & Suppression Layer (Task #12)

**Consent & Suppression:**
- `server/services/consent-service.ts` — Opt-in/opt-out tracking, bulk consent checks, channel-aware consent
- `server/services/suppression-service.ts` — Global suppression list, frequency capping, audience filtering
- `server/routes/consent-routes.ts` — Consent management REST endpoints

### CDP Phase 1 — Schema, Ingestion & Segmentation (Tasks #5–#7)

**Phase 1A — Schema Evolution + Identity Resolution (Task #5):**
- Added 4 new tables to `shared/schema.ts`: `customer_profile`, `customer_identity`, `event_store`, `segment_definition`
- Migration `scripts/migrations/005_event_store.sql` applies all 4 tables to the DB
- New `server/services/identity-resolution-service.ts` for golden record profile resolution
- New `server/services/attribute-processor.ts` for automatic profile enrichment

**Phase 1B — Event Ingestion + Attribute Processor (Task #6):**
- New `server/routes/ingest-routes.ts` registered in `server/routes/index.ts`
- `POST /api/ingest/event` endpoint with 4-step pipeline: Validate → Normalize → Deduplicate → Write
- Idempotency key–based deduplication for incoming events

**Phase 1C — Deterministic Segmentation Engine (Task #7):**
- New `server/services/segmentation-engine-service.ts` for rule-based segmentation
- New `server/routes/segmentation-engine-routes.ts`
- Runs alongside existing AI-powered segmentation system

### CI, Testing & Infrastructure (Tasks #8–#10)

**CI Testing & SonarCloud Integration (Task #8):**
- Updated `.github/workflows/build.yml` with proper test/coverage/SonarCloud pipeline
- Completed `sonar-project.properties` with source paths, test paths, exclusions
- Updated `vitest.config.ts` to include `development/testing/tests/` directory
- `development/testing/tests/` directory now contains 28 test files

**Run & Document Full Test Suite (Task #9):**
- Attempted full test suite execution across all categories (unit, integration, e2e, functional, performance, UAT)
- Generated test results documentation in `dev/tests/TEST-RESULTS.md`

**Fix Test Suite Infrastructure Failures (Task #10):**
- Fixed test collection/setup errors across test files
- Restored tests to runnable state with proper mocking and configuration
- Updated vitest setup files: `dev/tests/setup.ts`, `development/testing/tests/setup.ts`

### Server Architecture Refactoring (Task #2)

**Storage Layer Decomposition:**
- Created `server/storage/log-storage-base.ts` — `LogStorageBase` abstract class
- Created `server/storage/user-storage-base.ts` — `UserStorageBase extends LogStorageBase`
- Additional storage modules: `analytics-storage.ts`, `customer-storage.ts`, `embedding-storage.ts`, `raw-data-storage.ts`, `segment-storage.ts`
- `server/storage.ts` is now 258 lines (main entry), with 7 storage modules under `server/storage/` totaling 1,698 lines

**Route Layer Modularization:**
- `server/routes.ts` replaced by `server/routes/index.ts` (601 lines) as the registrar
- 35 domain route modules under `server/routes/` totaling ~11,034 lines

## Recent Changes (October 2025)

### Production Stability Fixes

**Critical Issues Resolved:**
1. **Archive Database Initialization** - Fixed module-load blocking that caused cascading startup failures
2. **AbortController Memory Leak** - Fixed listener accumulation exceeding Node.js limits
3. **Connection Pool Optimization** - Reduced total pool from 12 to 9 connections
4. **Cache Warming Resilience** - Increased timeout, added circuit breaker pattern
5. **Health Check System** - Added `/api/health` endpoint with full system diagnostics

### Smart Auto-Resume for Embedding Jobs (October 2025)

Automatic recovery of orphaned embedding jobs after server restarts, with max 3 auto-restart attempts per job and 5-minute cooldown after real failures.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and production builds
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack React Query for server state and caching
- **Form Handling**: React Hook Form with Zod validation resolvers

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **API Design**: RESTful endpoints with structured error handling and logging
- **Routes**: 35 domain modules registered via `server/routes/index.ts`
- **Services**: 43 service files under `server/services/`
- **Performance**: Request caching, rate limiting, and performance monitoring middleware

### Database Design
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **Schema Management**: Drizzle Kit for migrations and schema evolution
- **Schema file**: `shared/schema.ts` (873 lines, 22 tables)
- **Key Tables**:
  - `customers` - Core customer profiles with unmapped fields support
  - `customerEmbeddings` - Vector embeddings for similarity search with HNSW indexing
  - `embeddingJobs` - Cancellable batch job management with smart auto-resume
  - `segments` - Customer segmentation with AI-generated criteria
  - `applicationLogs` - Comprehensive audit logging
  - `customerProfile`, `customerIdentity`, `eventStore`, `segmentDefinition` - CDP Phase 1 tables
  - `customerAttributes`, `customerEvents`, `customerIdentifiers` - Extended customer data
  - `dataImports`, `rawDataImports`, `dataSourceSchemas` - Import pipeline tables
- **Vector Storage**:
  - Optimized `embedding_vector` column using native pgvector type with HNSW index
  - Legacy `embedding` column (real array) maintained for backwards compatibility
  - Vector engine (`server/vector-engine.ts`) intelligently detects and uses optimized column when available
  - Migration infrastructure supports batched backfill (46.69% complete as of Oct 2025; not re-verified since)

### AI and Machine Learning
- **Vector Embeddings**: OpenAI text-embedding-3-small model for customer profile analysis
- **Batch Processing**: Cancellable embedding generation with real-time progress tracking
- **AI Segmentation**: Anthropic Claude integration for intelligent customer segment suggestions
- **Vector Search**: Similarity-based customer discovery using embedding vectors

### Data Processing Pipeline
- **Import System**: Multi-format data import (CSV, JSON, Excel) with duplicate detection
- **Validation**: Schema-based validation with field mapping and transformation
- **Batch Operations**: Configurable batch sizes with progress monitoring and cancellation support
- **Archive System**: Isolated schema-based data archiving with metadata preservation

### Security and Authentication
- **JWT Tokens**: Secure token-based authentication with configurable expiration
- **Password Security**: Bcrypt hashing with salt rounds
- **Anti-Crawler**: Comprehensive meta tags and middleware to prevent search engine indexing
- **Input Sanitization**: Request validation and sanitization throughout the API layer
- **Security Headers**: Helmet.js with CSP, HSTS, and frame protection

### Monitoring and Observability
- **Application Logging**: Structured JSON logging with multiple categories (system, user, ai, security)
- **Performance Tracking**: Request timing, slow query detection, and performance metrics
- **Error Handling**: Centralized error handling with structured error responses
- **Health Checks**: `/api/health` (full diagnostics) and `/health` (basic deployment check)

### Build and Deployment
- **Development**: Hot reload with Vite dev server and tsx for TypeScript execution
- **Production Build**: Vite frontend build with esbuild backend bundling
- **Environment Configuration**: Separate development and production configurations
- **CI/CD**: GitHub Actions with test, coverage, and SonarCloud integration

## External Dependencies

### Core Infrastructure
- **Database**: Neon Postgres serverless database with connection pooling
- **Email Service**: SendGrid integration (optional, graceful fallback when not configured)
- **Environment**: Replit hosting platform with integrated development environment

### AI and Machine Learning Services
- **OpenAI API**: Text embedding generation for vector search capabilities
- **Anthropic Claude**: AI-powered customer segmentation and analysis

### Third-Party Libraries
- **UI Framework**: Radix UI primitives for accessible component foundations
- **Charts and Visualization**: Recharts for analytics dashboard rendering
- **Date Handling**: date-fns for date manipulation and formatting
- **File Processing**: xlsx for Excel file parsing and CSV processing utilities

### Development Tools
- **Testing**: Vitest with Testing Library suite — 81 test files, ~1,334 test specs (coverage reports with v8 provider, thresholds at 10%)
- **Build Tools**: esbuild for fast TypeScript compilation and bundling
- **Database Tools**: Drizzle Kit for schema management and migrations
- **CI/CD**: GitHub Actions workflow (`.github/workflows/build.yml`) with SonarCloud (`sonar-project.properties`)

## Documentation Maintenance

After every task merge, verify and update the following:

1. **replit.md** — Add a "Recent Changes" entry summarizing what was added/changed. Update architecture descriptions, file counts, and table lists if the schema or file structure changed.
2. **TEST-RUN-REPORT.md** — Re-run `npx vitest run --reporter=verbose` and record the actual pass/fail/skip counts, test file count, and approximate spec count.
3. **MIGRATION-GUIDE.md / VECTOR-OPTIMIZATION-SUMMARY.md** — If the vector migration was advanced, update the completion percentage with a "Last verified: [date]" note. If not touched, leave as-is.
4. **Stale documentation files** (COVERAGE_FINAL_STATUS.md, COVERAGE-SUMMARY.md, etc.) — These are point-in-time snapshots from October 2025. Only update if a new coverage run was performed; otherwise leave the "Last verified" header intact.

**Key things to verify:**
- [ ] Test file count and approximate spec count match reality
- [ ] Coverage thresholds in `vitest.config.ts` match what documentation claims
- [ ] Table names in schema description match `shared/schema.ts`
- [ ] File paths referenced in docs still exist
- [ ] Line counts or file counts are current (if cited)
