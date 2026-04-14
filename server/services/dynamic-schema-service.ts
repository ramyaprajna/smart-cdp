/**
 * Dynamic Schema Service (P3)
 *
 * Solves Gap #1 fully: "Fork → blank DB → AI rancang schema dari sample data"
 *
 * Given a ProposedSchema from ai-schema-proposer, this service can:
 *   1. Generate a raw SQL CREATE TABLE statement
 *   2. Execute it against the database (with user approval)
 *   3. Track created tables in a registry for querying
 *
 * SAFETY:
 *   - All dynamic tables are prefixed with `dyn_` to avoid conflicts
 *   - DDL is logged and reversible via DROP TABLE
 *   - User must explicitly approve before creation
 *
 * @module DynamicSchemaService
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';
import type { ProposedSchema, ProposedField } from './ai-schema-proposer';

// ── Types ───────────────────────────────────────────────────────

export interface CreateTableResult {
  success: boolean;
  tableName: string;
  sqlStatement: string;
  error?: string;
}

export interface DynamicTableInfo {
  tableName: string;
  displayName: string;
  description: string;
  fieldCount: number;
  createdAt: string;
}

// ── Service ─────────────────────────────────────────────────────

class DynamicSchemaServiceImpl {
  private readonly TABLE_PREFIX = 'dyn_';

  /**
   * Generate a CREATE TABLE SQL statement from a ProposedSchema.
   * Does NOT execute — returns the SQL for review/approval.
   */
  generateSQL(schema: ProposedSchema): string {
    const tableName = this.safeTableName(schema.tableName);
    const columns: string[] = [
      `  id UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
    ];

    for (const field of schema.fields) {
      if (field.name === 'id') continue; // already added
      const colName = this.safeColumnName(field.name);
      const colType = this.mapType(field.type);
      const nullable = field.nullable ? '' : ' NOT NULL';
      const unique = field.isUnique ? ' UNIQUE' : '';
      columns.push(`  ${colName} ${colType}${nullable}${unique}`);
    }

    // Always add metadata columns
    columns.push(`  _source_id TEXT`);
    columns.push(`  _profile_id UUID`);  // nullable link to customer_profile
    columns.push(`  _raw_entity_id UUID`);  // link back to raw_entities
    columns.push(`  _created_at TIMESTAMPTZ DEFAULT NOW()`);

    let ddl = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    ddl += columns.join(',\n');
    ddl += '\n);\n';

    // Indexes
    for (const idx of schema.suggestedIndexes) {
      const idxName = this.safeColumnName(idx);
      const fieldName = idx.replace(`idx_${schema.tableName}_`, '');
      const safeField = this.safeColumnName(fieldName);
      ddl += `\nCREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName} (${safeField});`;
    }

    // Always index _profile_id and _created_at
    ddl += `\nCREATE INDEX IF NOT EXISTS idx_${tableName.replace(this.TABLE_PREFIX, '')}_profile ON ${tableName} (_profile_id);`;
    ddl += `\nCREATE INDEX IF NOT EXISTS idx_${tableName.replace(this.TABLE_PREFIX, '')}_created ON ${tableName} (_created_at);`;

    return ddl;
  }

  /**
   * Execute the CREATE TABLE after user approval.
   * Returns success/failure with the executed SQL.
   */
  async createTable(schema: ProposedSchema): Promise<CreateTableResult> {
    const ddl = this.generateSQL(schema);
    const tableName = this.safeTableName(schema.tableName);

    try {
      await db.execute(sql.raw(ddl));

      secureLogger.info('Dynamic table created', {
        tableName,
        fieldCount: schema.fields.length,
        domain: schema.detectedDomain,
      });

      return {
        success: true,
        tableName,
        sqlStatement: ddl,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      secureLogger.error('Dynamic table creation failed', {
        tableName,
        error: errMsg,
      });

      return {
        success: false,
        tableName,
        sqlStatement: ddl,
        error: errMsg,
      };
    }
  }

  /**
   * Drop a dynamically created table. Only allows tables with dyn_ prefix.
   */
  async dropTable(tableName: string): Promise<{ success: boolean; error?: string }> {
    if (!tableName.startsWith(this.TABLE_PREFIX)) {
      return { success: false, error: 'Can only drop tables with dyn_ prefix' };
    }

    try {
      const safeName = this.safeTableName(tableName.replace(this.TABLE_PREFIX, ''));
      await db.execute(sql.raw(`DROP TABLE IF EXISTS ${safeName} CASCADE`));
      secureLogger.info('Dynamic table dropped', { tableName: safeName });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * List all dynamically created tables (with dyn_ prefix).
   */
  async listTables(): Promise<DynamicTableInfo[]> {
    try {
      const result = await db.execute(sql`
        SELECT table_name,
               obj_description((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass) as description
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'dyn_%'
        ORDER BY table_name
      `);

      return (result.rows as any[]).map(row => ({
        tableName: row.table_name,
        displayName: row.table_name.replace('dyn_', '').replace(/_/g, ' '),
        description: row.description || '',
        fieldCount: 0,
        createdAt: '',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Insert data into a dynamic table.
   */
  async insertRow(
    tableName: string,
    data: Record<string, unknown>,
    meta?: { sourceId?: string; profileId?: string; rawEntityId?: string }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!tableName.startsWith(this.TABLE_PREFIX)) {
      return { success: false, error: 'Can only insert into tables with dyn_ prefix' };
    }

    try {
      const columns = Object.keys(data).map(k => this.safeColumnName(k));
      const values = Object.values(data);

      if (meta?.sourceId) { columns.push('_source_id'); values.push(meta.sourceId); }
      if (meta?.profileId) { columns.push('_profile_id'); values.push(meta.profileId); }
      if (meta?.rawEntityId) { columns.push('_raw_entity_id'); values.push(meta.rawEntityId); }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`;

      const result = await db.execute(sql.raw(query));
      const id = (result.rows as any[])[0]?.id;

      return { success: true, id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private safeTableName(name: string): string {
    const clean = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .substring(0, 55);
    return clean.startsWith(this.TABLE_PREFIX) ? clean : `${this.TABLE_PREFIX}${clean}`;
  }

  private safeColumnName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .substring(0, 63);
  }

  private mapType(type: ProposedField['type']): string {
    switch (type) {
      case 'uuid': return 'UUID';
      case 'text': return 'TEXT';
      case 'integer': return 'INTEGER';
      case 'real': return 'REAL';
      case 'boolean': return 'BOOLEAN';
      case 'timestamp': return 'TIMESTAMPTZ';
      case 'jsonb': return 'JSONB';
      default: return 'TEXT';
    }
  }
}

export const dynamicSchemaService = new DynamicSchemaServiceImpl();
