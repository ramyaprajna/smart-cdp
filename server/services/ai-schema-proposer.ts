/**
 * AI Schema Proposer Service
 *
 * Solves Gap #1: "No Default Schema — AI rancang schema dari sample data"
 *
 * Instead of hardcoded schemas for 3 industries, this service analyzes
 * sample data from ANY domain and proposes a complete schema including:
 *   - Table name and description
 *   - Field definitions with types, constraints, and relationships
 *   - Suggested indexes for query performance
 *   - Industry/domain detection
 *
 * Flow:
 *   1. User uploads data or sends sample via API
 *   2. AI Schema Proposer analyzes field names, value patterns, data types
 *   3. Returns a ProposedSchema that can be:
 *      a. Stored in dataSourceSchemas registry (soft schema)
 *      b. Used to generate a Drizzle migration (hard schema — P3)
 *
 * @module AISchemaProposer
 */

import { getOpenAIClient } from '../utils/openai-client';
import { db } from '../db';
import { dataSourceSchemas } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// ── Types ───────────────────────────────────────────────────────

export interface ProposedField {
  name: string;
  originalHeader: string;
  type: 'text' | 'integer' | 'real' | 'boolean' | 'timestamp' | 'jsonb' | 'uuid';
  nullable: boolean;
  isIdentifier: boolean;       // Could link to a customer profile
  isPrimaryKey: boolean;
  isUnique: boolean;
  description: string;
  sampleValues: string[];
  inferredCategory: 'identifier' | 'attribute' | 'metric' | 'timestamp' | 'metadata' | 'relationship';
}

export interface ProposedSchema {
  tableName: string;
  displayName: string;
  description: string;
  detectedDomain: string;       // e.g. 'e-commerce', 'healthcare', 'education', 'logistics'
  domainConfidence: number;
  fields: ProposedField[];
  suggestedIndexes: string[];
  relationshipHints: Array<{
    field: string;
    relatesTo: string;           // e.g. 'customer_profile', 'event_store', 'external'
    relationship: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }>;
  estimatedRowCount?: number;
  aiReasoning: string;
}

export interface SchemaProposerInput {
  /** Sample data rows (minimum 3, recommended 10-50) */
  sampleData: Record<string, unknown>[];
  /** Optional hint about the data domain */
  domainHint?: string;
  /** Optional name for this data source */
  sourceName?: string;
}

// ── Service ─────────────────────────────────────────────────────

class AISchemaProposerService {
  /**
   * Analyze sample data and propose a schema.
   *
   * Strategy:
   *   1. Statistical analysis (types, nullability, uniqueness, patterns)
   *   2. AI-powered domain detection and field semantics
   *   3. Combine into ProposedSchema
   */
  async proposeSchema(input: SchemaProposerInput): Promise<ProposedSchema> {
    const { sampleData, domainHint, sourceName } = input;

    if (sampleData.length < 1) {
      throw new Error('At least 1 sample data row is required');
    }

    // Step 1: Statistical analysis
    const fieldStats = this.analyzeFields(sampleData);

    // Step 2: AI analysis for semantics + domain detection
    const aiAnalysis = await this.analyzeWithAI(fieldStats, sampleData.slice(0, 10), domainHint);

    // Step 3: Build proposed schema
    const fields: ProposedField[] = Object.entries(fieldStats).map(([fieldName, stats]) => {
      const aiField = aiAnalysis.fields[fieldName] || {};
      return {
        name: this.toSnakeCase(fieldName),
        originalHeader: fieldName,
        type: this.resolveType(stats, aiField),
        nullable: stats.nullRate > 0.05,
        isIdentifier: aiField.isIdentifier ?? false,
        isPrimaryKey: aiField.isPrimaryKey ?? false,
        isUnique: stats.uniqueRate > 0.95,
        description: aiField.description ?? `Field: ${fieldName}`,
        sampleValues: stats.sampleValues.slice(0, 3).map(String),
        inferredCategory: aiField.category ?? 'attribute',
      };
    });

    // Suggest indexes
    const suggestedIndexes: string[] = [];
    const identifiers = fields.filter(f => f.isIdentifier);
    const timestamps = fields.filter(f => f.type === 'timestamp');
    identifiers.forEach(f => suggestedIndexes.push(`idx_${aiAnalysis.tableName}_${f.name}`));
    timestamps.forEach(f => suggestedIndexes.push(`idx_${aiAnalysis.tableName}_${f.name}`));

    const proposedSchema: ProposedSchema = {
      tableName: aiAnalysis.tableName || this.toSnakeCase(sourceName || 'custom_data'),
      displayName: aiAnalysis.displayName || sourceName || 'Custom Data',
      description: aiAnalysis.description || 'AI-proposed schema from sample data',
      detectedDomain: aiAnalysis.domain || 'general',
      domainConfidence: aiAnalysis.domainConfidence || 50,
      fields,
      suggestedIndexes,
      relationshipHints: (aiAnalysis.relationships || []).map((r: any) => ({
        field: r.field,
        relatesTo: r.relatesTo,
        relationship: (['one-to-one', 'one-to-many', 'many-to-many'].includes(r.relationship) ? r.relationship : 'one-to-many') as 'one-to-one' | 'one-to-many' | 'many-to-many',
      })),
      estimatedRowCount: sampleData.length,
      aiReasoning: aiAnalysis.reasoning || '',
    };

    return proposedSchema;
  }

  /**
   * Save a proposed schema to the dataSourceSchemas registry.
   * This makes it available for future imports without needing AI re-analysis.
   */
  async saveToRegistry(schema: ProposedSchema): Promise<string> {
    const fieldDefinitions: Record<string, any> = {};
    for (const field of schema.fields) {
      fieldDefinitions[field.name] = {
        name: field.name,
        type: field.type,
        category: field.inferredCategory,
        description: field.description,
        required: !field.nullable,
        examples: field.sampleValues,
      };
    }

    const mappingTemplates: Record<string, string> = {};
    for (const field of schema.fields) {
      mappingTemplates[field.originalHeader] = field.name;
    }

    const [record] = await db
      .insert(dataSourceSchemas)
      .values({
        sourceName: schema.tableName,
        displayName: schema.displayName,
        description: schema.description,
        fieldDefinitions,
        mappingTemplates,
        validationRules: {
          requiredFields: schema.fields.filter(f => !f.nullable).map(f => f.name),
          businessRules: [],
        },
        industryContext: {
          domain: schema.detectedDomain,
          confidence: schema.domainConfidence,
          aiReasoning: schema.aiReasoning,
        },
      })
      .returning({ id: dataSourceSchemas.id });

    secureLogger.info('Schema saved to registry', {
      schemaId: record.id,
      tableName: schema.tableName,
      fieldCount: schema.fields.length,
    });

    return record.id;
  }

  // ── Field Analysis ──────────────────────────────────────────

  private analyzeFields(data: Record<string, unknown>[]): Record<string, FieldStats> {
    const allKeys = new Set<string>();
    data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

    const stats: Record<string, FieldStats> = {};

    for (const key of Array.from(allKeys)) {
      if (key.startsWith('_')) continue;

      const values = data.map(row => row[key]);
      const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');

      const types = new Set<string>();
      const uniqueValues = new Set<string>();
      const sampleValues: unknown[] = [];

      for (const v of nonNull) {
        types.add(typeof v);
        uniqueValues.add(String(v));
        if (sampleValues.length < 5) sampleValues.push(v);
      }

      stats[key] = {
        totalCount: values.length,
        nonNullCount: nonNull.length,
        nullRate: 1 - (nonNull.length / values.length),
        uniqueCount: uniqueValues.size,
        uniqueRate: nonNull.length > 0 ? uniqueValues.size / nonNull.length : 0,
        jsTypes: Array.from(types),
        sampleValues,
        looksLikeDate: nonNull.some(v => /^\d{4}-\d{2}-\d{2}/.test(String(v))),
        looksLikeNumber: nonNull.every(v => !isNaN(Number(v)) && String(v).length < 15),
        looksLikeBoolean: nonNull.every(v => ['true', 'false', '0', '1', 'yes', 'no'].includes(String(v).toLowerCase())),
        looksLikeUUID: nonNull.some(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))),
      };
    }

    return stats;
  }

  private resolveType(stats: FieldStats, aiField: any): ProposedField['type'] {
    if (stats.looksLikeUUID) return 'uuid';
    if (stats.looksLikeBoolean) return 'boolean';
    if (stats.looksLikeDate) return 'timestamp';
    if (stats.looksLikeNumber) {
      return stats.sampleValues.some(v => String(v).includes('.')) ? 'real' : 'integer';
    }
    if (aiField?.type) return aiField.type;
    return 'text';
  }

  // ── AI Analysis ─────────────────────────────────────────────

  private async analyzeWithAI(
    fieldStats: Record<string, FieldStats>,
    sampleRows: Record<string, unknown>[],
    domainHint?: string
  ): Promise<AISchemaAnalysis> {
    const openai = getOpenAIClient();

    // Build a compact representation for AI
    const fieldSummary: Record<string, any> = {};
    for (const [name, stats] of Object.entries(fieldStats)) {
      fieldSummary[name] = {
        samples: stats.sampleValues.slice(0, 3).map(String),
        type: stats.jsTypes.join('/'),
        nullRate: Math.round(stats.nullRate * 100) + '%',
        uniqueRate: Math.round(stats.uniqueRate * 100) + '%',
      };
    }

    const prompt = `Analyze this dataset and propose a database schema.
${domainHint ? `Domain hint: ${domainHint}` : ''}

Fields and statistics:
${JSON.stringify(fieldSummary, null, 2)}

Sample rows (first 3):
${JSON.stringify(sampleRows.slice(0, 3), null, 2)}

Respond with JSON only:
{
  "tableName": "snake_case_name",
  "displayName": "Human Name",
  "description": "What this data represents",
  "domain": "detected industry/domain",
  "domainConfidence": 0-100,
  "reasoning": "Why you chose this classification",
  "fields": {
    "fieldName": {
      "description": "What this field represents",
      "isIdentifier": true/false,
      "isPrimaryKey": true/false,
      "category": "identifier|attribute|metric|timestamp|metadata|relationship",
      "type": "text|integer|real|boolean|timestamp|jsonb|uuid"
    }
  },
  "relationships": [
    {"field": "x", "relatesTo": "customer_profile|event_store|external", "relationship": "one-to-one|one-to-many|many-to-many"}
  ]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: 'You are a database schema designer. Analyze data and propose optimal schemas. Respond ONLY with valid JSON.' },
          { role: 'user', content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content || '{}';
      // Strip markdown fences if present
      const cleaned = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      return JSON.parse(cleaned);
    } catch (error) {
      secureLogger.warn('AI schema analysis failed, using heuristic fallback', {
        error: String(error),
      });
      return this.heuristicFallback(fieldStats);
    }
  }

  private heuristicFallback(fieldStats: Record<string, FieldStats>): AISchemaAnalysis {
    const fields: Record<string, any> = {};
    for (const name of Object.keys(fieldStats)) {
      fields[name] = {
        description: `Imported field: ${name}`,
        isIdentifier: /id$|email|phone/i.test(name),
        isPrimaryKey: name === 'id',
        category: /id$|email|phone/i.test(name) ? 'identifier' :
                  /date|time|created|updated/i.test(name) ? 'timestamp' :
                  /count|amount|total|score/i.test(name) ? 'metric' : 'attribute',
      };
    }

    return {
      tableName: 'imported_data',
      displayName: 'Imported Data',
      description: 'Schema generated from heuristic analysis',
      domain: 'general',
      domainConfidence: 20,
      reasoning: 'AI unavailable — used pattern-based heuristics',
      fields,
      relationships: [],
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  private toSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s\-\.]+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 63);
  }
}

// ── Internal Types ──────────────────────────────────────────────

interface FieldStats {
  totalCount: number;
  nonNullCount: number;
  nullRate: number;
  uniqueCount: number;
  uniqueRate: number;
  jsTypes: string[];
  sampleValues: unknown[];
  looksLikeDate: boolean;
  looksLikeNumber: boolean;
  looksLikeBoolean: boolean;
  looksLikeUUID: boolean;
}

interface AISchemaAnalysis {
  tableName: string;
  displayName: string;
  description: string;
  domain: string;
  domainConfidence: number;
  reasoning: string;
  fields: Record<string, any>;
  relationships: Array<{
    field: string;
    relatesTo: string;
    relationship: string;
  }>;
}

export const aiSchemaProposer = new AISchemaProposerService();
