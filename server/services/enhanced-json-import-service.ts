/**
 * Enhanced JSON Import Service
 *
 * Purpose: Advanced import functionality with JSON storage for unmapped fields
 *
 * Key Features:
 * - Stores unmapped fields as JSON for data preservation
 * - Preserves complete original source data
 * - AI-powered field mapping with confidence scores
 * - Hybrid storage strategy (JSON + custom attributes)
 * - Query helpers for JSON data access
 * - Backward compatibility with existing systems
 *
 * Design Decisions:
 * - Uses JSON storage for flexibility with unmapped data
 * - Maintains custom attributes for backward compatibility
 * - Implements hybrid approach for optimal performance
 * - Preserves all original data to prevent data loss
 *
 * @module EnhancedJsonImportService
 * @created August 10, 2025
 * @updated August 13, 2025 - Refactored for improved error handling and performance
 */

// Enhanced JSON Import Service - Development status (requires production testing)

import { db } from '../db';
import { customers, customerAttributes, dataImports } from '../../shared/schema';
import { flexibleAIMapper } from './flexible-ai-mapper';
import { filePreviewService } from '../file-preview-service';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  ResponseFormatter,
  PerformanceMonitor
} from '../utils/service-utilities';
import {
  BatchProcessor,
  StatusUpdater,
  RecordValidator
} from '../utils/database-utilities';

export interface EnhancedColumnMapping {
  columnName: string;
  originalName: string;
  mappingType: 'core' | 'unmapped' | 'skip';
  targetField?: string; // For core fields like 'firstName', 'email'
  confidenceScore?: number; // AI mapping confidence
  dataType?: string; // Detected data type
  preserveInJson?: boolean; // Whether to store in unmappedFields JSON
}

export interface JsonImportPreview {
  importId: string;
  fileName: string;
  totalRows: number;
  headers: string[];
  sampleRows: any[];
  suggestedMappings: EnhancedColumnMapping[];
  unmappedFieldsPreview: Record<string, any>; // Preview of what will be stored as JSON
  mappingStrategy: 'hybrid' | 'json_primary' | 'attributes_primary';
}

export interface JsonImportOptions {
  storeUnmappedAsJson: boolean;
  preserveOriginalData: boolean;
  maintainCustomAttributes: boolean; // Backward compatibility
  jsonStorageStrategy: 'replace' | 'supplement'; // Replace custom attributes or supplement them
}

class EnhancedJsonImportService {

  /**
   * Create import preview with JSON storage analysis
   */
  async createJsonImportPreview(
    filePath: string,
    fileName: string,
    fileSize: number,
    options: JsonImportOptions = {
      storeUnmappedAsJson: true,
      preserveOriginalData: true,
      maintainCustomAttributes: false,
      jsonStorageStrategy: 'replace'
    }
  ): Promise<JsonImportPreview> {
    try {

      const importId = nanoid();

      // Extract file data
      const fileData = await filePreviewService.generatePreview(filePath, fileName, fileSize);

      if (!fileData.headers || fileData.headers.length === 0) {
        throw new Error('File contains no headers or is empty');
      }

      // Get AI analysis for column mapping
      const aiAnalysis = await flexibleAIMapper.analyzeFileColumns(
        fileData.headers,
        fileData.rows,
        100
      );

      // Categorize columns for JSON storage strategy
      const { mappings, unmappedPreview, strategy } = this.categorizeFieldsForJsonStorage(
        aiAnalysis,
        fileData.rows[0] || {},
        options
      );

      // Create data import record with JSON metadata
      await db.insert(dataImports).values({
        id: importId,
        fileName,
        fileSize,
        importType: this.getFileType(fileName),
        importSource: 'enhanced_json_import',
        importStatus: 'preview',
        importMetadata: {
          previewCreated: new Date().toISOString(),
          jsonStorageOptions: options,
          mappingStrategy: strategy,
          aiAnalysis: {
            overallConfidence: aiAnalysis.overallConfidence,
            suggestedDataSource: aiAnalysis.suggestedDataSource,
            flexibilityScore: aiAnalysis.flexibilityScore,
          },
        },
        fieldMappings: mappings,
      });


      return {
        importId,
        fileName,
        totalRows: fileData.metadata.totalRows,
        headers: fileData.headers,
        sampleRows: fileData.rows.slice(0, 5),
        suggestedMappings: mappings,
        unmappedFieldsPreview: unmappedPreview,
        mappingStrategy: strategy,
      };

    } catch (error) {
      secureLogger.error(`❌ Failed to create JSON import preview:`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Process import with enhanced JSON storage
   */
  async processJsonImport(
    importId: string,
    columnMappings: EnhancedColumnMapping[],
    options: JsonImportOptions
  ): Promise<{
    success: boolean;
    customersCreated: number;
    unmappedFieldsStored: number;
    attributesCreated: number;
    errors: any[];
  }> {
    try {

      // Get import record
      const importRecord = await db
        .select()
        .from(dataImports)
        .where(eq(dataImports.id, importId))
        .limit(1);

      if (importRecord.length === 0) {
        throw new Error('Import record not found');
      }

      const importData = importRecord[0];

      // Update status to processing
      await db
        .update(dataImports)
        .set({ importStatus: 'processing' })
        .where(eq(dataImports.id, importId));

      // Re-read the file for processing
      const fileData = await this.reprocessFile(importData.fileName);

      // Process each row with JSON storage
      const results = {
        customersCreated: 0,
        unmappedFieldsStored: 0,
        attributesCreated: 0,
        errors: [] as any[],
      };

      for (let i = 0; i < fileData.rows.length; i++) {
        try {
          const row = fileData.rows[i];
          const rowResults = await this.processRowWithJsonStorage(
            row,
            columnMappings,
            importId,
            i + 1,
            options
          );

          results.customersCreated++;
          results.unmappedFieldsStored += rowResults.unmappedFieldsCount;
          results.attributesCreated += rowResults.attributesCount;

        } catch (error) {
          secureLogger.error(`❌ Failed to process row ${i + 1}:`, { error: String(error) });

          // Enhanced error tracking with more details
          const errorDetail = {
            rowNumber: i + 1,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
            rowData: this.sanitizeRowForError(fileData.rows[i] || {}),
            timestamp: new Date().toISOString(),
            correlationId: importId,
            canRetry: this.isRetryableRowError(error)
          };

          results.errors.push(errorDetail);
        }
      }

      // Update final status
      await db
        .update(dataImports)
        .set({
          importStatus: 'completed',
          recordsProcessed: fileData.rows.length,
          recordsSuccessful: results.customersCreated,
          recordsFailed: results.errors.length,
          completedAt: new Date(),
        })
        .where(eq(dataImports.id, importId));


      return {
        success: true,
        ...results,
      };

    } catch (error) {
      secureLogger.error(`❌ JSON import processing failed:`, { error: String(error) });

      // Update status to failed
      await db
        .update(dataImports)
        .set({ importStatus: 'failed' })
        .where(eq(dataImports.id, importId));

      throw error;
    }
  }

  /**
   * Process a single row with JSON storage for unmapped fields
   */
  private async processRowWithJsonStorage(
    row: any,
    columnMappings: EnhancedColumnMapping[],
    importId: string,
    rowNumber: number,
    options: JsonImportOptions
  ): Promise<{
    customerId: string;
    unmappedFieldsCount: number;
    attributesCount: number;
  }> {
    // Separate core, unmapped, and skip mappings
    const coreMappings = columnMappings.filter(m => m.mappingType === 'core');
    const unmappedMappings = columnMappings.filter(m => m.mappingType === 'unmapped');
    const preservedMappings = columnMappings.filter(m => m.preserveInJson);

    // Build core customer data
    const coreCustomerData: any = {
      importId,
      sourceRowNumber: rowNumber,
    };

    // Map core fields
    coreMappings.forEach(mapping => {
      if (mapping.targetField && row[mapping.columnName] !== undefined) {
        coreCustomerData[mapping.targetField] = row[mapping.columnName];
      }
    });

    // Build unmapped fields JSON object
    const unmappedFieldsData: Record<string, any> = {};
    const originalSourceData: Record<string, any> = {};
    const fieldMappingMetadata: any = {};

    // Store unmapped fields in JSON if enabled
    if (options.storeUnmappedAsJson) {
      unmappedMappings.forEach(mapping => {
        if (row[mapping.columnName] !== undefined) {
          unmappedFieldsData[mapping.originalName] = {
            value: row[mapping.columnName],
            dataType: mapping.dataType || 'text',
            confidence: mapping.confidenceScore || 0,
            source: 'ai_mapping'
          };
        }
      });

      // Store preserved fields (even if mapped to core)
      preservedMappings.forEach(mapping => {
        if (row[mapping.columnName] !== undefined) {
          unmappedFieldsData[mapping.originalName] = {
            value: row[mapping.columnName],
            dataType: mapping.dataType || 'text',
            confidence: mapping.confidenceScore || 0,
            source: 'preserved_mapping'
          };
        }
      });

      coreCustomerData.unmappedFields = Object.keys(unmappedFieldsData).length > 0 ? unmappedFieldsData : null;
    }

    // Store complete original data if enabled
    if (options.preserveOriginalData) {
      Object.keys(row).forEach(key => {
        if (!key.startsWith('_')) { // Skip internal fields
          originalSourceData[key] = row[key];
        }
      });
      coreCustomerData.originalSourceData = originalSourceData;
    }

    // Store field mapping metadata
    fieldMappingMetadata.mappings = columnMappings.map(m => ({
      originalName: m.originalName,
      mappingType: m.mappingType,
      targetField: m.targetField,
      confidence: m.confidenceScore,
      dataType: m.dataType
    }));
    fieldMappingMetadata.importTimestamp = new Date().toISOString();
    fieldMappingMetadata.processingOptions = options;

    coreCustomerData.fieldMappingMetadata = fieldMappingMetadata;

    // Create customer record
    const customerResults = await db.insert(customers).values(coreCustomerData).returning();
    const customerId = customerResults[0].id;

    // Create custom attributes if maintaining backward compatibility
    let attributesCount = 0;
    if (options.maintainCustomAttributes && unmappedMappings.length > 0) {
      const attributeData = unmappedMappings
        .filter(mapping => row[mapping.columnName] !== undefined)
        .map(mapping => ({
          customerId,
          attributeName: this.sanitizeAttributeName(mapping.columnName),
          attributeValue: this.serializeValue(row[mapping.columnName], mapping.dataType || 'text'),
          dataType: mapping.dataType || 'text',
          attributeCategory: 'demographics',
          sourceSystem: 'enhanced_json_import',
          importId,
          sourceRowNumber: rowNumber,
          isActive: true,
        }));

      if (attributeData.length > 0) {
        await db.insert(customerAttributes).values(attributeData);
        attributesCount = attributeData.length;
      }
    }

    return {
      customerId,
      unmappedFieldsCount: Object.keys(unmappedFieldsData).length,
      attributesCount,
    };
  }

  /**
   * Query helper for JSON unmapped fields
   */
  async queryUnmappedFields(
    customerId: string,
    fieldName?: string
  ): Promise<Record<string, any> | any> {
    const result = await db
      .select({
        unmappedFields: customers.unmappedFields
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (result.length === 0) return null;

    const unmappedData = result[0].unmappedFields as Record<string, any>;

    if (fieldName) {
      return unmappedData?.[fieldName] || null;
    }

    return unmappedData;
  }

  /**
   * Query helper for searching JSON fields across customers
   */
  async searchUnmappedFields(
    fieldName: string,
    value: any,
    operator: '=' | 'LIKE' | 'ILIKE' | '>' | '<' = '='
  ): Promise<any[]> {
    let query;

    switch (operator) {
      case 'LIKE':
        query = sql`${customers.unmappedFields}->>${fieldName} LIKE ${`%${value}%`}`;
        break;
      case 'ILIKE':
        query = sql`${customers.unmappedFields}->>${fieldName} ILIKE ${`%${value}%`}`;
        break;
      case '>':
        query = sql`(${customers.unmappedFields}->>${fieldName})::numeric > ${value}`;
        break;
      case '<':
        query = sql`(${customers.unmappedFields}->>${fieldName})::numeric < ${value}`;
        break;
      default:
        query = sql`${customers.unmappedFields}->>${fieldName} = ${value}`;
    }

    return await db
      .select()
      .from(customers)
      .where(query);
  }

  /**
   * Get mapping statistics for import analysis
   */
  async getImportMappingStats(importId: string): Promise<{
    totalCustomers: number;
    customersWithUnmappedFields: number;
    customersWithOriginalData: number;
    averageUnmappedFieldsPerCustomer: number;
    topUnmappedFields: Array<{ field: string; count: number }>;
  }> {
    // Get total customers for this import
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.importId, importId));

    const totalCustomers = totalResult[0]?.count || 0;

    // Get customers with unmapped fields
    const unmappedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(
        sql`${customers.importId} = ${importId} AND ${customers.unmappedFields} IS NOT NULL`
      );

    const customersWithUnmappedFields = unmappedResult[0]?.count || 0;

    // Get customers with original data
    const originalDataResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(
        sql`${customers.importId} = ${importId} AND ${customers.originalSourceData} IS NOT NULL`
      );

    const customersWithOriginalData = originalDataResult[0]?.count || 0;

    // Calculate average unmapped fields per customer (simplified)
    const averageUnmappedFieldsPerCustomer = customersWithUnmappedFields > 0
      ? Math.round((customersWithUnmappedFields / totalCustomers) * 100) / 100
      : 0;

    return {
      totalCustomers,
      customersWithUnmappedFields,
      customersWithOriginalData,
      averageUnmappedFieldsPerCustomer,
      topUnmappedFields: [], // Would require more complex JSON aggregation
    };
  }

  /**
   * Sanitize row data for error logging (remove sensitive information)
   */
  private sanitizeRowForError(row: Record<string, any>): Record<string, any> {
    const sanitized = { ...row };

    // Remove potentially sensitive fields
    const sensitiveFields = ['password', 'ssn', 'creditCard', 'token'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Limit object size
    const entries = Object.entries(sanitized).slice(0, 5);
    return Object.fromEntries(entries);
  }

  /**
   * Determine if a row processing error is retryable
   */
  private isRetryableRowError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const retryableErrors = [
      'ValidationError',
      'TypeError', // Often due to data format issues
      'RangeError' // Date parsing issues, etc.
    ];

    const nonRetryableErrors = [
      'SyntaxError', // Malformed data
      'ReferenceError' // Programming errors
    ];

    const errorName = error.constructor.name;

    if (nonRetryableErrors.includes(errorName)) return false;
    if (retryableErrors.includes(errorName)) return true;

    // Check error message for clues
    const retryableMessages = ['timeout', 'network', 'temporary', 'format'];
    return retryableMessages.some(msg =>
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * Categorize fields for JSON storage strategy
   */
  private categorizeFieldsForJsonStorage(
    aiAnalysis: any,
    sampleRow: Record<string, any>,
    options: JsonImportOptions
  ): {
    mappings: EnhancedColumnMapping[];
    unmappedPreview: Record<string, any>;
    strategy: 'hybrid' | 'json_primary' | 'attributes_primary';
  } {
    const mappings: EnhancedColumnMapping[] = [];
    const unmappedPreview: Record<string, any> = {};

    aiAnalysis.mappings.forEach((analysis: any) => {
      if (analysis.targetSystem === 'core' && analysis.suggestedField) {
        // Core field mapping
        mappings.push({
          columnName: analysis.columnName,
          originalName: analysis.originalName,
          mappingType: 'core',
          targetField: analysis.suggestedField,
          confidenceScore: analysis.confidence,
          dataType: analysis.dataType,
          preserveInJson: options.preserveOriginalData, // Preserve even mapped fields if requested
        });
      } else {
        // Unmapped field - store as JSON
        mappings.push({
          columnName: analysis.columnName,
          originalName: analysis.originalName,
          mappingType: 'unmapped',
          confidenceScore: analysis.confidence,
          dataType: analysis.dataType,
          preserveInJson: true,
        });

        // Preview what will be stored
        if (sampleRow[analysis.columnName] !== undefined) {
          unmappedPreview[analysis.originalName] = {
            value: sampleRow[analysis.columnName],
            dataType: analysis.dataType,
            confidence: analysis.confidence
          };
        }
      }
    });

    // Determine strategy
    const coreFieldsCount = mappings.filter(m => m.mappingType === 'core').length;
    const unmappedFieldsCount = mappings.filter(m => m.mappingType === 'unmapped').length;

    let strategy: 'hybrid' | 'json_primary' | 'attributes_primary';
    if (coreFieldsCount > 0 && unmappedFieldsCount > 0) {
      strategy = 'hybrid';
    } else if (unmappedFieldsCount > coreFieldsCount) {
      strategy = 'json_primary';
    } else {
      strategy = 'attributes_primary';
    }

    return { mappings, unmappedPreview, strategy };
  }

  /**
   * Helper methods
   */
  private async reprocessFile(fileName: string): Promise<any> {
    // This would re-read and process the file
    // Implementation would depend on file storage location
    // For now, return a placeholder
    throw new Error('File reprocessing not implemented - file storage integration needed');
  }

  private getFileType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'csv': return 'csv';
      case 'xlsx': case 'xls': return 'excel';
      case 'json': return 'json';
      case 'txt': return 'text';
      case 'docx': return 'docx';
      default: return 'unknown';
    }
  }

  private sanitizeAttributeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private serializeValue(value: any, dataType: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    switch (dataType) {
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'date':
        return new Date(value).toISOString();
      case 'array':
        return Array.isArray(value) ? value : String(value).split(',').map(v => v.trim());
      case 'object':
        return typeof value === 'object' ? value : JSON.parse(String(value));
      default:
        return String(value);
    }
  }
}

export const enhancedJsonImportService = new EnhancedJsonImportService();
