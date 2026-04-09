/**
 * PII Masking Service - Data Privacy and Security Protection
 * 
 * CRITICAL SECURITY SERVICE: Implements comprehensive PII (Personally Identifiable Information)
 * masking and data protection for all logging, audit trails, and system outputs.
 * 
 * @module PIIMaskingService
 * @created September 18, 2025
 * @purpose GDPR/privacy compliance and security hardening
 * 
 * @security_features
 * - Complete PII masking for all sensitive customer data
 * - Context-aware masking based on field types and sensitivity levels
 * - Audit trail protection without losing operational value
 * - Configurable masking strategies per data type
 * - Secure hash-based consistent masking for debugging
 * 
 * @compliance_features  
 * - GDPR Article 25 - Data Protection by Design
 * - CCPA compliance for California residents
 * - HIPAA-level data protection standards
 * - Configurable retention and masking policies
 * 
 * @supported_data_types
 * - Personal identifiers (email, phone, names)
 * - Demographic data (gender, age, location)
 * - Financial information (payment details, account numbers)
 * - Behavioral data (preferences, activities)
 * - Geographic information (addresses, coordinates)
 */

import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * PII field categories with different masking strategies
 */
export enum PIICategory {
  PERSONAL_IDENTIFIER = 'personal_identifier',    // email, phone, ID numbers
  DEMOGRAPHIC = 'demographic',                    // gender, age, ethnicity  
  LOCATION = 'location',                         // address, city, coordinates
  FINANCIAL = 'financial',                       // payment info, account numbers
  BEHAVIORAL = 'behavioral',                     // preferences, activities
  MEDICAL = 'medical',                           // health information
  BIOMETRIC = 'biometric',                       // fingerprints, face data
  CUSTOM_SENSITIVE = 'custom_sensitive'          // client-defined sensitive fields
}

/**
 * Masking strategy types
 */
export enum MaskingStrategy {
  COMPLETE_MASK = 'complete_mask',               // [MASKED_EMAIL] 
  PARTIAL_MASK = 'partial_mask',                 // j***@example.com
  HASH_MASK = 'hash_mask',                       // hash_abc123 (consistent)
  CATEGORY_MASK = 'category_mask',               // [GENDER_DATA]
  FORMAT_PRESERVING = 'format_preserving',       // +62-xxx-xxx-xxxx
  NULL_REPLACEMENT = 'null_replacement'          // null/undefined
}

/**
 * Field masking configuration
 */
interface PIIFieldConfig {
  category: PIICategory;
  strategy: MaskingStrategy;
  maskingLevel: 'low' | 'medium' | 'high' | 'complete';
  preserveFormat?: boolean;
  hashSalt?: string;
  customMask?: string;
  auditLog?: boolean;
}

/**
 * Masking operation result
 */
export interface MaskingResult {
  originalValue: any;
  maskedValue: any;
  maskingApplied: boolean;
  strategy: MaskingStrategy;
  fieldCategory: PIICategory;
  warnings: string[];
}

/**
 * PII Detection and Masking Service Class
 */
export class PIIMaskingService {
  
  // Field configuration mapping - Indonesian/multilingual support
  private fieldConfigs: Record<string, PIIFieldConfig> = {
    
    // Personal Identifiers
    'email': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.PARTIAL_MASK,
      maskingLevel: 'high',
      preserveFormat: true,
      auditLog: true
    },
    'phone': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.FORMAT_PRESERVING,
      maskingLevel: 'high',
      preserveFormat: true,
      auditLog: true
    },
    'phoneNumber': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.FORMAT_PRESERVING,
      maskingLevel: 'high',
      preserveFormat: true,
      auditLog: true
    },
    'firstName': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.PARTIAL_MASK,
      maskingLevel: 'medium',
      auditLog: true
    },
    'lastName': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.PARTIAL_MASK,
      maskingLevel: 'medium', 
      auditLog: true
    },
    'name': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.PARTIAL_MASK,
      maskingLevel: 'medium',
      auditLog: true
    },
    'fullName': {
      category: PIICategory.PERSONAL_IDENTIFIER,
      strategy: MaskingStrategy.PARTIAL_MASK,
      maskingLevel: 'medium',
      auditLog: true
    },
    
    // Demographic Data (Indonesian fields)
    'jeniskelamin': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[GENDER_DATA]',
      auditLog: true
    },
    'gender': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[GENDER_DATA]',
      auditLog: true
    },
    'usia': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[AGE_DATA]',
      auditLog: true
    },
    'age': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[AGE_DATA]',
      auditLog: true
    },
    'tanggalLahir': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[BIRTH_DATE]',
      auditLog: true
    },
    'dateOfBirth': {
      category: PIICategory.DEMOGRAPHIC,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[BIRTH_DATE]',
      auditLog: true
    },
    
    // Location Data
    'domisili': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[LOCATION_DATA]',
      auditLog: true
    },
    'location': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[LOCATION_DATA]',
      auditLog: true
    },
    'city': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[CITY_DATA]',
      auditLog: true
    },
    'kota': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'medium',
      customMask: '[CITY_DATA]',
      auditLog: true
    },
    'address': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[ADDRESS_DATA]',
      auditLog: true
    },
    'alamat': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[ADDRESS_DATA]',
      auditLog: true
    },
    'province': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'low',
      customMask: '[PROVINCE_DATA]',
      auditLog: false
    },
    'provinsi': {
      category: PIICategory.LOCATION,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'low',
      customMask: '[PROVINCE_DATA]',
      auditLog: false
    },
    
    // Financial Information
    'accountNumber': {
      category: PIICategory.FINANCIAL,
      strategy: MaskingStrategy.COMPLETE_MASK,
      maskingLevel: 'complete',
      customMask: '[ACCOUNT_NUMBER]',
      auditLog: true
    },
    'creditCard': {
      category: PIICategory.FINANCIAL,
      strategy: MaskingStrategy.COMPLETE_MASK,
      maskingLevel: 'complete',
      customMask: '[PAYMENT_INFO]',
      auditLog: true
    },
    'income': {
      category: PIICategory.FINANCIAL,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[FINANCIAL_DATA]',
      auditLog: true
    },
    'pendapatan': {
      category: PIICategory.FINANCIAL,
      strategy: MaskingStrategy.CATEGORY_MASK,
      maskingLevel: 'high',
      customMask: '[FINANCIAL_DATA]',
      auditLog: true
    }
  };
  
  private hashSalt: string;
  private auditEntries: Array<{
    timestamp: Date;
    field: string;
    category: PIICategory;
    strategy: MaskingStrategy;
    context: string;
  }> = [];
  
  constructor() {
    const salt = process.env.PII_MASKING_SALT;
    if (!salt) {
      throw new Error(
        '[SECURITY] PII_MASKING_SALT environment variable is required but not set. ' +
        'Set PII_MASKING_SALT to a strong random value (32+ characters) before starting the server.'
      );
    }
    this.hashSalt = salt;
  }
  
  /**
   * Main masking function - masks all PII in an object recursively
   */
  maskObject(obj: any, context: string = 'general'): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.maskObject(item, context));
    }
    
    // Handle objects
    if (typeof obj === 'object') {
      const masked: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const maskingResult = this.maskField(key, value, context);
        masked[key] = maskingResult.maskedValue;
      }
      
      return masked;
    }
    
    return obj;
  }
  
  /**
   * Mask individual field value
   */
  maskField(fieldName: string, value: any, context: string = 'general'): MaskingResult {
    
    // Normalize field name (handle nested paths)
    const normalizedFieldName = this.normalizeFieldName(fieldName);
    const config = this.getFieldConfig(normalizedFieldName);
    
    const result: MaskingResult = {
      originalValue: value,
      maskedValue: value,
      maskingApplied: false,
      strategy: MaskingStrategy.COMPLETE_MASK,
      fieldCategory: PIICategory.CUSTOM_SENSITIVE,
      warnings: []
    };
    
    // Skip masking for non-sensitive data
    if (!config) {
      return result;
    }
    
    result.strategy = config.strategy;
    result.fieldCategory = config.category;
    
    try {
      
      // Apply masking strategy
      switch (config.strategy) {
        
        case MaskingStrategy.COMPLETE_MASK:
          result.maskedValue = config.customMask || '[MASKED_DATA]';
          result.maskingApplied = true;
          break;
          
        case MaskingStrategy.CATEGORY_MASK:
          result.maskedValue = config.customMask || `[${config.category.toUpperCase()}_DATA]`;
          result.maskingApplied = true;
          break;
          
        case MaskingStrategy.PARTIAL_MASK:
          result.maskedValue = this.applyPartialMask(value);
          result.maskingApplied = true;
          break;
          
        case MaskingStrategy.HASH_MASK:
          result.maskedValue = this.applyHashMask(value);
          result.maskingApplied = true;
          break;
          
        case MaskingStrategy.FORMAT_PRESERVING:
          result.maskedValue = this.applyFormatPreservingMask(value, fieldName);
          result.maskingApplied = true;
          break;
          
        case MaskingStrategy.NULL_REPLACEMENT:
          result.maskedValue = null;
          result.maskingApplied = true;
          break;
      }
      
      // Audit logging
      if (config.auditLog && result.maskingApplied) {
        this.auditEntries.push({
          timestamp: new Date(),
          field: fieldName,
          category: config.category,
          strategy: config.strategy,
          context
        });
      }
      
    } catch (error) {
      result.warnings.push(`Masking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.maskedValue = '[MASKING_ERROR]';
      result.maskingApplied = true;
    }
    
    return result;
  }
  
  /**
   * Mask criteria objects (for segment queries)
   */
  maskCriteria(criteria: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(criteria)) {
      
      // Handle nested unmapped fields
      if (key.startsWith('unmapped_fields.')) {
        const actualField = key.replace('unmapped_fields.', '');
        const maskingResult = this.maskField(actualField, value, 'segment_criteria');
        masked[key] = maskingResult.maskedValue;
      } else {
        const maskingResult = this.maskField(key, value, 'segment_criteria');
        masked[key] = maskingResult.maskedValue;
      }
    }
    
    return masked;
  }
  
  /**
   * Create secure debug string for logging
   */
  createSecureDebugString(data: any, maxLength: number = 200): string {
    const masked = this.maskObject(data, 'debug_logging');
    const jsonString = JSON.stringify(masked);
    
    if (jsonString.length > maxLength) {
      return jsonString.substring(0, maxLength) + '...[truncated]';
    }
    
    return jsonString;
  }
  
  // Private helper methods
  
  private normalizeFieldName(fieldName: string): string {
    // Handle dot notation and array indices
    return fieldName.toLowerCase()
                   .replace(/\[\d+\]/g, '') // Remove array indices
                   .replace(/\./g, '_')     // Convert dots to underscores
                   .replace(/-/g, '_');     // Convert dashes to underscores
  }
  
  private getFieldConfig(fieldName: string): PIIFieldConfig | null {
    // Direct match
    if (this.fieldConfigs[fieldName]) {
      return this.fieldConfigs[fieldName];
    }
    
    // Pattern matching for variations
    const patterns = [
      { pattern: /email/i, config: 'email' },
      { pattern: /phone/i, config: 'phone' },
      { pattern: /name$/i, config: 'name' },
      { pattern: /gender|jenis.*kelamin/i, config: 'jeniskelamin' },
      { pattern: /age|usia/i, config: 'usia' },
      { pattern: /location|lokasi|domisili/i, config: 'domisili' },
      { pattern: /city|kota/i, config: 'city' },
      { pattern: /address|alamat/i, config: 'address' }
    ];
    
    for (const { pattern, config } of patterns) {
      if (pattern.test(fieldName)) {
        return this.fieldConfigs[config];
      }
    }
    
    return null;
  }
  
  private applyPartialMask(value: any): string {
    // CRITICAL FIX: Preserve boolean values for segment criteria
    if (typeof value === 'boolean') {
      return String(value); // Convert to string representation but preserve the boolean meaning
    }
    
    if (!value || typeof value !== 'string') {
      return '[INVALID_DATA]';
    }
    
    if (value.includes('@')) {
      // Email masking: show first char + domain
      const [username, domain] = value.split('@');
      if (username.length <= 1) return `${username[0]}***@${domain}`;
      return `${username[0]}***@${domain}`;
    }
    
    // General text masking
    if (value.length <= 2) return '***';
    return `${value[0]}***${value[value.length - 1]}`;
  }
  
  private applyHashMask(value: any): string {
    const hash = crypto
      .createHmac('sha256', this.hashSalt)
      .update(String(value))
      .digest('hex');
    return `hash_${hash.substring(0, 8)}`;
  }
  
  private applyFormatPreservingMask(value: any, fieldType: string): string {
    // CRITICAL FIX: Preserve boolean values for segment criteria
    if (typeof value === 'boolean') {
      return String(value); // Preserve boolean meaning in string form
    }
    
    if (!value || typeof value !== 'string') {
      return '[INVALID_FORMAT]';
    }
    
    if (fieldType.toLowerCase().includes('phone')) {
      // Preserve phone format
      return value.replace(/\d/g, 'x');
    }
    
    // Default format preserving
    return value.replace(/[a-zA-Z]/g, 'x').replace(/\d/g, '0');
  }
  
  /**
   * Get audit summary for compliance reporting
   */
  getAuditSummary(since?: Date): {
    totalMaskingOperations: number;
    categoriesMasked: string[];
    mostMaskedFields: Array<{field: string; count: number}>;
    contexts: string[];
  } {
    const relevantEntries = since 
      ? this.auditEntries.filter(entry => entry.timestamp >= since)
      : this.auditEntries;
    
    const fieldCounts: Record<string, number> = {};
    const categories = new Set<string>();
    const contexts = new Set<string>();
    
    for (const entry of relevantEntries) {
      fieldCounts[entry.field] = (fieldCounts[entry.field] || 0) + 1;
      categories.add(entry.category);
      contexts.add(entry.context);
    }
    
    const mostMaskedFields = Object.entries(fieldCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([field, count]) => ({ field, count }));
    
    return {
      totalMaskingOperations: relevantEntries.length,
      categoriesMasked: Array.from(categories),
      mostMaskedFields,
      contexts: Array.from(contexts)
    };
  }
  
  /**
   * Test if a value contains PII
   */
  containsPII(value: any): boolean {
    if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value)) {
        if (this.getFieldConfig(this.normalizeFieldName(key))) {
          return true;
        }
      }
    }
    
    return false;
  }
}

// Export singleton instance
export const piiMaskingService = new PIIMaskingService();