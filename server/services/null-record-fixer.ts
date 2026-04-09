/**
 * NULL Record Fixer Service
 *
 * Comprehensive service to diagnose, analyze, and fix NULL records in the database
 * using AI-powered mapping to retroactively correct failed imports.
 *
 * Features:
 * - Detect and analyze NULL record patterns
 * - Identify root causes of failed mappings
 * - AI-powered retroactive field mapping correction
 * - Batch processing for large datasets
 * - Comprehensive reporting and validation
 */

import { db } from '../db';
import { customers, dataImports, rawDataImports } from '@shared/schema';
import { eq, and, isNull, or } from 'drizzle-orm';
import { schemaMapper } from '../utils/schema-mapper';
import { aiColumnMapper, AIColumnMappingResult } from './ai-column-mapper';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  ResponseFormatter,
  PerformanceMonitor
} from '../utils/service-utilities';
import {
  NullRecordAnalyzer,
  RecordValidator,
  StatusUpdater
} from '../utils/database-utilities';

interface NullRecordAnalysis {
  importId: string;
  totalRecords: number;
  completelyNullRecords: number;
  partiallyNullRecords: number;
  nullFields: string[];
  rootCause: string;
  hasRawData: boolean;
  fixable: boolean;
  recommendations: string[];
}

interface FixResult {
  success: boolean;
  recordsProcessed: number;
  recordsFixed: number;
  recordsSkipped: number;
  errors: string[];
  aiMappingUsed: boolean;
  aiConfidence?: number;
  mappingDetails: {
    originalHeaders: string[];
    mappedFields: Array<{ from: string; to: string; confidence: number }>;
    excludedFields: string[];
  };
}

export class NullRecordFixerService {

  /**
   * Analyze NULL records and determine the root cause
   */
  async analyzeNullRecords(importId: string): Promise<NullRecordAnalysis> {
    return await ServiceOperation.execute(
      'analyzeNullRecords',
      async () => {

        // Use database utility for NULL analysis
        const analysis = await NullRecordAnalyzer.analyzeNullCustomers(importId);

        // Check for raw data availability
        const hasRawData = await this.checkRawDataAvailability(importId);

        // Determine root cause and fixability
        const { rootCause, fixable, recommendations } = this.determineRootCause(analysis, hasRawData);

        return {
          importId,
          ...analysis,
          rootCause,
          hasRawData,
          fixable,
          recommendations
        };
      }
    ).then(result => result.data!);
  }

  /**
   * Check if raw data is available for this import
   */
  private async checkRawDataAvailability(importId: string): Promise<boolean> {
    const rawDataExists = await RecordValidator.checkExists(
      rawDataImports,
      eq(rawDataImports.importSessionId, importId)
    );
    return rawDataExists.exists;
  }

  /**
   * Fix NULL records using AI mapping (when raw data is available)
   */
  async fixNullRecordsWithAI(importId: string): Promise<FixResult> {
    secureLogger.info(`🤖 Starting AI-powered NULL record fix for import: ${importId}`);

    const result: FixResult = {
      success: false,
      recordsProcessed: 0,
      recordsFixed: 0,
      recordsSkipped: 0,
      errors: [],
      aiMappingUsed: false,
      mappingDetails: {
        originalHeaders: [],
        mappedFields: [],
        excludedFields: []
      }
    };

    try {
      // Get raw data for this import
      const rawData = await db.select()
        .from(rawDataImports)
        .where(eq(rawDataImports.importSessionId, importId))
        .limit(100); // Process in batches

      if (rawData.length === 0) {
        result.errors.push('No raw data available for this import');
        return result;
      }

      // Extract headers from first raw record
      const firstRecord = JSON.parse(rawData[0].rawDataRow as string);
      const originalHeaders = Object.keys(firstRecord);
      result.mappingDetails.originalHeaders = originalHeaders;

      secureLogger.info(`📋 Found ${originalHeaders.length} original headers: ${originalHeaders.join(', ')}`);

      // Prepare sample data for AI analysis
      const sampleData = rawData.slice(0, 50).map(r => JSON.parse(r.rawDataRow as string));

      // Use AI-enhanced mapping to determine correct field mappings
      const mappingResult = await schemaMapper.validateAndMapFieldsWithAI(originalHeaders, sampleData);

      result.aiMappingUsed = mappingResult.aiMappingUsed || false;
      result.aiConfidence = mappingResult.aiConfidence;

      // Process mapping results
      result.mappingDetails.mappedFields = mappingResult.validMappings.map(m => ({
        from: m.sourceField,
        to: m.targetField,
        confidence: 100 // Rule-based or AI confidence
      }));

      result.mappingDetails.excludedFields = mappingResult.excludedFields.map(e => e.field);


      // Process all raw data with the new mappings
      const allRawData = await db.select()
        .from(rawDataImports)
        .where(eq(rawDataImports.importSessionId, importId));

      let processed = 0, fixed = 0, skipped = 0;

      for (const rawRecord of allRawData) {
        try {
          const originalData = JSON.parse(rawRecord.rawDataRow as string);

          // Transform using the new AI mappings
          const transformedData = schemaMapper.transformRecord(originalData, mappingResult.validMappings);

          // Check if transformation produced meaningful data
          const hasValidData = transformedData.firstName || transformedData.lastName ||
                              transformedData.email || transformedData.phoneNumber;

          if (hasValidData) {
            // Update the customer record
            await db.update(customers)
              .set({
                ...transformedData,
                updatedAt: new Date(),
                // Add metadata about the fix
                source: `ai_fixed_${importId}`
              })
              .where(and(
                eq(customers.importId, importId),
                eq(customers.sourceRowNumber, rawRecord.sourceRowNumber)
              ));

            fixed++;
          } else {
            skipped++;
          }

          processed++;

          // Log progress every 1000 records
          if (processed % 1000 === 0) {
          }

        } catch (error) {
          result.errors.push(`Row ${rawRecord.sourceRowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          skipped++;
        }
      }

      result.recordsProcessed = processed;
      result.recordsFixed = fixed;
      result.recordsSkipped = skipped;
      result.success = fixed > 0;


      return result;

    } catch (error) {
      result.errors.push(`AI fixing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Generate recommendations for fixing NULL records
   */
  async generateFixRecommendations(importId: string): Promise<{
    analysis: NullRecordAnalysis;
    quickFixes: string[];
    comprehensiveSolution: string;
    sqlQueries: string[];
  }> {
    const analysis = await this.analyzeNullRecords(importId);

    const quickFixes: string[] = [];
    const sqlQueries: string[] = [];

    if (analysis.completelyNullRecords > 0) {
      quickFixes.push('Delete completely NULL records to clean up database');
      sqlQueries.push(`DELETE FROM customers WHERE import_id = '${importId}' AND first_name IS NULL AND last_name IS NULL AND email IS NULL;`);
    }

    if (analysis.hasRawData) {
      quickFixes.push('Reprocess raw data with new AI mapping system');
      quickFixes.push('Apply retroactive field mapping corrections');
    } else {
      quickFixes.push('Re-import original Excel file with new AI mapping');
      quickFixes.push('Use enhanced header recognition for international formats');
    }

    const comprehensiveSolution = analysis.hasRawData
      ? 'Use AI-powered retroactive mapping to fix existing NULL records using preserved raw data'
      : 'Clean up NULL records and guide user to re-import with enhanced AI mapping system';

    return {
      analysis,
      quickFixes,
      comprehensiveSolution,
      sqlQueries
    };
  }

  /**
   * Clean up NULL records (remove them from database)
   */
  async cleanupNullRecords(importId: string): Promise<{
    success: boolean;
    deletedRecords: number;
    error?: string;
  }> {
    return await ServiceOperation.execute(
      'cleanupNullRecords',
      async () => {

        const deletedCount = await NullRecordAnalyzer.deleteNullRecords(importId);


        return { deletedRecords: deletedCount };
      }
    ).then(result => ({
      success: result.success,
      deletedRecords: result.data?.deletedRecords || 0,
      error: result.error
    }));
  }

  /**
   * Determine root cause and generate recommendations
   */
  private determineRootCause(
    analysis: { totalRecords: number; completelyNullRecords: number; nullFields: string[] },
    hasRawData: boolean
  ): { rootCause: string; fixable: boolean; recommendations: string[] } {
    const { totalRecords, completelyNullRecords, nullFields } = analysis;

    const recommendations: string[] = [];
    let rootCause = 'Unknown cause';
    let fixable = false;

    // Determine root cause based on patterns
    if (completelyNullRecords === totalRecords) {
      rootCause = 'Complete mapping failure - no customer data was successfully imported';
      fixable = hasRawData;

      if (hasRawData) {
        recommendations.push('Use AI-powered retroactive mapping to fix all records');
        recommendations.push('Apply enhanced column detection algorithms');
      } else {
        recommendations.push('Re-import file with improved AI mapping system');
        recommendations.push('Use enhanced header recognition for international formats');
      }
    } else if (completelyNullRecords > totalRecords * 0.5) {
      rootCause = 'Partial mapping failure - significant portion of records failed to map correctly';
      fixable = true;

      recommendations.push('Use selective AI remapping for failed records');
      recommendations.push('Analyze and fix column mapping patterns');

      if (hasRawData) {
        recommendations.push('Apply retroactive mapping corrections');
      }
    } else if (nullFields.length > 0) {
      rootCause = `Specific field mapping issues detected in: ${nullFields.join(', ')}`;
      fixable = true;

      recommendations.push('Apply targeted field mapping corrections');
      recommendations.push('Use field-specific AI mapping improvements');
    } else {
      rootCause = 'Minor data quality issues - most records imported successfully';
      fixable = true;

      recommendations.push('Clean up remaining NULL records');
      recommendations.push('Apply data quality validation rules');
    }

    return { rootCause, fixable, recommendations };
  }
}

export const nullRecordFixer = new NullRecordFixerService();
