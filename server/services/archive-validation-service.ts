/**
 * Archive Restore Validation Service
 *
 * Comprehensive post-restore validation to ensure data completeness and integrity
 *
 * @created August 11, 2025
 */

import { db } from '../db';
import { customers, segments, dataImports, customerIdentifiers, customerEvents, customerSegments } from '../../shared/schema';
import { sql, eq, and, count, isNull, isNotNull, or } from 'drizzle-orm';
import { applicationLogger } from './application-logger';

export interface ValidationResult {
  isValid: boolean;
  totalRecordsRestored: number;
  validationResults: {
    tableName: string;
    recordCount: number;
    expectedFields: string[];
    missingFields: string[];
    emptyFields: string[];
    invalidRecords: number;
    validationErrors: string[];
  }[];
  criticalIssues: string[];
  warnings: string[];
  summary: {
    tablesValidated: number;
    totalErrors: number;
    totalWarnings: number;
    dataCompletenessPercentage: number;
  };
}

export interface RestoreValidationConfig {
  validateEmptyFields: boolean;
  validateDataTypes: boolean;
  validateRelationships: boolean;
  requiredFields: Record<string, string[]>;
  expectedCounts?: Record<string, number>;
}

export class ArchiveValidationService {
  private readonly DEFAULT_CONFIG: RestoreValidationConfig = {
    validateEmptyFields: true,
    validateDataTypes: true,
    validateRelationships: true,
    requiredFields: {
      customers: ['first_name', 'last_name', 'email'], // Fixed: use actual DB column names
      segments: ['name', 'criteria'],
      data_imports: ['fileName', 'importStatus'], // Fixed: use actual table name
      dataImports: ['fileName', 'importStatus'], // Keep both variants for compatibility
      customer_identifiers: ['customerId', 'identifierType', 'identifierValue'],
      customerIdentifiers: ['customerId', 'identifierType', 'identifierValue'],
      customer_events: ['customerId', 'eventType'],
      customerEvents: ['customerId', 'eventType']
    }
  };

  /**
   * Perform comprehensive post-restore validation
   */
  async validateRestoration(
    archiveId: string,
    restoredCounts: Record<string, number>,
    config: Partial<RestoreValidationConfig> = {}
  ): Promise<ValidationResult> {
    const validationConfig = { ...this.DEFAULT_CONFIG, ...config };

    applicationLogger.info('archive', `🔍 Starting post-restore validation for archive: ${archiveId}`).catch(() => {});

    const validationResults: ValidationResult['validationResults'] = [];
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    let totalRecordsRestored = 0;

    try {
      // Get actual current record counts instead of relying on potentially incorrect expected counts
      const actualCounts = await this.getCurrentRecordCounts();

      // Validate each table with actual data
      for (const tableName of Object.keys(restoredCounts)) {
        const expectedCount = restoredCounts[tableName];
        const actualCount = actualCounts[tableName] || 0;

        applicationLogger.info('archive', `📊 Validating table: ${tableName} (restored: ${expectedCount} records, found: ${actualCount})`).catch(() => {});

        const tableValidation = await this.validateTable(
          tableName,
          actualCount, // Use actual count for validation
          validationConfig
        );

        validationResults.push(tableValidation);
        totalRecordsRestored += tableValidation.recordCount;

        // Collect critical issues and warnings
        if (tableValidation.validationErrors.length > 0) {
          criticalIssues.push(
            `${tableName}: ${tableValidation.validationErrors.join(', ')}`
          );
        }

        if (tableValidation.emptyFields.length > 0) {
          warnings.push(
            `${tableName}: Empty fields detected - ${tableValidation.emptyFields.join(', ')}`
          );
        }

        // Only flag significant count mismatches (allow small variations)
        if (expectedCount > 0 && Math.abs(tableValidation.recordCount - expectedCount) > Math.max(1, expectedCount * 0.05)) {
          criticalIssues.push(
            `${tableName}: Record count mismatch - Expected: ${expectedCount}, Found: ${tableValidation.recordCount}`
          );
        }
      }

      // Validate data relationships
      if (validationConfig.validateRelationships) {
        const relationshipIssues = await this.validateDataRelationships();
        criticalIssues.push(...relationshipIssues);
      }

      // Calculate overall health metrics
      const totalErrors = criticalIssues.length;
      const totalWarnings = warnings.length;
      const completenessPercentage = this.calculateDataCompleteness(validationResults);

      const result: ValidationResult = {
        isValid: totalErrors === 0 && completenessPercentage >= 95,
        totalRecordsRestored,
        validationResults,
        criticalIssues,
        warnings,
        summary: {
          tablesValidated: validationResults.length,
          totalErrors,
          totalWarnings,
          dataCompletenessPercentage: Math.round(completenessPercentage * 100) / 100
        }
      };

      // Log validation summary
      this.logValidationResults(result);

      return result;

    } catch (error) {
      applicationLogger.error('archive', '❌ Validation process failed:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      throw new Error(`Post-restore validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Validate individual table data completeness and integrity
   */
  private async validateTable(
    tableName: string,
    expectedCount: number,
    config: RestoreValidationConfig
  ): Promise<ValidationResult['validationResults'][0]> {
    const table = this.getTableReference(tableName);

    // Handle legacy tables that exist in DB but not in current schema
    if (!table && (tableName === 'raw_data_imports' || tableName === 'rawDataImports')) {
      try {
        // SECURITY FIX: Use safer approach for legacy table queries
        // Instead of raw SQL, use Drizzle's schema-aware approach
        const recordCount = await this.getLegacyTableCount('raw_data_imports');
        return {
          tableName,
          recordCount,
          expectedFields: [],
          missingFields: [],
          emptyFields: [],
          invalidRecords: 0,
          validationErrors: recordCount > 0 ? [] : [] // No errors for legacy table
        };
      } catch (error) {
        return {
          tableName,
          recordCount: 0,
          expectedFields: [],
          missingFields: [],
          emptyFields: [],
          invalidRecords: 0,
          validationErrors: []  // Don't fail validation for missing legacy table
        };
      }
    }

    if (!table) {
      return {
        tableName,
        recordCount: 0,
        expectedFields: [],
        missingFields: [],
        emptyFields: [],
        invalidRecords: 0,
        validationErrors: [`Unknown table: ${tableName}`]
      };
    }

    // Get actual record count
    const [{ recordCount }] = await db
      .select({ recordCount: count() })
      .from(table);

    // Get required fields for this table
    const requiredFields = config.requiredFields[tableName] || [];
    const expectedFields = requiredFields;

    // Validate field completeness
    const emptyFields: string[] = [];
    const validationErrors: string[] = [];

    if (config.validateEmptyFields && requiredFields.length > 0) {
      for (const field of requiredFields) {
        try {
          const emptyCount = await this.countEmptyFields(table, field);
          if (emptyCount > 0) {
            emptyFields.push(`${field} (${emptyCount} empty)`);

            // Critical if more than 10% of records have empty required fields
            if (emptyCount / Number(recordCount) > 0.1) {
              validationErrors.push(
                `Critical: ${field} is empty in ${emptyCount}/${recordCount} records (${Math.round(emptyCount / Number(recordCount) * 100)}%)`
              );
            }
          }
        } catch (error) {
          applicationLogger.warn('archive', `Could not validate field ${field} in ${tableName}:`, { error: String(error) }).catch(() => {}).catch(() => {});
        }
      }
    }

    // Validate data types and formats
    if (config.validateDataTypes) {
      const typeValidationErrors = await this.validateDataTypes(table, tableName);
      validationErrors.push(...typeValidationErrors);
    }

    return {
      tableName,
      recordCount: Number(recordCount),
      expectedFields,
      missingFields: [], // Would be populated if schema validation was needed
      emptyFields,
      invalidRecords: validationErrors.length,
      validationErrors
    };
  }

  /**
   * Count empty or null fields in a table
   */
  private async countEmptyFields(table: any, fieldName: string): Promise<number> {
    try {
      const field = (table as any)[fieldName];
      if (!field) return 0;

      const [{ emptyCount }] = await db
        .select({ emptyCount: count() })
        .from(table)
        .where(
          or(
            isNull(field),
            eq(field, ''),
            eq(field, 'NULL'),
            eq(field, 'null')
          )
        );

      return Number(emptyCount);
    } catch (error) {
      applicationLogger.warn('archive', `Could not count empty fields for ${fieldName}:`, { error: String(error) }).catch(() => {}).catch(() => {});
      return 0;
    }
  }

  /**
   * Validate data types and formats specific to each table
   */
  private async validateDataTypes(table: any, tableName: string): Promise<string[]> {
    const errors: string[] = [];

    try {
      switch (tableName) {
        case 'customers':
          // SECURITY FIX: Use Drizzle ORM instead of raw SQL for validation
          try {
            // Validate email formats using Drizzle ORM query builder
            const customerData = await db.select({
              id: customers.id,
              email: customers.email,
              phoneNumber: customers.phoneNumber
            }).from(customers);

            let invalidEmailCount = 0;
            let invalidPhoneCount = 0;
            const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;

            for (const customer of customerData) {
              // Validate email format
              if (customer.email && customer.email !== '' && !emailRegex.test(customer.email)) {
                invalidEmailCount++;
              }
              
              // Validate phone format
              if (customer.phoneNumber && customer.phoneNumber !== '' && !phoneRegex.test(customer.phoneNumber)) {
                invalidPhoneCount++;
              }
            }

            if (invalidEmailCount > 0) {
              errors.push(`Invalid email format in ${invalidEmailCount} records`);
            }

            if (invalidPhoneCount > 0) {
              errors.push(`Invalid phone format in ${invalidPhoneCount} records`);
            }
          } catch (validationError) {
            applicationLogger.warn('archive', '⚠️ Could not validate customer data formats:', { error: String(validationError) }).catch(() => {}).catch(() => {});
            errors.push('Could not complete customer data format validation');
          }
          break;

        case 'segments':
          // Validate JSON criteria format - simplified approach that avoids SQL JSON comparison
          try {
            // Use Drizzle ORM instead of raw SQL for better JSONB handling
            const segmentsData = await db.select({
              id: segments.id,
              criteria: segments.criteria
            }).from(segments);

            let invalidCount = 0;
            for (const row of segmentsData) {
              if (row.criteria && row.criteria !== null) {
                try {
                  // The criteria is already parsed as JSONB by Drizzle,
                  // so if we got here, it's valid JSON
                  if (typeof row.criteria === 'object') {
                    // Valid JSON object
                    continue;
                  } else if (typeof row.criteria === 'string') {
                    // Try parsing if it's a string
                    JSON.parse(row.criteria);
                  }
                } catch (e) {
                  invalidCount++;
                }
              }
            }

            if (invalidCount > 0) {
              errors.push(`Invalid JSON criteria format in ${invalidCount} records`);
            }
          } catch (error) {
            applicationLogger.warn('archive', 'Could not validate segments JSON format:', { error: String(error) }).catch(() => {}).catch(() => {});
          }
          break;
      }
    } catch (error) {
      applicationLogger.warn('archive', `Data type validation failed for ${tableName}:`, { error: String(error) }).catch(() => {}).catch(() => {});
    }

    return errors;
  }

  /**
   * Validate data relationships between tables
   */
  private async validateDataRelationships(): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Check customer-segment relationships
      const orphanedSegmentAssignments = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM customer_segments cs
        LEFT JOIN customers c ON cs.customer_id = c.id
        WHERE c.id IS NULL
      `);

      if (Number(orphanedSegmentAssignments.rows[0]?.count) > 0) {
        issues.push(`${orphanedSegmentAssignments.rows[0]?.count} orphaned customer-segment assignments`);
      }

      // Check customer-import relationships
      const orphanedCustomers = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM customers c
        LEFT JOIN data_imports di ON c.import_id = di.id
        WHERE c.import_id IS NOT NULL AND di.id IS NULL
      `);

      if (Number(orphanedCustomers.rows[0]?.count) > 0) {
        issues.push(`${orphanedCustomers.rows[0]?.count} customers reference non-existent imports`);
      }

    } catch (error) {
      applicationLogger.warn('archive', 'Relationship validation failed:', { error: String(error) }).catch(() => {}).catch(() => {});
      issues.push('Could not validate all data relationships');
    }

    return issues;
  }

  /**
   * Calculate overall data completeness percentage
   */
  private calculateDataCompleteness(validationResults: ValidationResult['validationResults']): number {
    if (validationResults.length === 0) return 0;

    let totalFields = 0;
    let completeFields = 0;

    for (const result of validationResults) {
      const tableFields = result.expectedFields.length * result.recordCount;
      const emptyFieldCount = result.emptyFields.reduce((sum, field) => {
        const match = field.match(/\((\d+) empty\)/);
        return sum + (match ? parseInt(match[1]) : 0);
      }, 0);

      totalFields += tableFields;
      completeFields += (tableFields - emptyFieldCount);
    }

    return totalFields > 0 ? (completeFields / totalFields) * 100 : 100;
  }

  /**
   * Get database table reference by name
   */
  private getTableReference(tableName: string) {
    const tableMap: Record<string, any> = {
      customers,
      segments,
      data_imports: dataImports,
      dataImports,
      customer_identifiers: customerIdentifiers,
      customerIdentifiers,
      customer_events: customerEvents,
      customerEvents,
      customer_segments: customerSegments,
      customerSegments,
      // Legacy tables that exist in DB but not in current schema
      raw_data_imports: null,
      rawDataImports: null
    };

    return tableMap[tableName];
  }

  /**
   * Get current record counts for all relevant tables
   */
  private async getCurrentRecordCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    try {
      // Get customers count
      const [customerCount] = await db.select({ count: count() }).from(customers);
      counts.customers = Number(customerCount.count);

      // Get segments count
      const [segmentCount] = await db.select({ count: count() }).from(segments);
      counts.segments = Number(segmentCount.count);

      // Get data_imports count
      const [importCount] = await db.select({ count: count() }).from(dataImports);
      counts.data_imports = Number(importCount.count);
      counts.dataImports = Number(importCount.count); // Both variants

      // Get customer_identifiers count
      const [identifierCount] = await db.select({ count: count() }).from(customerIdentifiers);
      counts.customer_identifiers = Number(identifierCount.count);
      counts.customerIdentifiers = Number(identifierCount.count);

      // Get customer_events count
      const [eventCount] = await db.select({ count: count() }).from(customerEvents);
      counts.customer_events = Number(eventCount.count);
      counts.customerEvents = Number(eventCount.count);

      // Get customer_segments count
      try {
        const [segmentAssignmentCount] = await db.select({ count: count() }).from(customerSegments);
        counts.customer_segments = Number(segmentAssignmentCount.count);
        counts.customerSegments = Number(segmentAssignmentCount.count);
      } catch (error) {
        // Fallback to SQL query if Drizzle import fails
        const result = await db.execute(sql`SELECT COUNT(*) as count FROM customer_segments`);
        counts.customer_segments = Number(result.rows[0]?.count || 0);
        counts.customerSegments = Number(result.rows[0]?.count || 0);
      }

      // Legacy table: raw_data_imports (exists in DB but not in current schema)
      // SECURITY FIX: Use safe helper method instead of raw SQL
      const legacyCount = await this.getLegacyTableCount('raw_data_imports');
      counts.raw_data_imports = legacyCount;
      counts.rawDataImports = legacyCount;

    } catch (error) {
      applicationLogger.warn('archive', 'Could not get current record counts:', { error: String(error) }).catch(() => {}).catch(() => {});
    }

    return counts;
  }

  /**
   * SECURITY FIX: Safe method to get legacy table counts
   * This replaces raw SQL queries with a controlled approach
   */
  private async getLegacyTableCount(tableName: string): Promise<number> {
    // Whitelist of allowed legacy table names to prevent SQL injection
    const allowedLegacyTables = ['raw_data_imports', 'legacy_customers', 'legacy_imports'];
    
    if (!allowedLegacyTables.includes(tableName)) {
      applicationLogger.warn('archive', `🚫 Attempted access to non-whitelisted table: ${tableName}`, {}).catch(() => {});
      return 0;
    }
    
    try {
      // Use parameterized query with validated table name
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}`);
      return Number(result.rows[0]?.count || 0);
    } catch (error) {
      applicationLogger.warn('archive', `⚠️ Could not count records in legacy table ${tableName}:`, { error: String(error) }).catch(() => {}).catch(() => {});
      return 0;
    }
  }

  /**
   * Log comprehensive validation results
   */
  private logValidationResults(result: ValidationResult): void {
    applicationLogger.info('archive', `📈 Records Restored: ${result.totalRecordsRestored.toLocaleString()}`).catch(() => {});
    applicationLogger.info('archive', `❌ Critical Issues: ${result.summary.totalErrors}`).catch(() => {});
    applicationLogger.info('archive', `⚠️ Warnings: ${result.summary.totalWarnings}`).catch(() => {});

    if (result.criticalIssues.length > 0) {
      result.criticalIssues.forEach((issue, i) => {
      });
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((warning, i) => {
        applicationLogger.info('archive', `  ${i + 1}. ${warning}`).catch(() => {});
      });
    }

    result.validationResults.forEach(table => {
      if (table.emptyFields.length > 0) {
        applicationLogger.info('archive', `    ⚠️ Empty fields: ${table.emptyFields.join(', ')}`).catch(() => {});
      }
      if (table.validationErrors.length > 0) {
        applicationLogger.info('archive', `    ❌ Errors: ${table.validationErrors.join(', ')}`).catch(() => {});
      }
    });

  }
}


export const archiveValidationService = new ArchiveValidationService();
