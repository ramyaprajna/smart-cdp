/**
 * AI-Powered Column Mapping Service
 *
 * Purpose: Intelligent file column analysis and mapping using AI
 *
 * Key Features:
 * - Content pattern analysis for data type detection
 * - Semantic understanding of column names
 * - Confidence scoring for mapping accuracy
 * - Intelligent field exclusion logic
 * - Batch processing optimization
 * - JSON storage recommendations
 *
 * Design Decisions:
 * - Uses GPT-4o for advanced semantic understanding
 * - Implements caching for frequently mapped columns
 * - Provides detailed reasoning for each mapping
 * - Supports hybrid storage strategies
 *
 * @module AIColumnMapper
 * @created July 23, 2025
 * @updated August 13, 2025 - Refactored for improved error handling and performance
 */

import { getOpenAIClient } from '../utils/openai-client';
import { OpenAIPromptBuilder } from '../utils/openai-prompt-builder';
import { DataAnalysisHelpers } from '../utils/data-analysis-helpers';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  AIOperationLogger,
  PerformanceMonitor
} from '../utils/service-utilities';

// Use centralized OpenAI client with proper validation
const openai = getOpenAIClient();

/**
 * Column analysis result with AI insights
 */
export interface ColumnAnalysis {
  columnName: string;
  originalName: string;
  suggestedField: string | null;
  confidence: number; // 0-100
  dataType: 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean' | 'json' | 'uuid';
  patterns: {
    format: string;
    examples: string[];
    uniqueValues: number;
    nullCount: number;
    avgLength: number;
  };
  reasoning: string;
  warnings: string[];
  shouldExclude: boolean;
  exclusionReason?: string;
  // Enhanced JSON storage support
  jsonStorageRecommendation?: {
    preferJsonStorage: boolean; // Recommend storing as JSON vs traditional attributes
    preserveOriginalStructure: boolean; // Maintain original data format
    confidenceThreshold: number; // Min confidence for core field mapping
  };
  customAttributeSuggestion?: {
    shouldCreate: boolean;
    attributeName: string;
    category: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical';
  };
}

/**
 * AI mapping result for entire file
 */
export interface AIColumnMappingResult {
  mappings: ColumnAnalysis[];
  overallConfidence: number;
  suggestedExclusions: string[];
  processingNotes: string[];
  estimatedAccuracy: number;
  recommendedActions: string[];
  // Enhanced JSON storage analytics
  storageRecommendations?: {
    coreFieldMappings: number;
    jsonStorageFields: number;
    customAttributeFields: number;
    skipFields: number;
    optimalStorageStrategy: 'json_primary' | 'attributes_primary' | 'hybrid';
    confidenceDistribution: {
      high: number; // >80% confidence
      medium: number; // 50-80% confidence
      low: number; // <50% confidence
    };
  };
}

/**
 * Database schema information for AI context
 */
interface DatabaseSchema {
  tableName: string;
  fields: {
    name: string;
    type: string;
    description: string;
    required: boolean;
    examples: string[];
  }[];
}

export class AIColumnMapper {
  private databaseSchema: DatabaseSchema[] = [];

  constructor() {
    this.initializeDatabaseSchema();
  }

  /**
   * Initialize database schema information for AI context
   */
  private initializeDatabaseSchema() {
    // Define our database schema for AI understanding
    this.databaseSchema = [
      {
        tableName: 'customers',
        fields: [
          {
            name: 'firstName',
            type: 'text',
            description: 'Customer first name or given name. Recognizes variations: firstName, first_name, firstname, fname, given_name, nome, name, nama_depan, first',
            required: false,
            examples: ['John', 'Sarah', 'Ahmad', 'Siti']
          },
          {
            name: 'lastName',
            type: 'text',
            description: 'Customer last name, family name, or surname. Recognizes variations: lastName, last_name, lastname, lname, surname, family_name, sobrenome, apellido, nama_belakang, last',
            required: false,
            examples: ['Smith', 'Johnson', 'Santoso', 'Rahayu']
          },
          {
            name: 'email',
            type: 'email',
            description: 'Customer email address (unique). Recognizes variations: email, email_address, email_addr, e_mail, mail, e-mail, correio, email_id',
            required: false,
            examples: ['john@example.com', 'sarah.smith@gmail.com']
          },
          {
            name: 'phoneNumber',
            type: 'phone',
            description: 'Customer phone number in any format. Recognizes variations: phoneNumber, phone, phone_number, phonenumber, telephone, mobile, cell, telefone, celular, no_telepon, contact, whatsapp',
            required: false,
            examples: ['+62-21-123456', '(555) 123-4567', '08123456789']
          },
          {
            name: 'dateOfBirth',
            type: 'date',
            description: 'Customer date of birth. Recognizes variations: dateOfBirth, dob, birth_date, dateofbirth, birthday, date_of_birth, data_nascimento, fecha_nacimiento, tanggal_lahir',
            required: false,
            examples: ['1990-05-15', '15/05/1990', 'May 15, 1990']
          },
          {
            name: 'gender',
            type: 'text',
            description: 'Customer gender. Recognizes variations: gender, sex, sexo, genre, jenis_kelamin, genero',
            required: false,
            examples: ['Male', 'Female', 'M', 'F', 'Laki-laki', 'Perempuan']
          },
          {
            name: 'customerSegment',
            type: 'text',
            description: 'Customer business or demographic segment. Recognizes variations: customerSegment, segment, customer_segment, customersegment, category, type, categoria, segmento, kategori, grupo, group, listener_type, audience_type',
            required: false,
            examples: ['Professional', 'Student', 'Entrepreneur', 'Regular Listener']
          },
          {
            name: 'lifetimeValue',
            type: 'number',
            description: 'Customer lifetime value in currency',
            required: false,
            examples: ['1250.50', '$1,250.50', 'Rp 1.250.500']
          },
          {
            name: 'currentAddress',
            type: 'json',
            description: 'Customer address information. Recognizes variations: currentAddress, address, current_address, currentaddress, location, endereco, direccion, alamat, residence',
            required: false,
            examples: ['Jakarta, Indonesia', '123 Main St, Jakarta', '{city: "Jakarta", country: "Indonesia"}']
          },
          {
            name: 'lifetimeValue',
            type: 'number',
            description: 'Customer lifetime value in currency. Recognizes variations: lifetimeValue, ltv, lifetime_value, lifetimevalue, customer_value, total_value, valor_total, nilai_pelanggan',
            required: false,
            examples: ['1250.50', '$1,250.50', 'Rp 1.250.500']
          }
        ]
      }
    ];
  }

  /**
   * Analyze sample data from each column using AI (refactored for maintainability)
   */
  private async analyzeColumnData(
    columnName: string,
    sampleData: any[],
    allHeaders: string[]
  ): Promise<ColumnAnalysis> {
    try {
      const samples = this.prepareSampleData(sampleData);

      if (samples.length === 0) {
        return this.createEmptyColumnAnalysis(columnName);
      }

      const patterns = DataAnalysisHelpers.calculateDataPatterns(sampleData);
      const aiResult = await this.getAIAnalysis(columnName, samples, patterns, allHeaders);

      return this.buildColumnAnalysis(columnName, patterns, aiResult);

    } catch (error) {
      secureLogger.error(`AI analysis failed for column "${columnName}":`, { error: String(error) });
      return this.createFallbackAnalysis(columnName, sampleData);
    }
  }

  /**
   * Prepare sample data for analysis
   */
  private prepareSampleData(sampleData: any[]): string[] {
    return sampleData
      .filter(val => val != null && val !== '')
      .slice(0, 20)
      .map(val => String(val).trim());
  }

  /**
   * Get AI analysis using the prompt builder utility
   */
  private async getAIAnalysis(
    columnName: string,
    samples: string[],
    patterns: any,
    allHeaders: string[]
  ) {
    try {
      const messages = [
        {
          role: "system" as const,
          content: OpenAIPromptBuilder.createAnalysisSystemPrompt()
        },
        {
          role: "user" as const,
          content: OpenAIPromptBuilder.createColumnAnalysisPrompt(
            { columnName, samples, patterns, headers: allHeaders },
            this.getCoreFields()
          )
        }
      ];

      const response = await OpenAIPromptBuilder.executeCompletion(messages);
      return OpenAIPromptBuilder.parseResponse(response, {});
    } catch (error) {
      secureLogger.error(`[AI Column Mapper] OpenAI API call failed for column "${columnName}":`, { error: String(error) });
      
      // Return fallback analysis for API failures
      return {
        suggestedField: null,
        confidence: 0,
        dataType: 'text',
        reasoning: 'AI analysis failed, using basic pattern detection',
        warnings: ['OpenAI API unavailable - using pattern-based analysis'],
        shouldExclude: false,
        exclusionReason: null,
        customAttributeSuggestion: {
          shouldCreate: true,
          attributeName: columnName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          category: 'technical'
        }
      };
    }
  }

  /**
   * Build the final column analysis result
   */
  private buildColumnAnalysis(
    columnName: string,
    patterns: any,
    aiResult: any
  ): ColumnAnalysis {
    return {
      columnName,
      originalName: columnName,
      suggestedField: aiResult.suggestedField || null,
      confidence: Math.max(0, Math.min(100, aiResult.confidence || 0)),
      dataType: this.validateDataType(aiResult.dataType || 'text'),
      patterns: this.convertToLegacyPatternFormat(patterns),
      reasoning: aiResult.reasoning || 'AI analysis completed',
      warnings: Array.isArray(aiResult.warnings) ? aiResult.warnings : [],
      shouldExclude: Boolean(aiResult.shouldExclude),
      exclusionReason: aiResult.exclusionReason,
      customAttributeSuggestion: aiResult.customAttributeSuggestion
    };
  }

  /**
   * Convert new pattern format to legacy format for compatibility
   */
  private convertToLegacyPatternFormat(patterns: any) {
    return {
      format: patterns.patterns.length > 0 ? patterns.patterns[0] : 'text',
      examples: [], // Will be filled by calling code if needed
      uniqueValues: patterns.uniqueValues,
      nullCount: patterns.nullCount,
      avgLength: Math.round(patterns.avgLength)
    };
  }

  /**
   * Get core fields for AI analysis
   */
  private getCoreFields() {
    return this.databaseSchema[0].fields;
  }

  /**
   * Create system prompt for AI analysis
   */
  private getSystemPrompt(): string {
    return `You are an expert data analyst specializing in customer data mapping for a Customer Data Platform (CDP). Your task is to analyze column data and suggest the best database field mapping.

Available Database Fields:
${JSON.stringify(this.databaseSchema, null, 2)}

Your analysis should:
1. Examine data patterns, formats, and content
2. Consider semantic meaning of column names
3. Suggest the most appropriate database field mapping
4. Provide confidence score (0-100)
5. Identify potential data quality issues
6. IMPORTANT: Never exclude data that could be valuable as custom attributes

Always respond with valid JSON in this exact format:
{
  "suggestedField": "fieldName" or null,
  "confidence": number (0-100),
  "dataType": "text|email|phone|date|number|boolean|json|uuid",
  "reasoning": "explanation of mapping decision",
  "warnings": ["array of potential issues"],
  "shouldExclude": boolean,
  "exclusionReason": "reason if excluded",
  "customAttributeSuggestion": {
    "shouldCreate": boolean,
    "attributeName": "suggested_name",
    "category": "demographics|preferences|behaviors|engagement|technical"
  }
}

Key Rules:
- Only suggest existing fields if they truly match the data
- For valuable data that doesn't match existing fields (like social media handles, preferences, etc.), suggest creating custom attributes
- Only exclude truly problematic data (corrupted, security risks, etc.)
- Consider cultural context (Indonesian names, phone formats, etc.)
- Prioritize data retention through custom attributes over exclusion`;
  }

  /**
   * Create detailed analysis prompt for specific column
   */
  private createAnalysisPrompt(
    columnName: string,
    samples: string[],
    patterns: any,
    allHeaders: string[]
  ): string {
    return `Analyze this column data for customer import mapping:

Column Name: "${columnName}"
File Headers Context: ${allHeaders.join(', ')}

Sample Data (${samples.length} samples):
${samples.map((sample, i) => `${i + 1}. "${sample}"`).join('\n')}

Data Patterns:
- Unique Values: ${patterns.uniqueValues}
- Average Length: ${patterns.avgLength} characters
- Null/Empty Count: ${patterns.nullCount}
- Detected Format: ${patterns.format}

Please analyze this data and suggest the best database field mapping. Consider:
1. What type of customer information does this represent?
2. Which database field best matches this data?
3. Are there any data quality concerns?
4. Should this column be excluded from import?

Focus on accuracy and data integrity. If the data doesn't clearly match any database field, suggest creating a custom attribute for valuable data.`;
  }

  /**
   * Calculate basic data patterns for a column (legacy method, now uses DataAnalysisHelpers)
   * @deprecated Use DataAnalysisHelpers.calculateDataPatterns instead
   */
  private calculateDataPatterns(samples: string[]) {
    // Delegate to the new helper utility
    const patterns = DataAnalysisHelpers.calculateDataPatterns(samples);

    // Convert to legacy format for backward compatibility
    return {
      format: patterns.patterns.length > 0 ? patterns.patterns[0] : 'text',
      examples: samples.slice(0, 3),
      uniqueValues: patterns.uniqueValues,
      nullCount: patterns.nullCount,
      avgLength: Math.round(patterns.avgLength)
    };
  }

  /**
   * Detect basic data format patterns
   */
  private detectFormat(samples: string[]): string {
    if (samples.length === 0) return 'empty';

    // Email pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (samples.some(s => emailPattern.test(s))) return 'email';

    // Phone pattern (various formats)
    const phonePattern = /^[\+]?[\d\s\-\(\)]{7,20}$/;
    if (samples.some(s => phonePattern.test(s))) return 'phone';

    // Date patterns
    const datePattern = /^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}$/;
    if (samples.some(s => datePattern.test(s))) return 'date';

    // Number pattern
    if (samples.every(s => !isNaN(Number(s.replace(/[,$\s]/g, ''))))) return 'number';

    // UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (samples.some(s => uuidPattern.test(s))) return 'uuid';

    return 'text';
  }

  /**
   * Validate and normalize data type
   */
  private validateDataType(dataType: string): ColumnAnalysis['dataType'] {
    const validTypes: ColumnAnalysis['dataType'][] = [
      'text', 'email', 'phone', 'date', 'number', 'boolean', 'json', 'uuid'
    ];

    return validTypes.includes(dataType as any) ? dataType as any : 'text';
  }

  /**
   * Create analysis for empty/null columns
   */
  private createEmptyColumnAnalysis(columnName: string): ColumnAnalysis {
    return {
      columnName,
      originalName: columnName,
      suggestedField: null,
      confidence: 0,
      dataType: 'text',
      patterns: {
        format: 'empty',
        examples: [],
        uniqueValues: 0,
        nullCount: 1,
        avgLength: 0
      },
      reasoning: 'Column contains no valid data',
      warnings: ['Column is empty or contains only null values'],
      shouldExclude: true,
      exclusionReason: 'No valid data found'
    };
  }

  /**
   * Create fallback analysis when AI fails
   */
  private createFallbackAnalysis(columnName: string, sampleData: any[]): ColumnAnalysis {
    const samples = sampleData.filter(val => val != null && val !== '');
    const patterns = this.calculateDataPatterns(samples.map(s => String(s)));

    // Simple rule-based mapping as fallback
    let suggestedField: string | null = null;
    let confidence = 50;

    const lowerName = columnName.toLowerCase();

    if (lowerName.includes('email') || lowerName.includes('e-mail')) {
      suggestedField = 'email';
      confidence = 80;
    } else if (lowerName.includes('phone') || lowerName.includes('telp')) {
      suggestedField = 'phoneNumber';
      confidence = 80;
    } else if (lowerName.includes('name') || lowerName.includes('nama')) {
      suggestedField = lowerName.includes('first') || lowerName.includes('depan') ? 'firstName' : 'lastName';
      confidence = 70;
    } else if (lowerName.includes('birth') || lowerName.includes('lahir')) {
      suggestedField = 'dateOfBirth';
      confidence = 70;
    } else if (lowerName.includes('gender') || lowerName.includes('kelamin')) {
      suggestedField = 'gender';
      confidence = 70;
    }

    return {
      columnName,
      originalName: columnName,
      suggestedField,
      confidence,
      dataType: patterns.format as any || 'text',
      patterns,
      reasoning: 'Fallback rule-based analysis (AI unavailable)',
      warnings: ['AI analysis failed, using basic pattern matching'],
      shouldExclude: patterns.format === 'uuid' && !suggestedField,
      exclusionReason: patterns.format === 'uuid' ? 'UUID format incompatible with customer fields' : undefined
    };
  }

  /**
   * Main method: Analyze entire file and suggest column mappings
   */
  async analyzeFileColumns(
    headers: string[],
    rows: any[],
    maxSampleSize: number = 100
  ): Promise<AIColumnMappingResult> {
    try {
      secureLogger.info(`🤖 Starting AI column analysis for ${headers.length} columns with ${rows.length} rows`);

      // Limit sample size for performance
      const sampleRows = rows.slice(0, maxSampleSize);
      const mappings: ColumnAnalysis[] = [];

      // Analyze each column with AI
      for (const header of headers) {

        // Extract sample data for this column
        const columnData = sampleRows
          .map(row => row[header])
          .filter(val => val !== undefined);

        const analysis = await this.analyzeColumnData(header, columnData, headers);
        mappings.push(analysis);

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Calculate overall metrics
      const overallConfidence = this.calculateOverallConfidence(mappings);
      const suggestedExclusions = mappings
        .filter(m => m.shouldExclude)
        .map(m => m.columnName);

      const result: AIColumnMappingResult = {
        mappings,
        overallConfidence,
        suggestedExclusions,
        processingNotes: this.generateProcessingNotes(mappings),
        estimatedAccuracy: this.estimateAccuracy(mappings),
        recommendedActions: this.generateRecommendations(mappings)
      };

      return result;

    } catch (error) {
      secureLogger.error('AI column mapping failed:', { error: String(error) });
      throw new Error(`AI column mapping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(mappings: ColumnAnalysis[]): number {
    const validMappings = mappings.filter(m => m.suggestedField && !m.shouldExclude);

    if (validMappings.length === 0) return 0;

    const avgConfidence = validMappings.reduce((sum, m) => sum + m.confidence, 0) / validMappings.length;
    return Math.round(avgConfidence);
  }

  /**
   * Estimate mapping accuracy
   */
  private estimateAccuracy(mappings: ColumnAnalysis[]): number {
    const highConfidenceMappings = mappings.filter(m => m.confidence > 80 && !m.shouldExclude);
    const totalMappings = mappings.filter(m => !m.shouldExclude);

    if (totalMappings.length === 0) return 0;

    return Math.round((highConfidenceMappings.length / totalMappings.length) * 100);
  }

  /**
   * Generate processing notes
   */
  private generateProcessingNotes(mappings: ColumnAnalysis[]): string[] {
    const notes: string[] = [];

    const excludedCount = mappings.filter(m => m.shouldExclude).length;
    const mappedCount = mappings.filter(m => m.suggestedField && !m.shouldExclude).length;

    notes.push(`Analyzed ${mappings.length} columns`);
    notes.push(`Successfully mapped ${mappedCount} columns to database fields`);

    if (excludedCount > 0) {
      notes.push(`Excluded ${excludedCount} incompatible columns`);
    }

    const warningCount = mappings.reduce((sum, m) => sum + m.warnings.length, 0);
    if (warningCount > 0) {
      notes.push(`Generated ${warningCount} data quality warnings`);
    }

    return notes;
  }

  /**
   * Generate recommendations for user
   */
  private generateRecommendations(mappings: ColumnAnalysis[]): string[] {
    const recommendations: string[] = [];

    const lowConfidenceMappings = mappings.filter(m => m.confidence < 60 && !m.shouldExclude);
    if (lowConfidenceMappings.length > 0) {
      recommendations.push(`Review ${lowConfidenceMappings.length} low-confidence mappings before import`);
    }

    const hasWarnings = mappings.some(m => m.warnings.length > 0);
    if (hasWarnings) {
      recommendations.push('Address data quality warnings to improve import success rate');
    }

    const unmappedColumns = mappings.filter(m => !m.suggestedField && !m.shouldExclude);
    if (unmappedColumns.length > 0) {
      recommendations.push(`Consider manual mapping for ${unmappedColumns.length} unmapped columns`);
    }

    if (recommendations.length === 0) {
      recommendations.push('File analysis complete - ready for import');
    }

    return recommendations;
  }

  /**
   * Get field mapping for import processing
   */
  getFieldMappings(analysis: AIColumnMappingResult): Record<string, string> {
    const mappings: Record<string, string> = {};

    analysis.mappings
      .filter(m => m.suggestedField && !m.shouldExclude && m.confidence > 50)
      .forEach(m => {
        mappings[m.originalName] = m.suggestedField!;
      });

    return mappings;
  }
}

// Export singleton instance
export const aiColumnMapper = new AIColumnMapper();
