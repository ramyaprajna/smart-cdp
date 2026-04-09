/**
 * Enhanced Import Service with Unified JSON Storage
 *
 * This service handles the complete import flow with unified data storage:
 * 1. Upload a file (CSV, Excel, etc.)
 * 2. Preview columns and suggested mappings via AI analysis
 * 3. Manually map columns to existing fields OR store as JSON unmapped fields
 * 4. Process the import with core customer data and JSON-stored unmapped fields
 * 5. Maintains backward compatibility with custom attributes for gradual migration
 *
 * Updated: August 10, 2025 - Unified with enhanced JSON storage mechanism
 */

import { db } from '../db';
import { customers, customerAttributes, dataImports } from '../../shared/schema';
import { dynamicAttributeService } from './dynamic-attribute-service';
import { flexibleAIMapper } from './flexible-ai-mapper';
import { enhancedJsonImportService } from './enhanced-json-import-service';
import { filePreviewService } from '../file-preview-service';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  PerformanceMonitor,
  ResponseFormatter
} from '../utils/service-utilities';
import {
  RecordValidator,
  StatusUpdater,
  BatchProcessor
} from '../utils/database-utilities';

export interface ColumnMapping {
  columnName: string;
  originalName: string;
  mappingType: 'core' | 'unmapped' | 'custom' | 'skip'; // Added 'unmapped' for JSON storage
  targetField?: string; // For core fields like 'firstName', 'email'
  confidenceScore?: number; // AI mapping confidence (0-100)
  dataType?: string; // Detected data type for JSON storage
  preserveInJson?: boolean; // Store in unmappedFields JSON even if mapped to core
  customAttribute?: {
    attributeName: string;
    dataType: 'text' | 'number' | 'date' | 'boolean' | 'array' | 'object';
    category: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical';
    description?: string;
  };
}

export interface ImportPreview {
  importId: string;
  fileName: string;
  totalRows: number;
  headers: string[];
  sampleRows: any[];
  suggestedMappings: ColumnMapping[];
  aiAnalysis?: any;
}

export interface ProcessImportRequest {
  importId: string;
  columnMappings: ColumnMapping[];
  sourceSystem?: string;
  importMetadata?: any;
  // Enhanced JSON storage options
  storageOptions?: {
    storeUnmappedAsJson?: boolean; // Default: true
    preserveOriginalData?: boolean; // Default: true
    maintainCustomAttributes?: boolean; // Backward compatibility, default: false
    jsonStorageStrategy?: 'replace' | 'supplement'; // Default: 'replace'
  };
}

class EnhancedImportService {

  /**
   * Step 1: Create import preview with suggested mappings
   */
  async createImportPreview(
    filePath: string,
    fileName: string,
    fileSize: number
  ): Promise<ImportPreview> {
    return await ServiceOperation.execute(
      'createImportPreview',
      async () => {

        // Generate unique import ID
        const importId = nanoid();

        // Extract and validate file data
        const fileData = await this.extractAndValidateFileData(filePath, fileName, fileSize);

        // Get AI analysis and convert to mappings
        const { aiAnalysis, suggestedMappings } = await this.generateAIMappings(fileData);

        // Create import record
        await this.createImportRecord(importId, fileName, fileSize, aiAnalysis, suggestedMappings);


        return {
          importId,
          fileName,
          totalRows: fileData.metadata.totalRows,
          headers: fileData.headers,
          sampleRows: fileData.rows.slice(0, 5),
          suggestedMappings,
          aiAnalysis,
        };
      }
    ).then(result => result.data!);
  }

  /**
   * Extract and validate file data
   */
  private async extractAndValidateFileData(filePath: string, fileName: string, fileSize: number) {
    const fileData = await filePreviewService.generatePreview(filePath, fileName, fileSize);

    if (!fileData.headers || fileData.headers.length === 0) {
      throw new Error('File contains no headers or is empty');
    }

    return fileData;
  }

  /**
   * Generate AI mappings from file data
   */
  private async generateAIMappings(fileData: any) {
    const aiAnalysis = await flexibleAIMapper.analyzeFileColumns(
      fileData.headers,
      fileData.rows,
      100
    );

    const suggestedMappings: ColumnMapping[] = aiAnalysis.mappings.map((analysis: any) =>
      this.convertAnalysisToMapping(analysis)
    );

    return { aiAnalysis, suggestedMappings };
  }

  /**
   * Convert AI analysis to column mapping
   */
  private convertAnalysisToMapping(analysis: any): ColumnMapping {
    if (analysis.targetSystem === 'core' && analysis.suggestedField) {
      return {
        columnName: analysis.columnName,
        originalName: analysis.originalName,
        mappingType: 'core',
        targetField: analysis.suggestedField,
        confidenceScore: analysis.confidence,
        dataType: analysis.dataType,
        preserveInJson: false
      };
    } else if (analysis.shouldExclude) {
      return {
        columnName: analysis.columnName,
        originalName: analysis.originalName,
        mappingType: 'skip',
        confidenceScore: analysis.confidence,
        dataType: analysis.dataType
      };
    } else {
      return {
        columnName: analysis.columnName,
        originalName: analysis.originalName,
        mappingType: 'unmapped',
        confidenceScore: analysis.confidence,
        dataType: analysis.dataType,
        preserveInJson: true,
        customAttribute: {
          attributeName: this.sanitizeAttributeName(analysis.columnName),
          dataType: this.mapDataType(analysis.dataType),
          category: (analysis.attributeCategory || 'demographics') as any,
          description: `Custom attribute from column: ${analysis.originalName}`,
        }
      };
    }
  }

  /**
   * Create import record in database
   */
  private async createImportRecord(
    importId: string,
    fileName: string,
    fileSize: number,
    aiAnalysis: any,
    suggestedMappings: ColumnMapping[]
  ) {
    await db.insert(dataImports).values({
      id: importId,
      fileName,
      fileSize,
      importType: this.getFileType(fileName),
      importSource: 'enhanced_manual_import',
      importStatus: 'preview',
      importMetadata: {
        previewCreated: new Date().toISOString(),
        aiAnalysis: {
          overallConfidence: aiAnalysis.overallConfidence,
          suggestedDataSource: aiAnalysis.suggestedDataSource,
          flexibilityScore: aiAnalysis.flexibilityScore,
        },
      },
      fieldMappings: suggestedMappings,
    });
  }

  /**
   * Step 2: Update column mappings based on user choices
   */
  async updateColumnMappings(
    importId: string,
    columnMappings: ColumnMapping[]
  ): Promise<void> {
    try {

      // Update the data import record with new mappings
      await db
        .update(dataImports)
        .set({
          fieldMappings: columnMappings,
          importMetadata: {
            lastUpdated: new Date().toISOString(),
            userModified: true,
          },
        })
        .where(eq(dataImports.id, importId));

    } catch (error) {
      secureLogger.error(`❌ Failed to update column mappings:`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Step 3: Process the import with custom attribute creation
   */
  async processImport(request: ProcessImportRequest): Promise<{
    success: boolean;
    customersCreated: number;
    customAttributesCreated: number;
    errors: any[];
    storageBreakdown?: {
      jsonStoredFields: number;
      customAttributes: number;
      coreFieldMappings: number;
    };
  }> {
    try {

      // Get import record
      const importRecord = await db
        .select()
        .from(dataImports)
        .where(eq(dataImports.id, request.importId))
        .limit(1);

      if (importRecord.length === 0) {
        throw new Error('Import record not found');
      }

      const importData = importRecord[0];

      // Update status to processing
      await db
        .update(dataImports)
        .set({ importStatus: 'processing' })
        .where(eq(dataImports.id, request.importId));

      // Re-read the file for processing
      const fileData = await this.reprocessFile(importData.fileName);

      // Process each row
      const results = {
        customersCreated: 0,
        customAttributesCreated: 0,
        errors: [] as any[],
      };

      // Process rows with enhanced JSON storage
      let totalUnmappedFields = 0;

      for (let i = 0; i < fileData.rows.length; i++) {
        try {
          const row = fileData.rows[i];
          const result = await this.processRow(
            row,
            request.columnMappings,
            request.importId,
            i + 1,
            request.storageOptions
          );
          results.customersCreated++;
          totalUnmappedFields += result.unmappedFieldsCount;
          results.customAttributesCreated += result.attributesCount;

        } catch (error) {
          secureLogger.error(`❌ Failed to process row ${i + 1}:`, { error: String(error) });
          results.errors.push({
            rowNumber: i + 1,
            error: error instanceof Error ? error.message : 'Unknown error',
            unmappedFields: 0,
            attributes: 0,
          });
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
        .where(eq(dataImports.id, request.importId));


      return {
        success: true,
        customersCreated: results.customersCreated,
        customAttributesCreated: results.customAttributesCreated,
        errors: results.errors,
        storageBreakdown: {
          jsonStoredFields: totalUnmappedFields,
          customAttributes: results.customAttributesCreated,
          coreFieldMappings: request.columnMappings.filter(m => m.mappingType === 'core').length
        }
      };

    } catch (error) {
      secureLogger.error(`❌ Import processing failed:`, { error: String(error) });

      // Update status to failed
      await db
        .update(dataImports)
        .set({ importStatus: 'failed' })
        .where(eq(dataImports.id, request.importId));

      throw error;
    }
  }

  /**
   * Process a single row with unified JSON storage and optional custom attributes
   */
  private async processRow(
    row: any,
    columnMappings: ColumnMapping[],
    importId: string,
    rowNumber: number,
    storageOptions: ProcessImportRequest['storageOptions'] = {}
  ): Promise<{
    customerId: string;
    unmappedFieldsCount: number;
    attributesCount: number;
  }> {
    // Default storage options
    const options = {
      storeUnmappedAsJson: true,
      preserveOriginalData: true,
      maintainCustomAttributes: false,
      jsonStorageStrategy: 'replace' as const,
      ...storageOptions
    };

    // Separate mappings by type
    const coreMappings = columnMappings.filter(m => m.mappingType === 'core');
    const unmappedMappings = columnMappings.filter(m => m.mappingType === 'unmapped');
    const customMappings = columnMappings.filter(m => m.mappingType === 'custom');
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

    // Build JSON data for unmapped fields
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
    secureLogger.error('🚨🚨🚨 ENHANCED IMPORT SERVICE INSERT:', coreCustomerData.email);
    const customerResults = await db.insert(customers).values(coreCustomerData).returning();
    const customerId = customerResults[0].id;

    // Create custom attributes if maintaining backward compatibility
    let attributesCount = 0;
    if (options.maintainCustomAttributes && customMappings.length > 0) {
      const attributeData = customMappings
        .filter(mapping => row[mapping.columnName] !== undefined)
        .map(mapping => ({
          customerId,
          attributeName: mapping.customAttribute!.attributeName,
          attributeValue: this.serializeValue(
            row[mapping.columnName],
            mapping.customAttribute!.dataType
          ),
          dataType: mapping.customAttribute!.dataType,
          attributeCategory: mapping.customAttribute!.category,
          sourceSystem: 'enhanced_manual_import',
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
   * Helper methods
   */
  private sanitizeAttributeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private getFileType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'csv': return 'csv';
      case 'xlsx': case 'xls': return 'excel';
      case 'json': return 'json';
      default: return 'unknown';
    }
  }

  /**
   * Map AI detected data types to custom attribute data types
   */
  private mapDataType(aiDataType: string): 'text' | 'number' | 'date' | 'boolean' | 'array' | 'object' {
    switch (aiDataType) {
      case 'email':
      case 'phone':
      case 'uuid':
      case 'text':
        return 'text';
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'boolean':
        return 'boolean';
      case 'json':
        return 'object';
      default:
        return 'text';
    }
  }

  private serializeValue(value: any, dataType: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    switch (dataType) {
      case 'number':
        const num = parseFloat(String(value));
        return isNaN(num) ? null : num;

      case 'boolean':
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase();
        return ['true', '1', 'yes', 'y'].includes(str);

      case 'array':
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value.split(',').map(v => v.trim());
          }
        }
        return [value];

      case 'object':
        if (typeof value === 'object' && value !== null) return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return { raw: value };
          }
        }
        return { value };

      case 'date':
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();

      default: // 'text'
        return String(value);
    }
  }

  private async reprocessFile(fileName: string): Promise<any> {
    // Check if the file exists in temp directory first
    const tempPath = `temp/${fileName}`;
    const uploadsPath = `uploads/${fileName}`;

    let filePath: string;
    if (fs.existsSync(tempPath)) {
      filePath = tempPath;
    } else if (fs.existsSync(uploadsPath)) {
      filePath = uploadsPath;
    } else {
      throw new Error(`File not found: ${fileName}`);
    }


    // Get file size
    const stats = fs.statSync(filePath);

    // Use the file preview service to read the file
    const fileData = await filePreviewService.generatePreview(
      filePath,
      fileName,
      stats.size
    );

    return {
      rows: fileData.rows || [],
      headers: fileData.headers || [],
    };
  }
}

export const enhancedImportService = new EnhancedImportService();
