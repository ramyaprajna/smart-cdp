/**
 * Vector Search Security Validation
 * 
 * Enterprise-grade input validation and sanitization for vector search endpoints.
 * Implements comprehensive security measures to prevent attacks and ensure data integrity.
 * 
 * @module VectorSearchValidation
 * @security_features
 * - Embedding vector dimension validation (exactly 1536 elements for OpenAI)
 * - Malicious input pattern detection (NaN, Infinity, extreme values)
 * - Similarity threshold validation (0-1 range)
 * - Result limit validation (reasonable ranges to prevent DoS)
 * - Customer ID sanitization and format validation
 * - Search query sanitization and XSS prevention
 * 
 * @created September 18, 2025
 * @last_updated September 18, 2025
 */

import { z } from 'zod';
import { secureLogger } from '../utils/secure-logger';

/**
 * Security Constants for Vector Search Operations
 */
export const VECTOR_SECURITY_LIMITS = {
  // OpenAI text-embedding-3-small produces 1536-dimensional vectors
  EMBEDDING_DIMENSIONS: 1536,
  
  // Similarity thresholds (cosine similarity: 0 = completely different, 1 = identical)
  MIN_SIMILARITY_THRESHOLD: 0.0,
  MAX_SIMILARITY_THRESHOLD: 1.0,
  DEFAULT_SIMILARITY_THRESHOLD: 0.75,
  
  // Result limits to prevent DoS attacks
  MIN_RESULT_LIMIT: 1,
  MAX_RESULT_LIMIT: 100,
  DEFAULT_RESULT_LIMIT: 15,
  
  // Vector value ranges to detect malicious inputs
  MIN_VECTOR_VALUE: -10.0,
  MAX_VECTOR_VALUE: 10.0,
  
  // Customer ID format validation
  CUSTOMER_ID_MAX_LENGTH: 36, // UUID length
  CUSTOMER_ID_MIN_LENGTH: 1,
  
  // Search query limits
  SEARCH_QUERY_MAX_LENGTH: 1000,
  SEARCH_QUERY_MIN_LENGTH: 1,
  
  // Request timeout limits (milliseconds)
  VECTOR_OPERATION_TIMEOUT: 30000, // 30 seconds max
} as const;

/**
 * Malicious Input Pattern Detection
 * 
 * Detects potentially malicious patterns in vector data and search inputs.
 */
export class MaliciousInputDetector {
  
  /**
   * Check if a number value is potentially malicious
   */
  static isMaliciousNumber(value: number): boolean {
    return (
      !Number.isFinite(value) ||
      Number.isNaN(value) ||
      value < VECTOR_SECURITY_LIMITS.MIN_VECTOR_VALUE ||
      value > VECTOR_SECURITY_LIMITS.MAX_VECTOR_VALUE
    );
  }
  
  /**
   * Validate embedding vector for malicious patterns
   */
  static validateEmbeddingVector(vector: number[]): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check dimension count
    if (vector.length !== VECTOR_SECURITY_LIMITS.EMBEDDING_DIMENSIONS) {
      issues.push(`Invalid vector dimensions: expected ${VECTOR_SECURITY_LIMITS.EMBEDDING_DIMENSIONS}, got ${vector.length}`);
    }
    
    // Check for malicious values
    const maliciousIndices = vector
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => this.isMaliciousNumber(value))
      .map(({ index }) => index);
    
    if (maliciousIndices.length > 0) {
      issues.push(`Malicious values detected at indices: ${maliciousIndices.slice(0, 10).join(', ')}${maliciousIndices.length > 10 ? '...' : ''}`);
    }
    
    // Check vector magnitude (should be normalized for OpenAI embeddings)
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 2.0 || magnitude < 0.1) {
      issues.push(`Suspicious vector magnitude: ${magnitude.toFixed(4)} (expected ~1.0 for normalized embeddings)`);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Sanitize and validate search query for XSS and injection attacks
   */
  static sanitizeSearchQuery(query: string): { sanitized: string; isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    let sanitized = query;
    
    // Remove potential XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];
    
    xssPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        issues.push('Potential XSS pattern detected');
        sanitized = sanitized.replace(pattern, '');
      }
    });
    
    // Remove potential SQL injection patterns
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|alter|create|exec|execute)\b)/gi,
      /(--|;|\/\*|\*\/)/g,
      /(\bor\b\s+\b1\s*=\s*1\b)/gi,
      /(\band\b\s+\b1\s*=\s*1\b)/gi
    ];
    
    sqlPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        issues.push('Potential SQL injection pattern detected');
        sanitized = sanitized.replace(pattern, ' ');
      }
    });
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Check length constraints
    if (sanitized.length > VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MAX_LENGTH) {
      issues.push(`Search query too long: ${sanitized.length} characters (max: ${VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MAX_LENGTH})`);
      sanitized = sanitized.substring(0, VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MAX_LENGTH);
    }
    
    if (sanitized.length < VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MIN_LENGTH) {
      issues.push(`Search query too short: ${sanitized.length} characters (min: ${VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MIN_LENGTH})`);
    }
    
    return {
      sanitized,
      isValid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Validate customer ID format and security
   */
  static validateCustomerId(customerId: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check length
    if (customerId.length < VECTOR_SECURITY_LIMITS.CUSTOMER_ID_MIN_LENGTH ||
        customerId.length > VECTOR_SECURITY_LIMITS.CUSTOMER_ID_MAX_LENGTH) {
      issues.push(`Invalid customer ID length: ${customerId.length} (expected: ${VECTOR_SECURITY_LIMITS.CUSTOMER_ID_MIN_LENGTH}-${VECTOR_SECURITY_LIMITS.CUSTOMER_ID_MAX_LENGTH})`);
    }
    
    // Check for valid characters (alphanumeric, hyphens, underscores only)
    const validIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validIdPattern.test(customerId)) {
      issues.push('Customer ID contains invalid characters (only alphanumeric, hyphens, and underscores allowed)');
    }
    
    // Check for potential injection patterns
    const injectionPatterns = [
      /[<>'"`;]/,
      /\b(select|union|insert|update|delete|drop|alter|create)\b/i,
      /(--|\/\*|\*\/)/
    ];
    
    if (injectionPatterns.some(pattern => pattern.test(customerId))) {
      issues.push('Customer ID contains potentially malicious patterns');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

/**
 * Zod Validation Schemas for Vector Search Endpoints
 */

// Custom Zod validator for embedding vectors
const embeddingVectorValidator = z.array(z.number()).refine(
  (vector) => {
    const validation = MaliciousInputDetector.validateEmbeddingVector(vector);
    if (!validation.isValid) {
      secureLogger.warn('Invalid embedding vector detected', {
        issues: validation.issues,
        vectorLength: vector.length
      }, 'VECTOR_SECURITY');
    }
    return validation.isValid;
  },
  {
    message: `Invalid embedding vector: must be ${VECTOR_SECURITY_LIMITS.EMBEDDING_DIMENSIONS} normalized floating-point numbers`
  }
);

// Custom Zod validator for similarity thresholds
const similarityThresholdValidator = z.number()
  .min(VECTOR_SECURITY_LIMITS.MIN_SIMILARITY_THRESHOLD, 
       `Similarity threshold must be >= ${VECTOR_SECURITY_LIMITS.MIN_SIMILARITY_THRESHOLD}`)
  .max(VECTOR_SECURITY_LIMITS.MAX_SIMILARITY_THRESHOLD,
       `Similarity threshold must be <= ${VECTOR_SECURITY_LIMITS.MAX_SIMILARITY_THRESHOLD}`)
  .refine(
    (value) => Number.isFinite(value) && !Number.isNaN(value),
    { message: 'Similarity threshold must be a valid finite number' }
  );

// Custom Zod validator for result limits
const resultLimitValidator = z.number()
  .int('Result limit must be an integer')
  .min(VECTOR_SECURITY_LIMITS.MIN_RESULT_LIMIT,
       `Result limit must be >= ${VECTOR_SECURITY_LIMITS.MIN_RESULT_LIMIT}`)
  .max(VECTOR_SECURITY_LIMITS.MAX_RESULT_LIMIT,
       `Result limit must be <= ${VECTOR_SECURITY_LIMITS.MAX_RESULT_LIMIT} to prevent DoS attacks`);

// Custom Zod validator for customer IDs
const customerIdValidator = z.string()
  .transform((value) => value.trim())
  .refine(
    (customerId) => {
      const validation = MaliciousInputDetector.validateCustomerId(customerId);
      if (!validation.isValid) {
        secureLogger.warn('Invalid customer ID detected', {
          customerId: customerId.substring(0, 20) + '...', // Log only first 20 chars for security
          issues: validation.issues
        }, 'VECTOR_SECURITY');
      }
      return validation.isValid;
    },
    { message: 'Invalid customer ID format or potentially malicious content detected' }
  );

// Custom Zod validator for search queries
const searchQueryValidator = z.string()
  .transform((query) => {
    const sanitization = MaliciousInputDetector.sanitizeSearchQuery(query);
    if (!sanitization.isValid) {
      secureLogger.warn('Potentially malicious search query detected', {
        originalLength: query.length,
        sanitizedLength: sanitization.sanitized.length,
        issues: sanitization.issues
      }, 'VECTOR_SECURITY');
    }
    return sanitization.sanitized;
  })
  .refine(
    (query) => query.length >= VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MIN_LENGTH,
    { message: `Search query must be at least ${VECTOR_SECURITY_LIMITS.SEARCH_QUERY_MIN_LENGTH} character(s)` }
  );

/**
 * Vector Search Endpoint Validation Schemas
 */

// Schema for finding similar customers by customer ID
export const findSimilarCustomersSchema = z.object({
  customerId: customerIdValidator,
  threshold: similarityThresholdValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_SIMILARITY_THRESHOLD),
  limit: resultLimitValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_RESULT_LIMIT),
  embeddingType: z.string().optional().default('customer_profile'),
  includeMetadata: z.boolean().optional().default(false)
});

// Schema for vector similarity search by embedding
export const vectorSimilaritySearchSchema = z.object({
  embedding: embeddingVectorValidator,
  threshold: similarityThresholdValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_SIMILARITY_THRESHOLD),
  limit: resultLimitValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_RESULT_LIMIT),
  embeddingType: z.string().optional().default('customer_profile'),
  includeMetadata: z.boolean().optional().default(false)
});

// Schema for text-based customer search (generates embedding internally)
export const textBasedSearchSchema = z.object({
  query: searchQueryValidator,
  threshold: similarityThresholdValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_SIMILARITY_THRESHOLD),
  limit: resultLimitValidator.optional().default(VECTOR_SECURITY_LIMITS.DEFAULT_RESULT_LIMIT),
  embeddingType: z.string().optional().default('customer_profile'),
  includeMetadata: z.boolean().optional().default(false)
});

// Schema for cluster analysis parameters
export const clusterAnalysisSchema = z.object({
  clusterCount: z.number().int().min(2).max(20).optional().default(5),
  sampleSize: z.number().int().min(100).max(10000).optional().default(1000),
  embeddingType: z.string().optional().default('customer_profile')
});

// Schema for segment analysis parameters
export const segmentAnalysisSchema = z.object({
  segmentName: z.string().optional(),
  embeddingType: z.string().optional().default('customer_profile'),
  includeCharacteristics: z.boolean().optional().default(true)
});

/**
 * Type exports for use in route handlers
 */
export type FindSimilarCustomersInput = z.infer<typeof findSimilarCustomersSchema>;
export type VectorSimilaritySearchInput = z.infer<typeof vectorSimilaritySearchSchema>;
export type TextBasedSearchInput = z.infer<typeof textBasedSearchSchema>;
export type ClusterAnalysisInput = z.infer<typeof clusterAnalysisSchema>;
export type SegmentAnalysisInput = z.infer<typeof segmentAnalysisSchema>;

/**
 * Validation utility functions
 */
export const validateInput = {
  findSimilarCustomers: (input: unknown) => findSimilarCustomersSchema.parse(input),
  vectorSimilaritySearch: (input: unknown) => vectorSimilaritySearchSchema.parse(input),
  textBasedSearch: (input: unknown) => textBasedSearchSchema.parse(input),
  clusterAnalysis: (input: unknown) => clusterAnalysisSchema.parse(input),
  segmentAnalysis: (input: unknown) => segmentAnalysisSchema.parse(input)
};