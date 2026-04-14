/**
 * Flexible AI Column Mapper Service — MAIN ENTRY POINT
 *
 * HIERARCHY:
 *   ai-column-mapper.ts   ← BASE TYPES & single-column analysis
 *   flexible-ai-mapper.ts ← YOU ARE HERE (extends with schema registry + catch-all)
 *   bulk-ai-mapper.ts     ← BATCH WRAPPER (delegates to ai-column-mapper in parallel)
 *
 * Purpose: Enhanced AI-powered column mapping with industry-specific schema support
 *
 * Key Features:
 * - Industry-specific schema detection and mapping
 * - Hybrid approach combining rule-based and AI mapping
 * - Automatic data type inference and validation
 * - Storage strategy optimization (JSON vs attributes)
 * - Multi-language header support
 *
 * Design Decisions:
 * - Rule-based mapping takes precedence for performance and accuracy
 * - AI used only when rules don't provide high confidence
 * - Caching of mapping results to reduce API calls
 * - Batched processing for large datasets
 *
 * @module FlexibleAIMapper
 * @created Initial implementation
 * @updated August 13, 2025 - Refactored for improved performance and modularity
 */

import NodeCache from 'node-cache';
import { getOpenAIClient } from '../utils/openai-client';
import { schemaRegistryService } from './schema-registry-service';
import { AIColumnMappingResult, ColumnAnalysis } from './ai-column-mapper';
import {
  AIOperationLogger,
  DataValidator,
  ServiceOperation,
  PerformanceMonitor
} from '../utils/service-utilities';
import { secureLogger } from '../utils/secure-logger';

// Initialize OpenAI client with centralized configuration
const openai = getOpenAIClient();

export interface FlexibleColumnAnalysis extends ColumnAnalysis {
  targetSystem: 'core' | 'attributes' | 'events' | 'skip'; // Where to store this data
  attributeCategory?: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical';
  suggestedDataSource?: string; // 'music_industry', 'retail_crm', etc.
  transformationRules?: string[]; // Data transformation needed
}

export interface FlexibleAIMappingResult extends AIColumnMappingResult {
  mappings: FlexibleColumnAnalysis[];
  suggestedDataSource?: string;
  dataSourceConfidence?: number;
  flexibilityScore: number; // How well this data fits flexible schema vs fixed schema
  customAttributesCount: number;
  // Enhanced unified storage metrics
  unifiedStorageAnalysis?: {
    jsonStorageOptimal: boolean;
    unmappedFieldsCount: number;
    coreFieldMappingsCount: number;
    preservationPriority: 'high' | 'medium' | 'low'; // Data preservation importance
    migrationComplexity: 'simple' | 'moderate' | 'complex';
    backwardCompatibilityNeeded: boolean;
  };
}

/**
 * Cache configuration and metrics for AI mapping operations
 */
interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalOperations: number;
  cacheSize: number;
  lastCleanup: Date;
}

class FlexibleAIMapper {
  // NodeCache for bounded caching with TTL and size limits
  private mappingCache: NodeCache;
  private cacheMetrics: CacheMetrics;
  private readonly CACHE_KEY_SEPARATOR = '|||';
  private readonly CACHE_TTL = 3600; // 1 hour TTL
  private readonly MAX_CACHE_SIZE = 1000; // Max 1000 cached entries
  private readonly CLEANUP_INTERVAL = 300; // Cleanup every 5 minutes

  constructor() {
    // Initialize NodeCache with bounded settings
    this.mappingCache = new NodeCache({
      stdTTL: this.CACHE_TTL,
      maxKeys: this.MAX_CACHE_SIZE,
      checkperiod: this.CLEANUP_INTERVAL,
      useClones: false, // Performance optimization - return references
      deleteOnExpire: true,
      enableLegacyCallbacks: false
    });

    // Initialize cache metrics
    this.cacheMetrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalOperations: 0,
      cacheSize: 0,
      lastCleanup: new Date()
    };

    // Set up cache event listeners for metrics
    this.mappingCache.on('expired', (key, value) => {
    });

    this.mappingCache.on('del', (key, value) => {
      this.updateCacheMetrics();
    });

    this.mappingCache.on('set', (key, value) => {
      this.updateCacheMetrics();
    });

    // Performance monitoring - log cache stats periodically
    setInterval(() => {
      this.logCachePerformance();
    }, 60000); // Every minute
  }

  /**
   * Update cache metrics for monitoring
   */
  private updateCacheMetrics(): void {
    this.cacheMetrics.cacheSize = this.mappingCache.keys().length;
    this.cacheMetrics.totalOperations = this.cacheMetrics.hits + this.cacheMetrics.misses;
    this.cacheMetrics.hitRate = this.cacheMetrics.totalOperations > 0
      ? (this.cacheMetrics.hits / this.cacheMetrics.totalOperations) * 100
      : 0;
    this.cacheMetrics.lastCleanup = new Date();
  }

  /**
   * Log cache performance metrics
   */
  private logCachePerformance(): void {
    if (this.cacheMetrics.totalOperations > 0) {
      secureLogger.info(`[FlexibleAIMapper] Cache Performance:`, {
        hitRate: `${this.cacheMetrics.hitRate.toFixed(1)}%`,
        hits: this.cacheMetrics.hits,
        misses: this.cacheMetrics.misses,
        cacheSize: this.cacheMetrics.cacheSize,
        maxSize: this.MAX_CACHE_SIZE
      });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStatistics(): CacheMetrics {
    this.updateCacheMetrics();
    return { ...this.cacheMetrics };
  }

  /**
   * Invalidate cache entries (useful for testing or forced refresh)
   */
  public invalidateCache(pattern?: string): number {
    if (pattern) {
      const keys = this.mappingCache.keys().filter(key => key.includes(pattern));
      keys.forEach(key => this.mappingCache.del(key));
      return keys.length;
    } else {
      const keyCount = this.mappingCache.keys().length;
      this.mappingCache.flushAll();
      secureLogger.info('Cache invalidated', { entriesCleared: keyCount }, 'FLEXIBLE_AI_MAPPER');
      return keyCount;
    }
  }

  /**
   * Sanitize column name to prevent XSS, SQL injection, and path traversal attacks
   *
   * @param columnName - Raw column name from user input
   * @returns Sanitized column name safe for processing
   */
  private sanitizeColumnName(columnName: string): string {
    if (!columnName || typeof columnName !== 'string') {
      return '';
    }

    return columnName
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/DROP\s+TABLE/gi, '')
      .replace(/DELETE\s+FROM/gi, '')
      .replace(/INSERT\s+INTO/gi, '')
      .replace(/UPDATE\s+SET/gi, '')
      .replace(/\.\.\//g, '')
      .replace(/[<>'"`;]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Analyze file columns with flexible schema support and performance optimization
   *
   * @param headers - Column headers from the file
   * @param sampleRows - Sample data rows for analysis
   * @param maxSampleSize - Maximum number of rows to analyze
   * @returns Promise<FlexibleAIMappingResult> - Complete mapping analysis
   */
  async analyzeFileColumns(
    headers: string[],
    sampleRows: any[],
    maxSampleSize: number = 100
  ): Promise<FlexibleAIMappingResult> {
    return await ServiceOperation.execute(
      'analyzeFileColumns',
      async () => {
        // Starting Flexible AI column analysis

        // Step 0: Create header mapping (original -> sanitized) to preserve data access
        const headerMapping = headers.map(original => ({
          original,
          sanitized: this.sanitizeColumnName(original)
        }));
        const sanitizedHeaders = headerMapping.map(h => h.sanitized);

        // Step 1: Detect best matching schema (using sanitized names for safety)
        const schemaMatch = await this.detectBestSchema(sanitizedHeaders);

        // Step 2: Get core fields for mapping
        const coreFields = this.getCoreCustomerFields();

        // Step 3: Analyze columns in parallel with both original and sanitized names
        const columnAnalyses = await this.analyzeColumnsInParallel(
          headerMapping,
          sampleRows,
          coreFields,
          schemaMatch?.schema
        );

        // Step 4: Calculate metrics and generate result
        return this.generateMappingResult(columnAnalyses, schemaMatch);
      }
    ).then(result => result.data!);
  }

  /**
   * Detect best matching schema for the given headers (public method)
   */
  async detectSchemaPattern(headers: string[]): Promise<{ schema: any; confidence: number } | null> {
    return this.detectBestSchema(headers);
  }

  /**
   * Detect best matching schema for the given headers.
   * If no predefined schema matches with sufficient confidence,
   * returns null — callers should consider using
   * schemaRegistryService.generateSchemaFromSample() for unknown data.
   */
  private async detectBestSchema(headers: string[]) {
    const schemaMatch = await schemaRegistryService.suggestSchema(headers);

    if (schemaMatch) {
      await AIOperationLogger.logStart('schema_detection', undefined, {
        schema: schemaMatch.schema.displayName,
        confidence: schemaMatch.confidence
      });
    }

    // Schema suggestion analysis completed

    return schemaMatch;
  }

  /**
   * Analyze columns in parallel for better performance
   */
  private async analyzeColumnsInParallel(
    headerMapping: Array<{original: string; sanitized: string}>,
    sampleRows: any[],
    coreFields: string[],
    schema?: any
  ): Promise<FlexibleColumnAnalysis[]> {
    const analysisPromises = headerMapping.map(async ({original, sanitized}) => {
      // Analyzing column

      // Check cache first (use sanitized name for cache key)
      const cacheKey = this.generateCacheKey(sanitized, schema?.sourceName);
      const cached = this.mappingCache.get<FlexibleColumnAnalysis>(cacheKey);
      if (cached) {
        // Cache hit - using cached mapping
        this.cacheMetrics.hits++;
        return cached;
      }

      // Cache miss - proceed with AI analysis
      this.cacheMetrics.misses++;

      const startTime = Date.now();

      // CRITICAL: Use original name to access data from sampleRows
      const columnData = sampleRows
        .map(row => row[original])
        .filter(val => val !== null && val !== undefined);

      // Use sanitized name for analysis/display
      const analysis = await this.analyzeColumnFlexible(
        sanitized,
        columnData,
        coreFields,
        schema
      );

      const duration = Date.now() - startTime;

      // Cache the result with performance logging (use sanitized name)
      const success = this.mappingCache.set(cacheKey, analysis);
      if (success) {
        secureLogger.info(`[FlexibleAIMapper] Cached analysis for column: ${sanitized} (${duration}ms)`);
      } else {
        secureLogger.warn(`[FlexibleAIMapper] Failed to cache analysis for column: ${sanitized}`);
      }

      return analysis;
    });

    return await Promise.all(analysisPromises);
  }

  /**
   * Generate complete mapping result with metrics and recommendations
   */
  private generateMappingResult(
    columnAnalyses: FlexibleColumnAnalysis[],
    schemaMatch: any
  ): FlexibleAIMappingResult {
    // Calculate overall metrics
    const overallConfidence = Math.round(
      columnAnalyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / columnAnalyses.length
    );

    const customAttributesCount = columnAnalyses.filter(a => a.targetSystem === 'attributes').length;
    const coreFieldMappingsCount = columnAnalyses.filter(a => a.targetSystem === 'core').length;
    const unmappedFieldsCount = columnAnalyses.filter(a => a.targetSystem !== 'core' && a.targetSystem !== 'skip').length;

    // Enhanced unified storage analysis
    const unifiedStorageAnalysis = {
      jsonStorageOptimal: unmappedFieldsCount > customAttributesCount,
      unmappedFieldsCount,
      coreFieldMappingsCount,
      preservationPriority: unmappedFieldsCount > 5 ? 'high' as const :
                          unmappedFieldsCount > 2 ? 'medium' as const : 'low' as const,
      migrationComplexity: customAttributesCount > 10 ? 'complex' as const :
                          customAttributesCount > 5 ? 'moderate' as const : 'simple' as const,
      backwardCompatibilityNeeded: customAttributesCount > 0
    };

    // Storage recommendations for unified approach
    const storageRecommendations = {
      coreFieldMappings: coreFieldMappingsCount,
      jsonStorageFields: unmappedFieldsCount,
      customAttributeFields: customAttributesCount,
      skipFields: columnAnalyses.filter(a => a.targetSystem === 'skip').length,
      optimalStorageStrategy: unmappedFieldsCount > customAttributesCount ? 'json_primary' as const :
                             customAttributesCount > unmappedFieldsCount ? 'attributes_primary' as const : 'hybrid' as const,
      confidenceDistribution: {
        high: columnAnalyses.filter(a => a.confidence > 80).length,
        medium: columnAnalyses.filter(a => a.confidence >= 50 && a.confidence <= 80).length,
        low: columnAnalyses.filter(a => a.confidence < 50).length
      }
    };
    const coreFieldsCount = columnAnalyses.filter(a => a.targetSystem === 'core').length;

    const flexibilityScore = Math.round((customAttributesCount / columnAnalyses.length) * 100);

    const result: FlexibleAIMappingResult = {
      mappings: columnAnalyses,
      overallConfidence,
      unifiedStorageAnalysis,
      storageRecommendations,
      suggestedExclusions: columnAnalyses.filter(a => a.shouldExclude).map(a => a.columnName),
      processingNotes: [
        `Analyzed ${columnAnalyses.length} columns`,
        `Mapped ${coreFieldsCount} to core fields, ${customAttributesCount} to custom attributes`,
        `Storage strategy: ${storageRecommendations.optimalStorageStrategy}`,
        `JSON storage optimal: ${unifiedStorageAnalysis.jsonStorageOptimal ? 'Yes' : 'No'}`,
        schemaMatch ? `Detected ${schemaMatch.schema.displayName} data source` : 'No specific data source detected',
        `Flexibility score: ${flexibilityScore}%`
      ],
      estimatedAccuracy: this.calculateAccuracy(columnAnalyses),
      recommendedActions: this.generateRecommendations(columnAnalyses, schemaMatch, unifiedStorageAnalysis),
      suggestedDataSource: schemaMatch?.schema.sourceName,
      dataSourceConfidence: schemaMatch?.confidence,
      flexibilityScore,
      customAttributesCount,
    };

    // Flexible AI analysis complete

    return result;
  }

  /**
   * Generate cache key for column mapping
   */
  private generateCacheKey(header: string, schemaName?: string): string {
    return `${header}${this.CACHE_KEY_SEPARATOR}${schemaName || 'default'}`;
  }

  /**
   * Analyze a single column with flexible schema context
   */
  private async analyzeColumnFlexible(
    columnName: string,
    columnData: any[],
    coreFields: any[],
    suggestedSchema?: any
  ): Promise<FlexibleColumnAnalysis> {
    const patterns = this.analyzeDataPatterns(columnData);

    // Create AI analysis prompt with flexible context
    const prompt = this.createFlexibleAnalysisPrompt(
      columnName,
      patterns,
      coreFields,
      suggestedSchema
    );

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert data analyst specializing in flexible customer data platform mapping. Analyze column data and provide mapping suggestions for both core customer fields and custom attributes."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const aiAnalysis = JSON.parse(response.choices[0].message.content || '{}');

      return {
        columnName,
        originalName: columnName,
        suggestedField: aiAnalysis.suggestedField || null,
        confidence: Math.min(100, Math.max(0, aiAnalysis.confidence || 50)),
        dataType: aiAnalysis.dataType || 'text',
        patterns,
        reasoning: aiAnalysis.reasoning || 'No specific reasoning provided',
        warnings: aiAnalysis.warnings || [],
        shouldExclude: aiAnalysis.shouldExclude || false,
        exclusionReason: aiAnalysis.exclusionReason,
        // Flexible extensions
        targetSystem: aiAnalysis.targetSystem || 'attributes',
        attributeCategory: aiAnalysis.attributeCategory,
        suggestedDataSource: aiAnalysis.suggestedDataSource,
        transformationRules: aiAnalysis.transformationRules || [],
      };
    } catch (error) {
      secureLogger.error(`Failed to analyze column ${columnName}:`, { error: String(error) });

      // Fallback analysis
      return this.createFallbackAnalysis(columnName, patterns, coreFields);
    }
  }

  /**
   * Create AI analysis prompt with flexible schema context
   */
  private createFlexibleAnalysisPrompt(
    columnName: string,
    patterns: any,
    coreFields: any[],
    suggestedSchema?: any
  ): string {
    const schemaContext = suggestedSchema ? `
Data Source Context: ${suggestedSchema.displayName}
Industry: ${suggestedSchema.description}
Available Custom Fields: ${Object.keys(suggestedSchema.fieldDefinitions || {}).join(', ')}
Mapping Templates: ${JSON.stringify(suggestedSchema.mappingTemplates || {}, null, 2)}
` : '';

    return `
Analyze this data column for flexible customer data platform mapping:

Column Name: "${columnName}"
Data Patterns: ${JSON.stringify(patterns, null, 2)}

Core Customer Fields Available:
${coreFields.map(f => `- ${f.name}: ${f.description}`).join('\n')}

${schemaContext}

Please provide analysis in this JSON format:
{
  "suggestedField": "field_name or null",
  "confidence": 85,
  "dataType": "text|number|date|boolean|array|object|email|phone",
  "targetSystem": "core|attributes|events",
  "attributeCategory": "demographics|preferences|behaviors|engagement|technical",
  "suggestedDataSource": "data_source_name or null",
  "reasoning": "Detailed explanation of mapping decision",
  "warnings": ["Any data quality or mapping concerns"],
  "shouldExclude": false,
  "exclusionReason": "Reason if should exclude",
  "transformationRules": ["Any data transformations needed"]
}

Guidelines:
1. Map to "core" fields (firstName, lastName, email, phoneNumber, etc.) when data clearly matches
2. Map to "attributes" for industry-specific or custom data that doesn't fit core schema
3. Use "events" for time-series or activity data
4. NEVER use "skip" — all data must be preserved. Unknown fields go to "attributes" as dynamic_attributes
5. Consider data source context when available
6. Provide high confidence (80+) for clear matches, lower for ambiguous data
7. Include transformation rules for data that needs cleaning or conversion
`;
  }

  /**
   * Get core customer fields definition
   */
  private getCoreCustomerFields(): any[] {
    return [
      {
        name: 'firstName',
        description: 'Customer first name. Recognizes: firstName, first_name, firstname, fname, given_name, nome, name, nama_depan, first',
        type: 'text',
        aliases: ['firstName', 'first_name', 'firstname', 'fname', 'given_name', 'nome', 'name', 'nama_depan', 'first']
      },
      {
        name: 'lastName',
        description: 'Customer last name. Recognizes: lastName, last_name, lastname, lname, surname, family_name, sobrenome, apellido, nama_belakang, last',
        type: 'text',
        aliases: ['lastName', 'last_name', 'lastname', 'lname', 'surname', 'family_name', 'sobrenome', 'apellido', 'nama_belakang', 'last']
      },
      {
        name: 'email',
        description: 'Customer email address. Recognizes: email, email_address, email_addr, e_mail, mail, e-mail, correio, email_id',
        type: 'email',
        aliases: ['email', 'email_address', 'email_addr', 'e_mail', 'mail', 'e-mail', 'correio', 'email_id']
      },
      {
        name: 'phoneNumber',
        description: 'Customer phone number. Recognizes: phoneNumber, phone, phone_number, phonenumber, telephone, mobile, cell, telefone, celular, no_telepon, contact, whatsapp',
        type: 'phone',
        aliases: ['phoneNumber', 'phone', 'phone_number', 'phonenumber', 'telephone', 'mobile', 'cell', 'telefone', 'celular', 'no_telepon', 'contact', 'whatsapp']
      },
      {
        name: 'dateOfBirth',
        description: 'Customer birth date. Recognizes: dateOfBirth, dob, birth_date, dateofbirth, birthday, date_of_birth, data_nascimento, fecha_nacimiento, tanggal_lahir',
        type: 'date',
        aliases: ['dateOfBirth', 'dob', 'birth_date', 'dateofbirth', 'birthday', 'date_of_birth', 'data_nascimento', 'fecha_nacimiento', 'tanggal_lahir']
      },
      {
        name: 'gender',
        description: 'Customer gender. Recognizes: gender, sex, sexo, genre, jenis_kelamin, genero',
        type: 'text',
        aliases: ['gender', 'sex', 'sexo', 'genre', 'jenis_kelamin', 'genero']
      },
      {
        name: 'currentAddress',
        description: 'Customer current address. Recognizes: currentAddress, address, current_address, currentaddress, location, endereco, direccion, alamat, residence',
        type: 'object',
        aliases: ['currentAddress', 'address', 'current_address', 'currentaddress', 'location', 'endereco', 'direccion', 'alamat', 'residence']
      },
      {
        name: 'customerSegment',
        description: 'Customer segment. Recognizes: customerSegment, segment, customer_segment, customersegment, category, type, categoria, segmento, kategori, grupo, group, listener_type, audience_type',
        type: 'text',
        aliases: ['customerSegment', 'segment', 'customer_segment', 'customersegment', 'category', 'type', 'categoria', 'segmento', 'kategori', 'grupo', 'group', 'listener_type', 'audience_type']
      },
    ];
  }

  /**
   * Analyze data patterns in column values
   */
  private analyzeDataPatterns(columnData: any[]): any {
    const nonEmptyData = columnData.filter(val => val !== null && val !== undefined && val !== '');

    if (nonEmptyData.length === 0) {
      return {
        format: 'empty',
        examples: [],
        uniqueValues: 0,
        nullCount: columnData.length,
        avgLength: 0
      };
    }

    const examples = nonEmptyData.slice(0, 3).map(val => String(val));
    const uniqueValues = new Set(nonEmptyData.map(val => String(val))).size;
    const avgLength = nonEmptyData.reduce((sum, val) => sum + String(val).length, 0) / nonEmptyData.length;

    // Detect data format
    let format = 'text';
    const sampleValue = String(nonEmptyData[0]);

    if (/^\d+$/.test(sampleValue)) format = 'number';
    else if (/^[\d.]+$/.test(sampleValue)) format = 'decimal';
    else if (/\S+@\S+\.\S+/.test(sampleValue)) format = 'email';
    else if (/^\+?[\d\s\-()]+$/.test(sampleValue)) format = 'phone';
    else if (/^\d{4}-\d{2}-\d{2}/.test(sampleValue)) format = 'date';
    else if (/^(true|false)$/i.test(sampleValue)) format = 'boolean';
    else if (sampleValue.startsWith('[') || sampleValue.startsWith('{')) format = 'json';

    return {
      format,
      examples,
      uniqueValues,
      nullCount: columnData.length - nonEmptyData.length,
      avgLength: Math.round(avgLength)
    };
  }

  /**
   * Create fallback analysis when AI fails.
   *
   * Catch-all mode: fields that don't match core schema are ALWAYS stored
   * as 'attributes' (never skipped), ensuring zero data loss. Unrecognized
   * fields go to dynamic_attributes/custom attributes storage.
   */
  private createFallbackAnalysis(
    columnName: string,
    patterns: any,
    coreFields: any[]
  ): FlexibleColumnAnalysis {
    // Simple rule-based fallback
    const lowerName = columnName.toLowerCase();
    let suggestedField = null;
    let targetSystem: 'core' | 'attributes' | 'events' | 'skip' = 'attributes';
    let confidence = 30;
    let attributeCategory: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical' = 'technical';

    // Check for core field matches using comprehensive aliases
    for (const field of coreFields) {
      const fieldAliases = field.aliases || [field.name.toLowerCase()];
      const isMatch = fieldAliases.some((alias: string) =>
        lowerName.includes(alias.toLowerCase()) ||
        alias.toLowerCase().includes(lowerName)
      );

      if (isMatch) {
        suggestedField = field.name;
        targetSystem = 'core';
        confidence = 65;
        break;
      }
    }

    // Catch-all: if not core, store as attributes (never skip unknown data)
    // Infer category from data patterns
    if (targetSystem === 'attributes') {
      if (patterns.format === 'email' || patterns.format === 'phone') {
        attributeCategory = 'demographics';
      } else if (patterns.format === 'date') {
        attributeCategory = 'behaviors';
      } else if (patterns.format === 'boolean') {
        attributeCategory = 'preferences';
      } else if (patterns.format === 'number' || patterns.format === 'decimal') {
        attributeCategory = 'engagement';
      }
    }

    return {
      columnName,
      originalName: columnName,
      suggestedField,
      confidence,
      dataType: patterns.format as any,
      patterns,
      reasoning: targetSystem === 'core'
        ? 'Fallback rule-based analysis matched core field'
        : 'Catch-all: stored as dynamic attribute to preserve data (zero data loss policy)',
      warnings: ['AI analysis failed, using rule-based mapping with catch-all preservation'],
      shouldExclude: false,
      targetSystem,
      attributeCategory,
      transformationRules: [],
    };
  }

  /**
   * Calculate overall accuracy estimate
   */
  private calculateAccuracy(analyses: FlexibleColumnAnalysis[]): number {
    const totalConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0);
    const avgConfidence = totalConfidence / analyses.length;

    // Factor in exclusions and warnings
    const exclusions = analyses.filter(a => a.shouldExclude).length;
    const warnings = analyses.reduce((sum, a) => sum + a.warnings.length, 0);

    const penalty = (exclusions * 10) + (warnings * 2);
    return Math.max(0, Math.round(avgConfidence - penalty));
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    analyses: FlexibleColumnAnalysis[],
    schemaMatch?: any,
    unifiedStorageAnalysis?: any
  ): string[] {
    const recommendations = [];

    const lowConfidenceFields = analyses.filter(a => a.confidence < 70);
    if (lowConfidenceFields.length > 0) {
      recommendations.push(
        `Review ${lowConfidenceFields.length} low-confidence mappings: ${lowConfidenceFields.map(a => a.columnName).join(', ')}`
      );
    }

    const customAttributesCount = analyses.filter(a => a.targetSystem === 'attributes').length;
    if (customAttributesCount > 0) {
      recommendations.push(
        `${customAttributesCount} fields will be stored as flexible custom attributes`
      );
    }

    if (schemaMatch && schemaMatch.confidence < 80) {
      recommendations.push(
        `Consider verifying data source detection - ${schemaMatch.schema.displayName} suggested with ${schemaMatch.confidence}% confidence`
      );
    }

    const transformationsNeeded = analyses.filter(a => a.transformationRules && a.transformationRules.length > 0).length;
    if (transformationsNeeded > 0) {
      recommendations.push(
        `${transformationsNeeded} fields require data transformation before import`
      );
    }

    // Add unified storage recommendations
    if (unifiedStorageAnalysis?.jsonStorageOptimal) {
      recommendations.push(
        'Consider using JSON storage for unmapped fields to preserve data flexibility'
      );
    }

    return recommendations;
  }
}

export const flexibleAIMapper = new FlexibleAIMapper();
