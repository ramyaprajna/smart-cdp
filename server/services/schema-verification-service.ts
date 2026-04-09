/**
 * Schema Verification Service
 *
 * Evidence-Based Development module for database archival that provides:
 * - Automated schema consistency verification
 * - Database structure validation before operations
 * - Field mapping verification between live and archive schemas
 * - Compatibility checks for safe archival operations
 *
 * Created: August 1, 2025
 * Purpose: Eliminate schema mismatches causing archive failures
 */

import { db } from '../db';
import { archiveDb } from '../db-archive';
import { sql } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

export interface SchemaField {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default?: string;
}

export interface SchemaComparisonResult {
  tableName: string;
  isCompatible: boolean;
  liveFields: SchemaField[];
  archiveFields: SchemaField[];
  missingInLive: string[];
  missingInArchive: string[];
  typeMismatches: Array<{
    field: string;
    liveType: string;
    archiveType: string;
  }>;
}

export interface SchemaVerificationReport {
  timestamp: Date;
  overallCompatible: boolean;
  tablesChecked: number;
  compatibleTables: number;
  incompatibleTables: number;
  results: SchemaComparisonResult[];
  criticalIssues: string[];
  warnings: string[];
}

export class SchemaVerificationService {
  private readonly ARCHIVABLE_TABLES = [
    'customers',
    'customer_identifiers',
    'customer_events',
    'customer_embeddings',
    'segments',
    'customer_segments',
    'data_imports',
    'raw_data_imports'
  ];

  /**
   * Perform comprehensive schema verification between live and archive schemas
   */
  async verifySchemaCompatibility(): Promise<SchemaVerificationReport> {
    secureLogger.info('🔍 Starting comprehensive schema verification...');

    const results: SchemaComparisonResult[] = [];
    const criticalIssues: string[] = [];
    const warnings: string[] = [];

    for (const tableName of this.ARCHIVABLE_TABLES) {
      try {
        const comparison = await this.compareTableSchemas(tableName);
        results.push(comparison);

        if (!comparison.isCompatible) {
          criticalIssues.push(`Table ${tableName}: Schema incompatibility detected`);

          if (comparison.missingInArchive.length > 0) {
            criticalIssues.push(`Table ${tableName}: Missing archive fields: ${comparison.missingInArchive.join(', ')}`);
          }

          if (comparison.typeMismatches.length > 0) {
            comparison.typeMismatches.forEach(mismatch => {
              criticalIssues.push(`Table ${tableName}: Type mismatch on ${mismatch.field}: live=${mismatch.liveType} vs archive=${mismatch.archiveType}`);
            });
          }
        }

        if (comparison.missingInLive.length > 0) {
          warnings.push(`Table ${tableName}: Archive has additional fields: ${comparison.missingInLive.join(', ')}`);
        }

      } catch (error) {
        criticalIssues.push(`Table ${tableName}: Verification failed - ${(error as Error).message}`);
        results.push({
          tableName,
          isCompatible: false,
          liveFields: [],
          archiveFields: [],
          missingInLive: [],
          missingInArchive: [],
          typeMismatches: [],
        });
      }
    }

    const compatibleCount = results.filter(r => r.isCompatible).length;

    return {
      timestamp: new Date(),
      overallCompatible: criticalIssues.length === 0,
      tablesChecked: results.length,
      compatibleTables: compatibleCount,
      incompatibleTables: results.length - compatibleCount,
      results,
      criticalIssues,
      warnings
    };
  }

  /**
   * Compare schemas between live and archive tables
   */
  private async compareTableSchemas(tableName: string): Promise<SchemaComparisonResult> {
    const [liveFields, archiveFields] = await Promise.all([
      this.getTableSchema('public', tableName),
      this.getTableSchema('archive', tableName)
    ]);

    const liveFieldMap = new Map(liveFields.map(f => [f.column_name, f]));
    const archiveFieldMap = new Map(archiveFields.map(f => [f.column_name, f]));

    // Find missing fields
    const missingInArchive = liveFields
      .filter(f => !archiveFieldMap.has(f.column_name) && !this.isArchiveMetadataField(f.column_name))
      .map(f => f.column_name);

    const missingInLive = archiveFields
      .filter(f => !liveFieldMap.has(f.column_name) && !this.isArchiveMetadataField(f.column_name))
      .map(f => f.column_name);

    // Find type mismatches
    const typeMismatches = liveFields
      .filter(liveField => {
        const archiveField = archiveFieldMap.get(liveField.column_name);
        return archiveField && this.normalizeDataType(liveField.data_type) !== this.normalizeDataType(archiveField.data_type);
      })
      .map(liveField => {
        const archiveField = archiveFieldMap.get(liveField.column_name)!;
        return {
          field: liveField.column_name,
          liveType: liveField.data_type,
          archiveType: archiveField.data_type
        };
      });

    const isCompatible = missingInArchive.length === 0 && typeMismatches.length === 0;

    return {
      tableName,
      isCompatible,
      liveFields,
      archiveFields,
      missingInLive,
      missingInArchive,
      typeMismatches
    };
  }

  /**
   * Get table schema information
   */
  private async getTableSchema(schemaName: string, tableName: string): Promise<SchemaField[]> {
    const connection = schemaName === 'archive' ? archiveDb : db;

    const result = await connection.execute(sql`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = ${schemaName}
        AND table_name = ${tableName}
      ORDER BY ordinal_position
    `);

    return result.rows.map(row => ({
      column_name: row.column_name as string,
      data_type: row.data_type as string,
      is_nullable: row.is_nullable as string,
      column_default: row.column_default as string | undefined
    }));
  }

  /**
   * Check if field is archive-specific metadata
   */
  private isArchiveMetadataField(fieldName: string): boolean {
    const archiveFields = [
      'archive_id',
      'original_id',
      'archived_at',
      'original_created_at',
      'original_updated_at'
    ];
    return archiveFields.includes(fieldName);
  }

  /**
   * Normalize data types for comparison
   */
  private normalizeDataType(dataType: string): string {
    const typeMap: Record<string, string> = {
      'character varying': 'text',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      'double precision': 'float8',
      'integer': 'int4'
    };

    return typeMap[dataType] || dataType;
  }

  /**
   * Generate schema compatibility report
   */
  async generateCompatibilityReport(): Promise<string> {
    const report = await this.verifySchemaCompatibility();

    let output = `
# Schema Compatibility Report
Generated: ${report.timestamp.toISOString()}

## Summary
- Tables Checked: ${report.tablesChecked}
- Compatible: ${report.compatibleTables}
- Incompatible: ${report.incompatibleTables}
- Overall Compatible: ${report.overallCompatible ? '✅ YES' : '❌ NO'}

`;

    if (report.criticalIssues.length > 0) {
      output += `## Critical Issues\n`;
      report.criticalIssues.forEach(issue => {
        output += `- ❌ ${issue}\n`;
      });
      output += '\n';
    }

    if (report.warnings.length > 0) {
      output += `## Warnings\n`;
      report.warnings.forEach(warning => {
        output += `- ⚠️ ${warning}\n`;
      });
      output += '\n';
    }

    output += `## Table-by-Table Analysis\n`;
    report.results.forEach(result => {
      output += `
### ${result.tableName}
- Compatible: ${result.isCompatible ? '✅' : '❌'}
- Live Fields: ${result.liveFields.length}
- Archive Fields: ${result.archiveFields.length}
`;

      if (result.missingInArchive.length > 0) {
        output += `- Missing in Archive: ${result.missingInArchive.join(', ')}\n`;
      }

      if (result.typeMismatches.length > 0) {
        output += `- Type Mismatches:\n`;
        result.typeMismatches.forEach(mismatch => {
          output += `  - ${mismatch.field}: ${mismatch.liveType} vs ${mismatch.archiveType}\n`;
        });
      }
    });

    return output;
  }

  /**
   * Fix identified schema compatibility issues
   */
  async fixSchemaCompatibilityIssues(): Promise<{
    fixed: string[];
    failed: string[];
  }> {
    const report = await this.verifySchemaCompatibility();
    const fixed: string[] = [];
    const failed: string[] = [];

    for (const result of report.results) {
      if (!result.isCompatible) {
        try {
          await this.fixTableSchema(result);
          fixed.push(result.tableName);
        } catch (error) {
          failed.push(`${result.tableName}: ${(error as Error).message}`);
        }
      }
    }

    return { fixed, failed };
  }

  /**
   * Fix individual table schema issues
   */
  private async fixTableSchema(result: SchemaComparisonResult): Promise<void> {
    const { tableName, missingInArchive } = result;

    if (missingInArchive.length === 0) return;

    // Get the missing field definitions from live schema
    const liveFieldMap = new Map(result.liveFields.map(f => [f.column_name, f]));

    for (const missingField of missingInArchive) {
      const liveField = liveFieldMap.get(missingField);
      if (!liveField) continue;

      await archiveDb.execute(sql`
        ALTER TABLE archive.${sql.identifier(tableName)}
        ADD COLUMN ${sql.identifier(missingField)} ${sql.raw(liveField.data_type)}${sql.raw(liveField.is_nullable === 'YES' ? '' : ' NOT NULL')}${sql.raw(liveField.column_default ? ` DEFAULT ${liveField.column_default}` : '')}
      `);
    }
  }
}

export const schemaVerificationService = new SchemaVerificationService();
