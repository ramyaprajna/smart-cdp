/**
 * Dynamic Attribute Service
 *
 * Purpose: Handles creation and management of custom attributes on-the-fly during imports
 *
 * Key Features:
 * - Dynamic attribute creation during data import
 * - Automatic data type inference from values
 * - Batch operations for performance
 * - Attribute validation and sanitization
 * - Query optimization with proper indexing
 *
 * Design Decisions:
 * - Uses batch operations to minimize database round trips
 * - Implements automatic type inference to reduce manual configuration
 * - Sanitizes attribute names to prevent SQL injection
 * - Caches attribute definitions for performance
 *
 * @module DynamicAttributeService
 * @created Initial implementation
 * @updated August 13, 2025 - Refactored for better modularity and performance
 */

import { db } from '../db';
import { customerAttributes } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  ResponseFormatter,
  PerformanceMonitor
} from '../utils/service-utilities';
import {
  BatchProcessor,
  RecordValidator,
  DataAggregator
} from '../utils/database-utilities';

export interface CreateCustomAttributeRequest {
  attributeName: string;
  attributeType: 'text' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  dataSource?: string;
  confidence?: number;
  isSystem?: boolean;
  description?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: string[];
  };
}

export interface CustomAttributeDefinition {
  name: string;
  attributeType: string;
  dataSource?: string;
  confidence?: number;
  isSystem?: boolean;
  description: string;
  validation?: any;
}

class DynamicAttributeService {
  // Cache for attribute definitions to reduce database queries
  private attributeCache = new Map<string, CustomAttributeDefinition>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Create a new custom attribute definition (metadata only, no customer-specific data)
   *
   * @param attributeName - Name of the attribute
   * @param dataType - Data type of the attribute
   * @param description - Description of what this attribute represents
   * @param dataSource - Source system for this attribute
   * @param category - Category (demographics, preferences, behaviors, etc.)
   * @returns Promise<CustomAttributeDefinition> - The created attribute definition
   */
  async createAttributeDefinition(
    attributeName: string,
    dataType: string,
    description: string,
    dataSource: string,
    category: string
  ): Promise<CustomAttributeDefinition & { dataType: string; attributeName: string }> {
    return await ServiceOperation.execute(
      'createAttributeDefinition',
      async () => {
        const cleanAttributeName = this.sanitizeAttributeName(attributeName);
        
        const definition: CustomAttributeDefinition & { dataType: string; attributeName: string } = {
          name: cleanAttributeName,
          attributeName: cleanAttributeName,
          attributeType: dataType,
          dataType: dataType,
          dataSource,
          confidence: 1.0,
          isSystem: false,
          description,
          validation: {
            category
          }
        };

        this.cacheAttributeDefinition(cleanAttributeName, definition);
        
        secureLogger.info(`✅ Created attribute definition: ${cleanAttributeName} (${dataType})`);
        
        return definition;
      }
    ).then(result => result.data!);
  }

  /**
   * Create a new custom attribute with validation and error handling
   *
   * @param customerId - Target customer ID
   * @param attributeName - Name of the attribute to create
   * @param attributeValue - Value to store
   * @param options - Creation options including data type and category
   * @returns Promise<void>
   * @throws Error if attribute creation fails
   */
  async createCustomAttribute(
    customerId: string,
    attributeName: string,
    attributeValue: any,
    options: CreateCustomAttributeRequest
  ): Promise<void> {
    return await ServiceOperation.execute(
      'createCustomAttribute',
      async () => {
        // Validate and prepare attribute data
        const attributeData = this.prepareAttributeData(
          customerId,
          attributeName,
          attributeValue,
          options
        );

        // Create the custom attribute record
        await db.insert(customerAttributes).values(attributeData);

        // Cache the attribute definition for future reference
        this.cacheAttributeDefinition(attributeData.attributeName, {
          name: attributeData.attributeName,
          attributeType: attributeData.attributeType,
          dataSource: attributeData.dataSource,
          confidence: attributeData.confidence,
          isSystem: attributeData.isSystem,
          description: options.description || '',
          validation: options.validation
        });

        secureLogger.info(`✅ Created custom attribute: ${attributeData.attributeName} (${attributeData.attributeType}) for customer ${customerId}`);
      }
    ).then(() => {});
  }

  /**
   * Prepare attribute data with validation and sanitization
   */
  private prepareAttributeData(
    customerId: string,
    attributeName: string,
    attributeValue: any,
    options: CreateCustomAttributeRequest
  ) {
    const cleanAttributeName = this.sanitizeAttributeName(attributeName);
    const attributeType = options.attributeType || this.inferDataType(attributeValue);

    return {
      customerId,
      attributeName: cleanAttributeName,
      attributeValue: this.serializeAttributeValue(attributeValue, attributeType),
      attributeType,
      dataSource: options.dataSource || 'manual_import',
      confidence: options.confidence || 1.0,
      isSystem: options.isSystem || false,
    };
  }

  /**
   * Batch create custom attributes with optimized performance
   *
   * @param customerAttributeData - Array of attribute data to create
   * @returns Promise<void>
   * @description Uses batch processing to optimize database operations
   */
  async batchCreateCustomAttributes(
    customerAttributeData: Array<{
      customerId: string;
      attributeName: string;
      attributeValue: any;
      options: CreateCustomAttributeRequest;
    }>
  ): Promise<void> {
    return await ServiceOperation.execute(
      'batchCreateCustomAttributes',
      async () => {
        // Process in optimized batches
        const results = await BatchProcessor.processInBatches(
          customerAttributeData,
          async (batch) => {
            const attributeRecords = batch.map(item =>
              this.prepareAttributeData(
                item.customerId,
                item.attributeName,
                item.attributeValue,
                item.options
              )
            );

            await db.insert(customerAttributes).values(attributeRecords);
            return attributeRecords;
          },
          { batchSize: 100, continueOnError: false }
        );


        // Cache all created attribute definitions
        results.forEach(record => {
          this.cacheAttributeDefinition(record.attributeName, {
            name: record.attributeName,
            attributeType: record.attributeType,
            dataSource: record.dataSource,
            confidence: record.confidence,
            isSystem: record.isSystem,
            description: ''
          });
        });
      }
    ).then(() => {});
  }

  /**
   * Get existing custom attributes for a customer
   */
  async getCustomerAttributes(
    customerId: string,
    isSystem?: boolean
  ): Promise<Array<{
    attributeName: string;
    attributeValue: any;
    attributeType: string;
    dataSource: string;
    confidence: number;
    isSystem: boolean;
  }>> {
    try {
      let query = db
        .select()
        .from(customerAttributes)
        .where(eq(customerAttributes.customerId, customerId));

      if (isSystem !== undefined) {
        query = db
          .select()
          .from(customerAttributes)
          .where(and(
            eq(customerAttributes.customerId, customerId),
            eq(customerAttributes.isSystem, isSystem)
          ));
      }

      const attributes = await query;

      return attributes.map(attr => ({
        attributeName: attr.attributeName,
        attributeValue: this.deserializeAttributeValue(attr.attributeValue, attr.attributeType),
        attributeType: attr.attributeType,
        dataSource: attr.dataSource || 'unknown',
        confidence: attr.confidence || 1.0,
        isSystem: attr.isSystem || false,
      }));
    } catch (error) {
      secureLogger.error(`❌ Failed to get customer attributes:`, { error: String(error) });
      return [];
    }
  }

  /**
   * Check if a custom attribute already exists for any customer
   */
  async attributeExists(attributeName: string, dataSource?: string): Promise<boolean> {
    try {
      const cleanAttributeName = this.sanitizeAttributeName(attributeName);

      let query = db
        .select()
        .from(customerAttributes)
        .where(eq(customerAttributes.attributeName, cleanAttributeName));

      if (dataSource) {
        query = db
          .select()
          .from(customerAttributes)
          .where(and(
            eq(customerAttributes.attributeName, cleanAttributeName),
            eq(customerAttributes.dataSource, dataSource)
          ));
      }

      const existing = await query.limit(1);
      return existing.length > 0;
    } catch (error) {
      secureLogger.error(`❌ Failed to check attribute existence:`, { error: String(error) });
      return false;
    }
  }

  /**
   * Get all unique custom attributes across the system
   */
  async getAllCustomAttributes(): Promise<Array<{
    attributeName: string;
    attributeType: string;
    dataSource: string;
    usageCount: number;
    isSystem: boolean;
  }>> {
    try {
      // This would be implemented with proper SQL aggregation
      // For now, return basic structure
      const attributes = await db
        .select({
          attributeName: customerAttributes.attributeName,
          attributeType: customerAttributes.attributeType,
          dataSource: customerAttributes.dataSource,
          isSystem: customerAttributes.isSystem,
        })
        .from(customerAttributes);

      // Group and count (simplified implementation)
      const grouped = new Map();
      attributes.forEach((attr: any) => {
        const key = `${attr.attributeName}_${attr.attributeType}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            attributeName: attr.attributeName,
            attributeType: attr.attributeType,
            dataSource: attr.dataSource || 'unknown',
            isSystem: attr.isSystem || false,
            usageCount: 0,
          });
        }
        grouped.get(key).usageCount++;
      });

      return Array.from(grouped.values());
    } catch (error) {
      secureLogger.error(`❌ Failed to get all custom attributes:`, { error: String(error) });
      return [];
    }
  }

  /**
   * Suggest attribute mapping based on column name and sample data
   */
  async suggestAttributeMapping(
    columnName: string,
    sampleValues: any[],
    dataSource?: string
  ): Promise<{
    suggestedName: string;
    suggestedType: string;
    suggestedCategory: string;
    confidence: number;
    reasoning: string;
  }> {
    try {
      const cleanName = this.sanitizeAttributeName(columnName);
      const inferredType = this.inferDataTypeFromSamples(sampleValues);

      // Check if similar attribute exists
      const existing = await this.findSimilarAttributes(cleanName);

      let suggestedCategory = 'demographics';
      let confidence = 60;
      let reasoning = `Inferred from column name "${columnName}" and data type analysis`;

      // Basic category inference
      if (this.isPreferenceRelated(columnName)) {
        suggestedCategory = 'preferences';
        confidence += 15;
        reasoning += '. Detected preference-related terminology';
      } else if (this.isBehaviorRelated(columnName)) {
        suggestedCategory = 'behaviors';
        confidence += 15;
        reasoning += '. Detected behavior-related terminology';
      } else if (this.isEngagementRelated(columnName)) {
        suggestedCategory = 'engagement';
        confidence += 15;
        reasoning += '. Detected engagement-related terminology';
      }

      // Boost confidence if similar attribute exists
      if (existing.length > 0) {
        confidence += 20;
        reasoning += `. Similar attribute "${existing[0].attributeName}" found in system`;
      }

      return {
        suggestedName: cleanName,
        suggestedType: inferredType,
        suggestedCategory,
        confidence: Math.min(100, confidence),
        reasoning,
      };
    } catch (error) {
      secureLogger.error(`❌ Failed to suggest attribute mapping:`, { error: String(error) });

      return {
        suggestedName: this.sanitizeAttributeName(columnName),
        suggestedType: 'text',
        suggestedCategory: 'demographics',
        confidence: 30,
        reasoning: 'Fallback suggestion due to analysis error',
      };
    }
  }

  /**
   * Private helper methods
   */
  private sanitizeAttributeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private inferDataType(value: any): string {
    if (value === null || value === undefined) return 'text';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';

    const strValue = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) return 'date';
    if (/^\d+\.?\d*$/.test(strValue)) return 'number';

    return 'text';
  }

  private inferDataTypeFromSamples(samples: any[]): string {
    const nonEmptySamples = samples.filter(s => s !== null && s !== undefined && s !== '');
    if (nonEmptySamples.length === 0) return 'text';

    const types = nonEmptySamples.map(s => this.inferDataType(s));
    const typeCounts = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  /**
   * Cache attribute definition for performance
   */
  private cacheAttributeDefinition(name: string, definition: CustomAttributeDefinition): void {
    this.attributeCache.set(name, definition);
  }

  /**
   * Find similar attributes in the system
   */
  private async findSimilarAttributes(attributeName: string): Promise<any[]> {
    try {
      const similar = await db
        .select()
        .from(customerAttributes)
        .where(eq(customerAttributes.attributeName, attributeName))
        .limit(5);
      return similar;
    } catch (error) {
      secureLogger.error('Failed to find similar attributes:', { error: String(error) });
      return [];
    }
  }

  /**
   * Check if attribute name is preference-related
   */
  private isPreferenceRelated(name: string): boolean {
    const preferenceKeywords = ['preference', 'favorite', 'preferred', 'like', 'interest'];
    const lowerName = name.toLowerCase();
    return preferenceKeywords.some(keyword => lowerName.includes(keyword));
  }

  /**
   * Check if attribute name is behavior-related
   */
  private isBehaviorRelated(name: string): boolean {
    const behaviorKeywords = ['action', 'behavior', 'activity', 'usage', 'frequency'];
    const lowerName = name.toLowerCase();
    return behaviorKeywords.some(keyword => lowerName.includes(keyword));
  }

  /**
   * Check if attribute name is engagement-related
   */
  private isEngagementRelated(name: string): boolean {
    const engagementKeywords = ['engagement', 'interaction', 'response', 'participation'];
    const lowerName = name.toLowerCase();
    return engagementKeywords.some(keyword => lowerName.includes(keyword));
  }

  private serializeAttributeValue(value: any, attributeType: string): any {
    if (attributeType === 'array' && !Array.isArray(value)) {
      // Convert string representations of arrays
      if (typeof value === 'string' && (value.startsWith('[') || value.includes(','))) {
        try {
          return JSON.parse(value);
        } catch {
          return value.split(',').map(v => v.trim());
        }
      }
    }

    if (attributeType === 'object' && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { raw: value };
      }
    }

    return value;
  }

  private deserializeAttributeValue(value: any, attributeType: string): any {
    // JSONB already handles most serialization/deserialization
    return value;
  }


}

export const dynamicAttributeService = new DynamicAttributeService();
