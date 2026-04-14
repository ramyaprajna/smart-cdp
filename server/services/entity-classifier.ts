/**
 * Entity Classifier Service
 *
 * Uses AI to classify raw data into entity types without assuming
 * the data is customer data. This is the first step in the
 * "No Default Schema" approach — data comes in as-is, and AI
 * determines what kind of entity it represents.
 *
 * Supported entity types:
 *   - customer       — person/contact with PII (email, name, phone)
 *   - transaction    — purchase, order, payment record
 *   - event          — behavioral event, page view, interaction
 *   - product        — item, SKU, inventory record
 *   - feedback       — survey response, review, rating
 *   - location       — store, address, geography data
 *   - unknown        — couldn't classify with confidence
 *
 * @module EntityClassifier
 */

import { getOpenAIClient } from '../utils/openai-client';
import { secureLogger } from '../utils/secure-logger';

export interface ClassificationResult {
  entityType: string;
  confidence: number;
  reasoning: string;
  suggestedSchema: Record<string, FieldSuggestion>;
  identifiersFound: string[];    // fields that could link to a customer profile
  isCustomerLinkable: boolean;   // true if data CAN be linked to a customer (but doesn't have to)
}

export interface FieldSuggestion {
  originalField: string;
  suggestedName: string;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  category: 'identifier' | 'attribute' | 'metric' | 'timestamp' | 'metadata';
  isNullable: boolean;
}

// ── Rule-based heuristics (fast, no API call) ───────────────────

const ENTITY_SIGNALS: Record<string, string[]> = {
  customer: [
    'email', 'first_name', 'firstname', 'last_name', 'lastname', 'name',
    'phone', 'phone_number', 'phonenumber', 'date_of_birth', 'dob', 'gender',
    'address', 'city', 'country', 'whatsapp', 'wa_id',
  ],
  transaction: [
    'order_id', 'orderid', 'transaction_id', 'amount', 'total', 'subtotal',
    'price', 'payment', 'payment_method', 'currency', 'invoice', 'receipt',
    'purchase', 'quantity', 'sku', 'discount',
  ],
  event: [
    'event_type', 'eventtype', 'event_name', 'action', 'page_view', 'pageview',
    'session_id', 'sessionid', 'user_agent', 'referrer', 'utm_source', 'utm_medium',
    'click', 'impression', 'conversion', 'interaction',
  ],
  product: [
    'product_id', 'productid', 'sku', 'product_name', 'category', 'brand',
    'stock', 'inventory', 'weight', 'dimensions', 'barcode', 'upc',
  ],
  feedback: [
    'rating', 'review', 'comment', 'feedback', 'score', 'nps', 'survey',
    'satisfaction', 'sentiment', 'complaint', 'testimonial',
  ],
  location: [
    'latitude', 'longitude', 'lat', 'lng', 'store_id', 'branch', 'region',
    'zip_code', 'postal_code', 'coordinates',
  ],
};

class EntityClassifierService {
  /**
   * Classify a raw data record into an entity type.
   *
   * Strategy:
   *   1. Try rule-based heuristic first (fast, free)
   *   2. If confidence < 60%, fall back to AI classification
   */
  async classify(data: Record<string, unknown>): Promise<ClassificationResult> {
    const fields = Object.keys(data).map((f) => f.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

    // Step 1: Rule-based scoring
    const scores: Record<string, number> = {};
    for (const [entityType, signals] of Object.entries(ENTITY_SIGNALS)) {
      const matchCount = fields.filter((f) =>
        signals.some((s) => f.includes(s) || s.includes(f))
      ).length;
      scores[entityType] = fields.length > 0 ? (matchCount / fields.length) * 100 : 0;
    }

    const bestMatch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const [bestType, bestScore] = bestMatch || ['unknown', 0];

    // Find identifier fields
    const identifierFields = fields.filter((f) =>
      ENTITY_SIGNALS.customer.some((s) => f.includes(s) || s.includes(f))
    );

    // If rule-based is confident enough, return immediately
    if (bestScore >= 40) {
      return {
        entityType: bestType,
        confidence: Math.min(bestScore, 95),
        reasoning: `Rule-based: ${Math.round(bestScore)}% of fields match '${bestType}' signals`,
        suggestedSchema: this.buildSchemaSuggestion(data),
        identifiersFound: identifierFields,
        isCustomerLinkable: identifierFields.length > 0,
      };
    }

    // Step 2: AI classification for ambiguous data
    try {
      return await this.classifyWithAI(data, fields, identifierFields);
    } catch (error) {
      secureLogger.warn('Entity classifier AI fallback failed, using rule-based', {
        error: String(error),
      });

      return {
        entityType: bestScore > 15 ? bestType : 'unknown',
        confidence: Math.max(bestScore, 10),
        reasoning: `Rule-based fallback: low confidence (${Math.round(bestScore)}%)`,
        suggestedSchema: this.buildSchemaSuggestion(data),
        identifiersFound: identifierFields,
        isCustomerLinkable: identifierFields.length > 0,
      };
    }
  }

  private async classifyWithAI(
    data: Record<string, unknown>,
    fields: string[],
    identifierFields: string[]
  ): Promise<ClassificationResult> {
    const openai = getOpenAIClient();

    // Send only field names + sample values (not full data) for privacy
    const sampleFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      const strVal = String(value ?? '');
      sampleFields[key] = strVal.length > 50 ? strVal.substring(0, 50) + '...' : strVal;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are a data classification engine. Given field names and sample values, determine the entity type. Respond ONLY with valid JSON.

Entity types: customer, transaction, event, product, feedback, location, unknown

JSON format:
{
  "entityType": "string",
  "confidence": number (0-100),
  "reasoning": "string"
}`,
        },
        {
          role: 'user',
          content: `Classify this data record:\n${JSON.stringify(sampleFields, null, 2)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      entityType: parsed.entityType || 'unknown',
      confidence: parsed.confidence || 50,
      reasoning: `AI: ${parsed.reasoning || 'No reasoning provided'}`,
      suggestedSchema: this.buildSchemaSuggestion(data),
      identifiersFound: identifierFields,
      isCustomerLinkable: identifierFields.length > 0,
    };
  }

  private buildSchemaSuggestion(data: Record<string, unknown>): Record<string, FieldSuggestion> {
    const schema: Record<string, FieldSuggestion> = {};

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue; // skip internal fields

      schema[key] = {
        originalField: key,
        suggestedName: key.replace(/\s+/g, '_').toLowerCase(),
        dataType: this.inferDataType(value),
        category: this.inferCategory(key),
        isNullable: value === null || value === undefined || value === '',
      };
    }

    return schema;
  }

  private inferDataType(value: unknown): FieldSuggestion['dataType'] {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';

    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return 'date';
    if (/^\d+(\.\d+)?$/.test(str) && str.length < 15) return 'number';

    return 'string';
  }

  private inferCategory(fieldName: string): FieldSuggestion['category'] {
    const lower = fieldName.toLowerCase();

    if (/id$|_id|email|phone|whatsapp|name/.test(lower)) return 'identifier';
    if (/date|time|created|updated|timestamp/.test(lower)) return 'timestamp';
    if (/count|total|amount|score|rate|percent/.test(lower)) return 'metric';
    if (/source|channel|type|status|version|tag/.test(lower)) return 'metadata';

    return 'attribute';
  }
}

export const entityClassifier = new EntityClassifierService();
