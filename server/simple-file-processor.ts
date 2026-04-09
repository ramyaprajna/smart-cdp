/**
 * Simple File Processor
 * Handles multi-format file imports (Excel, CSV, TXT, JSON)
 *
 * @updated August 15, 2025 - Fixed field mapping for Excel headers with spaces/asterisks
 * @note All field names are mapped to camelCase database fields
 */

import XLSX from 'xlsx';
import { createReadStream } from 'node:fs';
import { dataLineageService } from './data-lineage-service';
import { schemaMapper, SchemaValidationResult } from './utils/schema-mapper';
import { SecuritySanitizer } from './utils/security-sanitizer';
import { applicationLogger } from './services/application-logger';

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
  // Enhanced: Duplicate analysis data for client-side handling
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

export class SimpleFileProcessor {
  async processFile(filePath: string, fileName: string, testMode = false, duplicateOptions?: any, progressSessionId?: string): Promise<FileUploadResult> {
    try {
      applicationLogger.info('import', `🔄 [File Processor] Starting processing: ${fileName}`).catch(() => {});

      const fileType = this.getFileType(fileName);
      let records: any[] = [];

      switch (fileType) {
        case 'excel':
          records = await this.processExcelFile(filePath);
          break;
        case 'csv':
          records = await this.processCsvFile(filePath);
          break;
        case 'txt':
          records = await this.processTxtFile(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Update progress with total records count
      if (progressSessionId) {
        try {
          const progressModule = await import('./routes/import-progress-routes');
          const currentProgress = progressModule.progressTracker.get(progressSessionId);
          if (currentProgress) {
            currentProgress.totalRecords = records.length;
            currentProgress.status = 'processing';
            currentProgress.currentOperation = `Processing ${records.length} records...`;
            currentProgress.lastUpdateTime = new Date();
            progressModule.progressTracker.set(progressSessionId, currentProgress);
          }
        } catch (error) {
          applicationLogger.error('import', '⚠️ [Progress] Failed to update progress:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
        }
      }

      // Process records in batches - pass file path for duplicate detection
      const result = await this.processBatch(records, fileName, testMode, filePath, duplicateOptions, progressSessionId);
      return result;

    } catch (error) {
      applicationLogger.error('import', '🚨 [File Processor] Critical error during file processing:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';

      return {
        success: false,
        message: `Import failed: ${errorMessage}`,
        recordsProcessed: 0,
        recordsSuccessful: 0,
        recordsFailed: 0,
        errors: [
          errorMessage,
          ...(process.env.NODE_ENV === 'development' && error instanceof Error ? [error.stack || ''] : [])
        ]
      };
    }
  }

  private async processExcelFile(filePath: string): Promise<any[]> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false
      }) as any[][];

      if (rawData.length === 0) {
        throw new Error('Excel file is empty');
      }

      const headers = rawData[0] as string[];
      const dataRows = rawData.slice(1);

      return dataRows.map((row, index) => {
        const record: any = { _sourceRowNumber: index + 2 };
        headers.forEach((header, colIndex) => {
          const cleanHeader = this.cleanFieldName(header);
          record[cleanHeader] = row[colIndex] || '';
        });
        return record;
      });
    } catch (error) {
      throw new Error(`Excel processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processCsvFile(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const records: any[] = [];
      let headers: string[] = [];
      let isFirstLine = true;
      let rowNumber = 0;

      const stream = createReadStream(filePath, { encoding: 'utf8' });
      let buffer = '';

      stream.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            rowNumber++;
            const values = this.parseCsvLine(line);

            if (isFirstLine) {
              headers = values.map(h => this.cleanFieldName(h));
              isFirstLine = false;
            } else {
              const record: any = { _sourceRowNumber: rowNumber };
              headers.forEach((header, index) => {
                record[header] = values[index] || '';
              });
              records.push(record);
            }
          }
        }
      });

      stream.on('end', () => {
        if (buffer.trim()) {
          rowNumber++;
          const values = this.parseCsvLine(buffer);
          if (!isFirstLine) {
            const record: any = { _sourceRowNumber: rowNumber };
            headers.forEach((header, index) => {
              record[header] = values[index] || '';
            });
            records.push(record);
          }
        }
        resolve(records);
      });

      stream.on('error', reject);
    });
  }

  private async processTxtFile(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let content = '';
      const stream = createReadStream(filePath, { encoding: 'utf8' });

      stream.on('data', (chunk: string) => {
        content += chunk;
      });

      stream.on('end', () => {
        const lines = content.split('\n').filter(line => line.trim());

        // Try to detect format
        if (lines[0]?.includes(',')) {
          // CSV-like format
          const headers = lines[0].split(',').map(h => this.cleanFieldName(h.trim()));
          const dataLines = lines.slice(1);

          const records = dataLines.map((line, index) => {
            const values = line.split(',').map(v => v.trim());
            const record: any = { _sourceRowNumber: index + 2 };

            headers.forEach((header, colIndex) => {
              record[header] = values[colIndex] || '';
            });

            return record;
          });

          resolve(records);
        } else {
          // Plain text - each line is a record
          const records = lines.map((line, index) => ({
            text: line.trim(),
            _sourceRowNumber: index + 1
          }));

          resolve(records);
        }
      });

      stream.on('error', reject);
    });
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private async processBatch(records: any[], fileName: string, testMode = false, filePath?: string, duplicateOptions?: any, progressSessionId?: string): Promise<FileUploadResult> {

    applicationLogger.info('import', '🚨 [DEBUG] PROCESSBATCH ENTRY', {
      fileName,
      testMode,
      hasFilePath: !!filePath,
      hasDuplicateOptions: !!duplicateOptions,
      duplicateOptionsType: typeof duplicateOptions,
      progressSessionId,
      recordCount: records.length
    }).catch(() => {});

    try {
      // Analyze schema with AI-enhanced mapping (automatic fallback to AI when rule-based fails)
      const sourceFields = records.length > 0 ? Object.keys(records[0]).filter(key => !key.startsWith('_')) : [];
      const sampleData = records.slice(0, 50); // Use first 50 records for AI analysis

      // Optimized logging for large files
      const isLargeFile = records.length > 1000;
      if (!isLargeFile) {
      } else {
      }
      const schemaValidation = await schemaMapper.validateAndMapFieldsWithAI(sourceFields, sampleData);
      const mappingFeedback = schemaMapper.generateMappingFeedback(schemaValidation);

      // Enhanced logging with AI mapping information
      if (schemaValidation.aiMappingUsed) {
        if (schemaValidation.mappingNotes) {
          applicationLogger.info('import', `Mapping notes: ${schemaValidation.mappingNotes.join('; ')}`).catch(() => {});
        }
      }
      if (schemaValidation.excludedFields.length > 0) {
        applicationLogger.info('import', `⚠️ Excluded fields: ${schemaValidation.excludedFields.map(e => e.field).join(', ')}`).catch(() => {});
      }

      // Transform records using validated schema mappings
      const customers = records.map(record => schemaMapper.transformRecord(record, schemaValidation.validMappings));

      // Log aggregated address parsing warnings for performance
      schemaMapper.logAddressWarningSummary();

      // Update progress after schema analysis
      if (progressSessionId) {
        try {
          const progressModule = await import('./routes/import-progress-routes');
          const currentProgress = progressModule.progressTracker.get(progressSessionId);
          if (currentProgress) {
            currentProgress.currentOperation = 'Analyzing for duplicates...';
            currentProgress.lastUpdateTime = new Date();
            progressModule.progressTracker.set(progressSessionId, currentProgress);
          }
        } catch (error) {
          applicationLogger.error('import', '⚠️ [Progress] Failed to update progress:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
        }
      }

      // Enhanced Duplicate Detection - only for production mode with file path
      let duplicateAnalysis = null;
      let customersToImport = customers; // Default: import all customers

      applicationLogger.info('import', `🔍 [Duplicate Detection] Starting duplicate detection process...`).catch(() => {});

      if (!testMode && filePath) {
        try {
          applicationLogger.info('import', `🔍 [Duplicate Detection] Sample customer data:`, {
            firstCustomer: customers[0] ? {
              email: customers[0].email,
              firstName: customers[0].firstName,
              lastName: customers[0].lastName,
              phoneNumber: customers[0].phoneNumber
            } : 'No customers found',
            totalCustomers: customers.length
          });

          const { duplicateDetectionService } = await import('./services/duplicate-detection-service');

          duplicateAnalysis = await duplicateDetectionService.analyzeImportForDuplicates(
            filePath,
            fileName,
            customers
          );


          applicationLogger.info('import', `📊 [Duplicate Detection] Analysis complete:`, {
            fileDuplicates: duplicateAnalysis.summary.fileDuplicatesCount,
            customerDuplicates: duplicateAnalysis.summary.customerDuplicatesCount,
            uniqueRecords: duplicateAnalysis.summary.uniqueNewRecords
          });

          // Log duplicate detection results
          if (duplicateAnalysis.summary.fileDuplicatesCount > 0) {
          }
          if (duplicateAnalysis.summary.customerDuplicatesCount > 0) {
          }

          // Store duplicate analysis for later processing after importId is available

        } catch (duplicateError) {
          applicationLogger.error('import', `Duplicate Detection analysis failed`, duplicateError instanceof Error ? duplicateError : new Error(String(duplicateError)), {
            filePath,
            fileName,
            customerCount: customers.length
          }).catch(() => {});
          applicationLogger.warn('import', `⚠️ [Duplicate Detection] Proceeding with import without duplicate detection`, {}).catch(() => {});
          // Continue with import even if duplicate detection fails
        }
      } else {
      }

      if (testMode) {
        // Test mode: analyze data without saving to database
        const validRecords = customers.filter(customer =>
          customer.firstName || customer.lastName || customer.email
        );

        const errors: string[] = [];
        customers.forEach((customer, index) => {
          if (!customer.firstName && !customer.lastName && !customer.email) {
            errors.push(`Row ${index + 1}: Missing required fields (name or email)`);
          }
        });

        return {
          success: true,
          message: `${mappingFeedback.summary}. Test completed - ${validRecords.length} valid records found (no data saved)`,
          recordsProcessed: records.length,
          recordsSuccessful: validRecords.length,
          recordsFailed: records.length - validRecords.length,
          errors: errors.slice(0, 10), // Limit errors shown
          schemaValidation,
          mappingFeedback
        };
      }

      // Production mode: save to database with data lineage
      const importId = await dataLineageService.startImport({
        fileName,
        importType: 'excel',
        importSource: 'file_upload',
        importedBy: 'system',
        metadata: {
          recordCount: records.length,
          schemaValidation: {
            validMappings: schemaValidation.validMappings.length,
            excludedFields: schemaValidation.excludedFields.length,
            warnings: schemaValidation.warnings.length,
            aiMappingUsed: schemaValidation.aiMappingUsed,
            aiConfidence: schemaValidation.aiConfidence
          },
          mappingFeedback: mappingFeedback.summary,
          aiMappingNotes: schemaValidation.mappingNotes
        }
      });

      // CRITICAL FIX: Handle duplicates based on user options after importId is available

      // Track duplicate handling results for final reporting
      let duplicateHandlingResult: any = null;

      if (!testMode && duplicateOptions && duplicateAnalysis && duplicateAnalysis.summary.customerDuplicatesCount > 0) {
        applicationLogger.info('import', `🔧 [Duplicate Handling] Duplicate customers found:`, duplicateAnalysis.duplicateCustomers.map(dup => ({
          email: dup.customer.email,
          firstName: dup.customer.firstName,
          lastName: dup.customer.lastName,
          matchCount: dup.existingMatches.length
        })));

        try {
          if (duplicateOptions.duplicatesPreHandled) {
            applicationLogger.info('import', `✅ [Duplicate Handling] Duplicates already resolved via handle API, skipping strategy execution`);
          } else {
            const { duplicateDetectionService } = await import('./services/duplicate-detection-service');
            duplicateHandlingResult = await duplicateDetectionService.handleDuplicates(
              importId,
              duplicateAnalysis,
              duplicateOptions
            );

            applicationLogger.info('import', `✅ [Duplicate Handling] Complete:`, {
              recordsProcessed: duplicateHandlingResult.recordsProcessed,
              recordsSkipped: duplicateHandlingResult.recordsSkipped,
              recordsUpdated: duplicateHandlingResult.recordsUpdated,
              recordsSuccessful: duplicateHandlingResult.recordsSuccessful
            });

            await dataLineageService.updateDuplicateHandlingStats(importId, {
              recordsDuplicates: duplicateAnalysis.summary.customerDuplicatesCount,
              recordsSkipped: duplicateHandlingResult.recordsSkipped,
              recordsUpdated: duplicateHandlingResult.recordsUpdated,
              duplicateHandlingStrategy: duplicateOptions.customerAction
            });
          }

          const duplicateEmails = new Set(
            duplicateAnalysis.duplicateCustomers.map(dup => dup.customer.email?.toLowerCase()).filter(Boolean)
          );
          const duplicatePhones = new Set(
            duplicateAnalysis.duplicateCustomers.map(dup => dup.customer.phoneNumber).filter(Boolean)
          );

          customersToImport = customers.filter(customer => {
            const isDuplicateEmail = customer.email && duplicateEmails.has(customer.email.toLowerCase());
            const isDuplicatePhone = customer.phoneNumber && duplicatePhones.has(customer.phoneNumber);
            return !isDuplicateEmail && !isDuplicatePhone;
          });

        } catch (handlingError) {
          applicationLogger.error('import', `❌ [Duplicate Handling] Failed to handle duplicates:`, handlingError instanceof Error ? handlingError : new Error(String(handlingError))).catch(() => {});
        }
      }

      // Update progress before importing customers
      if (progressSessionId) {
        try {
          const progressModule = await import('./routes/import-progress-routes');
          const currentProgress = progressModule.progressTracker.get(progressSessionId);
          if (currentProgress) {
            currentProgress.currentOperation = `Importing ${customersToImport.length} customers...`;
            currentProgress.lastUpdateTime = new Date();
            progressModule.progressTracker.set(progressSessionId, currentProgress);
          }
        } catch (error) {
          applicationLogger.error('import', '⚠️ [Progress] Failed to update progress:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
        }
      }

      const result = await dataLineageService.importCustomers(importId, customersToImport);

      // Update progress with final results
      if (progressSessionId) {
        try {
          const progressModule = await import('./routes/import-progress-routes');
          const currentProgress = progressModule.progressTracker.get(progressSessionId);
          if (currentProgress) {
            currentProgress.processedRecords = result.recordsProcessed;
            currentProgress.successfulRecords = result.recordsSuccessful;
            currentProgress.failedRecords = result.recordsFailed;
            currentProgress.duplicatesHandled = duplicateAnalysis?.summary?.customerDuplicatesCount || 0;
            currentProgress.currentOperation = 'Import completed';
            currentProgress.lastUpdateTime = new Date();
            currentProgress.status = result.recordsSuccessful > 0 ? 'completed' : 'error';

            // Calculate processing speed
            const elapsedSeconds = (currentProgress.lastUpdateTime.getTime() - currentProgress.startTime.getTime()) / 1000;
            currentProgress.processingSpeed = elapsedSeconds > 0 ? result.recordsProcessed / elapsedSeconds : 0;

            progressModule.progressTracker.set(progressSessionId, currentProgress);
          }
        } catch (error) {
          applicationLogger.error('import', '⚠️ [Progress] Failed to update final progress:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
        }
      }

      // Calculate variables for final reporting
      const actualDuplicates = duplicateAnalysis ? duplicateAnalysis.summary.customerDuplicatesCount : 0;
      const duplicatesHandled = duplicateAnalysis ? duplicateAnalysis.summary.customerDuplicatesCount : 0;
      const totalOriginalRecords = records.length;

      // Calculate actual successful records including duplicates handled
      let actualRecordsSuccessful = result.recordsSuccessful;
      if (duplicateHandlingResult) {
        applicationLogger.info('import', `🔧 [Final Reporting] Duplicate handling result:`, {
          duplicateStrategy: duplicateOptions?.customerAction,
          duplicateRecordsSuccessful: duplicateHandlingResult.recordsSuccessful,
          normalImportSuccessful: result.recordsSuccessful
        });

        // For non-skip strategies, count the successfully handled duplicates
        if (duplicateOptions?.customerAction !== 'skip_duplicates') {
          // For overwrite and merge strategies, count updated records as successful
          const successfulDuplicates = duplicateOptions.customerAction === 'create_new'
            ? duplicateHandlingResult.recordsSuccessful
            : duplicateHandlingResult.recordsUpdated + duplicateHandlingResult.recordsSuccessful;

          actualRecordsSuccessful += successfulDuplicates;
        }
      }

      // Fix: When duplicates are handled, count total original records as processed
      const actualRecordsProcessed = duplicateOptions && duplicatesHandled > 0 ?
        totalOriginalRecords : result.recordsProcessed;

      // Enhanced success message with duplicate information
      let successMessage = `${mappingFeedback.summary}. Processed ${actualRecordsProcessed} records with ${actualRecordsSuccessful} successful imports`;
      if (actualDuplicates > 0 && duplicateOptions) {
        switch (duplicateOptions.customerAction) {
          case 'skip_duplicates':
            successMessage += `. ${actualDuplicates} duplicates skipped as requested`;
            break;
          case 'overwrite_existing':
            successMessage += `. ${duplicateHandlingResult?.recordsUpdated || 0} existing records updated`;
            break;
          case 'merge_data':
            successMessage += `. ${duplicateHandlingResult?.recordsUpdated || 0} records merged with existing data`;
            break;
          case 'create_new':
            successMessage += `. ${duplicateHandlingResult?.recordsSuccessful || 0} new records created despite duplicates`;
            break;
          default:
            successMessage += `. ${actualDuplicates} duplicates processed`;
        }
      } else if (actualDuplicates > 0) {
        successMessage += `. ${actualDuplicates} duplicates detected`;
      }
      if (duplicateAnalysis && duplicateAnalysis.summary.fileDuplicatesCount > 0) {
        successMessage += `. File previously imported ${duplicateAnalysis.summary.fileDuplicatesCount} times`;
      }

      const isSuccessfulOperation = actualRecordsSuccessful > 0 ||
        (duplicateOptions && duplicatesHandled > 0);

      return {
        success: isSuccessfulOperation,
        message: successMessage,
        recordsProcessed: actualRecordsProcessed,
        recordsSuccessful: actualRecordsSuccessful,
        recordsDuplicates: actualDuplicates, // Now properly populated from analysis
        importId: importId,
        recordsFailed: result.recordsFailed,
        errors: result.errors || [],
        schemaValidation,
        mappingFeedback,
        // Enhanced: Include duplicate analysis in response for client use
        duplicateAnalysis: duplicateAnalysis ? {
          summary: duplicateAnalysis.summary,
          recommendations: duplicateAnalysis.recommendations,
          hasFileDuplicates: duplicateAnalysis.summary.fileDuplicatesCount > 0,
          hasCustomerDuplicates: duplicateAnalysis.summary.customerDuplicatesCount > 0
        } : undefined
      };

    } catch (error) {
      applicationLogger.error('import', '🚨 [File Processor] Processing failed:', error instanceof Error ? error : new Error(String(error))).catch(() => {}).catch(() => {});
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      const errorDetails = error instanceof Error ? error.stack : String(error);

      return {
        success: false,
        message: `File processing failed: ${errorMessage}`,
        recordsProcessed: records.length || 0,
        recordsSuccessful: 0,
        recordsFailed: records.length || 0,
        errors: [
          errorMessage,
          ...(process.env.NODE_ENV === 'development' && errorDetails ? [errorDetails] : [])
        ]
      };
    }
  }

  private transformToCustomer(record: any): any {
    // Legacy method - kept for backward compatibility with enhanced security
    // New imports should use schemaMapper.transformRecord()
    const fieldMapping: Record<string, string> = {
      'first_name': 'firstName',
      'firstname': 'firstName',
      'last_name': 'lastName',
      'lastname': 'lastName',
      'email_address': 'email',
      'phone': 'phoneNumber',
      'phone_number': 'phoneNumber',
      'segment': 'customerSegment',
      'customer_segment': 'customerSegment',
      'lifetime_value': 'lifetimeValue',
      'ltv': 'lifetimeValue',
      'data_quality': 'dataQualityScore',
      'quality_score': 'dataQualityScore'
    };

    const customer: any = {};

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('_')) continue;

      // Skip 'id' fields since customer table generates its own UUIDs
      if (key.toLowerCase() === 'id') continue;

      // SECURITY FIX: Sanitize field names and values to prevent XSS and SQL injection
      const sanitizedKey = SecuritySanitizer.sanitizeFieldName(key);
      const standardKey = fieldMapping[sanitizedKey.toLowerCase()] || sanitizedKey;

      // Sanitize all string values to prevent XSS attacks
      if (typeof value === 'string') {
        customer[standardKey] = SecuritySanitizer.sanitizeXSS(value);
      } else {
        customer[standardKey] = value;
      }
    }

    // Ensure required fields and data types with additional validation
    if (customer.lifetimeValue) {
      customer.lifetimeValue = parseFloat(customer.lifetimeValue) || 0;
    }

    if (customer.dataQualityScore) {
      customer.dataQualityScore = Math.min(100, Math.max(0, parseFloat(customer.dataQualityScore) || 0));
    }

    // Final security validation
    return SecuritySanitizer.sanitizeCustomerRecord(customer);
  }

  private cleanFieldName(fieldName: string): string {
    if (!fieldName || typeof fieldName !== 'string') return 'unknown_field';

    // Define exact mapping from Excel headers to database fields
    const fieldMappings: Record<string, string> = {
      'first name': 'firstName',
      'first name *': 'firstName',
      'firstname': 'firstName',
      'fname': 'firstName',
      'given_name': 'firstName',
      'last name': 'lastName',
      'last name *': 'lastName',
      'lastname': 'lastName',
      'lname': 'lastName',
      'surname': 'lastName',
      'email': 'email',
      'email address': 'email',
      'email address *': 'email',
      'email_address': 'email',
      'e_mail': 'email',
      'phone': 'phoneNumber',
      'phone number': 'phoneNumber',
      'phonenumber': 'phoneNumber',
      'phone_number': 'phoneNumber',
      'date of birth': 'dateOfBirth',
      'dateofbirth': 'dateOfBirth',
      'date_of_birth': 'dateOfBirth',
      'dob': 'dateOfBirth',
      'gender': 'gender',
      'customer segment': 'customerSegment',
      'customersegment': 'customerSegment',
      'customer_segment': 'customerSegment',
      'segment': 'customerSegment',
      'lifetime value': 'lifetimeValue',
      'lifetimevalue': 'lifetimeValue',
      'lifetime_value': 'lifetimeValue',
      'ltv': 'lifetimeValue',
      'current address': 'currentAddress',
      'currentaddress': 'currentAddress',
      'current_address': 'currentAddress',
      'address': 'currentAddress'
    };

    // Clean and normalize the field name
    const normalized = fieldName
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special chars including *
      .replace(/\s+/g, ' '); // Normalize spaces

    // Check for direct field mapping first
    if (fieldMappings[normalized]) {
      return fieldMappings[normalized];
    }

    // Fallback: convert to camelCase for unmapped fields
    const words = normalized.split(' ');
    return words
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('')
      .substring(0, 50);
  }

  private getFileType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'csv':
        return 'csv';
      case 'txt':
        return 'txt';
      default:
        throw new Error(`Unsupported file extension: ${ext}`);
    }
  }
}

export const simpleFileProcessor = new SimpleFileProcessor();
