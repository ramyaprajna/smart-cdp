/**
 * Enhanced Duplicate Detection Service
 *
 * Provides comprehensive duplicate detection for both file-level and customer-level duplicates
 * with detailed analysis, user confirmation workflows, and audit logging capabilities.
 *
 * Features:
 * - File-level duplicate detection using hash comparison
 * - Customer-level duplicate detection by email, phone, and name combinations
 * - Confidence scoring for match accuracy
 * - Detailed duplicate analysis reports
 * - Integration with existing import workflow
 * - Comprehensive audit logging
 *
 * Created: August 14, 2025
 * Integration: Works with existing data-lineage-service and import infrastructure
 */

import { db } from '../db';
import { dataImports, customers, applicationLogs } from '@shared/schema';
import { eq, and, or, ilike, isNotNull, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { secureLogger } from '../utils/secure-logger';

// Types for duplicate detection results
export interface DuplicateFile {
  importId: string;
  fileName: string;
  importedAt: Date | null;
  importedBy: string | null;
  recordsSuccessful: number | null;
  fileHash: string;
}

export interface DuplicateCustomer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  importId?: string | null;
  sourceFileName?: string;
  importedAt?: Date | null;
  matchReason: 'email' | 'phone' | 'name_combination' | 'multiple_fields';
  matchConfidence: number; // 0-1 scale
}

export interface DuplicateAnalysis {
  duplicateFiles: DuplicateFile[];
  duplicateCustomers: {
    customer: any; // Incoming customer record
    existingMatches: DuplicateCustomer[];
    rowNumber?: number;
  }[];
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
}

export interface DuplicateHandlingOptions {
  fileAction: 'skip' | 'overwrite' | 'append_suffix';
  customerAction: 'skip_duplicates' | 'overwrite_existing' | 'merge_data' | 'create_new';
  confirmationRequired: boolean;
}

export class DuplicateDetectionService {
  private db = db;
  private applicationLogs = applicationLogs;

  /**
   * Comprehensive pre-import duplicate analysis with timeout protection
   * Checks both file-level and customer-level duplicates before import
   */
  async analyzeImportForDuplicates(
    filePath: string,
    fileName: string,
    incomingCustomers: any[]
  ): Promise<DuplicateAnalysis> {
    secureLogger.info(`🔍 [Duplicate Analysis] Starting analysis for ${fileName}`);

    try {
      // Wrap entire analysis in timeout protection
      return await this.withTimeout(async () => {
        // Generate file hash for duplicate file detection
        // Skip file hash if file doesn't exist (use customer data instead)
        let fileHash = '';
        try {
          fileHash = await this.generateFileHash(filePath);
        } catch (error) {
          fileHash = this.generateContentHash(JSON.stringify(incomingCustomers));
        }

        // Check for file-level duplicates
        const duplicateFiles = await this.checkFileDuplicates(fileHash, fileName);

        // Check for customer-level duplicates with optimized batch processing
        const customerDuplicateAnalysis = await this.checkCustomerDuplicatesBatch(incomingCustomers);

        // Generate summary and recommendations
        const summary = this.generateSummary(duplicateFiles, customerDuplicateAnalysis, incomingCustomers.length);
        const recommendations = this.generateRecommendations(duplicateFiles, customerDuplicateAnalysis);

        const analysis: DuplicateAnalysis = {
          duplicateFiles,
          duplicateCustomers: customerDuplicateAnalysis,
          summary,
          recommendations
        };

        // Log duplicate detection event
        await this.logDuplicateDetectionEvent('duplicate_analysis', {
          fileName,
          fileHash,
          analysis: summary,
          recommendations
        });

        return analysis;
      }, 8000); // 8 second timeout
    } catch (error) {
      secureLogger.error(`❌ [Duplicate Analysis] Analysis failed:`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Check for file-level duplicates by comparing file hash
   */
  async checkFileDuplicates(fileHash: string, fileName: string): Promise<DuplicateFile[]> {
    try {
      const existingImports = await db
        .select({
          id: dataImports.id,
          fileName: dataImports.fileName,
          importedAt: dataImports.importedAt,
          importedBy: dataImports.importedBy,
          recordsSuccessful: dataImports.recordsSuccessful,
          importMetadata: dataImports.importMetadata
        })
        .from(dataImports)
        .where(
          and(
            eq(dataImports.importStatus, 'completed')
          )
        );

      // Filter imports with matching file hash
      const duplicateFiles = existingImports
        .filter(importRecord => {
          const metadata = importRecord.importMetadata as any;
          return metadata?.fileHash === fileHash;
        })
        .map(importRecord => ({
          importId: importRecord.id,
          fileName: importRecord.fileName,
          importedAt: importRecord.importedAt,
          importedBy: importRecord.importedBy,
          recordsSuccessful: importRecord.recordsSuccessful,
          fileHash
        }));

      return duplicateFiles;
    } catch (error) {
      secureLogger.error('[Duplicate Detection] Failed to check file duplicates:', { error: String(error) });
      // Return empty array as fallback to allow the import process to continue
      return [];
    }
  }

  /**
   * Check for customer-level duplicates using optimized batch processing
   * Enhanced to detect both database duplicates AND within-file duplicates
   */
  async checkCustomerDuplicatesBatch(incomingCustomers: any[]): Promise<{
    customer: any;
    existingMatches: DuplicateCustomer[];
    rowNumber?: number;
  }[]> {

    const duplicateAnalysis = [];
    const batchSize = 50; // Process in smaller batches

    // Extract all emails and phone numbers for batch queries
    const emails = incomingCustomers
      .map(c => c.email?.trim().toLowerCase())
      .filter(email => email && email.length > 0);

    const phoneNumbers = incomingCustomers
      .map(c => this.cleanPhoneNumber(c.phoneNumber))
      .filter(phone => phone && phone.length > 0);

    // Batch query all existing customers with matching emails
    const existingByEmail = emails.length > 0 ? await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phoneNumber: customers.phoneNumber,
        importId: customers.importId,
        createdAt: customers.createdAt
      })
      .from(customers)
      .where(
        and(
          inArray(customers.email, emails),
          isNotNull(customers.email)
        )
      ) : [];

    // Batch query all existing customers with matching phones
    const existingByPhone = phoneNumbers.length > 0 ? await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phoneNumber: customers.phoneNumber,
        importId: customers.importId,
        createdAt: customers.createdAt
      })
      .from(customers)
      .where(
        and(
          inArray(customers.phoneNumber, phoneNumbers),
          isNotNull(customers.phoneNumber)
        )
      ) : [];


    // ENHANCED: Check for within-file duplicates before checking database duplicates
    const withinFileDuplicates = this.findWithinFileDuplicates(incomingCustomers);

    // Process incoming customers in batches
    for (let i = 0; i < incomingCustomers.length; i += batchSize) {
      const batch = incomingCustomers.slice(i, i + batchSize);

      for (const customer of batch) {
        const rowNumber = customer._sourceRowNumber || (i + 1);

        // Check for database duplicates
        const existingMatches = this.findMatchesInBatchResults(
          customer,
          existingByEmail,
          existingByPhone
        );

        // Check for within-file duplicates
        const withinFileMatches = withinFileDuplicates.filter(dup =>
          dup.primaryIndex === incomingCustomers.indexOf(customer) ||
          dup.duplicateIndexes.includes(incomingCustomers.indexOf(customer))
        );

        // Combine all matches
        const allMatches = [...existingMatches];

        // Add within-file duplicates as "matches" for consistency
        withinFileMatches.forEach(withinFileMatch => {
          if (withinFileMatch.primaryIndex !== incomingCustomers.indexOf(customer)) {
            // This customer is a duplicate of another customer in the file
            const primaryCustomer = incomingCustomers[withinFileMatch.primaryIndex];
            allMatches.push({
              id: `within-file-${withinFileMatch.primaryIndex}`,
              firstName: primaryCustomer.firstName,
              lastName: primaryCustomer.lastName,
              email: primaryCustomer.email,
              phoneNumber: primaryCustomer.phoneNumber,
              importId: null,
              sourceFileName: 'current-file',
              importedAt: null,
              matchReason: withinFileMatch.reason,
              matchConfidence: 1.0 // Within-file duplicates are 100% confidence
            });
          }
        });

        if (allMatches.length > 0) {
          duplicateAnalysis.push({
            customer,
            existingMatches: allMatches,
            rowNumber
          });
        }
      }

      // Progress logging for large batches
      if (incomingCustomers.length > 100) {
        const progress = Math.round(((i + batchSize) / incomingCustomers.length) * 100);
        secureLogger.info(`📈 [Duplicate Analysis] Progress: ${Math.min(progress, 100)}%`);
      }
    }

    return duplicateAnalysis;
  }

  /**
   * Find duplicates within the incoming file itself
   * Detects records with same email or phone number within the import data
   */
  private findWithinFileDuplicates(incomingCustomers: any[]): {
    primaryIndex: number;
    duplicateIndexes: number[];
    reason: 'email' | 'phone' | 'multiple_fields';
    email?: string;
    phoneNumber?: string;
  }[] {
    const duplicateGroups: {
      primaryIndex: number;
      duplicateIndexes: number[];
      reason: 'email' | 'phone' | 'multiple_fields';
      email?: string;
      phoneNumber?: string;
    }[] = [];
    const emailMap = new Map<string, number[]>();
    const phoneMap = new Map<string, number[]>();

    // Build email and phone maps
    incomingCustomers.forEach((customer, index) => {
      const email = customer.email?.trim().toLowerCase();
      const phone = this.cleanPhoneNumber(customer.phoneNumber);

      if (email) {
        if (!emailMap.has(email)) {
          emailMap.set(email, []);
        }
        emailMap.get(email)!.push(index);
      }

      if (phone) {
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, []);
        }
        phoneMap.get(phone)!.push(index);
      }
    });

    // Find email duplicates
    emailMap.forEach((indexes, email) => {
      if (indexes.length > 1) {
        duplicateGroups.push({
          primaryIndex: indexes[0], // First occurrence is primary
          duplicateIndexes: indexes.slice(1), // Rest are duplicates
          reason: 'email' as const,
          email
        });
      }
    });

    // Find phone duplicates (only if not already found as email duplicates)
    phoneMap.forEach((indexes, phoneNumber) => {
      if (indexes.length > 1) {
        // Check if these records were already flagged as email duplicates
        const alreadyFlagged = duplicateGroups.some(group =>
          indexes.some(idx => idx === group.primaryIndex || group.duplicateIndexes.includes(idx))
        );

        if (!alreadyFlagged) {
          duplicateGroups.push({
            primaryIndex: indexes[0],
            duplicateIndexes: indexes.slice(1),
            reason: 'phone' as const,
            phoneNumber
          });
        }
      }
    });

    if (duplicateGroups.length > 0) {
      duplicateGroups.forEach(group => {
        secureLogger.info(`📋 [Within-File Duplicate] ${group.reason.toUpperCase()}: ${group.email || group.phoneNumber} - Primary: row ${group.primaryIndex + 1}, Duplicates: rows ${group.duplicateIndexes.map(i => i + 1).join(', ')}`);
      });
    }

    return duplicateGroups;
  }

  /**
   * Legacy method - kept for backward compatibility (now optimized with exact matches)
   */
  async findMatchingCustomers(incomingCustomer: any): Promise<DuplicateCustomer[]> {
    const matches: DuplicateCustomer[] = [];

    // Strategy 1: Exact email match (highest confidence)
    if (incomingCustomer.email) {
      const emailMatches = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phoneNumber: customers.phoneNumber,
          importId: customers.importId,
          createdAt: customers.createdAt
        })
        .from(customers)
        .leftJoin(dataImports, eq(customers.importId, dataImports.id))
        .where(
          and(
            eq(customers.email, incomingCustomer.email.trim().toLowerCase()),
            isNotNull(customers.email)
          )
        );

      emailMatches.forEach(match => {
        matches.push({
          ...match,
          sourceFileName: undefined, // Will be filled from join if needed
          importedAt: match.createdAt,
          matchReason: 'email',
          matchConfidence: 0.95
        });
      });
    }

    // Strategy 2: Phone number match (high confidence)
    if (incomingCustomer.phoneNumber) {
      const cleanPhone = this.cleanPhoneNumber(incomingCustomer.phoneNumber);
      if (cleanPhone) {
        const phoneMatches = await db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            email: customers.email,
            phoneNumber: customers.phoneNumber,
            importId: customers.importId,
            createdAt: customers.createdAt
          })
          .from(customers)
          .where(
            and(
              eq(customers.phoneNumber, cleanPhone),
              isNotNull(customers.phoneNumber)
            )
          );

        phoneMatches.forEach(match => {
          // Avoid duplicate entries (if email already matched)
          const existingMatch = matches.find(m => m.id === match.id);
          if (!existingMatch) {
            matches.push({
              ...match,
              sourceFileName: undefined,
              importedAt: match.createdAt,
              matchReason: 'phone',
              matchConfidence: 0.85
            });
          } else {
            // Upgrade confidence if multiple fields match
            existingMatch.matchReason = 'multiple_fields';
            existingMatch.matchConfidence = 0.98;
          }
        });
      }
    }

    // Strategy 3: Name combination match (moderate confidence)
    if (incomingCustomer.firstName && incomingCustomer.lastName) {
      const nameMatches = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phoneNumber: customers.phoneNumber,
          importId: customers.importId,
          createdAt: customers.createdAt
        })
        .from(customers)
        .where(
          and(
            ilike(customers.firstName, incomingCustomer.firstName.trim()),
            ilike(customers.lastName, incomingCustomer.lastName.trim()),
            isNotNull(customers.firstName),
            isNotNull(customers.lastName)
          )
        );

      nameMatches.forEach(match => {
        const existingMatch = matches.find(m => m.id === match.id);
        if (!existingMatch) {
          matches.push({
            ...match,
            sourceFileName: undefined,
            importedAt: match.createdAt,
            matchReason: 'name_combination',
            matchConfidence: 0.70
          });
        }
      });
    }

    return matches;
  }

  /**
   * Handle duplicates based on user-selected strategy (OPTIMIZED FOR PERFORMANCE)
   * Uses batch processing for database operations to improve import speed
   */
  async handleDuplicates(
    importId: string,
    duplicateAnalysis: DuplicateAnalysis,
    options: DuplicateHandlingOptions
  ): Promise<{
    recordsProcessed: number;
    recordsSuccessful: number;
    recordsSkipped: number;
    recordsUpdated: number;
    errors: string[];
  }> {
    const result = {
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsSkipped: 0,
      recordsUpdated: 0,
      errors: [] as string[]
    };

    // Log duplicate handling decision
    await this.logDuplicateDetectionEvent('duplicate_handling', {
      importId,
      options,
      duplicateCount: duplicateAnalysis.duplicateCustomers.length
    });

    // 🚀 PERFORMANCE OPTIMIZATION: Group operations by type for batch processing
    const operationGroups = {
      skip_duplicates: [] as any[],
      overwrite_existing: [] as any[],
      merge_data: [] as any[],
      create_new: [] as any[]
    };

    duplicateAnalysis.duplicateCustomers.forEach(duplicateItem => {
      const hasWithinFileMatchOnly = duplicateItem.existingMatches.every(
        m => typeof m.id === 'string' && m.id.startsWith('within-file-')
      );

      if (hasWithinFileMatchOnly && (options.customerAction === 'overwrite_existing' || options.customerAction === 'merge_data')) {
        operationGroups.skip_duplicates.push(duplicateItem);
      } else {
        operationGroups[options.customerAction].push(duplicateItem);
      }
    });

    secureLogger.info(`🚀 [Performance] Batch processing ${duplicateAnalysis.duplicateCustomers.length} duplicates with strategy: ${options.customerAction}`);

    // Process each group with optimized batch operations
    switch (options.customerAction) {
      case 'skip_duplicates':
        result.recordsProcessed = operationGroups.skip_duplicates.length;
        result.recordsSkipped = operationGroups.skip_duplicates.length;
        // Batch log all skipped records (optional - can be disabled for performance)
        break;

      case 'overwrite_existing': {
        const skippedWithinFile = operationGroups.skip_duplicates.length;
        if (operationGroups.overwrite_existing.length > 0) {
          const overwriteResult = await this.batchUpdateExistingCustomers(
            operationGroups.overwrite_existing,
            importId,
            'overwrite'
          );
          result.recordsProcessed = overwriteResult.recordsProcessed + skippedWithinFile;
          result.recordsUpdated = overwriteResult.recordsUpdated;
          result.recordsSuccessful = overwriteResult.recordsUpdated;
          result.recordsSkipped = skippedWithinFile;
          result.errors.push(...overwriteResult.errors);
        } else {
          result.recordsProcessed = skippedWithinFile;
          result.recordsSkipped = skippedWithinFile;
        }
        break;
      }

      case 'merge_data': {
        const skippedWithinFileMerge = operationGroups.skip_duplicates.length;
        if (operationGroups.merge_data.length > 0) {
          const mergeResult = await this.batchUpdateExistingCustomers(
            operationGroups.merge_data,
            importId,
            'merge'
          );
          result.recordsProcessed = mergeResult.recordsProcessed + skippedWithinFileMerge;
          result.recordsUpdated = mergeResult.recordsUpdated;
          result.recordsSuccessful = mergeResult.recordsUpdated;
          result.recordsSkipped = skippedWithinFileMerge;
          result.errors.push(...mergeResult.errors);
        } else {
          result.recordsProcessed = skippedWithinFileMerge;
          result.recordsSkipped = skippedWithinFileMerge;
        }
        break;
      }

      case 'create_new':
        const createResult = await this.batchCreateNewCustomers(
          operationGroups.create_new,
          importId
        );
        result.recordsProcessed = createResult.recordsProcessed;
        result.recordsSuccessful = createResult.recordsSuccessful;
        result.errors.push(...createResult.errors);
        break;
    }

    secureLogger.info(`✅ [Performance] Batch processing completed: ${result.recordsProcessed} processed, ${result.recordsUpdated} updated, ${result.recordsSuccessful} created`);
    return result;
  }

  /**
   * Generate file hash for duplicate detection
   */
  private async generateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Generate content hash from data for duplicate detection
   * Used as fallback when file is not accessible
   */
  private generateContentHash(content: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Clean phone number for consistent matching
   */
  private cleanPhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/[\s\-\(\)\.]/g, '').replace(/^\+?1?/, '');
  }

  /**
   * 🚀 PERFORMANCE OPTIMIZED: Batch update existing customers
   * Replaces individual database updates with efficient batch processing
   */
  private async batchUpdateExistingCustomers(
    duplicateItems: any[],
    importId: string,
    mode: 'overwrite' | 'merge'
  ): Promise<{
    recordsProcessed: number;
    recordsUpdated: number;
    errors: string[];
  }> {
    const result = {
      recordsProcessed: 0,
      recordsUpdated: 0,
      errors: [] as string[]
    };

    const BATCH_SIZE = 50; // Process in batches for memory efficiency
    
    for (let i = 0; i < duplicateItems.length; i += BATCH_SIZE) {
      const batch = duplicateItems.slice(i, i + BATCH_SIZE);
      
      try {
        // Process each batch concurrently for better performance
        const updatePromises = batch.map(async (duplicateItem) => {
          try {
            const customerId = duplicateItem.existingMatches[0].id;
            let updateData: any;

            if (mode === 'merge') {
              const { mergedData } = this.mergeCustomerDataWithTracking(duplicateItem.existingMatches[0], duplicateItem.customer);
              updateData = mergedData;
            } else {
              updateData = duplicateItem.customer;
            }

            // Prepare update data
            const finalUpdateData = {
              ...updateData,
              updatedAt: new Date(),
              importId
            };

            // Remove internal fields
            delete finalUpdateData._sourceRowNumber;
            delete finalUpdateData.id;

            // Individual update (still needed for WHERE clause specificity)
            await db.update(customers)
              .set(finalUpdateData as any)
              .where(eq(customers.id, customerId));

            return { success: true, customerId };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error', customerId: duplicateItem.existingMatches[0]?.id || 'unknown' };
          }
        });

        const batchResults = await Promise.all(updatePromises);
        
        // Process results
        batchResults.forEach((batchResult, index) => {
          result.recordsProcessed++;
          if (batchResult.success) {
            result.recordsUpdated++;
          } else {
            result.errors.push(`Row ${batch[index].rowNumber || 'unknown'}: ${batchResult.error}`);
          }
        });
        
        // Progress logging for large batches
        if (duplicateItems.length > 100) {
          const progress = Math.round(((i + BATCH_SIZE) / duplicateItems.length) * 100);
          secureLogger.info(`📊 [Batch Update] Progress: ${Math.min(progress, 100)}% (${result.recordsUpdated}/${duplicateItems.length})`);
        }
        
      } catch (error) {
        result.errors.push(`Batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * 🚀 PERFORMANCE OPTIMIZED: Batch create new customers
   */
  private async batchCreateNewCustomers(
    duplicateItems: any[],
    importId: string
  ): Promise<{
    recordsProcessed: number;
    recordsSuccessful: number;
    errors: string[];
  }> {
    const result = {
      recordsProcessed: duplicateItems.length,
      recordsSuccessful: 0,
      errors: [] as string[]
    };

    const BATCH_SIZE = 100; // Larger batch size for inserts
    
    for (let i = 0; i < duplicateItems.length; i += BATCH_SIZE) {
      const batch = duplicateItems.slice(i, i + BATCH_SIZE);
      
      try {
        const newCustomersData = batch.map(duplicateItem => ({
          ...duplicateItem.customer,
          importId,
          id: undefined // Let database generate ID
        }));

        await db.insert(customers).values(newCustomersData);
        result.recordsSuccessful += batch.length;
        
      } catch (error) {
        result.errors.push(`Batch create error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Update existing customer with new data (Legacy - kept for compatibility)
   */
  private async updateExistingCustomer(customerId: string, newData: any, importId: string): Promise<void> {
    const updateData = {
      ...newData,
      updatedAt: new Date(),
      importId // Track the latest import that updated this customer
    };

    // Remove internal fields
    delete updateData._sourceRowNumber;
    delete updateData.id;

    await db.update(customers)
      .set(updateData as any) // Type assertion needed for dynamic update data
      .where(eq(customers.id, customerId));
  }

  /**
   * Update existing customer with new data and track changes
   */
  private async updateExistingCustomerWithTracking(
    customerId: string,
    newData: any,
    importId: string
  ): Promise<Record<string, { from: any; to: any }>> {
    // First, get the existing customer data
    const existingCustomer = await db.select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!existingCustomer[0]) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    const existing = existingCustomer[0];
    const dataChanges: Record<string, { from: any; to: any }> = {};

    // Track what fields are changing
    Object.keys(newData).forEach(key => {
      if (key !== 'id' && key !== '_sourceRowNumber' && newData[key] !== undefined) {
        const oldValue = existing[key as keyof typeof existing];
        const newValue = newData[key];

        // Only track actual changes
        if (oldValue !== newValue) {
          dataChanges[key] = {
            from: oldValue,
            to: newValue
          };
        }
      }
    });

    // Update the customer
    await this.updateExistingCustomer(customerId, newData, importId);

    return dataChanges;
  }

  /**
   * Merge customer data from existing and new records
   */
  private mergeCustomerData(existing: any, incoming: any): any {
    const merged = { ...existing };

    // Merge strategy: incoming data overrides null/empty existing data
    Object.keys(incoming).forEach(key => {
      if (incoming[key] && !merged[key]) {
        merged[key] = incoming[key];
      } else if (incoming[key]) {
        // For non-empty existing data, prefer more recent or more complete data
        merged[key] = incoming[key];
      }
    });

    return merged;
  }

  /**
   * Merge customer data with change tracking
   */
  private mergeCustomerDataWithTracking(
    existing: any,
    incoming: any
  ): { mergedData: any; dataChanges: Record<string, { from: any; to: any }> } {
    const merged = { ...existing };
    const dataChanges: Record<string, { from: any; to: any }> = {};

    // Merge strategy: incoming data overrides null/empty existing data
    Object.keys(incoming).forEach(key => {
      if (key !== 'id' && key !== '_sourceRowNumber' && incoming[key] !== undefined) {
        const existingValue = existing[key];
        const incomingValue = incoming[key];

        let shouldUpdate = false;

        if (incomingValue && !existingValue) {
          // Incoming data fills empty field
          shouldUpdate = true;
        } else if (incomingValue && existingValue && incomingValue !== existingValue) {
          // Incoming data overwrites existing data (prefer more recent)
          shouldUpdate = true;
        }

        if (shouldUpdate) {
          merged[key] = incomingValue;
          dataChanges[key] = {
            from: existingValue,
            to: incomingValue
          };
        }
      }
    });

    return { mergedData: merged, dataChanges };
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    duplicateFiles: DuplicateFile[],
    customerDuplicates: any[],
    totalIncomingRecords: number
  ) {
    return {
      fileDuplicatesCount: duplicateFiles.length,
      customerDuplicatesCount: customerDuplicates.length,
      totalIncomingRecords,
      uniqueNewRecords: totalIncomingRecords - customerDuplicates.length,
      duplicateRecordsCount: customerDuplicates.length
    };
  }

  /**
   * Generate recommendations based on duplicate analysis
   */
  private generateRecommendations(duplicateFiles: DuplicateFile[], customerDuplicates: any[]) {
    const hasFileDuplicates = duplicateFiles.length > 0;
    const hasCustomerDuplicates = customerDuplicates.length > 0;

    if (hasFileDuplicates && hasCustomerDuplicates) {
      return {
        action: 'review_required' as const,
        reason: 'Both file-level and customer-level duplicates detected',
        options: [
          'Skip entire file (file already processed)',
          'Import only new customers (skip customer duplicates)',
          'Update existing customers with new data',
          'Merge customer data intelligently'
        ]
      };
    } else if (hasFileDuplicates) {
      return {
        action: 'review_required' as const,
        reason: 'File appears to have been imported previously',
        options: [
          'Skip import (file already processed)',
          'Re-import with overwrite existing data',
          'Import with timestamp suffix'
        ]
      };
    } else if (hasCustomerDuplicates) {
      return {
        action: 'review_required' as const,
        reason: `${customerDuplicates.length} duplicate customers found`,
        options: [
          'Skip duplicate customers',
          'Update existing customers',
          'Merge customer data',
          'Create new records with identifiers'
        ]
      };
    } else {
      return {
        action: 'proceed' as const,
        reason: 'No duplicates detected - safe to import',
        options: ['Proceed with standard import']
      };
    }
  }

  /**
   * Log duplicate detection events for audit trail
   */
  private async logDuplicateDetectionEvent(
    eventType: 'duplicate_analysis' | 'duplicate_handling',
    metadata: any
  ): Promise<void> {
    try {
      // Log to application logs table for persistent storage
      await this.db.insert(this.applicationLogs).values({
        level: 'info',
        category: 'import',
        message: `Duplicate detection ${eventType}`,
        metadata: {
          eventType,
          ...metadata,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
      });

    } catch (error) {
      secureLogger.error('Failed to log duplicate detection event:', { error: String(error) });
    }
  }

  /**
   * Log individual customer duplicate actions
   */
  private async logCustomerDuplicateAction(
    importId: string,
    duplicateItem: any,
    action: 'skipped' | 'overwritten' | 'merged' | 'created_new',
    dataChanges?: Record<string, { from: any; to: any }>
  ): Promise<void> {
    try {
      const logData = {
        importId,
        customerId: duplicateItem.existingMatches[0]?.id,
        rowNumber: duplicateItem.rowNumber,
        matchReason: duplicateItem.existingMatches[0]?.matchReason,
        matchConfidence: duplicateItem.existingMatches[0]?.matchConfidence,
        action,
        dataChanges
      };

      // Log to application logs table for persistent storage and easy querying
      await this.db.insert(this.applicationLogs).values({
        level: 'info',
        category: 'import',
        message: `Customer duplicate ${action}`,
        metadata: logData,
        timestamp: new Date(),
      });

    } catch (error) {
      secureLogger.error('Failed to log customer duplicate action:', { error: String(error) });
    }
  }

  /**
   * Timeout utility for preventing duplicate detection hangs
   */
  private async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Duplicate detection timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Find matches in pre-fetched batch results (optimized for performance)
   */
  private findMatchesInBatchResults(
    incomingCustomer: any,
    existingByEmail: any[],
    existingByPhone: any[]
  ): DuplicateCustomer[] {
    const matches: DuplicateCustomer[] = [];
    const matchedIds = new Set<string>();

    // Strategy 1: Exact email match (highest confidence)
    if (incomingCustomer.email) {
      const cleanEmail = incomingCustomer.email.trim().toLowerCase();
      const emailMatches = existingByEmail.filter(
        existing => existing.email?.toLowerCase() === cleanEmail
      );

      emailMatches.forEach(match => {
        if (!matchedIds.has(match.id)) {
          matches.push({
            ...match,
            sourceFileName: undefined,
            importedAt: match.createdAt,
            matchReason: 'email',
            matchConfidence: 0.95
          });
          matchedIds.add(match.id);
        }
      });
    }

    // Strategy 2: Phone number match (high confidence)
    if (incomingCustomer.phoneNumber) {
      const cleanPhone = this.cleanPhoneNumber(incomingCustomer.phoneNumber);
      if (cleanPhone) {
        const phoneMatches = existingByPhone.filter(existing => {
          const existingClean = this.cleanPhoneNumber(existing.phoneNumber || '');
          return existingClean === cleanPhone;
        });

        phoneMatches.forEach(match => {
          const existingMatch = matches.find(m => m.id === match.id);
          if (existingMatch) {
            // Upgrade confidence if multiple fields match
            existingMatch.matchReason = 'multiple_fields';
            existingMatch.matchConfidence = 0.98;
          } else if (!matchedIds.has(match.id)) {
            matches.push({
              ...match,
              sourceFileName: undefined,
              importedAt: match.createdAt,
              matchReason: 'phone',
              matchConfidence: 0.85
            });
            matchedIds.add(match.id);
          }
        });
      }
    }

    return matches;
  }
}

// Singleton instance
export const duplicateDetectionService = new DuplicateDetectionService();
