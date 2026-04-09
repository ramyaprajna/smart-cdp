# CDP Phase 1 Foundation — Comprehensive Implementation Plan

**Project:** Smart CDP Platform — Promina Indofood  
**Sprint:** Weeks 1–2 (Tactical Execution)  
**Source Document:** CDP Foundation Technical Playbook (Panduan Pengembangan Fase 1: Fondasi CDP)  
**Date:** March 17, 2026  
**Status:** Pre-Implementation — Planning Complete, No Changes Made

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Strategic Context](#2-strategic-context)
3. [Repository State Assessment](#3-repository-state-assessment)
4. [Task Breakdown](#4-task-breakdown)
   - [Task 1 — Data Schema Evolution](#task-1--data-schema-evolution)
   - [Task 2 — Identity Resolution (Golden Record)](#task-2--identity-resolution-golden-record)
   - [Task 3 — Event Ingestion Standardization](#task-3--event-ingestion-standardization)
   - [Task 4 — Attribute Processor](#task-4--attribute-processor)
   - [Task 5 — Basic Segmentation Engine](#task-5--basic-segmentation-engine)
5. [Architecture: Final State After Phase 1](#5-architecture-final-state-after-phase-1)
6. [File Change Impact Matrix](#6-file-change-impact-matrix)
7. [Risk Assessment](#7-risk-assessment)
8. [Implementation Order & Dependencies](#8-implementation-order--dependencies)
9. [Definition of Done](#9-definition-of-done)
10. [Phase 2 Readiness Criteria](#10-phase-2-readiness-criteria)

---

## 1. Executive Summary

Phase 1 transforms the existing Smart CDP Beta from an **import-driven analytics platform** into a **real-time, webhook-powered, identity-resolved Customer Data Platform**. The 5 tasks in the playbook are all scoped to specific existing files in this repository, with 2 brand-new files to create and 3 existing files to extend.

The work is **strictly additive** — no existing tables, routes, or services are deleted or replaced. The new pipeline runs alongside the existing import pipeline.

**Upon completion, the platform becomes the Single Source of Truth for:**
- Customer Profiles (Golden Record, de-duplicated by identity)
- Behavioral Events (real-time, multi-source)
- Segment Membership (rule-based, deterministic)

This is the critical prerequisite before Phase 2 (Rise CRM Sync + n8n Orchestration) can begin.

---

## 2. Strategic Context

### Why This Phase Exists

The current platform excels at batch data import (CSV/Excel), AI-assisted column mapping, duplicate detection, and vector similarity search. However, it lacks:

- A **real-time ingestion pipeline** for live webhook payloads (WhatsApp Business API, WA Flow, CRM)
- An **identity resolution engine** that unifies a customer across multiple channels into one profile
- An **automated attribute enrichment** mechanism that keeps profile data current without manual imports
- A **deterministic rule-based segmentation engine** that can be synced to a CRM

### What Does Not Change

- The existing `customers` table and all import workflows remain fully operational
- All existing UI pages, API routes, and services are untouched
- The existing AI segmentation, vector search, and embedding features continue to work
- All current authentication, RBAC, and logging infrastructure stays in place

---

## 3. Repository State Assessment

### Current File Inventory (Relevant to Phase 1)

| File | Current Size | Current Purpose | Phase 1 Role |
|---|---|---|---|
| `shared/schema.ts` | 800+ lines, 18 tables | Full app data model | Add 4 new tables |
| `server/data-lineage-service.ts` | 24KB | Batch import tracking & lineage | Extend with identity resolution |
| `server/routes.ts` | 75KB (~1,925 lines) | All API routes | Add new ingestion endpoints |
| `server/services/attribute-processor.ts` | **Does not exist** | — | Create from scratch |
| `shared/segment-templates.ts` | **Does not exist** | — | Create from scratch |

### Existing Tables That Overlap With New Tables (Not Replacements)

| Existing Table | New Table | Relationship |
|---|---|---|
| `customers` | `customer_profile` | `customers` = import-driven batch record. `customer_profile` = identity-resolved Golden Record from real-time events. Both coexist. |
| `customerIdentifiers` | `customer_identity` | `customerIdentifiers` links to `customers` (batch import context). `customer_identity` links to `customer_profile` (real-time webhook context). |
| `customerEvents` | `event_store` | `customerEvents` = events manually imported. `event_store` = events received via webhook in real-time. |
| `segments` | `segment_definition` | `segments` = UI-managed segments with AI assistance. `segment_definition` = engine-readable rule definitions for the deterministic segmentation pipeline. |

### Existing Services That Relate to Phase 1

| Service File | Relevance |
|---|---|
| `server/services/duplicate-detection-service.ts` | Concept overlap with Task 3 deduplication — but scoped to batch imports, not webhook deduplication |
| `server/services/dynamic-attribute-service.ts` | Concept overlap with Task 4 — but handles custom user-defined attributes, not automated enrichment from events |
| `server/services/ai-segment-service.ts` | Concept overlap with Task 5 — AI-assisted segmentation; the new engine is deterministic/rule-based and will run alongside it |
| `server/services/schema-registry-service.ts` | Useful for Task 3 — the Zod validation step can reference this pattern |

---

## 4. Task Breakdown

---

### Task 1 — Data Schema Evolution

**Playbook Reference:** Langkah 1: Evolusi Skema Data (Drizzle ORM)  
**Target File:** `shared/schema.ts`  
**Type of Change:** Additive — new tables appended, nothing modified  
**Requires DB Push:** Yes — `npm run db:push` after changes

#### New Tables to Define

---

##### Table 1: `customer_profile` (Golden Record)

The canonical, deduplicated customer record. One row per real person, regardless of how many channels or sources they came from.

```typescript
export const customerProfile = pgTable("customer_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Core identity fields
  name: text("name"),
  email: text("email"),
  whatsappNumber: text("whatsapp_number"),
  crmId: text("crm_id"),
  // Status & behavioral summary
  status: text("status").default("active"), // 'active', 'inactive', 'churned'
  lastActivityDate: timestamp("last_activity_date", { withTimezone: true }),
  totalEventsCount: integer("total_events_count").default(0),
  // Source metadata
  primaryChannel: text("primary_channel"), // 'waba', 'wa_flow', 'crm'
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
```

**Why distinct from `customers`:** The `customers` table accumulates rows from CSV/Excel imports, one per imported row. `customer_profile` is maintained via identity resolution — there is always exactly one row per real person.

---

##### Table 2: `customer_identity` (Identifier Mapping)

Maps every known identifier (WhatsApp number, email, CRM ID) to a `customer_profile` ID. This is the lookup table for the identity resolution engine.

```typescript
export const customerIdentity = pgTable("customer_identity", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(), // FK → customer_profile.id
  identifierType: text("identifier_type").notNull(), // 'whatsapp', 'email', 'crm_id'
  identifierValue: text("identifier_value").notNull(),
  sourceSystem: text("source_system"), // 'waba', 'wa_flow', 'crm'
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
});
// Unique constraint: one identifierType + identifierValue pair maps to one profile
```

**Why distinct from `customerIdentifiers`:** `customerIdentifiers` is tied to the `customers` table and batch import flows. `customer_identity` is the real-time lookup store for the webhook pipeline.

---

##### Table 3: `event_store` (Behavioral Events)

Stores all real-time behavioral events received via webhook from all channels, normalized into a unified format.

```typescript
export const eventStore = pgTable("event_store", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull(), // FK → customer_profile.id (resolved via identity)
  // Event classification
  eventType: text("event_type").notNull(), // 'message_read', 'message_sent', 'quiz_completed', etc.
  sourceChannel: text("source_channel").notNull(), // 'waba', 'wa_flow', 'crm'
  // Idempotency key — prevents duplicate events
  idempotencyKey: text("idempotency_key").unique(), // Hash of source + event ID + timestamp
  // Payload
  rawPayload: jsonb("raw_payload"), // Original incoming payload
  normalizedPayload: jsonb("normalized_payload"), // Standardized fields
  // Timestamps
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
});
```

**Why distinct from `customerEvents`:** `customerEvents` is populated via data import. `event_store` is populated exclusively by the real-time webhook ingestion pipeline and includes the `idempotencyKey` field required for deduplication.

---

##### Table 4: `segment_definition` (Segmentation Rules)

Stores rule sets that the segmentation engine evaluates against `customer_profile` and `event_store` data.

```typescript
export const segmentDefinition = pgTable("segment_definition", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  // Rules stored as structured JSON the engine can evaluate
  rules: jsonb("rules").notNull(),
  // Example rules structure:
  // { "operator": "AND", "conditions": [
  //   { "field": "event_store.event_type", "op": "eq", "value": "quiz_completed" },
  //   { "field": "event_store.eventTimestamp", "op": "within_days", "value": 7 }
  // ]}
  isActive: boolean("is_active").default(true),
  // Output tracking
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  memberCount: integer("member_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
```

**Why distinct from `segments`:** The `segments` table is created and managed through the UI and holds criteria as free-form JSON for the AI segmentation system. `segment_definition` holds structured, machine-executable rule definitions for the deterministic filtering engine.

#### After Defining Tables

Add corresponding Drizzle relations and `createInsertSchema` / type exports for all 4 tables, following the existing pattern in `schema.ts`. Then run:

```bash
npm run db:push
```

---

### Task 2 — Identity Resolution (Golden Record)

**Playbook Reference:** Langkah 2: Resolusi Identitas (Golden Record)  
**Target File:** `server/data-lineage-service.ts`  
**Type of Change:** Extension — new class/functions added, existing code untouched

#### What Needs to Be Built

A new exported class or set of functions within `data-lineage-service.ts` that implements the Golden Record resolution logic. It should be clearly separated from the existing `DataLineageService` class.

#### Resolution Logic (Tactical Rules from Playbook)

```
Input: Incoming event with one or more identifiers
       (WhatsApp Number, Email Address, CRM ID)

Step 1 — Lookup
  For each identifier in the event:
    Query customer_identity WHERE identifierType = X AND identifierValue = Y

Step 2a — Profile Found (Existing Customer)
  → Use the resolved profileId
  → Update customer_identity.lastSeenAt
  → Merge any new identifiers from this event into customer_identity
  → Return profileId

Step 2b — Profile Not Found (New Customer)
  → INSERT new row into customer_profile
  → INSERT new row(s) into customer_identity for each identifier
  → Return new profileId

Output: profileId (always — either existing or newly created)
```

#### Suggested Implementation Structure

```typescript
// Add inside server/data-lineage-service.ts

export class IdentityResolutionService {

  async resolveIdentity(identifiers: IdentifierInput[]): Promise<string> {
    // 1. Search customer_identity for any known identifier
    // 2. If found: update lastSeenAt, add any new identifiers, return profileId
    // 3. If not found: create customer_profile + customer_identity rows, return new profileId
  }

  private async findProfileByIdentifier(
    type: string,
    value: string
  ): Promise<string | null> {
    // Query customer_identity table
  }

  private async createNewProfile(
    identifiers: IdentifierInput[]
  ): Promise<string> {
    // INSERT customer_profile, then INSERT customer_identity rows
  }
}

export interface IdentifierInput {
  type: 'whatsapp' | 'email' | 'crm_id';
  value: string;
  sourceSystem: string;
}
```

#### Coexistence Concern

The existing `DataLineageService` in this file manages batch import sessions (`startImport`, `importCustomers`, `completeImport`). The new `IdentityResolutionService` is completely independent — it does not touch `dataImports`, `customers`, or any import-related tables. Both classes in the same file serve different pipeline contexts.

---

### Task 3 — Event Ingestion Standardization

**Playbook Reference:** Langkah 3: Standardisasi Ingesti Event  
**Target File:** `server/routes.ts`  
**Type of Change:** Additive — new webhook endpoint(s) added, existing routes untouched

#### The 4-Step Pipeline

Every incoming webhook from any source goes through this exact sequence:

```
1. VALIDATE
   Validate raw JSON against Zod schema defined in shared/schema.ts
   Reject immediately with 400 if schema invalid
   
2. NORMALIZE
   Transform source-specific fields into the unified event shape
   WABA payload → standard format
   WA Flow payload → standard format
   CRM payload → standard format
   
3. DEDUPLICATE
   Compute idempotencyKey = hash(sourceChannel + sourceEventId + eventTimestamp)
   Query event_store WHERE idempotencyKey = computed hash
   If found: return 200 with "already processed" — do not insert
   If not found: proceed to step 4
   
4. WRITE
   Call IdentityResolutionService.resolveIdentity(identifiers from payload)
   Receive profileId
   INSERT into event_store with profileId + normalized payload + idempotencyKey
   Return 201 with event record
```

#### Endpoint Design

```
POST /api/ingest/event
```

A **single unified endpoint** that accepts payloads from all 3 sources. The `sourceChannel` field in the payload body identifies the source and determines which normalizer to apply.

```typescript
// Request body structure
{
  sourceChannel: "waba" | "wa_flow" | "crm",
  sourceEventId: string,        // Original ID from the source system
  eventTimestamp: string,       // ISO 8601
  identifiers: {
    whatsapp?: string,
    email?: string,
    crmId?: string
  },
  payload: { ... }              // Raw source-specific fields
}
```

Alternative approach (3 dedicated endpoints):
```
POST /api/ingest/waba
POST /api/ingest/wa-flow
POST /api/ingest/crm
```

Each with source-specific Zod validation schemas. Simpler to validate, more explicit in naming.

#### Zod Schemas to Define (in shared/schema.ts or a new shared/ingest-schemas.ts)

```typescript
export const wabaIngestSchema = z.object({
  sourceEventId: z.string(),
  eventTimestamp: z.string().datetime(),
  wabaMessageId: z.string(),
  phoneNumber: z.string(),
  eventType: z.enum(['message_sent', 'message_delivered', 'message_read']),
  payload: z.record(z.unknown()),
});

export const wAFlowIngestSchema = z.object({ ... });
export const crmIngestSchema = z.object({ ... });
```

#### Route Addition Location

Add the new endpoint(s) near the existing customer events route (around line 504 in current `routes.ts`), clearly marked as the real-time ingestion section, separate from the existing batch import routes.

---

### Task 4 — Attribute Processor

**Playbook Reference:** Langkah 4: Prosesor Atribut (Real-Time Enrichment)  
**Target File:** `server/services/attribute-processor.ts` ← NEW FILE  
**Type of Change:** Net-new file, zero conflict

#### What It Does

After an event is written to `event_store` (by Task 3), the Attribute Processor is triggered automatically. It recalculates specific fields on the `customer_profile` Golden Record based on the new event data — no manual action required.

#### The Enrichment Cycle (from Playbook)

```
A. Event Arrives
   event_type: "message_read" saved to event_store
   
B. Automation Trigger
   attribute-processor.ts is called with { profileId, eventType, eventTimestamp }
   
C. Value Calculation
   Based on eventType, recalculate specific profile fields:
   - "message_read"    → update last_activity_date, increment total_events_count
   - "quiz_completed"  → update last_activity_date, flag quiz_completed = true
   - "message_sent"    → update last_activity_date, increment outbound_message_count
   
D. Profile Update
   UPDATE customer_profile SET
     last_activity_date = eventTimestamp,
     total_events_count = total_events_count + 1,
     updated_at = NOW()
   WHERE id = profileId
```

#### Suggested Implementation Structure

```typescript
// server/services/attribute-processor.ts

export class AttributeProcessor {

  async process(profileId: string, event: ProcessorEvent): Promise<void> {
    const updates = this.calculateUpdates(event);
    await this.applyUpdates(profileId, updates);
  }

  private calculateUpdates(event: ProcessorEvent): ProfileUpdates {
    const updates: ProfileUpdates = {
      lastActivityDate: event.eventTimestamp,
    };

    switch (event.eventType) {
      case 'message_read':
      case 'message_sent':
      case 'quiz_completed':
        // Apply event-type-specific logic
        break;
    }

    return updates;
  }

  private async applyUpdates(
    profileId: string,
    updates: ProfileUpdates
  ): Promise<void> {
    // UPDATE customer_profile WHERE id = profileId
  }
}

export interface ProcessorEvent {
  eventType: string;
  eventTimestamp: Date;
  sourceChannel: string;
  normalizedPayload: Record<string, unknown>;
}

export interface ProfileUpdates {
  lastActivityDate?: Date;
  totalEventsCount?: number;
  status?: string;
  primaryChannel?: string;
}
```

#### Integration Point

The `AttributeProcessor` must be called at the end of Task 3's ingestion pipeline (Step 4 — Write), after the event is successfully written to `event_store`:

```typescript
// In the ingestion route handler, after event_store INSERT:
const attributeProcessor = new AttributeProcessor();
await attributeProcessor.process(resolvedProfileId, normalizedEvent);
```

This keeps the trigger synchronous within the same request. For high-volume production, this can be moved to a background job queue later.

---

### Task 5 — Basic Segmentation Engine

**Playbook Reference:** Langkah 5: Mesin Segmentasi Dasar  
**Target File:** `shared/segment-templates.ts` ← NEW FILE  
**Type of Change:** Net-new file, zero conflict

#### What It Does

Reads `segment_definition` rules and evaluates them against `customer_profile` and `event_store` data to produce a list of profile IDs that belong to each segment — the "Segment Membership" output.

#### The Filtering Flow (from Playbook)

```
customer_profile (data source)
event_store (data source)
        ↓
Filtering Engine reads segment_definition.rules
        ↓
For each rule condition, query the relevant data source
Combine conditions using AND/OR operators
        ↓
Output: Array of profileIds matching all conditions
        ↓
Write results as Segment Membership
(Future Phase 2: sync membership to CRM)
```

#### Example Rule Evaluation

**Rule defined in `segment_definition.rules`:**
```json
{
  "operator": "AND",
  "conditions": [
    {
      "field": "event_store.event_type",
      "op": "eq",
      "value": "quiz_completed"
    },
    {
      "field": "event_store.event_timestamp",
      "op": "within_days",
      "value": 7
    }
  ]
}
```

**What the engine does with it:**
```sql
SELECT DISTINCT profile_id 
FROM event_store
WHERE event_type = 'quiz_completed'
  AND event_timestamp >= NOW() - INTERVAL '7 days'
```

#### Suggested Implementation Structure

```typescript
// shared/segment-templates.ts

export class SegmentationEngine {

  async evaluate(segmentDefinitionId: string): Promise<string[]> {
    const definition = await this.loadDefinition(segmentDefinitionId);
    const profileIds = await this.applyRules(definition.rules);
    await this.updateMemberCount(segmentDefinitionId, profileIds.length);
    return profileIds;
  }

  async evaluateAll(): Promise<Map<string, string[]>> {
    const activeDefinitions = await this.loadAllActive();
    const results = new Map<string, string[]>();
    for (const def of activeDefinitions) {
      results.set(def.id, await this.evaluate(def.id));
    }
    return results;
  }

  private async applyRules(rules: SegmentRules): Promise<string[]> {
    // Translate rules JSON into DB queries against customer_profile + event_store
    // Support operators: AND, OR
    // Support conditions: eq, neq, gt, lt, within_days, contains
  }
}

export interface SegmentRules {
  operator: 'AND' | 'OR';
  conditions: SegmentCondition[];
}

export interface SegmentCondition {
  field: string;        // e.g. "event_store.event_type"
  op: string;           // e.g. "eq", "within_days"
  value: string | number | boolean;
}
```

#### Future Integration (Phase 2 CRM Sync)

The `evaluate()` method returns an array of `profileId` strings. In Phase 2, this list is what gets synchronized to Rise CRM — each profile ID mapped to its CRM counterpart via the `customer_identity` table where `identifierType = 'crm_id'`.

---

## 5. Architecture: Final State After Phase 1

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REAL-TIME PIPELINE (NEW — Phase 1)               │
│                                                                     │
│  Webhook Payload                                                    │
│  (WABA / WA Flow / CRM)                                            │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────┐                                            │
│  │  POST /api/ingest   │  server/routes.ts (Task 3)                │
│  │  1. Validate (Zod)  │                                            │
│  │  2. Normalize       │                                            │
│  │  3. Deduplicate     │                                            │
│  └──────────┬──────────┘                                            │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────────┐                                       │
│  │  IdentityResolutionSvc   │  data-lineage-service.ts (Task 2)    │
│  │  Lookup customer_identity│                                       │
│  │  → resolve profileId     │                                       │
│  └──────────┬───────────────┘                                       │
│             │                                                       │
│      ┌──────┴──────┐                                                │
│      ▼             ▼                                                │
│  event_store  customer_identity  ← new tables (Task 1)             │
│      │             │                                                │
│      │        customer_profile   ← new table (Task 1)              │
│      │                                                              │
│      ▼                                                              │
│  ┌──────────────────────┐                                           │
│  │  AttributeProcessor  │  services/attribute-processor.ts (Task 4)│
│  │  Enrich profile      │                                           │
│  │  automatically       │                                           │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│       customer_profile (updated)                                    │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐                                           │
│  │  SegmentationEngine  │  shared/segment-templates.ts (Task 5)    │
│  │  Evaluate rules      │                                           │
│  │  → Segment Membership│                                           │
│  └──────────────────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│      segment_definition ← new table (Task 1)                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                EXISTING PIPELINE (UNCHANGED — Batch Import)         │
│                                                                     │
│  CSV / Excel Upload                                                 │
│       → DataLineageService (batch import tracking)                  │
│       → customers table                                             │
│       → customerEvents table                                        │
│       → AI segmentation (segments table)                            │
│       → Vector embeddings (customerEmbeddings)                      │
│       → All existing UI pages fully operational                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. File Change Impact Matrix

| File | Change Type | Lines Affected (Estimate) | Touches Existing Logic? | Risk |
|---|---|---|---|---|
| `shared/schema.ts` | Add 4 tables + relations + schemas | +120–150 lines | No — appended only | 🟢 Low |
| `server/data-lineage-service.ts` | Add new class below existing code | +80–120 lines | No — separate class | 🟡 Medium |
| `server/routes.ts` | Add new endpoint(s) + pipeline logic | +100–180 lines | No — new routes only | 🟡 Medium |
| `server/services/attribute-processor.ts` | New file from scratch | ~100–150 lines | N/A — new file | 🟢 Low |
| `shared/segment-templates.ts` | New file from scratch | ~120–180 lines | N/A — new file | 🟢 Low |
| **Database** | 4 new tables created | — | Existing tables untouched | 🟢 Low |

---

## 7. Risk Assessment

### Risk 1 — `data-lineage-service.ts` Complexity Growth
**Level: Medium**  
The file already serves batch import tracking. Adding identity resolution to it as the playbook specifies creates a mixed-responsibility file. The `IdentityResolutionService` class should be clearly delineated with a section comment and, if the file grows beyond 500 lines total, extracted to `server/services/identity-resolution-service.ts` as a follow-up refactor.

**Mitigation:** Use a clearly named, standalone class. Do not modify any existing functions.

### Risk 2 — `routes.ts` Continued Growth
**Level: Medium**  
At 75KB, `routes.ts` is already the most complex file in the backend. Adding ingestion endpoints increases this. The ingestion endpoint logic should be thin — it delegates to `IdentityResolutionService` and `AttributeProcessor` — keeping the route handler itself short.

**Mitigation:** Keep route handlers to 20–30 lines each. All business logic lives in services.

### Risk 3 — Idempotency Key Collisions
**Level: Low**  
The deduplication step in Task 3 relies on a unique `idempotencyKey` per event. If the key computation is not deterministic (e.g., using event receipt time instead of source event time), the same event could be stored twice.

**Mitigation:** Compute the key as `hash(sourceChannel + sourceEventId)` using only source-provided fields, never server-side timestamps.

### Risk 4 — `npm run db:push` Altering Existing Tables
**Level: Low**  
If `schema.ts` changes inadvertently touch existing table definitions (e.g., a typo renaming a column), `db:push` could generate destructive migrations.

**Mitigation:** Only append new table definitions. Do not modify any existing `pgTable(...)` blocks. Run `db:push` in development first and verify the output SQL before production.

### Risk 5 — Attribute Processor Synchronous Latency
**Level: Low (Phase 1)**  
Calling `AttributeProcessor.process()` synchronously inside the ingestion request handler adds latency to each webhook response. For low volume (Phase 1), this is acceptable.

**Mitigation:** Document this as a known Phase 1 constraint. Plan async queue (e.g., BullMQ) for Phase 2 if throughput requires it.

---

## 8. Implementation Order & Dependencies

Tasks must be executed in this order because each depends on the previous:

```
Task 1 (Schema)
    ↓
    Creates: customer_profile, customer_identity, event_store, segment_definition tables
    Required by: Tasks 2, 3, 4, 5

Task 2 (Identity Resolution)
    ↓
    Creates: IdentityResolutionService class
    Required by: Task 3 (the ingestion pipeline calls it to get profileId)

Task 3 (Event Ingestion)
    ↓
    Creates: POST /api/ingest webhook endpoint
    Required by: Task 4 (processor is called within the ingestion handler)

Task 4 (Attribute Processor)
    ↓
    Creates: AttributeProcessor service
    Required by: Integration into Task 3's write step

Task 5 (Segmentation Engine)
    ↑
    Can be developed in parallel with Tasks 3–4, as long as Task 1 is complete
    Reads from: customer_profile and event_store (defined in Task 1)
    No dependency on Tasks 2, 3, or 4
```

**Parallelism opportunity:** Task 5 can start as soon as Task 1 is done, independently of Tasks 2–4.

---

## 9. Definition of Done

Phase 1 is complete when all 3 success criteria from the playbook are verifiable:

### Criterion 1 — Multi-Source Ingestion API ✅
- `POST /api/ingest/event` (or equivalent) is live
- Accepts WABA, WA Flow, and CRM payload formats
- Rejects invalid payloads with a clear 400 error and Zod validation details
- Accepts valid payloads with a 201 response containing the stored event record
- Verified by: Sending test payloads for each of the 3 source channels

### Criterion 2 — Real-Time Data Pipeline ✅
- End-to-end flow verified: webhook → identity resolution → event_store write
- Sending the same event twice results in only one row in `event_store` (idempotency confirmed)
- `customer_identity` correctly maps all identifiers to a single `customer_profile`
- Verified by: Integration test with duplicate payload + DB query to confirm one row

### Criterion 3 — Profile Automation (Golden Record) ✅
- Sending a new event updates `customer_profile.last_activity_date` automatically
- No manual action required after the event is received
- `customer_profile.total_events_count` increments correctly on each new event
- Verified by: Query `customer_profile` before and after sending a test event

---

## 10. Phase 2 Readiness Criteria

Phase 2 (CRM Operational Layer — Rise CRM Sync) can begin when:

| Readiness Check | How to Verify |
|---|---|
| `customer_profile` has at least one Golden Record per known customer | `SELECT COUNT(*) FROM customer_profile` |
| `customer_identity` successfully maps `crm_id` identifiers | `SELECT * FROM customer_identity WHERE identifier_type = 'crm_id'` |
| `event_store` contains real events from at least 2 distinct source channels | `SELECT source_channel, COUNT(*) FROM event_store GROUP BY source_channel` |
| `segment_definition` has at least one active rule that evaluates to a non-empty membership | Run `SegmentationEngine.evaluateAll()` and verify results |
| Phase 1 Definition of Done criteria all pass | Run integration tests |

**Phase 2 Scope (for awareness, not Phase 1 work):**
- Bi-directional sync between `customer_profile` and Rise CRM using `crm_id` from `customer_identity`
- n8n workflow orchestration triggered by `event_store` writes
- Segment membership push to CRM campaign lists

---

*Document prepared from: CDP Foundation Technical Playbook (PDF, 10 slides), cross-referenced against the Smart CDP Beta repository as of March 17, 2026.*  
*No changes have been made to the codebase. This document is analysis and planning only.*
