/**
 * Flexible CDP Schema Registry Service
 *
 * Purpose: Manage industry-specific data schemas and mapping templates
 *
 * Key Features:
 * - Industry-specific schema definitions
 * - AI mapping templates for field recognition
 * - Data validation rules and business logic
 * - Schema versioning and evolution
 * - Custom schema registration
 *
 * Design Decisions:
 * - Predefined schemas for common industries
 * - Extensible template system
 * - Validation rules for data integrity
 * - Context-aware mapping suggestions
 *
 * @module SchemaRegistryService
 * @created Initial implementation
 * @updated August 13, 2025 - Refactored for improved modularity and error handling
 */

import { db } from '../db';
import { dataSourceSchemas } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  ResponseFormatter
} from '../utils/service-utilities';
import {
  RecordValidator
} from '../utils/database-utilities';

export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  category: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical';
  description: string;
  required?: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: string[];
  };
  examples: string[];
}

export interface SchemaTemplate {
  sourceName: string;
  displayName: string;
  description: string;
  fieldDefinitions: Record<string, FieldDefinition>;
  mappingTemplates: Record<string, string>; // Original header -> field name mapping
  validationRules: {
    requiredFields: string[];
    businessRules: string[];
  };
  industryContext: {
    commonTerms: string[];
    dataPatterns: string[];
    businessFocus: string[];
  };
}

class SchemaRegistryService {
  private predefinedSchemas: SchemaTemplate[] = [
    // Music Industry Schema
    {
      sourceName: 'music_industry',
      displayName: 'Music Industry',
      description: 'Customer data schema for music industry, radio stations, streaming platforms',
      fieldDefinitions: {
        'genre_preferences': {
          name: 'genre_preferences',
          type: 'array',
          category: 'preferences',
          description: 'Musical genres the customer prefers',
          examples: ['["Rock", "Jazz", "Pop"]', '["Classical", "Electronic"]'],
        },
        'listening_hours_daily': {
          name: 'listening_hours_daily',
          type: 'number',
          category: 'behaviors',
          description: 'Average hours of music listening per day',
          examples: ['4.5', '2.0', '8.5'],
        },
        'favorite_artists': {
          name: 'favorite_artists',
          type: 'array',
          category: 'preferences',
          description: 'List of favorite artists or bands',
          examples: ['["John Mayer", "Adele"]', '["Metallica", "Led Zeppelin"]'],
        },
        'concert_attendance_yearly': {
          name: 'concert_attendance_yearly',
          type: 'number',
          category: 'behaviors',
          description: 'Number of concerts attended per year',
          examples: ['12', '5', '0'],
        },
        'streaming_platform': {
          name: 'streaming_platform',
          type: 'text',
          category: 'demographics',
          description: 'Primary music streaming platform used',
          examples: ['Spotify', 'Apple Music', 'YouTube Music'],
        },
        'music_discovery_method': {
          name: 'music_discovery_method',
          type: 'text',
          category: 'behaviors',
          description: 'How the customer discovers new music',
          examples: ['Radio', 'Friends', 'Social Media', 'Playlists'],
        },
      },
      mappingTemplates: {
        // Indonesian headers (common in music industry data)
        'GENRE_FAVORIT': 'genre_preferences',
        'GENRE_MUSIK': 'genre_preferences',
        'ARTIS_FAVORIT': 'favorite_artists',
        'ARTIS_KESUKAAN': 'favorite_artists',
        'JAM_MENDENGARKAN': 'listening_hours_daily',
        'LAMA_MENDENGARKAN': 'listening_hours_daily',
        'PLATFORM_STREAMING': 'streaming_platform',
        'KONSER_TAHUNAN': 'concert_attendance_yearly',

        // English headers
        'FAVORITE_GENRE': 'genre_preferences',
        'MUSIC_GENRE': 'genre_preferences',
        'FAVORITE_ARTIST': 'favorite_artists',
        'PREFERRED_ARTIST': 'favorite_artists',
        'LISTENING_HOURS': 'listening_hours_daily',
        'DAILY_LISTENING': 'listening_hours_daily',
        'STREAMING_SERVICE': 'streaming_platform',
        'MUSIC_PLATFORM': 'streaming_platform',
        'CONCERTS_PER_YEAR': 'concert_attendance_yearly',
        'ANNUAL_CONCERTS': 'concert_attendance_yearly',
      },
      validationRules: {
        requiredFields: [],
        businessRules: [
          'listening_hours_daily should be between 0 and 24',
          'concert_attendance_yearly should be non-negative',
        ],
      },
      industryContext: {
        commonTerms: ['music', 'genre', 'artist', 'concert', 'streaming', 'radio', 'album', 'song'],
        dataPatterns: ['genre lists', 'artist names', 'platform names', 'time durations'],
        businessFocus: ['customer preferences', 'engagement patterns', 'content consumption'],
      },
    },

    // Retail CRM Schema
    {
      sourceName: 'retail_crm',
      displayName: 'Retail CRM',
      description: 'Customer data schema for retail businesses, e-commerce, shopping centers',
      fieldDefinitions: {
        'purchase_history': {
          name: 'purchase_history',
          type: 'array',
          category: 'behaviors',
          description: 'List of customer purchases with details',
          examples: ['[{"item": "laptop", "date": "2024-01-15", "amount": 1200}]'],
        },
        'loyalty_points': {
          name: 'loyalty_points',
          type: 'number',
          category: 'engagement',
          description: 'Current loyalty program points balance',
          examples: ['2500', '150', '0'],
        },
        'preferred_brands': {
          name: 'preferred_brands',
          type: 'array',
          category: 'preferences',
          description: 'Brands the customer frequently purchases',
          examples: ['["Apple", "Nike", "Starbucks"]', '["Samsung", "Adidas"]'],
        },
        'shopping_frequency': {
          name: 'shopping_frequency',
          type: 'text',
          category: 'behaviors',
          description: 'How often the customer shops',
          examples: ['weekly', 'monthly', 'quarterly'],
        },
        'average_order_value': {
          name: 'average_order_value',
          type: 'number',
          category: 'behaviors',
          description: 'Average monetary value per order',
          examples: ['125.50', '75.25', '300.00'],
        },
        'preferred_categories': {
          name: 'preferred_categories',
          type: 'array',
          category: 'preferences',
          description: 'Product categories customer prefers',
          examples: ['["Electronics", "Clothing"]', '["Books", "Home & Garden"]'],
        },
      },
      mappingTemplates: {
        'PURCHASE_HISTORY': 'purchase_history',
        'ORDER_HISTORY': 'purchase_history',
        'LOYALTY_POINTS': 'loyalty_points',
        'REWARD_POINTS': 'loyalty_points',
        'FAVORITE_BRANDS': 'preferred_brands',
        'PREFERRED_BRANDS': 'preferred_brands',
        'SHOPPING_FREQUENCY': 'shopping_frequency',
        'PURCHASE_FREQUENCY': 'shopping_frequency',
        'AVERAGE_ORDER': 'average_order_value',
        'AVG_ORDER_VALUE': 'average_order_value',
        'PRODUCT_CATEGORIES': 'preferred_categories',
        'FAVORITE_CATEGORIES': 'preferred_categories',
      },
      validationRules: {
        requiredFields: [],
        businessRules: [
          'loyalty_points should be non-negative',
          'average_order_value should be positive',
        ],
      },
      industryContext: {
        commonTerms: ['purchase', 'order', 'loyalty', 'brand', 'category', 'shopping', 'retail'],
        dataPatterns: ['purchase arrays', 'monetary values', 'frequency terms', 'brand names'],
        businessFocus: ['purchase behavior', 'brand loyalty', 'customer value'],
      },
    },

    // Healthcare Schema
    {
      sourceName: 'healthcare',
      displayName: 'Healthcare',
      description: 'Customer data schema for healthcare providers, medical practices',
      fieldDefinitions: {
        'medical_conditions': {
          name: 'medical_conditions',
          type: 'array',
          category: 'demographics',
          description: 'List of known medical conditions (anonymized)',
          examples: ['["Diabetes", "Hypertension"]', '["Asthma"]'],
        },
        'appointment_frequency': {
          name: 'appointment_frequency',
          type: 'text',
          category: 'behaviors',
          description: 'How often patient schedules appointments',
          examples: ['monthly', 'quarterly', 'annually'],
        },
        'insurance_provider': {
          name: 'insurance_provider',
          type: 'text',
          category: 'demographics',
          description: 'Primary insurance provider',
          examples: ['Blue Cross', 'Aetna', 'Kaiser'],
        },
        'emergency_contact': {
          name: 'emergency_contact',
          type: 'object',
          category: 'demographics',
          description: 'Emergency contact information',
          examples: ['{"name": "John Doe", "phone": "555-1234"}'],
        },
      },
      mappingTemplates: {
        'MEDICAL_CONDITIONS': 'medical_conditions',
        'HEALTH_CONDITIONS': 'medical_conditions',
        'APPOINTMENT_FREQ': 'appointment_frequency',
        'VISIT_FREQUENCY': 'appointment_frequency',
        'INSURANCE': 'insurance_provider',
        'INSURANCE_COMPANY': 'insurance_provider',
        'EMERGENCY_CONTACT': 'emergency_contact',
      },
      validationRules: {
        requiredFields: [],
        businessRules: [
          'medical_conditions should be anonymized',
          'emergency_contact must include name and phone',
        ],
      },
      industryContext: {
        commonTerms: ['medical', 'health', 'appointment', 'insurance', 'condition', 'patient'],
        dataPatterns: ['medical terminology', 'contact information', 'frequency terms'],
        businessFocus: ['patient care', 'health management', 'service delivery'],
      },
    },
  ];

  /**
   * Initialize the schema registry with predefined industry schemas
   */
  async initializeSchemas(): Promise<void> {

    for (const template of this.predefinedSchemas) {
      try {
        // Check if schema already exists
        const existing = await db
          .select()
          .from(dataSourceSchemas)
          .where(eq(dataSourceSchemas.sourceName, template.sourceName))
          .limit(1);

        if (existing.length === 0) {
          // Create new schema
          await db.insert(dataSourceSchemas).values({
            sourceName: template.sourceName,
            displayName: template.displayName,
            description: template.description,
            schemaVersion: "1.0",
            fieldDefinitions: template.fieldDefinitions,
            mappingTemplates: template.mappingTemplates,
            validationRules: template.validationRules,
            industryContext: template.industryContext,
          });

        } else {
        }
      } catch (error) {
        secureLogger.error(`❌ Failed to create schema ${template.sourceName}:`, { error: String(error) });
      }
    }

  }

  /**
   * Get all available data source schemas
   */
  async getAvailableSchemas(): Promise<any[]> {
    return await db
      .select()
      .from(dataSourceSchemas)
      .where(eq(dataSourceSchemas.isActive, true));
  }

  /**
   * Get a specific schema by source name
   */
  async getSchema(sourceName: string): Promise<any | null> {
    const result = await db
      .select()
      .from(dataSourceSchemas)
      .where(eq(dataSourceSchemas.sourceName, sourceName))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get a specific schema by name (alias for getSchema)
   */
  async getSchemaByName(sourceName: string): Promise<any | null> {
    return this.getSchema(sourceName);
  }

  /**
   * List all available schemas (alias for getAvailableSchemas)
   */
  async listSchemas(): Promise<any[]> {
    return this.getAvailableSchemas();
  }

  /**
   * Validate a field value against schema definition
   */
  async validateField(
    schemaName: string,
    fieldName: string,
    value: any
  ): Promise<boolean> {
    try {
      let schema = this.predefinedSchemas.find(s => s.sourceName === schemaName);
      
      if (!schema) {
        try {
          schema = await this.getSchema(schemaName);
        } catch (dbError) {
          secureLogger.warn(`Could not fetch schema from database: ${dbError}`);
          return false;
        }
      }
      
      if (!schema || !schema.fieldDefinitions) {
        return false;
      }

      const fieldDef = schema.fieldDefinitions[fieldName];
      if (!fieldDef) {
        return false;
      }

      if (fieldDef.validation) {
        const validation = fieldDef.validation;
        
        if (typeof value === 'string') {
          if (validation.minLength && value.length < validation.minLength) {
            return false;
          }
          if (validation.maxLength && value.length > validation.maxLength) {
            return false;
          }
          if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
            return false;
          }
          if (validation.options && !validation.options.includes(value)) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      secureLogger.error(`❌ Failed to validate field:`, { error: String(error) });
      return false;
    }
  }

  /**
   * Suggest the best schema for given data headers
   */
  async suggestSchema(headers: string[]): Promise<{ schema: any; confidence: number } | null> {
    const schemas = await this.getAvailableSchemas();
    let bestMatch = null;
    let highestScore = 0;

    for (const schema of schemas) {
      const mappingTemplates = schema.mappingTemplates || {};
      const industryContext = schema.industryContext || {};

      let score = 0;
      let matches = 0;

      // Check direct mapping matches
      headers.forEach(header => {
        const upperHeader = header.toUpperCase();
        if (mappingTemplates[upperHeader]) {
          matches++;
          score += 10; // High score for direct mapping
        }
      });

      // Check industry context matches
      headers.forEach(header => {
        const lowerHeader = header.toLowerCase();
        (industryContext.commonTerms || []).forEach((term: string) => {
          if (lowerHeader.includes(term.toLowerCase())) {
            score += 2; // Medium score for context match
          }
        });
      });

      const confidence = Math.min(100, (score / headers.length) * 10);

      if (confidence > highestScore && matches > 0) {
        highestScore = confidence;
        bestMatch = { schema, confidence };
      }
    }

    return bestMatch;
  }
}

export const schemaRegistryService = new SchemaRegistryService();
