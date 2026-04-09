/**
 * Validation Schema Factory
 *
 * Centralized factory for creating consistent Zod validation schemas
 * across route handlers. Eliminates duplication and ensures consistency.
 *
 * Created: August 11, 2025 - Refactoring consolidation
 */

import { z } from 'zod';

export class ValidationSchemaFactory {
  /**
   * Common patterns for reuse
   */
  static readonly COMMON_PATTERNS = {
    uuid: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    pagination: {
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0)
    },
    dateRange: {
      startDate: z.string().datetime(),
      endDate: z.string().datetime()
    },
    searchQuery: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  } as const;

  /**
   * Create archive operation schemas
   */
  static createArchiveSchemas() {
    return {
      create: z.object({
        name: this.COMMON_PATTERNS.name,
        description: this.COMMON_PATTERNS.description,
        archiveType: z.enum(['full', 'partial', 'backup']).default('full'),
        includeTables: z.array(z.string()).optional(),
        excludeTables: z.array(z.string()).optional(),
        dateRange: z.object(this.COMMON_PATTERNS.dateRange).optional()
      }),

      update: z.object({
        name: this.COMMON_PATTERNS.name.optional(),
        description: this.COMMON_PATTERNS.description,
        metadata: z.record(z.any()).optional()
      }),

      restore: z.object({
        restoreType: z.enum(['full', 'selective']),
        selectedTables: z.array(z.string()).optional(),
        replaceExisting: z.boolean().default(false),
        validateData: z.boolean().default(true)
      }),

      query: z.object({
        ...this.COMMON_PATTERNS.pagination,
        search: this.COMMON_PATTERNS.searchQuery,
        sortBy: z.enum(['name', 'created_at', 'data_size']).default('created_at'),
        sortOrder: this.COMMON_PATTERNS.sortOrder
      })
    };
  }

  /**
   * Create logs query schemas
   */
  static createLogsSchemas() {
    return {
      query: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error', 'critical']).optional(),
        category: z.enum(['email', 'authentication', 'database', 'api', 'system', 'import', 'vector', 'security', 'ai', 'archive']).optional(),
        userId: this.COMMON_PATTERNS.uuid.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        isArchived: z.union([z.boolean(), z.string()]).optional().transform((val) => {
          if (typeof val === 'string') {
            return val === 'true';
          }
          return val;
        }),
        limit: z.coerce.number().min(1).max(1000).optional(),
        offset: z.coerce.number().min(0).optional()
      }),

      action: z.object({
        logIds: z.array(this.COMMON_PATTERNS.uuid).min(1)
      })
    };
  }

  /**
   * Create import operation schemas
   */
  static createImportSchemas() {
    return {
      mapping: z.object({
        columnName: z.string(),
        originalName: z.string(),
        mappingType: z.enum(['core', 'unmapped', 'custom', 'skip']),
        targetField: z.string().optional(),
        confidenceScore: z.number().min(0).max(100).optional(),
        dataType: z.string().optional(),
        preserveInJson: z.boolean().optional()
      }),

      process: z.object({
        importId: this.COMMON_PATTERNS.uuid,
        columnMappings: z.array(z.object({
          columnName: z.string(),
          mappingType: z.enum(['core', 'unmapped', 'custom', 'skip']),
          targetField: z.string().optional()
        })),
        sourceSystem: z.string().optional(),
        importMetadata: z.any().optional()
      })
    };
  }

  /**
   * Create customer query schemas
   */
  static createCustomerSchemas() {
    return {
      query: z.object({
        ...this.COMMON_PATTERNS.pagination,
        search: this.COMMON_PATTERNS.searchQuery,
        segment: z.string().optional(),
        sortBy: z.enum(['firstName', 'lastName', 'email', 'createdAt', 'lifetimeValue']).default('createdAt'),
        sortOrder: this.COMMON_PATTERNS.sortOrder
      }),

      filter: z.object({
        ageRange: z.object({
          min: z.number().min(0).max(120).optional(),
          max: z.number().min(0).max(120).optional()
        }).optional(),
        genderFilter: z.array(z.string()).optional(),
        locationFilter: z.array(z.string()).optional(),
        segmentFilter: z.array(z.string()).optional(),
        lifetimeValueRange: z.object({
          min: z.number().min(0).optional(),
          max: z.number().min(0).optional()
        }).optional()
      })
    };
  }

  /**
   * Create user management schemas
   */
  static createUserSchemas() {
    return {
      create: z.object({
        email: this.COMMON_PATTERNS.email,
        firstName: this.COMMON_PATTERNS.name,
        lastName: this.COMMON_PATTERNS.name,
        password: z.string().min(8),
        role: z.enum(['admin', 'analyst', 'viewer', 'marketing']).default('viewer')
      }),

      update: z.object({
        firstName: this.COMMON_PATTERNS.name.optional(),
        lastName: this.COMMON_PATTERNS.name.optional(),
        role: z.enum(['admin', 'analyst', 'viewer', 'marketing']).optional(),
        isActive: z.boolean().optional()
      }),

      login: z.object({
        email: this.COMMON_PATTERNS.email,
        password: z.string()
      })
    };
  }

  /**
   * Create segment management schemas
   */
  static createSegmentSchemas() {
    return {
      create: z.object({
        name: this.COMMON_PATTERNS.name,
        description: this.COMMON_PATTERNS.description,
        criteria: z.record(z.any()),
        isActive: z.boolean().default(true)
      }),

      update: z.object({
        name: this.COMMON_PATTERNS.name.optional(),
        description: this.COMMON_PATTERNS.description,
        criteria: z.record(z.any()).optional(),
        isActive: z.boolean().optional()
      })
    };
  }

  /**
   * Helper method to validate request body
   */
  static validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new Error(`Validation error: ${result.error.message}`);
    }
    return result.data;
  }

  /**
   * Helper method to validate query parameters
   */
  static validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
    const result = schema.safeParse(query);
    if (!result.success) {
      throw new Error(`Query validation error: ${result.error.message}`);
    }
    return result.data;
  }
}
