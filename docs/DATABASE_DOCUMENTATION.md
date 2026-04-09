# Customer Data Platform (CDP) Database Documentation

> **Last Updated:** December 2025  
> **Schema Version:** 1.0  
> **Database:** PostgreSQL with Drizzle ORM

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Table Relationships](#table-relationships)
4. [Core Domain Tables](#core-domain-tables)
   - [customers](#customers)
   - [customerEvents](#customerevents)
   - [segments](#segments)
   - [customerSegments](#customersegments)
   - [customerIdentifiers](#customeridentifiers)
   - [customerAttributes](#customerattributes)
5. [AI/ML Infrastructure Tables](#aiml-infrastructure-tables)
   - [customerEmbeddings](#customerembeddings)
   - [embeddingJobs](#embeddingjobs)
   - [embeddingProgress](#embeddingprogress)
6. [Data Import Pipeline Tables](#data-import-pipeline-tables)
   - [dataImports](#dataimports)
   - [rawDataImports](#rawdataimports)
   - [dataSourceSchemas](#datasourceschemas)
7. [User Management Tables](#user-management-tables)
   - [users](#users)
   - [userSessions](#usersessions)
8. [Observability Tables](#observability-tables)
   - [applicationLogs](#applicationlogs)
   - [errorGroups](#errorgroups)
   - [logAlerts](#logalerts)
   - [logSettings](#logsettings)
9. [Common Queries](#common-queries)
10. [Best Practices](#best-practices)
11. [Getting Started Guide](#getting-started-guide)

---

## Overview

This Customer Data Platform (CDP) database is designed to:

- **Unify customer data** from multiple sources into a single, coherent profile
- **Track customer behavior** through events and activity logging
- **Enable AI-powered segmentation** using vector embeddings for similarity search
- **Support flexible data imports** with schema detection and AI-assisted field mapping
- **Provide comprehensive observability** through structured logging and error tracking

### Key Technologies

| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database with JSONB and pgvector support |
| **Drizzle ORM** | Type-safe database access and schema management |
| **pgvector** | Vector similarity search for AI embeddings (1536 dimensions) |
| **JSONB** | Flexible storage for dynamic attributes and metadata |

### Database Statistics

| Metric | Count |
|--------|-------|
| Total Tables | 18 |
| Core Domain Tables | 6 |
| AI/ML Tables | 3 |
| Data Import Tables | 3 |
| User Management Tables | 2 |
| Observability Tables | 4 |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CUSTOMER DATA PLATFORM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        CORE DOMAIN LAYER                             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐   │    │
│  │   │  customers   │───▶│ customerEvents   │    │    segments     │   │    │
│  │   │  (profiles)  │    │  (activities)    │    │  (definitions)  │   │    │
│  │   └──────┬───────┘    └──────────────────┘    └────────┬────────┘   │    │
│  │          │                                             │            │    │
│  │          ▼                                             ▼            │    │
│  │   ┌──────────────────┐              ┌──────────────────────────┐   │    │
│  │   │customerIdentifiers│              │   customerSegments      │   │    │
│  │   │ (multi-identity)  │              │   (junction table)      │   │    │
│  │   └──────────────────┘              └──────────────────────────┘   │    │
│  │          │                                                         │    │
│  │          ▼                                                         │    │
│  │   ┌──────────────────┐                                             │    │
│  │   │customerAttributes │                                            │    │
│  │   │ (dynamic fields)  │                                            │    │
│  │   └──────────────────┘                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      AI/ML INFRASTRUCTURE                           │    │
│  │                                                                      │    │
│  │   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐  │    │
│  │   │customerEmbeddings│◀───│  embeddingJobs   │◀───│embedding     │  │    │
│  │   │ (vector search)  │    │  (job tracking)  │    │Progress      │  │    │
│  │   └──────────────────┘    └──────────────────┘    └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      DATA IMPORT PIPELINE                           │    │
│  │                                                                      │    │
│  │   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐  │    │
│  │   │   dataImports    │───▶│  rawDataImports  │    │dataSource    │  │    │
│  │   │ (import history) │    │  (staging area)  │    │Schemas       │  │    │
│  │   └──────────────────┘    └──────────────────┘    └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │   USER MANAGEMENT        │    │         OBSERVABILITY                │   │
│  │                          │    │                                      │   │
│  │  ┌───────┐  ┌──────────┐ │    │  ┌─────────────┐  ┌────────────┐    │   │
│  │  │ users │──│userSess- │ │    │  │application  │──│errorGroups │    │   │
│  │  │       │  │ions      │ │    │  │Logs         │  │            │    │   │
│  │  └───────┘  └──────────┘ │    │  └─────────────┘  └────────────┘    │   │
│  │                          │    │                                      │   │
│  │                          │    │  ┌─────────────┐  ┌────────────┐    │   │
│  │                          │    │  │ logAlerts   │  │logSettings │    │   │
│  │                          │    │  └─────────────┘  └────────────┘    │   │
│  └──────────────────────────┘    └──────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Relationships

### Entity Relationships

```
customers (1) ──────────────────────────────── (N) customerEvents
    │                                                   
    ├──── (1) ─────────────────────────────── (N) customerIdentifiers
    │                                                   
    ├──── (1) ─────────────────────────────── (N) customerAttributes
    │                                                   
    ├──── (1) ─────────────────────────────── (1) customerEmbeddings
    │                                                   
    └──── (N) ─────── customerSegments ────── (N) segments

users (1) ─────────────────────────────────── (N) userSessions

applicationLogs (N) ───────────────────────── (1) errorGroups
```

### Foreign Key Summary

| Child Table | Parent Table | Foreign Key | Relationship |
|-------------|--------------|-------------|--------------|
| customerEvents | customers | customerId | Many-to-One |
| customerSegments | customers | customerId | Many-to-One |
| customerSegments | segments | segmentId | Many-to-One |
| customerIdentifiers | customers | customerId | Many-to-One |
| customerAttributes | customers | customerId | Many-to-One |
| customerEmbeddings | customers | customerId | One-to-One |
| userSessions | users | userId | Many-to-One |
| applicationLogs | errorGroups | errorGroupId | Many-to-One |

---

## Core Domain Tables

### customers

**Purpose:** Central table storing unified customer profiles with core demographic and behavioral data.

**Key Features:**
- Stores standard customer attributes (name, email, phone, address)
- JSONB columns for flexible unmapped fields and metadata
- Links to data lineage for audit trail
- Supports AI-powered data quality scoring

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| firstName | TEXT | Yes | - | Customer first name |
| lastName | TEXT | Yes | - | Customer last name |
| email | TEXT | Yes | - | Email address (indexed) |
| phoneNumber | TEXT | Yes | - | Phone number |
| dateOfBirth | TIMESTAMP | Yes | - | Date of birth |
| gender | TEXT | Yes | - | Gender identifier |
| currentAddress | JSONB | Yes | - | Structured address object |
| customerSegment | TEXT | Yes | - | Assigned segment label |
| lifetimeValue | REAL | Yes | 0 | Calculated customer lifetime value |
| lastActiveAt | TIMESTAMP | Yes | - | Last activity timestamp |
| dataQualityScore | REAL | Yes | 0 | AI-calculated quality score (0-1) |
| importId | UUID | Yes | - | Source import reference |
| sourceRowNumber | INTEGER | Yes | - | Original row in source file |
| sourceFileHash | TEXT | Yes | - | Hash for deduplication |
| dataLineage | JSONB | Yes | - | Complete audit trail |
| unmappedFields | JSONB | Yes | - | Fields not mapped to schema |
| originalSourceData | JSONB | Yes | - | Complete original row data |
| fieldMappingMetadata | JSONB | Yes | - | AI mapping confidence scores |
| createdAt | TIMESTAMP | No | now() | Record creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - Active Premium Customer:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "firstName": "Sarah",
  "lastName": "Johnson",
  "email": "sarah.johnson@email.com",
  "phoneNumber": "+1-555-0123",
  "dateOfBirth": "1985-03-15T00:00:00Z",
  "gender": "female",
  "currentAddress": {
    "street": "123 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94102",
    "country": "USA"
  },
  "customerSegment": "premium",
  "lifetimeValue": 15420.50,
  "lastActiveAt": "2025-12-20T14:30:00Z",
  "dataQualityScore": 0.95,
  "importId": "imp-001-2025",
  "sourceRowNumber": 42,
  "unmappedFields": {
    "loyalty_tier": "gold",
    "preferred_store": "downtown"
  },
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2025-12-20T14:30:00Z"
}
```

**Row 2 - New Customer with Minimal Data:**
```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "firstName": "Michael",
  "lastName": null,
  "email": "mike.chen@company.org",
  "phoneNumber": null,
  "dateOfBirth": null,
  "gender": null,
  "currentAddress": null,
  "customerSegment": "new",
  "lifetimeValue": 0,
  "lastActiveAt": "2025-12-19T09:15:00Z",
  "dataQualityScore": 0.35,
  "importId": "imp-002-2025",
  "sourceRowNumber": 1523,
  "unmappedFields": {
    "referral_code": "FRIEND2025",
    "signup_source": "mobile_app"
  },
  "createdAt": "2025-12-19T09:15:00Z",
  "updatedAt": "2025-12-19T09:15:00Z"
}
```

#### Indexes

| Index Name | Columns | Purpose |
|------------|---------|---------|
| customers_email_idx | email | Fast email lookups |
| customers_segment_idx | customerSegment | Segment filtering |
| customers_lifetime_value_idx | lifetimeValue | Value-based queries |
| customers_phone_number_idx | phoneNumber | Phone lookups |
| customers_import_id_idx | importId | Import tracking |
| customers_unmapped_fields_gin_idx | unmappedFields (GIN) | JSONB querying |

---

### customerEvents

**Purpose:** Tracks all customer activities, interactions, and behavioral events.

**Key Features:**
- Captures any event type (page views, purchases, clicks, etc.)
- Stores device/session context for attribution
- JSONB for flexible event properties

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| customerId | UUID | No | - | Reference to customers table |
| eventType | TEXT | No | - | Event category (purchase, view, click) |
| eventTimestamp | TIMESTAMP | Yes | now() | When event occurred |
| source | TEXT | Yes | - | Event source (web, mobile, api) |
| sessionId | TEXT | Yes | - | Session identifier |
| deviceId | TEXT | Yes | - | Device fingerprint |
| ipAddress | TEXT | Yes | - | Request IP address |
| userAgent | TEXT | Yes | - | Browser/client info |
| eventProperties | JSONB | Yes | - | Event-specific data |
| importId | UUID | Yes | - | Source import reference |
| sourceRowNumber | INTEGER | Yes | - | Original row number |
| createdAt | TIMESTAMP | No | now() | Record creation time |

#### Sample Data

**Row 1 - Purchase Event:**
```json
{
  "id": "evt-001-a1b2c3d4",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "eventType": "purchase",
  "eventTimestamp": "2025-12-20T14:30:00Z",
  "source": "web",
  "sessionId": "sess_abc123xyz",
  "deviceId": "dev_9f8e7d6c",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "eventProperties": {
    "orderId": "ORD-2025-78901",
    "totalAmount": 299.99,
    "currency": "USD",
    "items": [
      {"sku": "PROD-001", "name": "Wireless Headphones", "qty": 1, "price": 199.99},
      {"sku": "PROD-042", "name": "USB-C Cable", "qty": 2, "price": 50.00}
    ],
    "paymentMethod": "credit_card"
  },
  "createdAt": "2025-12-20T14:30:00Z"
}
```

**Row 2 - Page View Event:**
```json
{
  "id": "evt-002-b2c3d4e5",
  "customerId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "eventType": "page_view",
  "eventTimestamp": "2025-12-19T09:15:00Z",
  "source": "mobile",
  "sessionId": "sess_mobile_456",
  "deviceId": "dev_ios_abc123",
  "ipAddress": "10.0.0.50",
  "userAgent": "CDP-MobileApp/2.1.0 (iOS 17.0)",
  "eventProperties": {
    "pageUrl": "/products/electronics",
    "pageTitle": "Electronics Category",
    "referrer": "organic_search",
    "durationSeconds": 45,
    "scrollDepth": 0.75
  },
  "createdAt": "2025-12-19T09:15:00Z"
}
```

---

### segments

**Purpose:** Defines customer segments with criteria for automated assignment.

**Key Features:**
- Flexible JSONB criteria for complex rules
- Active/inactive toggle for management
- Customer count caching for performance

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| name | TEXT | No | - | Segment display name |
| description | TEXT | Yes | - | Human-readable description |
| criteria | JSONB | No | - | Segment rules/conditions |
| isActive | BOOLEAN | Yes | true | Whether segment is active |
| customerCount | INTEGER | Yes | 0 | Cached customer count |
| createdAt | TIMESTAMP | No | now() | Creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - High Value Segment:**
```json
{
  "id": "seg-premium-001",
  "name": "Premium Customers",
  "description": "Customers with lifetime value over $10,000 and active in last 30 days",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {"field": "lifetimeValue", "operator": ">=", "value": 10000},
      {"field": "lastActiveAt", "operator": ">=", "value": "30_days_ago"}
    ]
  },
  "isActive": true,
  "customerCount": 1247,
  "createdAt": "2024-06-01T00:00:00Z",
  "updatedAt": "2025-12-20T06:00:00Z"
}
```

**Row 2 - At-Risk Segment:**
```json
{
  "id": "seg-atrisk-002",
  "name": "At-Risk Churners",
  "description": "Previously active customers who haven't engaged in 60+ days",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {"field": "lifetimeValue", "operator": ">", "value": 0},
      {"field": "lastActiveAt", "operator": "<", "value": "60_days_ago"}
    ]
  },
  "isActive": true,
  "customerCount": 523,
  "createdAt": "2024-09-15T00:00:00Z",
  "updatedAt": "2025-12-20T06:00:00Z"
}
```

---

### customerSegments

**Purpose:** Junction table linking customers to their assigned segments.

**Key Features:**
- Many-to-many relationship support
- Tracks assignment timestamp
- Enables segment history analysis

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| customerId | UUID | No | - | Reference to customers |
| segmentId | UUID | No | - | Reference to segments |
| assignedAt | TIMESTAMP | Yes | now() | When customer was assigned |

#### Sample Data

**Row 1:**
```json
{
  "id": "cs-001-abc123",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "segmentId": "seg-premium-001",
  "assignedAt": "2025-06-15T10:30:00Z"
}
```

**Row 2:**
```json
{
  "id": "cs-002-def456",
  "customerId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "segmentId": "seg-atrisk-002",
  "assignedAt": "2025-12-01T00:00:00Z"
}
```

---

### customerIdentifiers

**Purpose:** Stores multiple identifiers per customer for identity resolution.

**Key Features:**
- Supports any identifier type (email, phone, device ID, etc.)
- Tracks source system for data provenance
- Enables cross-platform identity matching

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| customerId | UUID | No | - | Reference to customers |
| identifierType | TEXT | No | - | Type: email, phone, device_id, etc. |
| identifierValue | TEXT | No | - | The actual identifier value |
| sourceSystem | TEXT | Yes | - | Origin system |
| importId | UUID | Yes | - | Source import reference |
| sourceRowNumber | INTEGER | Yes | - | Original row number |
| lastSeenAt | TIMESTAMP | Yes | - | Last activity with this ID |
| createdAt | TIMESTAMP | No | now() | Record creation time |

#### Sample Data

**Row 1 - Email Identifier:**
```json
{
  "id": "ident-001-email",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "identifierType": "email",
  "identifierValue": "sarah.johnson@email.com",
  "sourceSystem": "salesforce",
  "lastSeenAt": "2025-12-20T14:30:00Z",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

**Row 2 - Device ID Identifier:**
```json
{
  "id": "ident-002-device",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "identifierType": "device_id",
  "identifierValue": "dev_9f8e7d6c5b4a3210",
  "sourceSystem": "mobile_app",
  "lastSeenAt": "2025-12-18T08:45:00Z",
  "createdAt": "2025-03-20T16:00:00Z"
}
```

---

### customerAttributes

**Purpose:** Stores dynamic, extensible customer attributes beyond core schema.

**Key Features:**
- Supports any attribute name/value pair
- Type-aware storage (text, number, date, boolean)
- AI confidence scoring for derived attributes
- System vs user-defined flag

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| customerId | UUID | No | - | Reference to customers |
| attributeName | TEXT | No | - | Attribute key name |
| attributeValue | TEXT | Yes | - | Attribute value (as string) |
| attributeType | TEXT | No | text | Data type: text, number, date, boolean |
| dataSource | TEXT | Yes | - | Origin of attribute |
| confidence | REAL | Yes | 1.0 | AI confidence score (0-1) |
| isSystem | BOOLEAN | Yes | false | System-generated vs user-defined |
| createdAt | TIMESTAMP | No | now() | Record creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - AI-Derived Preference:**
```json
{
  "id": "attr-001-pref",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "attributeName": "preferred_category",
  "attributeValue": "electronics",
  "attributeType": "text",
  "dataSource": "ai_analysis",
  "confidence": 0.87,
  "isSystem": true,
  "createdAt": "2025-11-01T00:00:00Z",
  "updatedAt": "2025-12-15T00:00:00Z"
}
```

**Row 2 - User-Defined Custom Field:**
```json
{
  "id": "attr-002-custom",
  "customerId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "attributeName": "newsletter_frequency",
  "attributeValue": "weekly",
  "attributeType": "text",
  "dataSource": "user_preference",
  "confidence": 1.0,
  "isSystem": false,
  "createdAt": "2025-12-19T09:20:00Z",
  "updatedAt": "2025-12-19T09:20:00Z"
}
```

---

## AI/ML Infrastructure Tables

### customerEmbeddings

**Purpose:** Stores vector embeddings for AI-powered customer similarity search.

**Key Features:**
- 1536-dimensional vectors (OpenAI embedding format)
- Dual storage: PostgreSQL array + pgvector column for performance
- Profile text hashing for deduplication
- HNSW indexing support for sub-second similarity search

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| customerId | UUID | No | - | Reference to customers (unique) |
| embedding | REAL[] | No | - | Vector as PostgreSQL array (deprecated) |
| embeddingVector | VECTOR(1536) | Yes | - | Optimized pgvector column |
| embeddingType | TEXT | No | customer_profile | Embedding category |
| profileTextHash | TEXT | Yes | - | SHA-256 hash for deduplication |
| lastGeneratedAt | TIMESTAMP | Yes | now() | Generation timestamp |

#### Sample Data

**Row 1 - Full Customer Profile Embedding:**
```json
{
  "id": "emb-001-sarah",
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "embedding": [0.0123, -0.0456, 0.0789, "... (1536 dimensions)"],
  "embeddingVector": "[0.0123,-0.0456,0.0789,...]",
  "embeddingType": "customer_profile",
  "profileTextHash": "sha256_abc123def456789...",
  "lastGeneratedAt": "2025-12-15T02:00:00Z"
}
```

**Row 2 - New Customer with Basic Embedding:**
```json
{
  "id": "emb-002-mike",
  "customerId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "embedding": [-0.0234, 0.0567, -0.0890, "... (1536 dimensions)"],
  "embeddingVector": "[-0.0234,0.0567,-0.0890,...]",
  "embeddingType": "customer_profile",
  "profileTextHash": "sha256_xyz789abc123456...",
  "lastGeneratedAt": "2025-12-19T10:00:00Z"
}
```

---

### embeddingJobs

**Purpose:** Tracks cancellable embedding generation jobs with lifecycle management.

**Key Features:**
- Job state machine: idle → running → completed/cancelled/failed
- Graceful cancellation support with token savings calculation
- Auto-restart capability for orphaned jobs
- Batch processing with configurable size

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| status | TEXT | No | idle | Job state (idle/running/cancelling/cancelled/completed/failed) |
| totalCustomers | INTEGER | No | 0 | Total customers to process |
| processedCustomers | INTEGER | No | 0 | Completed count |
| batchSize | INTEGER | No | 100 | Processing batch size |
| cancelRequested | BOOLEAN | No | false | Cancellation flag |
| estimatedTokensSaved | INTEGER | Yes | 0 | Tokens saved by cancellation |
| errorMessage | TEXT | Yes | - | Error details |
| autoRestartCount | INTEGER | No | 0 | Restart attempts (max 3) |
| lastFailedAt | TIMESTAMP | Yes | - | Last failure time |
| createdAt | TIMESTAMP | Yes | now() | Job creation time |
| startedAt | TIMESTAMP | Yes | - | Processing start time |
| completedAt | TIMESTAMP | Yes | - | Completion time |
| cancelledAt | TIMESTAMP | Yes | - | Cancellation time |

#### Sample Data

**Row 1 - Completed Job:**
```json
{
  "id": "job-001-complete",
  "status": "completed",
  "totalCustomers": 5000,
  "processedCustomers": 5000,
  "batchSize": 100,
  "cancelRequested": false,
  "estimatedTokensSaved": 0,
  "errorMessage": null,
  "autoRestartCount": 0,
  "createdAt": "2025-12-14T22:00:00Z",
  "startedAt": "2025-12-14T22:00:05Z",
  "completedAt": "2025-12-15T02:15:00Z"
}
```

**Row 2 - Cancelled Job:**
```json
{
  "id": "job-002-cancelled",
  "status": "cancelled",
  "totalCustomers": 10000,
  "processedCustomers": 3500,
  "batchSize": 100,
  "cancelRequested": true,
  "estimatedTokensSaved": 156000,
  "errorMessage": null,
  "autoRestartCount": 0,
  "createdAt": "2025-12-19T10:00:00Z",
  "startedAt": "2025-12-19T10:00:10Z",
  "cancelledAt": "2025-12-19T11:30:00Z"
}
```

---

### embeddingProgress

**Purpose:** Detailed progress tracking with real-time metrics and watchdog support.

**Key Features:**
- Batch-level progress with throughput metrics
- Rate limiting and backoff management
- Watchdog detection for stalled jobs
- WebSocket streaming support for real-time updates
- Adaptive batch sizing

#### Schema (Key Fields)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| importId | UUID | Links to import session (unique) |
| status | TEXT | pending/processing/completed/failed/cancelled/paused |
| totalCustomers | INTEGER | Total to process |
| processedCustomers | INTEGER | Completed count |
| generatedEmbeddings | INTEGER | Successful embeddings |
| failedEmbeddings | INTEGER | Failed attempts |
| currentBatch | INTEGER | Current batch number |
| totalBatches | INTEGER | Total batch count |
| batchSize | INTEGER | Size per batch |
| averageBatchTimeMs | INTEGER | Rolling average time |
| throughputPerSecond | REAL | Processing speed |
| rateLimitHits | INTEGER | Rate limit encounters |
| isStalled | BOOLEAN | Watchdog stall flag |
| streamingEnabled | BOOLEAN | WebSocket updates |
| lastHeartbeat | TIMESTAMP | Activity timestamp |

#### Sample Data

**Row 1 - Active Processing:**
```json
{
  "id": "prog-001-active",
  "importId": "imp-001-2025",
  "status": "processing",
  "totalCustomers": 5000,
  "processedCustomers": 2350,
  "generatedEmbeddings": 2340,
  "failedEmbeddings": 10,
  "currentBatch": 24,
  "totalBatches": 50,
  "batchSize": 100,
  "averageBatchTimeMs": 4500,
  "throughputPerSecond": 22.2,
  "rateLimitHits": 2,
  "isStalled": false,
  "streamingEnabled": true,
  "lastHeartbeat": "2025-12-20T15:45:30Z",
  "startedAt": "2025-12-20T14:00:00Z"
}
```

**Row 2 - Completed with Errors:**
```json
{
  "id": "prog-002-done",
  "importId": "imp-002-2025",
  "status": "completed",
  "totalCustomers": 1000,
  "processedCustomers": 1000,
  "generatedEmbeddings": 985,
  "failedEmbeddings": 15,
  "currentBatch": 20,
  "totalBatches": 20,
  "batchSize": 50,
  "averageBatchTimeMs": 3200,
  "throughputPerSecond": 15.6,
  "rateLimitHits": 0,
  "isStalled": false,
  "errors": [
    {"customerId": "cust-err-001", "error": "Empty profile text"},
    {"customerId": "cust-err-002", "error": "Invalid character encoding"}
  ],
  "startedAt": "2025-12-19T08:00:00Z",
  "completedAt": "2025-12-19T08:35:00Z"
}
```

---

## Data Import Pipeline Tables

### dataImports

**Purpose:** Tracks completed data import jobs with statistics and metadata.

**Key Features:**
- Multi-format support (CSV, XLSX, JSON, API)
- Comprehensive record counts (success, failed, duplicates, merged)
- Duplicate handling strategy configuration
- Field mapping storage

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| fileName | TEXT | No | - | Source file name |
| filePath | TEXT | Yes | - | Storage path |
| fileSize | INTEGER | Yes | - | File size in bytes |
| importType | TEXT | No | - | Format: csv, xlsx, json, api |
| importSource | TEXT | Yes | - | Origin system |
| recordsProcessed | INTEGER | Yes | 0 | Total records handled |
| recordsSuccessful | INTEGER | Yes | 0 | Successfully imported |
| recordsFailed | INTEGER | Yes | 0 | Failed records |
| recordsDuplicates | INTEGER | Yes | 0 | Duplicate detections |
| recordsSkipped | INTEGER | Yes | 0 | Skipped records |
| recordsUpdated | INTEGER | Yes | 0 | Updated existing |
| recordsMerged | INTEGER | Yes | 0 | Merged records |
| duplicateHandlingStrategy | TEXT | Yes | - | skip/overwrite/merge/create_new |
| importStatus | TEXT | No | pending | pending/processing/completed/failed |
| importMetadata | JSONB | Yes | - | Additional import data |
| fieldMappings | JSONB | Yes | - | Column→field mappings |
| importedAt | TIMESTAMP | Yes | - | Start time |
| completedAt | TIMESTAMP | Yes | - | End time |

#### Sample Data

**Row 1 - Successful Large Import:**
```json
{
  "id": "imp-001-2025",
  "fileName": "customer_export_2025.csv",
  "filePath": "/uploads/customer_export_2025.csv",
  "fileSize": 15728640,
  "importType": "csv",
  "importSource": "salesforce",
  "recordsProcessed": 25000,
  "recordsSuccessful": 24500,
  "recordsFailed": 150,
  "recordsDuplicates": 350,
  "recordsSkipped": 0,
  "recordsUpdated": 1200,
  "recordsMerged": 800,
  "duplicateHandlingStrategy": "merge_data",
  "importStatus": "completed",
  "fieldMappings": {
    "Customer Email": "email",
    "First Name": "firstName",
    "Last Name": "lastName",
    "Phone": "phoneNumber",
    "LTV": "lifetimeValue"
  },
  "importedAt": "2025-12-15T00:00:00Z",
  "completedAt": "2025-12-15T00:45:00Z"
}
```

**Row 2 - Failed Import:**
```json
{
  "id": "imp-002-2025",
  "fileName": "corrupted_data.xlsx",
  "filePath": "/uploads/corrupted_data.xlsx",
  "fileSize": 524288,
  "importType": "xlsx",
  "importSource": "manual_upload",
  "recordsProcessed": 100,
  "recordsSuccessful": 0,
  "recordsFailed": 100,
  "recordsDuplicates": 0,
  "duplicateHandlingStrategy": "skip_duplicates",
  "importStatus": "failed",
  "importMetadata": {
    "errorType": "PARSE_ERROR",
    "errorDetails": "Invalid date format in column 'DOB'"
  },
  "importedAt": "2025-12-18T14:00:00Z",
  "completedAt": null
}
```

---

### rawDataImports

**Purpose:** Staging table for raw imported data before transformation.

**Key Features:**
- Preserves original data exactly as received
- Stores detected data types per column
- Validation error tracking
- Processing status for workflow control

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| importSessionId | UUID | No | - | Links to import session |
| sourceFileName | TEXT | Yes | - | Original file name |
| sourceSheetName | TEXT | Yes | - | Sheet name (for Excel) |
| sourceRowNumber | INTEGER | No | - | Original row number |
| rawDataRow | JSONB | No | - | Complete original row |
| originalHeaders | JSONB | Yes | - | Column headers |
| dataTypesDetected | JSONB | Yes | - | Detected types per field |
| validationErrors | JSONB | Yes | - | Validation issues found |
| processingStatus | TEXT | No | pending | pending/processed/failed/skipped |
| processedAt | TIMESTAMP | Yes | - | Processing timestamp |
| createdAt | TIMESTAMP | No | now() | Record creation time |

#### Sample Data

**Row 1 - Successfully Processed:**
```json
{
  "id": "raw-001-processed",
  "importSessionId": "imp-001-2025",
  "sourceFileName": "customer_export_2025.csv",
  "sourceSheetName": null,
  "sourceRowNumber": 42,
  "rawDataRow": {
    "Customer Email": "sarah.johnson@email.com",
    "First Name": "Sarah",
    "Last Name": "Johnson",
    "Phone": "+1-555-0123",
    "LTV": "15420.50"
  },
  "originalHeaders": ["Customer Email", "First Name", "Last Name", "Phone", "LTV"],
  "dataTypesDetected": {
    "Customer Email": "email",
    "First Name": "text",
    "Last Name": "text",
    "Phone": "phone",
    "LTV": "number"
  },
  "validationErrors": null,
  "processingStatus": "processed",
  "processedAt": "2025-12-15T00:02:15Z",
  "createdAt": "2025-12-15T00:00:30Z"
}
```

**Row 2 - Failed Validation:**
```json
{
  "id": "raw-002-failed",
  "importSessionId": "imp-001-2025",
  "sourceFileName": "customer_export_2025.csv",
  "sourceSheetName": null,
  "sourceRowNumber": 1523,
  "rawDataRow": {
    "Customer Email": "invalid-email",
    "First Name": "",
    "Last Name": null,
    "Phone": "abc123",
    "LTV": "not-a-number"
  },
  "originalHeaders": ["Customer Email", "First Name", "Last Name", "Phone", "LTV"],
  "dataTypesDetected": {
    "Customer Email": "text",
    "First Name": "empty",
    "Last Name": "null",
    "Phone": "text",
    "LTV": "text"
  },
  "validationErrors": [
    {"field": "Customer Email", "error": "Invalid email format"},
    {"field": "LTV", "error": "Expected number, got text"}
  ],
  "processingStatus": "failed",
  "processedAt": "2025-12-15T00:03:45Z",
  "createdAt": "2025-12-15T00:00:30Z"
}
```

---

### dataSourceSchemas

**Purpose:** Manages flexible schema definitions for different data sources.

**Key Features:**
- Industry-specific schema templates
- AI-assisted field mapping templates
- Validation rule configuration
- Version management

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| sourceName | TEXT | No | - | Unique schema identifier |
| displayName | TEXT | No | - | Human-readable name |
| description | TEXT | Yes | - | Schema description |
| schemaVersion | TEXT | No | 1.0 | Version string |
| fieldDefinitions | JSONB | No | - | Field configurations |
| mappingTemplates | JSONB | Yes | - | Header→field mappings |
| validationRules | JSONB | Yes | - | Validation configuration |
| industryContext | JSONB | Yes | - | Industry-specific settings |
| isActive | BOOLEAN | Yes | true | Whether schema is active |
| createdBy | UUID | Yes | - | Creator user ID |
| createdAt | TIMESTAMP | No | now() | Creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - E-commerce Schema:**
```json
{
  "id": "schema-ecommerce-001",
  "sourceName": "shopify_customers",
  "displayName": "Shopify Customer Export",
  "description": "Standard schema for Shopify customer data exports",
  "schemaVersion": "2.0",
  "fieldDefinitions": {
    "email": {"type": "email", "required": true, "unique": true},
    "first_name": {"type": "text", "required": false},
    "last_name": {"type": "text", "required": false},
    "phone": {"type": "phone", "required": false},
    "total_spent": {"type": "currency", "required": false},
    "orders_count": {"type": "integer", "required": false}
  },
  "mappingTemplates": {
    "Email": "email",
    "Customer Email": "email",
    "First Name": "first_name",
    "Last Name": "last_name",
    "Total Spent": "total_spent"
  },
  "validationRules": {
    "email": {"pattern": "^[\\w.-]+@[\\w.-]+\\.\\w+$"},
    "total_spent": {"min": 0}
  },
  "industryContext": {
    "industry": "ecommerce",
    "platform": "shopify"
  },
  "isActive": true,
  "createdAt": "2024-06-01T00:00:00Z",
  "updatedAt": "2025-10-15T00:00:00Z"
}
```

**Row 2 - Healthcare Schema:**
```json
{
  "id": "schema-healthcare-001",
  "sourceName": "patient_records",
  "displayName": "Patient Record Import",
  "description": "HIPAA-compliant patient data schema",
  "schemaVersion": "1.5",
  "fieldDefinitions": {
    "patient_id": {"type": "text", "required": true, "unique": true},
    "first_name": {"type": "text", "required": true},
    "last_name": {"type": "text", "required": true},
    "dob": {"type": "date", "required": true},
    "email": {"type": "email", "required": false},
    "insurance_id": {"type": "text", "required": false}
  },
  "mappingTemplates": {
    "Patient ID": "patient_id",
    "MRN": "patient_id",
    "Date of Birth": "dob",
    "DOB": "dob"
  },
  "validationRules": {
    "dob": {"max": "today", "format": "YYYY-MM-DD"}
  },
  "industryContext": {
    "industry": "healthcare",
    "compliance": ["HIPAA"],
    "piiFields": ["first_name", "last_name", "dob", "email"]
  },
  "isActive": true,
  "createdAt": "2025-01-15T00:00:00Z",
  "updatedAt": "2025-11-20T00:00:00Z"
}
```

---

## User Management Tables

### users

**Purpose:** Application user accounts with role-based access control.

**Key Features:**
- Email-based authentication
- Role hierarchy (admin, user, viewer)
- Email verification workflow
- Account activation tokens

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| email | TEXT | No | - | Unique email address |
| passwordHash | TEXT | No | - | Bcrypt password hash |
| firstName | TEXT | Yes | - | First name |
| lastName | TEXT | Yes | - | Last name |
| role | TEXT | No | user | admin/user/viewer |
| isActive | BOOLEAN | Yes | false | Account active status |
| isEmailVerified | BOOLEAN | Yes | false | Email verified status |
| activationToken | TEXT | Yes | - | Email verification token |
| activationTokenExpires | TIMESTAMP | Yes | - | Token expiry |
| lastLoginAt | TIMESTAMP | Yes | - | Last login time |
| createdAt | TIMESTAMP | No | now() | Account creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - Admin User:**
```json
{
  "id": "user-admin-001",
  "email": "admin@company.com",
  "passwordHash": "$2b$10$...(bcrypt hash)",
  "firstName": "Admin",
  "lastName": "User",
  "role": "admin",
  "isActive": true,
  "isEmailVerified": true,
  "activationToken": null,
  "activationTokenExpires": null,
  "lastLoginAt": "2025-12-20T09:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2025-12-20T09:00:00Z"
}
```

**Row 2 - Pending User:**
```json
{
  "id": "user-pending-002",
  "email": "newuser@company.com",
  "passwordHash": "$2b$10$...(bcrypt hash)",
  "firstName": "New",
  "lastName": "User",
  "role": "user",
  "isActive": false,
  "isEmailVerified": false,
  "activationToken": "abc123xyz789",
  "activationTokenExpires": "2025-12-22T10:00:00Z",
  "lastLoginAt": null,
  "createdAt": "2025-12-20T10:00:00Z",
  "updatedAt": "2025-12-20T10:00:00Z"
}
```

---

### userSessions

**Purpose:** Manages active user sessions for authentication.

**Key Features:**
- Token-based session management
- Expiration tracking
- User association

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| userId | UUID | No | - | Reference to users |
| sessionToken | TEXT | No | - | Unique session token |
| expiresAt | TIMESTAMP | No | - | Session expiry time |
| createdAt | TIMESTAMP | No | now() | Session creation time |

#### Sample Data

**Row 1 - Active Session:**
```json
{
  "id": "sess-001-active",
  "userId": "user-admin-001",
  "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-12-21T09:00:00Z",
  "createdAt": "2025-12-20T09:00:00Z"
}
```

**Row 2 - Expired Session:**
```json
{
  "id": "sess-002-expired",
  "userId": "user-admin-001",
  "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-12-19T15:00:00Z",
  "createdAt": "2025-12-18T15:00:00Z"
}
```

---

## Observability Tables

### applicationLogs

**Purpose:** Structured application logging with security and lifecycle management.

**Key Features:**
- Standard log levels (trace, debug, info, warn, error, fatal)
- Category-based organization (email, auth, database, api, etc.)
- PII redaction support
- Error fingerprinting for grouping
- TTL-based retention

#### Schema (Key Fields)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| timestamp | TIMESTAMP | Log timestamp |
| level | TEXT | Log level (trace/debug/info/warn/error/fatal) |
| category | TEXT | Category (email/auth/database/api/system/import) |
| message | TEXT | Log message |
| metadata | JSONB | Structured data |
| userId | UUID | Associated user |
| requestId | TEXT | Request correlation |
| correlationId | TEXT | Cross-service correlation |
| stackTrace | TEXT | Error stack trace |
| service | TEXT | Service identifier |
| environment | TEXT | Environment (development/production) |
| isRedacted | BOOLEAN | PII redaction flag |
| errorFingerprint | TEXT | Error grouping signature |
| errorGroupId | UUID | Reference to error group |
| isArchived | BOOLEAN | Archive status |
| ttlExpiry | TIMESTAMP | Retention expiry |

#### Sample Data

**Row 1 - Info Log:**
```json
{
  "id": "log-001-info",
  "timestamp": "2025-12-20T14:30:00Z",
  "level": "info",
  "category": "import",
  "message": "Customer import completed successfully",
  "metadata": {
    "importId": "imp-001-2025",
    "recordsProcessed": 25000,
    "duration": "45 minutes"
  },
  "userId": "user-admin-001",
  "requestId": "req-abc123",
  "service": "cdp-platform",
  "environment": "production",
  "isRedacted": false,
  "isArchived": false,
  "createdAt": "2025-12-20T14:30:00Z"
}
```

**Row 2 - Error Log:**
```json
{
  "id": "log-002-error",
  "timestamp": "2025-12-20T15:00:00Z",
  "level": "error",
  "category": "database",
  "message": "Failed to connect to embedding service",
  "metadata": {
    "errorCode": "ECONNREFUSED",
    "retryAttempt": 3
  },
  "userId": null,
  "requestId": "req-xyz789",
  "correlationId": "corr-emb-job-001",
  "stackTrace": "Error: ECONNREFUSED\n  at TCPConnectWrap.afterConnect...",
  "service": "embedding-service",
  "environment": "production",
  "isRedacted": false,
  "errorFingerprint": "md5_econnrefused_embedding",
  "errorGroupId": "errgrp-001",
  "isArchived": false,
  "createdAt": "2025-12-20T15:00:00Z"
}
```

---

### errorGroups

**Purpose:** Aggregates similar errors for efficient monitoring.

**Key Features:**
- Fingerprint-based deduplication
- Occurrence counting
- Resolution tracking
- Sample log reference

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| fingerprint | TEXT | No | - | Unique error signature |
| firstSeen | TIMESTAMP | No | - | First occurrence |
| lastSeen | TIMESTAMP | No | - | Most recent occurrence |
| count | INTEGER | No | 1 | Total occurrences |
| sampleLogId | UUID | Yes | - | Representative log |
| level | TEXT | No | - | Error level |
| category | TEXT | No | - | Error category |
| service | TEXT | No | - | Originating service |
| messageTemplate | TEXT | Yes | - | Normalized message |
| stackTraceHash | TEXT | Yes | - | Stack trace signature |
| isResolved | BOOLEAN | Yes | false | Resolution status |
| resolvedAt | TIMESTAMP | Yes | - | Resolution time |
| resolvedBy | UUID | Yes | - | Resolver user ID |
| notes | TEXT | Yes | - | Resolution notes |

#### Sample Data

**Row 1 - Active Error Group:**
```json
{
  "id": "errgrp-001",
  "fingerprint": "md5_econnrefused_embedding",
  "firstSeen": "2025-12-18T10:00:00Z",
  "lastSeen": "2025-12-20T15:00:00Z",
  "count": 47,
  "sampleLogId": "log-002-error",
  "level": "error",
  "category": "database",
  "service": "embedding-service",
  "messageTemplate": "Failed to connect to embedding service",
  "stackTraceHash": "sha256_tcpconnect_abc",
  "isResolved": false,
  "resolvedAt": null,
  "resolvedBy": null,
  "notes": null,
  "createdAt": "2025-12-18T10:00:00Z"
}
```

**Row 2 - Resolved Error Group:**
```json
{
  "id": "errgrp-002",
  "fingerprint": "md5_timeout_api",
  "firstSeen": "2025-12-10T08:00:00Z",
  "lastSeen": "2025-12-15T12:00:00Z",
  "count": 156,
  "sampleLogId": "log-old-timeout",
  "level": "warn",
  "category": "api",
  "service": "cdp-platform",
  "messageTemplate": "API request timeout exceeded",
  "stackTraceHash": null,
  "isResolved": true,
  "resolvedAt": "2025-12-16T09:00:00Z",
  "resolvedBy": "user-admin-001",
  "notes": "Increased timeout to 30s and added connection pooling",
  "createdAt": "2025-12-10T08:00:00Z"
}
```

---

### logAlerts

**Purpose:** Health monitoring and anomaly detection alerts.

**Key Features:**
- Multiple alert types (error_rate, volume_spike, anomaly, threshold)
- Statistical analysis (z-score, EWMA)
- Severity levels
- Muting capability

#### Schema (Key Fields)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| alertType | TEXT | error_rate/volume_spike/anomaly/threshold |
| scope | TEXT | service/category/global |
| scopeValue | TEXT | Specific scope target |
| metric | TEXT | Monitored metric |
| threshold | REAL | Alert threshold |
| currentValue | REAL | Current metric value |
| status | TEXT | active/resolved/muted |
| severity | TEXT | low/medium/high/critical |
| zScore | REAL | Statistical z-score |
| baseline | REAL | Historical baseline |
| firstTriggered | TIMESTAMP | First trigger time |
| lastTriggered | TIMESTAMP | Most recent trigger |
| triggerCount | INTEGER | Total triggers |
| message | TEXT | Alert description |
| actionRequired | TEXT | Suggested actions |

#### Sample Data

**Row 1 - Active Critical Alert:**
```json
{
  "id": "alert-001-critical",
  "alertType": "error_rate",
  "scope": "service",
  "scopeValue": "embedding-service",
  "metric": "error_rate",
  "threshold": 0.05,
  "currentValue": 0.12,
  "status": "active",
  "severity": "critical",
  "analysisMethod": "ewma",
  "zScore": 3.2,
  "baseline": 0.02,
  "firstTriggered": "2025-12-20T14:00:00Z",
  "lastTriggered": "2025-12-20T15:30:00Z",
  "triggerCount": 8,
  "message": "Error rate exceeds 5% threshold (currently 12%)",
  "actionRequired": "Investigate embedding service connectivity"
}
```

**Row 2 - Muted Alert:**
```json
{
  "id": "alert-002-muted",
  "alertType": "volume_spike",
  "scope": "category",
  "scopeValue": "import",
  "metric": "log_count",
  "threshold": 1000,
  "currentValue": 5000,
  "status": "muted",
  "severity": "medium",
  "analysisMethod": "z_score",
  "zScore": 2.1,
  "baseline": 500,
  "firstTriggered": "2025-12-15T00:00:00Z",
  "lastTriggered": "2025-12-15T01:00:00Z",
  "triggerCount": 3,
  "mutedUntil": "2025-12-25T00:00:00Z",
  "message": "Unusual log volume spike during bulk import",
  "actionRequired": "Expected behavior during large import"
}
```

---

### logSettings

**Purpose:** Centralized configuration for logging behavior.

**Key Features:**
- Retention policies
- Redaction rules
- Sampling rates
- Alert thresholds

#### Schema

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | auto-generated | Primary key |
| settingKey | TEXT | No | - | Unique configuration key |
| settingValue | JSONB | No | - | Configuration value |
| settingType | TEXT | No | - | retention/redaction/sampling/alerts |
| description | TEXT | Yes | - | Human-readable description |
| isActive | BOOLEAN | Yes | true | Whether setting is active |
| validationSchema | JSONB | Yes | - | JSON schema for validation |
| updatedBy | UUID | Yes | - | Last modified by |
| createdAt | TIMESTAMP | No | now() | Creation time |
| updatedAt | TIMESTAMP | No | now() | Last update time |

#### Sample Data

**Row 1 - Retention Policy:**
```json
{
  "id": "setting-retention-001",
  "settingKey": "log_retention_days",
  "settingValue": {
    "default": 30,
    "error": 90,
    "fatal": 365,
    "debug": 7
  },
  "settingType": "retention",
  "description": "Log retention periods by level (in days)",
  "isActive": true,
  "validationSchema": {
    "type": "object",
    "properties": {
      "default": {"type": "integer", "minimum": 1}
    }
  },
  "updatedBy": "user-admin-001",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2025-06-01T00:00:00Z"
}
```

**Row 2 - PII Redaction Rules:**
```json
{
  "id": "setting-redaction-001",
  "settingKey": "pii_redaction_patterns",
  "settingValue": {
    "patterns": [
      {"name": "email", "regex": "[\\w.-]+@[\\w.-]+\\.\\w+", "replacement": "[REDACTED_EMAIL]"},
      {"name": "phone", "regex": "\\+?\\d{10,15}", "replacement": "[REDACTED_PHONE]"},
      {"name": "ssn", "regex": "\\d{3}-\\d{2}-\\d{4}", "replacement": "[REDACTED_SSN]"}
    ],
    "enabledCategories": ["all"]
  },
  "settingType": "redaction",
  "description": "PII patterns to automatically redact from logs",
  "isActive": true,
  "updatedBy": "user-admin-001",
  "createdAt": "2024-03-15T00:00:00Z",
  "updatedAt": "2025-09-01T00:00:00Z"
}
```

---

## Common Queries

### Customer Queries

```sql
-- Find customer by email
SELECT * FROM customers WHERE email = 'sarah.johnson@email.com';

-- Get high-value customers (lifetime value > $10,000)
SELECT id, first_name, last_name, email, lifetime_value
FROM customers
WHERE lifetime_value > 10000
ORDER BY lifetime_value DESC
LIMIT 100;

-- Get customer with all identifiers
SELECT c.*, json_agg(ci.*) as identifiers
FROM customers c
LEFT JOIN customer_identifiers ci ON c.id = ci.customer_id
WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
GROUP BY c.id;

-- Count customers by segment
SELECT customer_segment, COUNT(*) as count
FROM customers
WHERE customer_segment IS NOT NULL
GROUP BY customer_segment
ORDER BY count DESC;
```

### Event Queries

```sql
-- Get recent events for a customer
SELECT * FROM customer_events
WHERE customer_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
ORDER BY event_timestamp DESC
LIMIT 50;

-- Count events by type (last 7 days)
SELECT event_type, COUNT(*) as count
FROM customer_events
WHERE event_timestamp > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY count DESC;

-- Purchase events with properties
SELECT id, customer_id, event_timestamp, event_properties->>'orderId' as order_id,
       (event_properties->>'totalAmount')::numeric as amount
FROM customer_events
WHERE event_type = 'purchase'
ORDER BY event_timestamp DESC;
```

### Segment Queries

```sql
-- Get all active segments with customer counts
SELECT id, name, description, customer_count
FROM segments
WHERE is_active = true
ORDER BY customer_count DESC;

-- Get customers in a specific segment
SELECT c.*
FROM customers c
JOIN customer_segments cs ON c.id = cs.customer_id
WHERE cs.segment_id = 'seg-premium-001';
```

### Embedding Queries

```sql
-- Find similar customers using pgvector
SELECT c.id, c.first_name, c.last_name, c.email,
       1 - (ce.embedding_vector <=> '[query_vector]') as similarity
FROM customer_embeddings ce
JOIN customers c ON ce.customer_id = c.id
ORDER BY ce.embedding_vector <=> '[query_vector]'
LIMIT 10;

-- Check embedding generation status
SELECT status, COUNT(*) as count
FROM embedding_jobs
GROUP BY status;

-- Get embedding progress for active jobs
SELECT * FROM embedding_progress
WHERE status = 'processing'
ORDER BY last_updated_at DESC;
```

### Import Queries

```sql
-- Recent import history
SELECT id, file_name, import_type, import_status,
       records_successful, records_failed, imported_at
FROM data_imports
ORDER BY imported_at DESC
LIMIT 20;

-- Failed raw imports for debugging
SELECT * FROM raw_data_imports
WHERE processing_status = 'failed'
AND import_session_id = 'imp-001-2025'
LIMIT 100;
```

### Logging Queries

```sql
-- Recent errors
SELECT timestamp, level, category, message, metadata
FROM application_logs
WHERE level IN ('error', 'fatal')
ORDER BY timestamp DESC
LIMIT 50;

-- Error groups by frequency
SELECT id, fingerprint, count, first_seen, last_seen, message_template
FROM error_groups
WHERE is_resolved = false
ORDER BY count DESC
LIMIT 20;

-- Active alerts
SELECT * FROM log_alerts
WHERE status = 'active'
ORDER BY severity DESC, last_triggered DESC;
```

---

## Best Practices

### 1. Performance Optimization

- **Use indexes**: Always filter on indexed columns (email, customer_segment, event_type)
- **JSONB queries**: Use GIN indexes for JSONB `@>` operator queries
- **Batch operations**: Process large datasets in batches (100-500 records)
- **Connection pooling**: Use connection pooling in production

### 2. Data Quality

- **Validate before insert**: Use Zod schemas for input validation
- **Track data lineage**: Always populate `importId` and `sourceRowNumber`
- **Monitor quality scores**: Set up alerts for low `dataQualityScore` trends

### 3. Security

- **Hash passwords**: Always use bcrypt for password hashing
- **Redact PII**: Enable log redaction for sensitive data
- **Use parameterized queries**: Never concatenate user input into SQL

### 4. Embedding Best Practices

- **Deduplicate**: Use `profileTextHash` to avoid regenerating identical embeddings
- **Monitor jobs**: Set up alerts for stalled embedding jobs
- **Use pgvector**: Prefer `embeddingVector` column for similarity search

### 5. Import Pipeline

- **Stage first**: Always write to `rawDataImports` before processing
- **Handle duplicates**: Configure `duplicateHandlingStrategy` appropriately
- **Track errors**: Store validation errors for debugging

---

## Getting Started Guide

### Step 1: Understand the Data Model

1. Start with the `customers` table - this is the central entity
2. Explore relationships: events, segments, identifiers, attributes
3. Review the JSONB columns for flexible data storage

### Step 2: Run Your First Queries

```sql
-- Count total customers
SELECT COUNT(*) FROM customers;

-- View recent imports
SELECT * FROM data_imports ORDER BY imported_at DESC LIMIT 5;

-- Check system health
SELECT level, COUNT(*) FROM application_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY level;
```

### Step 3: Explore the API

The Drizzle ORM provides type-safe database access:

```typescript
import { db } from './server/db';
import { customers, customerEvents } from './shared/schema';
import { eq } from 'drizzle-orm';

// Find customer by email
const customer = await db
  .select()
  .from(customers)
  .where(eq(customers.email, 'sarah.johnson@email.com'))
  .limit(1);

// Get customer events
const events = await db
  .select()
  .from(customerEvents)
  .where(eq(customerEvents.customerId, customer[0].id))
  .orderBy(customerEvents.eventTimestamp);
```

### Step 4: Set Up Local Development

1. Ensure PostgreSQL is running with pgvector extension
2. Run migrations: `npm run db:push`
3. Seed test data if needed
4. Start the application: `npm run dev`

### Step 5: Key Files to Review

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema definitions |
| `server/db.ts` | Database connection setup |
| `server/storage.ts` | Data access layer |
| `server/routes.ts` | API endpoints |

---

## Appendix: Schema File Location

All table definitions are in: `shared/schema.ts`

This file contains:
- Table definitions using Drizzle ORM
- Relationship definitions
- Zod validation schemas
- TypeScript types for insert/select operations

---

*Documentation generated for CDP Platform - Version 1.0*
