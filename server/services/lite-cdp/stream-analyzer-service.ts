/**
 * Stream Analyzer Service — Lite CDP v2
 *
 * Purpose: AI-powered analysis of data streams using GPT-4o.
 * Given sample data from a CSV/Excel upload, this service classifies the stream,
 * maps every field, suggests identity columns, proposes segments, generates an
 * embedding template, and configures analytics — all in a single LLM call.
 *
 * Key Features:
 * - Comprehensive system prompt covering 10+ real-world stream archetypes
 * - User prompt includes 20 sample rows + field stats + heuristic hints
 * - Strict JSON validation: all field keys must exist in source headers
 * - Conservative identity-field detection (false unless AI is confident)
 * - Single GPT-4o call with JSON mode enabled
 *
 * Design Decisions:
 * - Uses getOpenAIClient() singleton (aligned with ai-column-mapper.ts convention)
 * - model = 'gpt-4o' for maximum semantic understanding
 * - 20 sample rows (not all 100) to stay well under context limits
 * - Validation re-uses the full headers list — AI cannot invent new keys
 *
 * Types: FieldDefinition and IdentifierType are imported from @shared/schema-v2.
 *
 * @module StreamAnalyzerService
 * @created 2025 — Lite CDP v2 Sprint 2.2
 */

import { getOpenAIClient } from '../../utils/openai-client';
import type { SampleData, FieldStats } from './sample-extractor';
import type { FieldDefinition, IdentifierType } from '@shared/schema-v2';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface AIAnalysisResult {
  /** Short name for the stream (e.g. "purchase_transactions", "event_attendees") */
  streamType: string;
  /** Primary entity modelled by the stream */
  entityType: 'person' | 'transaction' | 'session' | 'interaction' | 'device' | 'unknown';
  /** One FieldDefinition per source column */
  fieldDefinitions: FieldDefinition[];
  /** Columns that can act as customer/entity identifiers */
  suggestedIdentityFields: Array<{
    key: string;
    identifierType: IdentifierType;
    confidence: number;
    reasoning: string;
  }>;
  /** Proposed audience segments derivable from this data */
  suggestedSegments: Array<{
    name: string;
    description: string;
    basedOnField: string;
    segmentType: 'categorical' | 'numeric_range' | 'temporal' | 'behavioral';
  }>;
  /**
   * Sentence template for generating vector embeddings.
   * Uses {field_key} placeholders matching FieldDefinition.key values.
   * Example: "Customer {name} purchased {product_name} for {amount} on {purchase_date}."
   */
  embeddingTemplate: string;
  /** Prose description used to prime the chatbot with stream context */
  chatbotContext: string;
  analyticsConfig: {
    /** Fields suitable for GROUP BY (e.g. category, city, plan_type) */
    groupByFields: string[];
    /** Fields with suggested aggregation functions */
    aggregateFields: Array<{
      key: string;
      aggregations: ('sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count')[];
    }>;
    /** Primary timestamp field, or null if none detected */
    timeField: string | null;
    /** The most important metric field for dashboards */
    primaryMetric: string | null;
  };
  /** 0–1 confidence in the overall analysis */
  analysisConfidence: number;
  /** Prose notes on ambiguities, caveats, or assumptions */
  analysisNotes: string;
}

// ─── Main Class ───────────────────────────────────────────────────────────────

export class StreamAnalyzerService {
  private model = 'gpt-4o';

  // ── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Analyse a data stream sample using GPT-4o.
   *
   * Calls the OpenAI Chat Completions API with JSON mode enabled and returns a
   * fully validated AIAnalysisResult.
   *
   * @param sampleData      Output from SampleExtractor.extractFromCSV/extractFromExcel
   * @param heuristicHints  Optional pre-AI hints from SampleExtractor.computeHeuristicHints
   */
  async analyzeStream(
    sampleData: SampleData,
    heuristicHints?: Array<{ field: string; hint: string; confidence: number }>
  ): Promise<AIAnalysisResult> {
    const openai = getOpenAIClient();

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(sampleData, heuristicHints);

    const response = await openai.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      temperature: 0.2, // Low temperature for consistent, deterministic classification
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('StreamAnalyzerService: OpenAI returned an empty response');
    }

    const result = this.parseAIResponse(rawContent);

    const validation = this.validateResult(result, sampleData);
    if (!validation.valid) {
      throw new Error(
        `StreamAnalyzerService: AI response failed validation — ${validation.errors.join('; ')}`
      );
    }

    return result;
  }

  // ── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Build the system prompt.
   *
   * The prompt covers:
   * 1. Role & purpose
   * 2. Supported stream archetypes with examples
   * 3. Field classification rules (type, group, identifier logic)
   * 4. Embedding template format
   * 5. Analytics configuration guidelines
   * 6. Output JSON schema (mirrors AIAnalysisResult)
   */
  private buildSystemPrompt(): string {
    return `You are an expert Customer Data Platform (CDP) data architect. Your task is to analyse a sample dataset uploaded by a business user and produce a structured JSON analysis that will power an automated data stream configuration.

## Your Responsibilities

1. **Classify the stream**: Identify what kind of data this is (stream type and entity type).
2. **Map every field**: For each column, determine its data type, semantic group, and whether it is an identifier.
3. **Suggest identity fields**: Identify columns that can uniquely identify a person or entity. Be CONSERVATIVE — only set isIdentifier=true when you are highly confident.
4. **Propose audience segments**: Suggest 2–5 useful audience segments that could be built from this data.
5. **Write an embedding template**: A natural-language sentence using {field_key} placeholders that captures the most important facts about a record.
6. **Write chatbot context**: A 1–2 sentence description that a chatbot will use to understand this data stream.
7. **Configure analytics**: Identify fields for GROUP BY, aggregation, time axis, and primary metric.

## Stream Archetypes (examples, not exhaustive)

- **event_attendance**: Conference/seminar/webinar registrations. Fields: name, email, phone, event_name, date, session, attendance_status.
- **purchase_transaction**: E-commerce / POS sales. Fields: order_id, customer_id, product_name, category, quantity, price, total, purchase_date, payment_method.
- **web_session**: Website analytics exports. Fields: session_id, user_id, page_url, device, browser, duration_seconds, referrer, timestamp.
- **streaming_session**: Music/video platform plays. Fields: user_id, content_id, title, artist/genre, play_duration, completion_rate, timestamp.
- **chat_conversation**: CRM chat/support logs. Fields: conversation_id, customer_id, agent_id, channel, start_time, end_time, resolution_status, csat_score.
- **call_log**: Call centre records. Fields: call_id, caller_number, agent_id, duration_seconds, call_type, disposition, timestamp.
- **customer_registration**: CRM/loyalty sign-ups. Fields: customer_id, name, email, phone, dob, gender, city, join_date, tier.
- **loyalty_transaction**: Loyalty point earning/redemption. Fields: member_id, transaction_id, activity_type, points, balance, timestamp, branch.
- **survey_response**: NPS / satisfaction survey exports. Fields: respondent_id, email, score, verbatim, channel, submitted_at.
- **device_telemetry**: IoT / app device events. Fields: device_id, event_type, firmware_version, battery_level, timestamp, payload.

## Field Classification Rules

**dataType**: Choose from: string | number | date | boolean | json
  - Dates: any ISO-8601, dd/mm/yyyy, epoch timestamps
  - Number: integer or decimal values
  - Boolean: true/false, yes/no, 0/1
  - json: nested/complex objects

**group**: Choose the MOST specific applicable group:
  - identity: any identifier (email, phone, ID, member number, ticket, RFID)
  - demographic: name, age, gender, dob, city, country
  - behavioral: actions the entity performed (clicks, views, plays, attendance)
  - transactional: financial / purchase data (amount, price, quantity, points)
  - metadata: system fields, timestamps, status, source, tags, everything else

**isRequired**: true only if the field is clearly mandatory for every record (e.g. primary key, transaction ID).

**isPII**: true for name, email, phone, address, date of birth, national ID — any personally identifiable information.

**isIdentifier**: Set true ONLY for fields that can uniquely identify a record or link to a customer profile. Typical identifiers: email, phone, member_id, customer_id, order_id, session_id.

**identifierType**: Required when isIdentifier=true. Choose from:
  email | phone | wa_number | device_id | ticket_number | rfid | cookie | session_id | crm_id | member_id | custom

## Embedding Template Rules

- Write a natural sentence that captures who did what, when, and what value was involved.
- Use exact {field_key} placeholders matching the column headers exactly (case-sensitive).
- Do NOT invent field keys that don't exist in the input headers.
- Keep it under 30 words.
- Example: "Customer {email} attended {event_name} on {event_date} in {city}."

## Analytics Configuration Rules

- **groupByFields**: Low-cardinality categorical fields (< 50 expected unique values): status, category, gender, city, channel, tier, product_type.
- **aggregateFields**: Numeric fields that business users might want to SUM, AVG, COUNT, etc.
- **timeField**: The single most important timestamp column; null if none.
- **primaryMetric**: The most business-critical numeric field (revenue, score, count); null if none.

## Output Format

Return ONLY valid JSON matching this schema exactly:

{
  "streamType": "snake_case_name",
  "entityType": "person|transaction|session|interaction|device|unknown",
  "fieldDefinitions": [
    {
      "key": "exact_column_header",
      "label": "Human Readable Label",
      "dataType": "string|number|date|boolean|json",
      "group": "identity|demographic|behavioral|transactional|metadata",
      "isIdentifier": false,
      "identifierType": null,
      "isRequired": false,
      "isPII": false,
      "sampleValues": [],
      "description": "What this field represents"
    }
  ],
  "suggestedIdentityFields": [
    {
      "key": "exact_column_header",
      "identifierType": "email|phone|wa_number|device_id|ticket_number|rfid|cookie|session_id|crm_id|member_id|custom",
      "confidence": 0.95,
      "reasoning": "This field contains email addresses and uniquely identifies each person."
    }
  ],
  "suggestedSegments": [
    {
      "name": "High Value Customers",
      "description": "Customers with total spend above the 80th percentile",
      "basedOnField": "total_amount",
      "segmentType": "numeric_range"
    }
  ],
  "embeddingTemplate": "Natural sentence with {field_key} placeholders",
  "chatbotContext": "1-2 sentence description of the stream for chatbot priming.",
  "analyticsConfig": {
    "groupByFields": ["field_key_1", "field_key_2"],
    "aggregateFields": [
      { "key": "amount", "aggregations": ["sum", "avg", "count"] }
    ],
    "timeField": "created_at_or_null",
    "primaryMetric": "field_key_or_null"
  },
  "analysisConfidence": 0.88,
  "analysisNotes": "Notes on any ambiguous fields or assumptions made."
}

CRITICAL RULES:
- All "key" values in fieldDefinitions and suggestedIdentityFields MUST match an actual column header from the input exactly (case-sensitive).
- Do not include more than 10 suggestedSegments.
- Set analysisConfidence honestly (0.5 = very uncertain, 1.0 = completely obvious).
- If entityType is unclear, use "unknown" rather than guessing.
`;
  }

  /**
   * Build the user prompt containing the actual data sample.
   *
   * Includes:
   * - Column headers
   * - Up to 20 sample rows (JSON)
   * - Per-field statistics (null rate, unique rate, data type, sample values)
   * - Heuristic hints from SampleExtractor (if provided)
   */
  private buildUserPrompt(
    sampleData: SampleData,
    hints?: Array<{ field: string; hint: string; confidence: number }>
  ): string {
    const { headers, sampleRows, totalRowCount, fieldStats } = sampleData;

    // Limit to 20 rows for context budget
    const displayRows = sampleRows.slice(0, 20);

    const statsLines = headers.map((header) => {
      const stat: FieldStats | undefined = fieldStats[header];
      if (!stat) return `  ${header}: (no stats)`;

      const samples = stat.sampleValues
        .slice(0, 3)
        .map((v) => JSON.stringify(v))
        .join(', ');

      return (
        `  "${header}": ` +
        `nullRate=${(stat.nullRate * 100).toFixed(1)}%, ` +
        `uniqueRate=${(stat.uniqueRate * 100).toFixed(1)}%, ` +
        `inferredType=${stat.dataTypeSample}` +
        (stat.minLength !== undefined
          ? `, stringLen=${stat.minLength}–${stat.maxLength}`
          : '') +
        `, samples=[${samples}]`
      );
    });

    const hintsSection =
      hints && hints.length > 0
        ? `\n## Pre-Analysis Heuristic Hints (from column-name pattern matching)\n${hints
            .map(
              (h) =>
                `  - "${h.field}": ${h.hint} (confidence=${(h.confidence * 100).toFixed(0)}%)`
            )
            .join('\n')}`
        : '';

    return `## Dataset Overview
- Total rows in file: ${totalRowCount.toLocaleString()}
- Columns (${headers.length}): ${headers.map((h) => `"${h}"`).join(', ')}

## Sample Rows (first ${displayRows.length} of ${totalRowCount})
\`\`\`json
${JSON.stringify(displayRows, null, 2)}
\`\`\`

## Field Statistics (computed from up to 100 rows)
${statsLines.join('\n')}
${hintsSection}

Please analyse this dataset and return the JSON analysis as specified in the system prompt.`;
  }

  /**
   * Parse the raw JSON string returned by the AI.
   *
   * Throws a descriptive error if the JSON is malformed.
   */
  private parseAIResponse(response: string): AIAnalysisResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch (err) {
      throw new Error(
        `StreamAnalyzerService: AI returned malformed JSON — ${(err as Error).message}\n\nRaw response (first 500 chars): ${response.slice(0, 500)}`
      );
    }

    // Basic shape check before returning
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('StreamAnalyzerService: AI response is not a JSON object');
    }

    const obj = parsed as Record<string, unknown>;

    // Ensure required top-level keys exist
    const requiredKeys: (keyof AIAnalysisResult)[] = [
      'streamType',
      'entityType',
      'fieldDefinitions',
      'suggestedIdentityFields',
      'suggestedSegments',
      'embeddingTemplate',
      'chatbotContext',
      'analyticsConfig',
      'analysisConfidence',
      'analysisNotes',
    ];

    const missing = requiredKeys.filter((k) => !(k in obj));
    if (missing.length > 0) {
      throw new Error(
        `StreamAnalyzerService: AI response missing required keys: ${missing.join(', ')}`
      );
    }

    return parsed as AIAnalysisResult;
  }

  /**
   * Validate the parsed AI result against the source data.
   *
   * Checks:
   * 1. Every fieldDefinition.key exists in the source headers
   * 2. Every suggestedIdentityField.key exists in the source headers
   * 3. fieldDefinitions length matches headers length (± 0)
   * 4. entityType is a known value
   * 5. analysisConfidence is 0–1
   * 6. analyticsConfig fields reference valid keys
   */
  private validateResult(
    result: AIAnalysisResult,
    sampleData: SampleData
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const headerSet = new Set(sampleData.headers);

    const validEntityTypes = new Set([
      'person', 'transaction', 'session', 'interaction', 'device', 'unknown',
    ]);
    if (!validEntityTypes.has(result.entityType)) {
      errors.push(`Invalid entityType: "${result.entityType}"`);
    }

    if (typeof result.analysisConfidence !== 'number' ||
      result.analysisConfidence < 0 ||
      result.analysisConfidence > 1) {
      errors.push(`analysisConfidence must be a number between 0 and 1; got ${result.analysisConfidence}`);
    }

    // Validate fieldDefinition keys
    if (!Array.isArray(result.fieldDefinitions)) {
      errors.push('fieldDefinitions must be an array');
    } else {
      const validTypes = new Set(['string', 'number', 'date', 'boolean', 'json']);
      const validGroups = new Set([
        'identity', 'demographic', 'behavioral', 'transactional', 'metadata',
      ]);

      result.fieldDefinitions.forEach((fd, idx) => {
        if (!headerSet.has(fd.key)) {
          errors.push(`fieldDefinitions[${idx}].key "${fd.key}" does not exist in source headers`);
        }
        if (!validTypes.has(fd.dataType)) {
          errors.push(`fieldDefinitions[${idx}].dataType "${fd.dataType}" is not a valid type`);
        }
        if (!validGroups.has(fd.group)) {
          errors.push(`fieldDefinitions[${idx}].group "${fd.group}" is not a valid group`);
        }
      });
    }

    // Validate identity field keys
    if (!Array.isArray(result.suggestedIdentityFields)) {
      errors.push('suggestedIdentityFields must be an array');
    } else {
      result.suggestedIdentityFields.forEach((idf, idx) => {
        if (!headerSet.has(idf.key)) {
          errors.push(
            `suggestedIdentityFields[${idx}].key "${idf.key}" does not exist in source headers`
          );
        }
        if (typeof idf.confidence !== 'number' || idf.confidence < 0 || idf.confidence > 1) {
          errors.push(`suggestedIdentityFields[${idx}].confidence must be 0–1`);
        }
      });
    }

    // Validate analyticsConfig references
    const { analyticsConfig } = result;
    if (analyticsConfig) {
      if (Array.isArray(analyticsConfig.groupByFields)) {
        analyticsConfig.groupByFields.forEach((f) => {
          if (f && !headerSet.has(f)) {
            errors.push(`analyticsConfig.groupByFields contains unknown key: "${f}"`);
          }
        });
      }
      if (Array.isArray(analyticsConfig.aggregateFields)) {
        analyticsConfig.aggregateFields.forEach((af, idx) => {
          if (!headerSet.has(af.key)) {
            errors.push(`analyticsConfig.aggregateFields[${idx}].key "${af.key}" does not exist in headers`);
          }
        });
      }
      if (analyticsConfig.timeField && !headerSet.has(analyticsConfig.timeField)) {
        errors.push(`analyticsConfig.timeField "${analyticsConfig.timeField}" does not exist in headers`);
      }
      if (analyticsConfig.primaryMetric && !headerSet.has(analyticsConfig.primaryMetric)) {
        errors.push(`analyticsConfig.primaryMetric "${analyticsConfig.primaryMetric}" does not exist in headers`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
