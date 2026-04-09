/**
 * Mapping Review Service
 *
 * Secure, performance-optimized service for intelligent field mapping review.
 * Detects when AI mapping needs human approval and provides review interface data.
 *
 * Security Features:
 * - Input validation and sanitization
 * - XSS protection for field names and suggestions
 * - Confidence threshold validation
 *
 * Performance Features:
 * - Cached results to reduce API calls
 * - Parallel analysis processing
 * - Minimal data transfer
 *
 * @created August 13, 2025 - Enhanced data import with intelligent mapping review
 */

import { ServiceOperation } from '../utils/service-utilities';
import { flexibleAIMapper } from './flexible-ai-mapper';
import type { FlexibleColumnAnalysis, FlexibleAIMappingResult } from './flexible-ai-mapper';
import { SecuritySanitization } from '../utils/security-sanitization';
import { secureLogger } from '../utils/secure-logger';

// Security: Define allowed field characters to prevent XSS
const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const MAX_FIELD_NAME_LENGTH = 50;
const MAX_SAMPLE_VALUES = 3; // Limit sample data for security

export interface MappingConflict {
  sourceField: string;
  conflictingFields: string[];
  confidence: number;
  reason: string;
  suggestedResolution: string;
}

export interface UncertainMapping {
  sourceField: string;
  sanitizedFieldName: string;
  currentSuggestion: string | null;
  confidence: number;
  dataType: string;
  sampleData: string[];
  availableTargets: string[];
  reasoning: string;
  isConflict: boolean;
}

export interface MappingReviewData {
  needsReview: boolean;
  reviewReason: 'low_confidence' | 'conflicts' | 'unknown_fields' | 'none';
  uncertainMappings: UncertainMapping[];
  conflicts: MappingConflict[];
  autoApprovedCount: number;
  totalMappings: number;
  recommendations: string[];
  confidenceThreshold: number;
}

/**
 * Service for handling intelligent mapping review decisions
 */
class MappingReviewService {
  private readonly CONFIDENCE_THRESHOLD = 70; // Configurable threshold for review
  private readonly MIN_CONFLICT_CONFIDENCE = 60;

  // Cache for available target fields to improve performance
  private targetFieldsCache: string[] | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Analyze mapping results and determine if review is needed
   *
   * @param headers - Original file headers
   * @param sampleRows - Sample data for analysis
   * @param maxSampleSize - Maximum rows to analyze
   * @returns Promise<MappingReviewData> - Review analysis results
   */
  async analyzeMappingForReview(
    headers: string[],
    sampleRows: any[],
    maxSampleSize: number = 100
  ): Promise<MappingReviewData> {
    return await ServiceOperation.execute(
      'analyzeMappingForReview',
      async () => {
        secureLogger.info(`🔍 [Mapping Review] Starting analysis for ${headers.length} fields`);

        try {
          // Security: Validate and sanitize inputs with error handling
          const sanitizedHeaders = this.sanitizeHeaders(headers);
          const limitedSampleRows = sampleRows.slice(0, maxSampleSize);

          // Get AI mapping analysis
          const aiResult = await flexibleAIMapper.analyzeFileColumns(
            sanitizedHeaders,
            limitedSampleRows,
            maxSampleSize
          );

          // Determine if review is needed based on confidence and conflicts
          const reviewDecision = this.determineReviewNeed(aiResult);

          if (!reviewDecision.needsReview) {
            return {
              needsReview: false,
              reviewReason: 'none' as const,
              uncertainMappings: [],
              conflicts: [],
              autoApprovedCount: sanitizedHeaders.length,
              totalMappings: sanitizedHeaders.length,
              recommendations: ['All mappings approved automatically'],
              confidenceThreshold: this.CONFIDENCE_THRESHOLD
            };
          }

          // Build review data for uncertain mappings
          const uncertainMappings = await this.buildUncertainMappings(
            aiResult.mappings,
            limitedSampleRows
          );

          // Detect mapping conflicts
          const conflicts = this.detectMappingConflicts(aiResult.mappings);

          const result: MappingReviewData = {
            needsReview: true,
            reviewReason: reviewDecision.reason,
            uncertainMappings,
            conflicts,
            autoApprovedCount: this.countAutoApproved(aiResult.mappings),
            totalMappings: aiResult.mappings.length,
            recommendations: this.generateRecommendations(aiResult),
            confidenceThreshold: this.CONFIDENCE_THRESHOLD
          };

          return result;

        } catch (sanitizationError) {
          secureLogger.error(`❌ [Mapping Review] Sanitization failed:`, { error: String(sanitizationError) });

          // Return safe fallback response to prevent undefined access
          return {
            needsReview: true,
            reviewReason: 'unknown_fields' as const,
            uncertainMappings: headers.map((header, index) => ({
              sourceField: header,
              sanitizedFieldName: `field_${index}`,
              currentSuggestion: null,
              confidence: 0,
              dataType: 'text',
              sampleData: ['[processing error]'],
              availableTargets: ['custom_attribute'],
              reasoning: 'Field processing encountered an error, manual review required',
              isConflict: false
            })),
            conflicts: [],
            autoApprovedCount: 0,
            totalMappings: headers.length,
            recommendations: ['Manual review required due to processing error'],
            confidenceThreshold: this.CONFIDENCE_THRESHOLD
          };
        }
      }
    ).then(result => result.data!);
  }

  /**
   * Enhanced Security: Sanitize field headers using comprehensive international processing
   */
  private sanitizeHeaders(headers: string[]): string[] {
    try {
      return SecuritySanitization.processInternationalHeaders(headers);
    } catch (sanitizationError) {
      secureLogger.warn(`⚠️ [Mapping Review] Header sanitization failed, using fallback:`, { error: String(sanitizationError) });
      // Fallback sanitization that doesn't use complex regex patterns
      return headers.map((header, index) => {
        if (typeof header !== 'string') return `field_${index}`;
        return header
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50) || `field_${index}`;
      });
    }
  }
  /**
   * Determine if mapping review is needed based on AI analysis results
   */
  private determineReviewNeed(aiResult: FlexibleAIMappingResult): {
    needsReview: boolean;
    reason: MappingReviewData['reviewReason'];
  } {
    const lowConfidenceMappings = aiResult.mappings.filter(
      m => m.confidence < this.CONFIDENCE_THRESHOLD
    );

    const conflictingMappings = this.findConflictingMappings(aiResult.mappings);
    const unknownFieldMappings = aiResult.mappings.filter(
      m => !m.suggestedField || m.suggestedField === 'custom_attribute'
    );

    if (lowConfidenceMappings.length > 0) {
      return { needsReview: true, reason: 'low_confidence' };
    }

    if (conflictingMappings.length > 0) {
      return { needsReview: true, reason: 'conflicts' };
    }

    if (unknownFieldMappings.length > aiResult.mappings.length * 0.3) {
      return { needsReview: true, reason: 'unknown_fields' };
    }

    return { needsReview: false, reason: 'none' };
  }

  /**
   * Build uncertain mappings data for review interface
   */
  private async buildUncertainMappings(
    mappings: FlexibleColumnAnalysis[],
    sampleRows: any[]
  ): Promise<UncertainMapping[]> {
    const targetFields = await this.getAvailableTargetFields();

    return mappings
      .filter(mapping =>
        mapping.confidence < this.CONFIDENCE_THRESHOLD ||
        !mapping.suggestedField
      )
      .map(mapping => {
        // Security: Sanitize sample data
        const sampleData = this.sanitizeSampleData(
          sampleRows.map(row => row[mapping.columnName]).filter(Boolean),
          MAX_SAMPLE_VALUES
        );

        return {
          sourceField: mapping.columnName,
          sanitizedFieldName: this.sanitizeFieldName(mapping.columnName),
          currentSuggestion: mapping.suggestedField,
          confidence: Math.round(mapping.confidence),
          dataType: mapping.dataType,
          sampleData,
          availableTargets: targetFields,
          reasoning: mapping.reasoning || 'Low confidence mapping',
          isConflict: false // Will be updated by conflict detection
        };
      });
  }

  /**
   * Enhanced Security: Sanitize sample data using comprehensive protection
   */
  private sanitizeSampleData(samples: any[], maxSamples: number): string[] {
    return SecuritySanitization.sanitizeSampleData(samples, maxSamples);
  }

  /**
   * Enhanced Security: Sanitize individual field name using comprehensive protection
   */
  private sanitizeFieldName(fieldName: string): string {
    return SecuritySanitization.sanitizeFieldName(fieldName);
  }

  /**
   * Detect mapping conflicts (multiple fields mapping to same target)
   */
  private detectMappingConflicts(mappings: FlexibleColumnAnalysis[]): MappingConflict[] {
    const conflicts: MappingConflict[] = [];
    const targetMap = new Map<string, FlexibleColumnAnalysis[]>();

    // Group mappings by target field
    mappings
      .filter(m => m.suggestedField && m.confidence >= this.MIN_CONFLICT_CONFIDENCE)
      .forEach(mapping => {
        const target = mapping.suggestedField!;
        if (!targetMap.has(target)) {
          targetMap.set(target, []);
        }
        targetMap.get(target)!.push(mapping);
      });

    // Find conflicts (multiple source fields → same target)
    targetMap.forEach((mappingList, targetField) => {
      if (mappingList.length > 1) {
        conflicts.push({
          sourceField: targetField,
          conflictingFields: mappingList.map(m => m.columnName),
          confidence: Math.max(...mappingList.map(m => m.confidence)),
          reason: `Multiple fields mapping to ${targetField}`,
          suggestedResolution: 'Choose the best field or create custom attributes'
        });
      }
    });

    return conflicts;
  }

  /**
   * Find conflicting mappings for internal use
   */
  private findConflictingMappings(mappings: FlexibleColumnAnalysis[]): FlexibleColumnAnalysis[] {
    const conflicts = this.detectMappingConflicts(mappings);
    const conflictingFieldNames = new Set(
      conflicts.flatMap(c => c.conflictingFields)
    );

    return mappings.filter(m => conflictingFieldNames.has(m.columnName));
  }

  /**
   * Count auto-approved mappings (high confidence, no conflicts)
   */
  private countAutoApproved(mappings: FlexibleColumnAnalysis[]): number {
    const conflictingFields = new Set(
      this.findConflictingMappings(mappings).map(m => m.columnName)
    );

    return mappings.filter(m =>
      m.confidence >= this.CONFIDENCE_THRESHOLD &&
      !conflictingFields.has(m.columnName)
    ).length;
  }

  /**
   * Generate actionable recommendations for the user
   */
  private generateRecommendations(aiResult: FlexibleAIMappingResult): string[] {
    const recommendations: string[] = [];
    const lowConfidence = aiResult.mappings.filter(m => m.confidence < 50);
    const mediumConfidence = aiResult.mappings.filter(m => m.confidence >= 50 && m.confidence < 70);

    if (lowConfidence.length > 0) {
      recommendations.push(
        `Review ${lowConfidence.length} low-confidence mappings carefully`
      );
    }

    if (mediumConfidence.length > 0) {
      recommendations.push(
        `Consider custom fields for ${mediumConfidence.length} uncertain mappings`
      );
    }

    if (aiResult.customAttributesCount > 5) {
      recommendations.push('Consider using JSON storage for better performance');
    }

    if (recommendations.length === 0) {
      recommendations.push('All mappings look good - review and approve');
    }

    return recommendations;
  }

  /**
   * Get available target fields with caching for performance
   */
  private async getAvailableTargetFields(): Promise<string[]> {
    if (this.targetFieldsCache) {
      return this.targetFieldsCache;
    }

    // Get core customer fields
    const coreFields = [
      'firstName', 'lastName', 'email', 'phoneNumber', 'dateOfBirth',
      'gender', 'currentAddress', 'customerSegment', 'lifetimeValue'
    ];

    // Add custom attribute option
    const allFields = [...coreFields, 'custom_attribute', 'skip'];

    this.targetFieldsCache = allFields;

    // Clear cache after TTL
    setTimeout(() => {
      this.targetFieldsCache = null;
    }, this.CACHE_TTL);

    return allFields;
  }
}

// Export singleton instance for consistent usage
export const mappingReviewService = new MappingReviewService();
