/**
 * Unified File Processor
 *
 * Replaces the deleted simple-file-processor.ts by composing:
 *   - file-processors/ factory   → file parsing (CSV, Excel, TXT, DOCX)
 *   - utils/schema-mapper         → AI-enhanced field mapping
 *   - data-lineage-service        → batch import with lineage tracking
 *   - duplicate-detection-service → dedup before insert
 *
 * This module is the single entry point for the POST /upload route.
 *
 * @module UnifiedFileProcessor
 */

import { detectFileType, createFileProcessor } from './file-processors';
import { dataLineageService } from './data-lineage-service';
import { schemaMapper, type SchemaValidationResult } from './utils/schema-mapper';
import { applicationLogger } from './services/application-logger';
import { secureLogger } from './utils/secure-logger';

export interface FileUploadResult {
  success: boolean;
  message: string;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsDuplicates?: number;
  recordsFailed: number;
  importId?: string;
  errors: string[];
  schemaValidation?: SchemaValidationResult;
  mappingFeedback?: {
    summary: string;
    details: string[];
    excludedFieldsSummary?: string;
  };
  duplicateAnalysis?: {
    summary: {
      fileDuplicatesCount: number;
      customerDuplicatesCount: number;
      totalIncomingRecords: number;
      uniqueNewRecords: number;
      duplicateRecordsCount: number;
    };
    recommendations: {
      action: 'proceed' | 'review_required' | 'abort';
      reason: string;
      options: string[];
    };
    hasFileDuplicates: boolean;
    hasCustomerDuplicates: boolean;
  };
}

class UnifiedFileProcessor {
  /**
   * Parse and import a file end-to-end.
   *
   * 1. Detect format & parse rows via file-processors/ factory
   * 2. AI-enhanced schema mapping via schema-mapper
   * 3. Duplicate detection (optional)
   * 4. Batch import via data-lineage-service
   */
  async processFile(
    filePath: string,
    fileName: string,
    testMode = false,
    duplicateOptions?: any,
    progressSessionId?: string
  ): Promise<FileUploadResult> {
    try {
      applicationLogger
        .info('import', `🔄 [Unified Processor] Starting processing: ${fileName}`)
        .catch(() => {});

      // ── Step 1: Parse file using factory ──────────────────────────
      const fileType = detectFileType(fileName);
      const processor = createFileProcessor(fileType, Infinity); // read ALL rows
      const parsed = await processor.processFile(filePath);
      const records = parsed.rows;

      applicationLogger
        .info('import', `📄 [Unified Processor] Parsed ${records.length} rows from ${fileType} file`)
        .catch(() => {});

      // Update progress with total records
      if (progressSessionId) {
        await this.updateProgress(progressSessionId, {
          totalRecords: records.length,
          status: 'processing' as const,
          currentOperation: `Processing ${records.length} records...`,
        });
      }

      // ── Step 2: AI-enhanced schema mapping ────────────────────────
      const sourceFields = records.length > 0
        ? Object.keys(records[0]).filter((k) => !k.startsWith('_'))
        : [];
      const sampleData = records.slice(0, 50);

      const schemaValidation = await schemaMapper.validateAndMapFieldsWithAI(sourceFields, sampleData);
      const mappingFeedback = schemaMapper.generateMappingFeedback(schemaValidation);

      if (schemaValidation.aiMappingUsed) {
        applicationLogger
          .info('import', `🤖 [Unified Processor] AI mapping used (confidence: ${schemaValidation.aiConfidence})`)
          .catch(() => {});
      }
      if (schemaValidation.excludedFields.length > 0) {
        applicationLogger
          .info('import', `⚠️ Excluded fields: ${schemaValidation.excludedFields.map((e) => e.field).join(', ')}`)
          .catch(() => {});
      }

      // Transform records
      const customers = records.map((record) =>
        schemaMapper.transformRecord(record, schemaValidation.validMappings)
      );
      schemaMapper.logAddressWarningSummary();

      // ── Step 3: Duplicate detection ───────────────────────────────
      if (progressSessionId) {
        await this.updateProgress(progressSessionId, {
          currentOperation: 'Analyzing for duplicates...',
        });
      }

      let duplicateAnalysis: any = null;
      let customersToImport = customers;

      if (!testMode && filePath) {
        try {
          const { duplicateDetectionService } = await import('./services/duplicate-detection-service');
          duplicateAnalysis = await duplicateDetectionService.analyzeImportForDuplicates(
            filePath,
            fileName,
            customers
          );

          applicationLogger
            .info('import', `📊 [Duplicate Detection] Analysis complete`, {
              fileDuplicates: duplicateAnalysis.summary.fileDuplicatesCount,
              customerDuplicates: duplicateAnalysis.summary.customerDuplicatesCount,
              uniqueRecords: duplicateAnalysis.summary.uniqueNewRecords,
            })
            .catch(() => {});
        } catch (dupError) {
          applicationLogger
            .warn('import', `⚠️ Duplicate detection failed, proceeding without it`, {})
            .catch(() => {});
        }
      }

      // ── Test mode: return analysis only ───────────────────────────
      if (testMode) {
        const validRecords = customers.filter(
          (c) => c.firstName || c.lastName || c.email
        );
        const errors: string[] = [];
        customers.forEach((c, i) => {
          if (!c.firstName && !c.lastName && !c.email) {
            errors.push(`Row ${i + 1}: Missing required fields (name or email)`);
          }
        });

        return {
          success: true,
          message: `${mappingFeedback.summary}. Test completed – ${validRecords.length} valid records found (no data saved)`,
          recordsProcessed: records.length,
          recordsSuccessful: validRecords.length,
          recordsFailed: records.length - validRecords.length,
          errors: errors.slice(0, 10),
          schemaValidation,
          mappingFeedback,
        };
      }

      // ── Step 4: Production import ─────────────────────────────────
      const importId = await dataLineageService.startImport({
        fileName,
        importType: fileType as 'json' | 'excel' | 'csv' | 'api',
        importSource: 'file_upload',
        importedBy: 'system',
        metadata: {
          recordCount: records.length,
          schemaValidation: {
            validMappings: schemaValidation.validMappings.length,
            excludedFields: schemaValidation.excludedFields.length,
            warnings: schemaValidation.warnings.length,
            aiMappingUsed: schemaValidation.aiMappingUsed,
            aiConfidence: schemaValidation.aiConfidence,
          },
          mappingFeedback: mappingFeedback.summary,
          aiMappingNotes: schemaValidation.mappingNotes,
        },
      });

      // Handle duplicates based on user options
      let duplicateHandlingResult: any = null;

      if (
        duplicateOptions &&
        duplicateAnalysis &&
        duplicateAnalysis.summary.customerDuplicatesCount > 0
      ) {
        try {
          if (!duplicateOptions.duplicatesPreHandled) {
            const { duplicateDetectionService } = await import('./services/duplicate-detection-service');
            duplicateHandlingResult = await duplicateDetectionService.handleDuplicates(
              importId,
              duplicateAnalysis,
              duplicateOptions
            );

            await dataLineageService.updateDuplicateHandlingStats(importId, {
              recordsDuplicates: duplicateAnalysis.summary.customerDuplicatesCount,
              recordsSkipped: duplicateHandlingResult.recordsSkipped,
              recordsUpdated: duplicateHandlingResult.recordsUpdated,
              duplicateHandlingStrategy: duplicateOptions.customerAction,
            });
          }

          // Exclude already-handled duplicates from the main import batch
          const duplicateEmails = new Set(
            duplicateAnalysis.duplicateCustomers
              .map((d: any) => d.customer.email?.toLowerCase())
              .filter(Boolean)
          );
          const duplicatePhones = new Set(
            duplicateAnalysis.duplicateCustomers
              .map((d: any) => d.customer.phoneNumber)
              .filter(Boolean)
          );

          customersToImport = customers.filter((c) => {
            const isDupEmail = c.email && duplicateEmails.has(c.email.toLowerCase());
            const isDupPhone = c.phoneNumber && duplicatePhones.has(c.phoneNumber);
            return !isDupEmail && !isDupPhone;
          });
        } catch (handleErr) {
          applicationLogger
            .error('import', `❌ Duplicate handling failed`, handleErr instanceof Error ? handleErr : new Error(String(handleErr)))
            .catch(() => {});
        }
      }

      // Update progress before import
      if (progressSessionId) {
        await this.updateProgress(progressSessionId, {
          currentOperation: `Importing ${customersToImport.length} customers...`,
        });
      }

      const result = await dataLineageService.importCustomers(importId, customersToImport);

      // Update progress with final results
      if (progressSessionId) {
        await this.updateProgress(progressSessionId, {
          processedRecords: result.recordsProcessed,
          successfulRecords: result.recordsSuccessful,
          failedRecords: result.recordsFailed,
          duplicatesHandled: duplicateAnalysis?.summary?.customerDuplicatesCount || 0,
          status: 'completed' as const,
          currentOperation: 'Import completed successfully',
        });
      }

      const totalDuplicates = duplicateAnalysis?.summary?.customerDuplicatesCount || 0;

      return {
        success: true,
        message: `${mappingFeedback.summary}. Successfully imported ${result.recordsSuccessful} of ${records.length} records`,
        recordsProcessed: result.recordsProcessed,
        recordsSuccessful: result.recordsSuccessful,
        recordsDuplicates: totalDuplicates,
        recordsFailed: result.recordsFailed,
        importId,
        errors: result.errors || [],
        schemaValidation,
        mappingFeedback,
        duplicateAnalysis: duplicateAnalysis
          ? {
              summary: duplicateAnalysis.summary,
              recommendations: duplicateAnalysis.recommendations,
              hasFileDuplicates: duplicateAnalysis.summary.fileDuplicatesCount > 0,
              hasCustomerDuplicates: duplicateAnalysis.summary.customerDuplicatesCount > 0,
            }
          : undefined,
      };
    } catch (error) {
      applicationLogger
        .error('import', '🚨 [Unified Processor] Critical error', error instanceof Error ? error : new Error(String(error)))
        .catch(() => {});

      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';

      return {
        success: false,
        message: `Import failed: ${errorMessage}`,
        recordsProcessed: 0,
        recordsSuccessful: 0,
        recordsFailed: 0,
        errors: [errorMessage],
      };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private async updateProgress(
    sessionId: string,
    patch: Record<string, any>
  ): Promise<void> {
    try {
      const progressModule = await import('./routes/import-progress-routes');
      const current = progressModule.progressTracker.get(sessionId);
      if (current) {
        Object.assign(current, patch, { lastUpdateTime: new Date() });
        progressModule.progressTracker.set(sessionId, current);
      }
    } catch {
      // Non-critical — progress tracking failure should not block import
    }
  }
}

export const unifiedFileProcessor = new UnifiedFileProcessor();
