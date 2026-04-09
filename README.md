<div align="center">

# Smart CDP

**AI-Powered Customer Data Platform**

Unify customer data, discover insights with vector search, and engage across channels — all from one platform.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.6-blue.svg)
![PostgreSQL](https://img.shields.io/badge/postgresql-pgvector-336791.svg)
![React](https://img.shields.io/badge/react-18.3-61dafb.svg)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation and Setup](#installation-and-setup)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Smart CDP is a full-stack Customer Data Platform that consolidates customer records from disparate sources into unified profiles, enriches them with AI-generated embeddings for semantic similarity search, and powers multi-channel engagement campaigns across Email, WhatsApp, and loyalty programs.

Built for teams that need to move from fragmented spreadsheets to a single source of truth for customer intelligence, Smart CDP provides:

- **Unified Customer Profiles** — merge data from CSV, Excel, and JSON imports into golden records with identity resolution and data quality scoring.
- **AI-Powered Intelligence** — generate vector embeddings with OpenAI, perform semantic similarity search via pgvector, and let AI map messy source columns to your schema automatically.
- **Deterministic Segmentation Engine** — define rule-based segments with complex AND/OR conditions evaluated against customer attributes and behavior.
- **Multi-Channel Campaigns** — orchestrate outbound messaging through WhatsApp Business API (WABA), SendGrid email, and SMS with consent management and frequency capping.
- **Enterprise Observability** — structured application logging with PII redaction, error grouping, real-time log streaming, anomaly detection, and comprehensive data lineage tracking.

---

## Key Features

### Unified Customer Profiles
- Import customer data from CSV, XLSX, and JSON files with AI-assisted column mapping
- Automatic duplicate detection with configurable handling strategies (skip, overwrite, merge, create new)
- Data quality scoring and validation with row-level error tracking
- Identity resolution across email, phone, device ID, and custom identifiers
- Dynamic customer attributes with flexible JSONB storage for unmapped fields
- Full data lineage tracking from source file to unified profile

### AI-Powered Data Pipeline
- **Vector Embeddings** — generate 1536-dimensional embeddings via OpenAI for every customer profile
- **Semantic Search** — find similar customers using natural language queries powered by pgvector HNSW indexing
- **AI Column Mapping** — automatically map arbitrary source file headers to your CDP schema using LLM intelligence
- **AI Segmentation** — describe a segment in plain English and let AI generate the corresponding filter rules
- **Cancellable Embedding Jobs** — long-running embedding generation with real-time progress tracking, pause/resume, graceful cancellation, and watchdog monitoring for stalled jobs
- **Adaptive Batch Sizing** — dynamic batch size adjustment based on API response times and rate limits

### Segmentation Engine
- Rule-based segment definitions with nested AND/OR conditions
- Real-time segment preview with customer count estimation
- Automatic segment membership evaluation
- Segment-targeted campaign delivery
- AI-assisted segment creation from natural language descriptions

### Multi-Channel Engagement
- **Email (SendGrid)** — transactional and marketing email delivery with template support
- **WhatsApp (WABA)** — template management, message delivery, and webhook-based status tracking via Meta Cloud API
- **Campaign Management** — campaign lifecycle management: draft, schedule, send, and track delivery analytics (sent, delivered, read, failed). Channel schema supports WhatsApp, email, SMS, and push (WhatsApp and email integrations are fully implemented; SMS and push are schema-ready for future providers)
- **Consent & Suppression** — per-channel opt-in/opt-out tracking, suppression lists, frequency capping, and compliance enforcement

### Loyalty & Points System
- Immutable append-only point ledger with idempotency protection
- Earn, burn, expiry, and adjustment transaction types
- Materialized balance cache with tier management (Bronze, Silver, Gold, Platinum)
- Redemption workflow with approval lifecycle (pending, approved, rejected, fulfilled, cancelled)

### Scoring & Analytics
- Customer engagement scoring with configurable weighted models
- Batch scoring scheduler with automatic recalculation every 6 hours
- Score distribution analytics and churn risk analysis
- High-value customer identification

### Enterprise Observability
- Structured logging with categories: system, email, authentication, database, API, import, vector, archive, security, AI
- PII redaction engine with configurable rules
- Error grouping by fingerprint with z-score anomaly detection
- Log alerts with threshold and statistical analysis methods
- Real-time log streaming via WebSocket
- Archive management with backup and restore capabilities
- API performance monitoring with response time tracking

### Security
- JWT-based authentication with HTTP-only cookie tokens
- Role-based access control (admin, analyst, marketing, viewer)
- Email activation workflow with SendGrid
- Helmet security headers (CSP, HSTS, X-Frame-Options, etc.)
- Anti-crawler middleware with robots.txt enforcement
- Rate limiting with token bucket algorithm
- Secure vector search endpoints with input validation and audit logging
- Environment security validation on startup (fail-fast for missing secrets)

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.6 | Type safety |
| Vite | 5.4 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| shadcn/ui (Radix) | Latest | Component library |
| TanStack React Query | 5.x | Server state management |
| wouter | 3.3 | Client-side routing |
| Recharts | 2.15 | Data visualization |
| Framer Motion | 11.x | Animations |
| Lucide React | 0.543 | Icon library |
| react-hook-form | 7.62 | Form management |
| react-joyride | 2.9 | Onboarding tour |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | >= 18 | Runtime |
| Express | 4.21 | HTTP server |
| TypeScript | 5.6 | Type safety |
| Drizzle ORM | 0.39 | Database access and schema |
| Zod | 3.25 | Request validation |
| jsonwebtoken | 9.0 | JWT authentication |
| bcryptjs | 3.0 | Password hashing |
| Helmet | 8.1 | Security headers |
| express-rate-limit | 8.1 | Rate limiting |
| Multer | 2.0 | File uploads |
| csv-parser / fast-csv | 3.2 / 5.0 | CSV processing |
| xlsx | 0.18 | Excel file processing |
| ws | 8.18 | WebSocket (real-time progress) |

### Database & AI

| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | Latest | Primary database |
| pgvector | 0.2 | Vector similarity search |
| Neon Serverless | 1.0 | Serverless Postgres driver |
| Drizzle Kit | 0.30 | Schema migrations |
| OpenAI SDK | 5.20 | Embedding generation and AI features |
| Anthropic SDK | 0.61 | Alternative AI provider (available as dependency) |

### Testing

| Technology | Version | Purpose |
|---|---|---|
| Vitest | 3.2 | Test runner |
| @testing-library/react | 16.3 | Component testing |
| MSW | 2.10 | API mocking |
| Supertest | 7.1 | HTTP assertion |
| jsdom | 26.1 | DOM environment |

### Integrations

| Service | Purpose |
|---|---|
| SendGrid | Transactional and marketing email delivery |
| WhatsApp Business API (WABA) | Template messaging via Meta Cloud API |
| OpenAI | Vector embeddings and AI-powered features |
| Replit Auth | OAuth-based authentication (optional) |

---

## Architecture Overview

Smart CDP follows a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React SPA)                          │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐  │
│  │Dashboard│ │Customers │ │Segments │ │Campaigns │ │Admin Tools│  │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘ └───────────┘  │
│  React 18 + TanStack Query + wouter + shadcn/ui + Tailwind CSS     │
├──────────────────────────────────────────────────────────────────────┤
│                      API LAYER (Express.js)                         │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────────────┐  │
│  │ Auth Routes  │ │ Domain Routes  │ │ Admin / Observability    │  │
│  │ (JWT + RBAC) │ │ (Modular)      │ │ Routes                   │  │
│  └──────────────┘ └────────────────┘ └──────────────────────────┘  │
│  Helmet ∙ Rate Limiting ∙ Anti-Crawler ∙ Error Handler             │
├──────────────────────────────────────────────────────────────────────┤
│                      SERVICE LAYER                                  │
│  ┌───────────────┐ ┌────────────────┐ ┌─────────────────────────┐  │
│  │ AI Services   │ │ Campaign Svc   │ │ Observability Services  │  │
│  │ (Embeddings,  │ │ (WABA, Email,  │ │ (Logger, Monitoring,    │  │
│  │  Mapping, AI  │ │  Consent,      │ │  Lineage, Watchdog,     │  │
│  │  Segmentation)│ │  Loyalty)      │ │  Cache Warming)         │  │
│  └───────────────┘ └────────────────┘ └─────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                      STORAGE LAYER                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ PostgreSQL + pgvector                                        │   │
│  │ Drizzle ORM ∙ JSONB ∙ GIN Indexes ∙ HNSW Vector Indexes     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

- **Modular Route Organization** — domain-specific routes extracted into separate modules (auth, customers, segments, campaigns, loyalty, etc.) registered through a central hub.
- **Storage Interface** — all database operations go through an `IStorage` interface, enabling testability and future storage backend swaps.
- **Service Layer** — business logic encapsulated in services (AI column mapper, campaign service, consent service, scoring engine, etc.) keeping route handlers thin.
- **WebSocket Streaming** — real-time embedding progress updates pushed to connected clients.
- **Cache Warming** — analytics cache pre-populated on startup and refreshed periodically for sub-second dashboard loads.
- **Security-First Startup** — environment validation runs before any server initialization; the process exits immediately if critical secrets are missing.

---

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| Node.js | 18.0.0 |
| npm | 8.0.0 |
| PostgreSQL | 14+ with pgvector extension |

### Required External Services

| Service | Required For | How to Obtain |
|---|---|---|
| PostgreSQL Database | Core data storage | Any PostgreSQL provider (Neon, Supabase, local) |
| OpenAI API Key | Vector embeddings and AI features | [platform.openai.com](https://platform.openai.com) |
| SendGrid API Key | Email delivery (activation, campaigns) | [sendgrid.com](https://sendgrid.com) |
| WhatsApp Business API | WhatsApp messaging (optional) | [Meta Business Suite](https://business.facebook.com) |

---

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/promina-smart-cdp.git
cd promina-smart-cdp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up the Database

Ensure PostgreSQL is running and the `pgvector` extension is available:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Configure Environment Variables

Create a `.env` file in the project root (see [Configuration](#configuration) for the full list):

```env
DATABASE_URL=postgresql://user:password@host:5432/smartcdp
JWT_SECRET=your-secure-secret-minimum-32-characters
OPENAI_API_KEY=sk-...
SENDGRID_API_KEY=SG....
```

### 5. Push the Database Schema

```bash
npm run db:push
```

This uses Drizzle Kit to synchronize the schema defined in `shared/schema.ts` with your database.

### 6. Start the Development Server

```bash
npm run dev
```

The application starts on **port 5000**, serving both the API and the React frontend from a single Express server with Vite HMR in development mode.

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NODE_ENV` | Yes | `development` or `production` |
| `JWT_SECRET` | Production | Secret for signing JWT tokens (minimum 32 characters in production) |
| `SESSION_SECRET` | Production | Secret for Express session middleware |
| `PII_MASKING_SALT` | Production | Salt for PII data masking |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings and AI features |
| `SENDGRID_API_KEY` | Yes | SendGrid API key for email delivery |
| `SENDGRID_VERIFIED_SENDER` | No | Verified sender email for SendGrid |
| `WABA_PHONE_NUMBER_ID` | No | WhatsApp Business phone number ID |
| `WABA_ACCESS_TOKEN` | No | WhatsApp Business API access token |
| `WABA_BUSINESS_ACCOUNT_ID` | No | WhatsApp Business Account ID |
| `WABA_WEBHOOK_VERIFY_TOKEN` | No | Webhook verification token for WABA |
| `WABA_WEBHOOK_SECRET` | Production | HMAC secret for verifying Meta webhook payloads |
| `APP_URL` | No | Public application URL (used in email links) |

> **Note:** In production (`NODE_ENV=production`), the server validates that all required environment variables are set and exits immediately if any are missing. In development, only `NODE_ENV` and `DATABASE_URL` are required.

### Database Setup with pgvector

Smart CDP uses pgvector for vector similarity search. The `customerEmbeddings` table stores 1536-dimensional vectors generated by OpenAI's embedding model. Ensure your PostgreSQL instance supports the `vector` extension:

```sql
-- Verify pgvector is installed
SELECT * FROM pg_extension WHERE extname = 'vector';

-- If not installed (requires superuser)
CREATE EXTENSION vector;
```

The Drizzle schema automatically creates the necessary vector columns and indexes when you run `npm run db:push`.

---

## Usage Guide

### Dashboard

The main dashboard provides an at-a-glance overview of your customer data:
- Total customer count and active user metrics
- Segment distribution charts
- Data quality overview
- Recent import activity
- Platform health indicators

### Customer Profiles

Browse, search, and filter unified customer profiles:
- Full-text search by name, email, or phone
- Filter by segment, data quality score, or lifetime value
- View detailed profile cards with demographics, events, and attributes
- Access original source data and field mapping metadata

### Vector Search

Find similar customers using natural language queries:
- Enter a description like "young professionals in Jakarta with high engagement"
- The system generates an embedding and performs cosine similarity search against all customer vectors
- Results ranked by similarity score with detailed profile previews
- Segment analysis and cluster analysis views

### Segments

Create and manage customer segments:
- Define segments with rule-based criteria (field conditions with AND/OR operators)
- Preview segment membership before saving
- AI-assisted segment creation from natural language descriptions
- View segment member lists and export capabilities

### Data Import Workflow

1. **Upload** — drag and drop CSV, XLSX, or JSON files
2. **Preview** — inspect detected columns, data types, and sample rows
3. **Map Columns** — manually assign or use AI to auto-map source headers to CDP fields
4. **Configure** — set duplicate handling strategy and validation rules
5. **Import** — process records with real-time progress tracking
6. **Review** — inspect import results, error details, and retry failed records

### Campaigns

Create multi-channel marketing campaigns:
- Select target segment and communication channel (WhatsApp, email, SMS, push)
- Configure message template with personalization variables
- Schedule for immediate or future delivery
- Track delivery analytics: sent, delivered, read, and failed counts

### Loyalty Program

Manage customer loyalty points:
- View point balances and transaction history per customer
- Process earn and burn transactions with idempotency protection
- Manage redemption requests through the approval workflow
- Monitor tier distribution across the customer base

### Admin Tools

- **User Management** — create and manage platform users with role assignments (admin, analyst, marketing, viewer)
- **Archive Management** — create data backups and restore from archives
- **Application Logs** — browse structured logs with category/level filtering, search, and real-time streaming
- **Real-Time Log View** — live monitoring dashboard with auto-refresh for embedding system status

---

## API Reference

All API endpoints are served under the `/api` prefix. Authentication is required for most endpoints via JWT token (passed as an HTTP-only cookie or Authorization header). The tables below list the primary endpoints; for the authoritative source, refer to the route modules in `server/routes/`.

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api` | API status and version |
| `GET` | `/health` | Server health with uptime and memory |
| `GET` | `/api/health` | Comprehensive health check with system diagnostics |

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login with email and password |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET` | `/api/auth/me` | Get current authenticated user |
| `GET` | `/api/auth/activate?token=...` | Activate account via email token |
| `POST` | `/api/auth/resend-activation` | Resend activation email |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List platform users |
| `GET` | `/api/users/:id` | Get user by ID |
| `POST` | `/api/users` | Register a new user account |
| `PUT` | `/api/users/:id` | Update user details |
| `DELETE` | `/api/users/:id` | Delete a user |

### Customers

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/customers` | List customers (paginated) |
| `GET` | `/api/customers/search?q=...` | Search customers by name, email, phone |
| `POST` | `/api/customers/filter` | Filter customers by criteria |
| `GET` | `/api/customers/:id` | Get customer by ID |
| `POST` | `/api/customers` | Create a new customer |
| `PUT` | `/api/customers/:id` | Update customer fields |
| `GET` | `/api/customers/:id/events` | Get customer events |
| `POST` | `/api/customers/:id/events` | Create a customer event |
| `GET` | `/api/customers/:id/segments` | Get customer's segments |
| `GET` | `/api/customers/:id/lineage` | Get data lineage for a customer |

### Segments

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/segments` | List all segments |
| `GET` | `/api/segments/metrics/:segmentId` | Get segment metrics and analytics |
| `GET` | `/api/segments/metrics` | Get metrics for all segments |
| `POST` | `/api/segments` | Create a new segment |
| `PATCH` | `/api/segments/:id` | Update segment |
| `POST` | `/api/segments/from-ai` | Create segment from AI-generated rules |
| `POST` | `/api/ai/segment-suggestions` | Get AI segment suggestions from description |

### Vector Search (Secure)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/vector-secure/search` | Semantic search with natural language query |
| `POST` | `/api/vector-secure/find-similar/:customerId` | Find customers similar to a given profile |
| `GET` | `/api/vector-secure/segment-analysis` | Analyze segment distribution in vector space |
| `GET` | `/api/vector-secure/cluster-analysis` | Cluster analysis of customer embeddings |
| `GET` | `/api/vector-secure/health` | Vector search service health status |

### Data Import

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/files/preview` | Preview file contents and detected schema |
| `POST` | `/api/files/upload` | Upload and process a file for import |
| `POST` | `/api/imports/start` | Start a new import session |
| `GET` | `/api/imports` | List import history (paginated, filterable) |
| `GET` | `/api/imports/:sessionId/progress` | Get real-time import progress |
| `GET` | `/api/imports/:sessionId/status` | Get import session status |
| `POST` | `/api/imports/:sessionId/cancel` | Cancel a running import |
| `POST` | `/api/imports/:sessionId/resume` | Resume a paused import |
| `POST` | `/api/data/import` | Bulk import customers via JSON |

### AI Column Mapping

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ai-mapping/map-columns` | AI-powered column mapping suggestions |
| `POST` | `/api/mapping-review/analyze` | Analyze column mappings |
| `POST` | `/api/mapping-review/approve` | Approve and apply column mappings |
| `GET` | `/api/mapping-review/fields` | Get available mapping fields |

### Embeddings

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/embeddings/batch/start` | Start batch-optimized embedding generation |
| `GET` | `/api/embeddings/batch/:jobId/status` | Get batch job status |
| `POST` | `/api/embeddings/batch/:jobId/cancel` | Cancel a batch embedding job |
| `POST` | `/api/embeddings/batch/:jobId/pause` | Pause a batch embedding job |
| `POST` | `/api/embeddings/batch/:jobId/resume` | Resume a paused batch job |
| `GET` | `/api/embeddings/batch/latest-status` | Get latest batch job status |
| `GET` | `/api/embeddings/batch/jobs` | List all batch jobs |
| `GET` | `/api/embeddings/system/status` | Get embedding system status |
| `POST` | `/api/embeddings/start` | Start a legacy embedding job |
| `GET` | `/api/embeddings/:jobId/status` | Get legacy job status |
| `POST` | `/api/embeddings/:jobId/cancel` | Cancel a legacy embedding job |

### Campaigns

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List campaigns (filterable) |
| `POST` | `/api/campaigns` | Create a campaign |
| `GET` | `/api/campaigns/:id` | Get campaign details |
| `PATCH` | `/api/campaigns/:id` | Update campaign |
| `POST` | `/api/campaigns/:id/schedule` | Schedule a campaign |
| `POST` | `/api/campaigns/:id/execute` | Execute a campaign (resolve audience + send) |
| `POST` | `/api/campaigns/:id/cancel` | Cancel a campaign |
| `POST` | `/api/campaigns/:id/complete` | Mark campaign as completed |
| `GET` | `/api/campaigns/:id/analytics` | Get campaign delivery analytics |
| `GET` | `/api/campaigns/:id/messages` | List campaign messages per recipient |
| `GET` | `/api/campaigns/:id/audience-preview` | Preview audience without executing |

### Loyalty

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/loyalty/balance/:profileId` | Get point balance and tier |
| `GET` | `/api/loyalty/history/:profileId` | Get paginated transaction history |
| `GET` | `/api/loyalty/redemptions/:profileId` | Get redemption list for a profile |
| `GET` | `/api/loyalty/rules` | Get configured earn/burn rules and tiers |
| `POST` | `/api/loyalty/earn` | Record earn transaction |
| `POST` | `/api/loyalty/burn` | Record burn transaction |
| `POST` | `/api/loyalty/redeem` | Submit redemption request |
| `POST` | `/api/loyalty/redemptions/:id/approve` | Approve a pending redemption |
| `POST` | `/api/loyalty/redemptions/:id/reject` | Reject or cancel a redemption |

### Consent & Suppression

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/consent/:profileId` | Get all consent records for a profile |
| `GET` | `/api/consent/:profileId/:channel` | Get consent for specific channel |
| `POST` | `/api/consent` | Create or update consent record |
| `POST` | `/api/consent/revoke` | Revoke consent |
| `POST` | `/api/consent/bulk-check` | Bulk check consent for multiple profiles |
| `GET` | `/api/consent/frequency-cap/:profileId/:channel` | Check frequency cap status |
| `GET` | `/api/suppression` | List suppression records |
| `POST` | `/api/suppression` | Add to suppression list |
| `DELETE` | `/api/suppression` | Remove from suppression list |
| `GET` | `/api/suppression/check/:profileId` | Check if profile is suppressed |

### WABA (WhatsApp Business API)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/waba/templates` | List cached WhatsApp templates |
| `POST` | `/api/waba/templates/sync` | Force refresh templates from Meta API |
| `POST` | `/api/waba/send/template` | Send a template message |
| `POST` | `/api/waba/send/text` | Send a text message |
| `POST` | `/api/waba/send/interactive` | Send an interactive message |
| `POST` | `/api/waba/campaigns/:id/broadcast` | Trigger campaign broadcast |
| `GET` | `/api/webhooks/waba` | Meta webhook verification (hub challenge) |
| `POST` | `/api/webhooks/waba` | Receive inbound webhook events from Meta |

### Scoring & Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scoring/profiles/:profileId` | Get engagement score for a customer |
| `POST` | `/api/scoring/batch` | Trigger batch score recalculation (admin) |
| `GET` | `/api/scoring/distribution` | Get score distribution histogram |
| `GET` | `/api/scoring/summary` | Overall analytics dashboard summary |
| `GET` | `/api/scoring/campaigns` | Campaign analytics list |
| `GET` | `/api/scoring/campaigns/:campaignId` | Single campaign performance metrics |

### Observability

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/logs` | Query application logs (filterable by level, category, date) |
| `GET` | `/api/data-lineage` | Data lineage routes |

---

## Testing

Smart CDP uses Vitest as the test runner with React Testing Library for component tests.

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests with UI

```bash
npm run test:ui
```

### Test Tooling

| Tool | Purpose |
|---|---|
| Vitest | Test runner and assertion library |
| @testing-library/react | React component rendering and queries |
| @testing-library/user-event | User interaction simulation |
| MSW (Mock Service Worker) | API request interception and mocking |
| Supertest | HTTP endpoint integration testing |
| jsdom | Browser DOM simulation |
| @vitest/coverage-v8 | Code coverage via V8 |

---

## Project Structure

The following is a high-level overview of the main directories and key files. The actual codebase contains additional route modules, services, and utilities not listed here.

```
promina-smart-cdp/
├── client/                      # Frontend React application
│   └── src/
│       ├── components/          # Reusable UI components
│       │   ├── layout/          # Sidebar, navigation
│       │   ├── ui/              # shadcn/ui components
│       │   ├── auth/            # Protected route, login forms
│       │   ├── chatbot/         # AI analytics chatbot
│       │   ├── onboarding/      # User onboarding tour
│       │   └── common/          # Shared utilities
│       ├── contexts/            # React contexts (auth, onboarding)
│       ├── hooks/               # Custom hooks
│       ├── lib/                 # Query client, utilities
│       └── pages/               # Route page components
│           ├── dashboard.tsx
│           ├── customers.tsx
│           ├── vector-search.tsx
│           ├── segments.tsx
│           ├── data-import.tsx
│           ├── campaigns.tsx
│           ├── loyalty.tsx
│           ├── consent.tsx
│           ├── scoring.tsx
│           ├── waba.tsx
│           └── admin/           # Admin-only pages
├── server/                      # Backend Express application
│   ├── index.ts                 # Server entry point
│   ├── app.ts                   # Express app factory
│   ├── storage.ts               # IStorage interface and implementation
│   ├── routes/                  # API route modules
│   │   ├── index.ts             # Central route registration
│   │   ├── auth-routes.ts
│   │   ├── customer-routes.ts
│   │   ├── segment-routes.ts
│   │   ├── campaign-routes.ts
│   │   ├── loyalty-routes.ts
│   │   ├── consent-routes.ts
│   │   ├── scoring-routes.ts
│   │   ├── embedding-routes.ts
│   │   ├── secure-vector-routes.ts
│   │   ├── waba-webhook-routes.ts
│   │   ├── ai-mapping-routes.ts
│   │   ├── import-routes.ts
│   │   ├── file-upload-routes.ts
│   │   └── logs-routes.ts
│   ├── services/                # Business logic services
│   │   ├── ai-column-mapper.ts
│   │   ├── ai-segment-service.ts
│   │   ├── application-logger.ts
│   │   ├── campaign-service.ts
│   │   ├── consent-service.ts
│   │   ├── cancellable-embedding-service.ts
│   │   ├── embedding-watchdog-service.ts
│   │   └── ...
│   ├── middleware/               # Express middleware
│   ├── utils/                   # Utility modules
│   │   ├── secure-logger.ts
│   │   ├── environment-security.ts
│   │   └── health-check.ts
│   ├── jwt-utils.ts             # JWT token management
│   ├── auth-middleware.ts       # Authentication middleware
│   ├── cache.ts                 # Cache manager
│   └── cache-warming.ts         # Analytics cache pre-warming
├── shared/
│   └── schema.ts                # Drizzle ORM schema (single source of truth)
├── docs/
│   └── DATABASE_DOCUMENTATION.md # Comprehensive database documentation
├── test/                        # Test files
├── drizzle.config.ts            # Drizzle Kit configuration
├── vite.config.ts               # Vite build configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies and scripts
```

---

## Deployment

### Build for Production

```bash
npm run build
```

This runs `vite build` for the frontend and `esbuild` for the backend, producing optimized output in the `dist/` directory.

### Start Production Server

```bash
npm start
```

Runs `NODE_ENV=production node dist/index.js` on port 5000.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set a strong `JWT_SECRET` (minimum 32 characters)
- [ ] Set `SESSION_SECRET` for Express sessions
- [ ] Set `PII_MASKING_SALT` for data masking
- [ ] Configure `DATABASE_URL` pointing to production PostgreSQL with pgvector
- [ ] Set `OPENAI_API_KEY` for AI features
- [ ] Set `SENDGRID_API_KEY` and `SENDGRID_VERIFIED_SENDER` for email delivery
- [ ] Configure WABA credentials and `WABA_WEBHOOK_SECRET` if using WhatsApp
- [ ] Ensure the pgvector extension is enabled in the production database
- [ ] Run `npm run db:push` against the production database to sync schema
- [ ] Verify the health check endpoint responds at `/api/health`

### Replit Deployment

Smart CDP is designed to run on Replit. The application serves both frontend and backend on port 5000 (the only non-firewalled port). Use the built-in deployment workflow to publish to production.

---

## Contributing

Contributions are welcome. Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes following the conventions below
4. Run tests: `npm test`
5. Run type checking: `npm run check`
6. Commit with a descriptive message
7. Push and open a Pull Request

### Code Conventions

- **TypeScript** — all code is TypeScript with strict mode; no `any` types without justification
- **Schema First** — data model changes start in `shared/schema.ts` with Drizzle ORM
- **Thin Routes** — route handlers delegate to the storage interface or services; keep business logic out of routes
- **Zod Validation** — all API inputs validated with Zod schemas derived from `drizzle-zod`
- **React Query** — use TanStack Query for all data fetching; invalidate caches after mutations
- **shadcn/ui** — use existing component library; avoid custom CSS where possible
- **Structured Logging** — use `applicationLogger` for all server-side logging with appropriate categories

### Branch Naming

- `feature/` — new features
- `fix/` — bug fixes
- `refactor/` — code improvements without behavior changes
- `docs/` — documentation updates

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Drizzle ORM](https://orm.drizzle.team/) — type-safe database toolkit
- [pgvector](https://github.com/pgvector/pgvector) — open-source vector similarity search for PostgreSQL
- [OpenAI](https://openai.com/) — embedding generation and AI capabilities
- [shadcn/ui](https://ui.shadcn.com/) — beautifully designed component library
- [SendGrid](https://sendgrid.com/) — email delivery infrastructure
- [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) — WhatsApp Business messaging
- [Recharts](https://recharts.org/) — composable charting library for React
- [TanStack Query](https://tanstack.com/query) — powerful data synchronization for React
