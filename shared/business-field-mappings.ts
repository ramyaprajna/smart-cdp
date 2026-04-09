/**
 * Business Field Mapping Service - Core Admin UX Field Mappings
 * 
 * CRITICAL SERVICE: Provides secure, performant mapping between admin-friendly business terms
 * and actual database schema. Fixes the critical schema mismatch issue where segments expect
 * boolean flags like {has_email: true} but database stores actual email values.
 * 
 * @module BusinessFieldMappings
 * @created September 18, 2025
 * @purpose Resolve segment criteria schema mismatch and provide secure field access
 * 
 * @security_features
 * - Parameterized query patterns only (no string concatenation)
 * - Input validation and sanitization rules
 * - Role-based field access controls
 * - SQL injection prevention through type validation
 * 
 * @performance_features  
 * - Optimized for existing database indexes
 * - JSONB query optimization patterns
 * - Query result caching compatibility
 * - Support for sub-500ms segment queries
 * 
 * @critical_fix
 * Translates segment criteria format from:
 * - {has_email: true} → {email: {$exists: true}}
 * - {has_phone: false} → {phoneNumber: {$not_exists: true}}
 * - {has_first_name: true} → {firstName: {$exists: true}}
 */

import { z } from 'zod';

/**
 * Supported field data types for validation and sanitization
 */
export enum FieldDataType {
  STRING = 'string',
  NUMBER = 'number', 
  BOOLEAN = 'boolean',
  DATE = 'date',
  EMAIL = 'email',
  PHONE = 'phone',
  JSONB_TEXT = 'jsonb_text',
  JSONB_NUMBER = 'jsonb_number',
  JSONB_BOOLEAN = 'jsonb_boolean',
  ADDRESS = 'address'
}

/**
 * Database query patterns for different field types
 */
export enum QueryPattern {
  DIRECT_EQUALITY = 'direct_equality',
  EXISTENCE_CHECK = 'existence_check', 
  REGEX_MATCH = 'regex_match',
  NUMERIC_RANGE = 'numeric_range',
  DATE_RANGE = 'date_range',
  JSONB_KEY_EXISTS = 'jsonb_key_exists',
  JSONB_VALUE_MATCH = 'jsonb_value_match',
  ADDRESS_SEARCH = 'address_search'
}

/**
 * Role-based field access levels
 */
export enum FieldAccessLevel {
  PUBLIC = 'public',           // Safe for all users
  PROTECTED = 'protected',     // Requires authentication
  SENSITIVE = 'sensitive',     // Admin/analyst only
  RESTRICTED = 'restricted'    // Super admin only
}

/**
 * Field mapping configuration interface
 */
export interface FieldMappingConfig {
  // Business-friendly identifier
  businessTerm: string;
  
  // Database field information
  databaseField: string;
  dataType: FieldDataType;
  queryPattern: QueryPattern;
  
  // Security and access control
  accessLevel: FieldAccessLevel;
  requiresAuth: boolean;
  sensitiveData: boolean;
  
  // Query optimization
  indexed: boolean;
  cacheable: boolean;
  estimatedSelectivity: number; // 0-1, for query optimization
  
  // Validation and sanitization
  validationSchema?: z.ZodSchema;
  sanitizationRules?: string[];
  
  // Admin display
  displayName: string;
  description: string;
  category: string;
}

/**
 * Core field mappings for Smart CDP Platform
 * 
 * CRITICAL MAPPINGS: These mappings fix the schema mismatch issue by providing
 * proper translation between admin criteria and database queries.
 */
export const BUSINESS_FIELD_MAPPINGS: Record<string, FieldMappingConfig> = {
  
  // === CRITICAL FIXES: Contact Information Fields ===
  // These mappings fix the primary schema mismatch causing 0 customer counts
  
  'has_email': {
    businessTerm: 'has_email',
    databaseField: 'email',
    dataType: FieldDataType.BOOLEAN,
    queryPattern: QueryPattern.EXISTENCE_CHECK,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: true, // customers_email_idx exists
    cacheable: true,
    estimatedSelectivity: 0.99, // 99%+ coverage
    displayName: 'Has Email Address',
    description: 'Customer has a valid email address',
    category: 'Contact Information'
  },
  
  'has_phone': {
    businessTerm: 'has_phone',
    databaseField: 'phoneNumber', 
    dataType: FieldDataType.BOOLEAN,
    queryPattern: QueryPattern.EXISTENCE_CHECK,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: true, // customers_phone_number_idx exists
    cacheable: true,
    estimatedSelectivity: 0.25, // ~25% coverage
    displayName: 'Has Phone Number',
    description: 'Customer has a valid phone number',
    category: 'Contact Information'
  },
  
  'has_first_name': {
    businessTerm: 'has_first_name',
    databaseField: 'firstName',
    dataType: FieldDataType.BOOLEAN,
    queryPattern: QueryPattern.EXISTENCE_CHECK,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.99, // 99%+ coverage
    displayName: 'Has First Name',
    description: 'Customer has a first name',
    category: 'Demographics'
  },
  
  'has_last_name': {
    businessTerm: 'has_last_name',
    databaseField: 'lastName',
    dataType: FieldDataType.BOOLEAN,
    queryPattern: QueryPattern.EXISTENCE_CHECK,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.95, // 95%+ coverage
    displayName: 'Has Last Name',
    description: 'Customer has a last name',
    category: 'Demographics'
  },
  
  // === DIRECT FIELD MAPPINGS ===
  
  'email': {
    businessTerm: 'email',
    databaseField: 'email',
    dataType: FieldDataType.EMAIL,
    queryPattern: QueryPattern.REGEX_MATCH,
    accessLevel: FieldAccessLevel.SENSITIVE,
    requiresAuth: true,
    sensitiveData: true,
    indexed: true,
    cacheable: false, // PII should not be cached
    estimatedSelectivity: 0.001,
    validationSchema: z.string().email(),
    sanitizationRules: ['lowercase', 'trim'],
    displayName: 'Email Address',
    description: 'Customer email address (masked for privacy)',
    category: 'Contact Information'
  },

  'email_contains': {
    businessTerm: 'email_contains',
    databaseField: 'email',
    dataType: FieldDataType.STRING,
    queryPattern: QueryPattern.REGEX_MATCH,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: true,
    cacheable: true,
    estimatedSelectivity: 0.02,
    sanitizationRules: ['lowercase', 'trim'],
    displayName: 'Email Contains Text',
    description: 'Search for text patterns within email addresses (for location/domain filtering)',
    category: 'Contact Information'
  },
  
  'phone_number': {
    businessTerm: 'phone_number',
    databaseField: 'phoneNumber',
    dataType: FieldDataType.PHONE,
    queryPattern: QueryPattern.REGEX_MATCH,
    accessLevel: FieldAccessLevel.SENSITIVE,
    requiresAuth: true,
    sensitiveData: true,
    indexed: true,
    cacheable: false,
    estimatedSelectivity: 0.001,
    sanitizationRules: ['phone_format'],
    displayName: 'Phone Number',
    description: 'Customer phone number (masked for privacy)',
    category: 'Contact Information'
  },
  
  'first_name': {
    businessTerm: 'first_name',
    databaseField: 'firstName',
    dataType: FieldDataType.STRING,
    queryPattern: QueryPattern.REGEX_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: true,
    indexed: false,
    cacheable: false,
    estimatedSelectivity: 0.01,
    validationSchema: z.string().min(1).max(50),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'First Name',
    description: 'Customer first name',
    category: 'Demographics'
  },
  
  'last_name': {
    businessTerm: 'last_name',
    databaseField: 'lastName',
    dataType: FieldDataType.STRING,
    queryPattern: QueryPattern.REGEX_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: true,
    indexed: false,
    cacheable: false,
    estimatedSelectivity: 0.01,
    validationSchema: z.string().min(1).max(50),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'Last Name',
    description: 'Customer last name',
    category: 'Demographics'
  },
  
  // === BUSINESS INTELLIGENCE FIELDS ===
  
  'customer_segment': {
    businessTerm: 'customer_segment',
    databaseField: 'customerSegment',
    dataType: FieldDataType.STRING,
    queryPattern: QueryPattern.DIRECT_EQUALITY,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: true, // customers_segment_idx exists
    cacheable: true,
    estimatedSelectivity: 0.2, // ~5 segments typical
    validationSchema: z.string().min(1).max(100),
    displayName: 'Customer Segment',
    description: 'Pre-defined customer classification',
    category: 'Business Intelligence'
  },
  
  'lifetime_value': {
    businessTerm: 'lifetime_value',
    databaseField: 'lifetimeValue',
    dataType: FieldDataType.NUMBER,
    queryPattern: QueryPattern.NUMERIC_RANGE,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: true, // customers_lifetime_value_idx exists
    cacheable: true,
    estimatedSelectivity: 0.1,
    validationSchema: z.number().min(0).max(1000000),
    displayName: 'Lifetime Value',
    description: 'Customer lifetime value in USD',
    category: 'Business Intelligence'
  },
  
  'data_quality_score': {
    businessTerm: 'data_quality_score',
    databaseField: 'dataQualityScore',
    dataType: FieldDataType.NUMBER,
    queryPattern: QueryPattern.NUMERIC_RANGE,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.2,
    validationSchema: z.number().min(0).max(100),
    displayName: 'Data Quality Score',
    description: 'Data completeness percentage (0-100)',
    category: 'Data Quality'
  },
  
  'last_active_at': {
    businessTerm: 'last_active_at',
    databaseField: 'lastActiveAt',
    dataType: FieldDataType.DATE,
    queryPattern: QueryPattern.DATE_RANGE,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.3,
    displayName: 'Last Active Date',
    description: 'When customer was last active',
    category: 'Engagement'
  },
  
  'date_of_birth': {
    businessTerm: 'date_of_birth',
    databaseField: 'dateOfBirth',
    dataType: FieldDataType.DATE,
    queryPattern: QueryPattern.DATE_RANGE,
    accessLevel: FieldAccessLevel.SENSITIVE,
    requiresAuth: true,
    sensitiveData: true,
    indexed: false,
    cacheable: false,
    estimatedSelectivity: 0.01,
    displayName: 'Date of Birth',
    description: 'Customer birth date (for age calculations)',
    category: 'Demographics'
  },
  
  'gender': {
    businessTerm: 'gender',
    databaseField: 'gender',
    dataType: FieldDataType.STRING,
    queryPattern: QueryPattern.DIRECT_EQUALITY,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: true,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.5, // Binary split typically
    validationSchema: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']),
    displayName: 'Gender',
    description: 'Customer gender identity',
    category: 'Demographics'
  },
  
  // === ADDRESS FIELDS ===
  
  'has_address': {
    businessTerm: 'has_address',
    databaseField: 'currentAddress',
    dataType: FieldDataType.BOOLEAN,
    queryPattern: QueryPattern.EXISTENCE_CHECK,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.8, // Most customers have some address
    displayName: 'Has Address',
    description: 'Customer has address information',
    category: 'Location'
  },
  
  'city': {
    businessTerm: 'city',
    databaseField: 'currentAddress',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: false, // Could add GIN index for JSONB
    cacheable: true,
    estimatedSelectivity: 0.05,
    validationSchema: z.string().min(1).max(100),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'City',
    description: 'Customer city (from address)',
    category: 'Location'
  },
  
  'state': {
    businessTerm: 'state',
    databaseField: 'currentAddress',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.02, // ~50 states
    validationSchema: z.string().min(1).max(50),
    sanitizationRules: ['trim', 'uppercase'],
    displayName: 'State/Province',
    description: 'Customer state or province',
    category: 'Location'
  },
  
  'country': {
    businessTerm: 'country',
    databaseField: 'currentAddress',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PUBLIC,
    requiresAuth: false,
    sensitiveData: false,
    indexed: false,
    cacheable: true,
    estimatedSelectivity: 0.1,
    validationSchema: z.string().min(2).max(50),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'Country',
    description: 'Customer country',
    category: 'Location'
  },
  
  // === UNMAPPED FIELDS (FLEXIBLE CDP) ===
  
  'unmapped_age': {
    businessTerm: 'unmapped_age',
    databaseField: 'unmappedFields',
    dataType: FieldDataType.JSONB_NUMBER,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: true, // customers_unmapped_fields_gin_idx exists
    cacheable: true,
    estimatedSelectivity: 0.01, // Low coverage field
    validationSchema: z.number().min(0).max(150),
    displayName: 'Age (Unmapped)',
    description: 'Age from unmapped source data',
    category: 'Demographics'
  },
  
  'unmapped_profession': {
    businessTerm: 'unmapped_profession',
    databaseField: 'unmappedFields',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: true,
    cacheable: true,
    estimatedSelectivity: 0.05,
    validationSchema: z.string().min(1).max(100),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'Profession (Unmapped)',
    description: 'Profession from unmapped source data',
    category: 'Demographics'
  },
  
  'unmapped_industry': {
    businessTerm: 'unmapped_industry',
    databaseField: 'unmappedFields',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: true,
    cacheable: true,
    estimatedSelectivity: 0.1,
    validationSchema: z.string().min(1).max(100),
    sanitizationRules: ['trim', 'capitalize'],
    displayName: 'Industry (Unmapped)',
    description: 'Industry from unmapped source data',
    category: 'Business'
  },

  'unmapped_fields.domisili': {
    businessTerm: 'unmapped_fields.domisili',
    databaseField: 'unmappedFields',
    dataType: FieldDataType.JSONB_TEXT,
    queryPattern: QueryPattern.JSONB_VALUE_MATCH,
    accessLevel: FieldAccessLevel.PROTECTED,
    requiresAuth: true,
    sensitiveData: false,
    indexed: true,
    cacheable: true,
    estimatedSelectivity: 0.02,
    validationSchema: z.union([
      z.string().min(1).max(100),
      z.object({ $regex: z.string() })
    ]),
    sanitizationRules: ['trim'],
    displayName: 'Location (Domisili)',
    description: 'Customer location from unmapped source data',
    category: 'Location'
  }
};

/**
 * Get field mapping configuration by business term
 */
export function getFieldMapping(businessTerm: string): FieldMappingConfig | undefined {
  return BUSINESS_FIELD_MAPPINGS[businessTerm];
}

/**
 * Get all field mappings for a specific category
 */
export function getFieldMappingsByCategory(category: string): FieldMappingConfig[] {
  return Object.values(BUSINESS_FIELD_MAPPINGS).filter(
    mapping => mapping.category === category
  );
}

/**
 * Get all public fields (safe for unauthenticated access)
 */
export function getPublicFieldMappings(): FieldMappingConfig[] {
  return Object.values(BUSINESS_FIELD_MAPPINGS).filter(
    mapping => mapping.accessLevel === FieldAccessLevel.PUBLIC
  );
}

/**
 * Get all cached-enabled fields for performance optimization
 */
export function getCacheableFieldMappings(): FieldMappingConfig[] {
  return Object.values(BUSINESS_FIELD_MAPPINGS).filter(
    mapping => mapping.cacheable
  );
}

/**
 * Get all indexed fields for optimized queries
 */
export function getIndexedFieldMappings(): FieldMappingConfig[] {
  return Object.values(BUSINESS_FIELD_MAPPINGS).filter(
    mapping => mapping.indexed
  );
}

/**
 * Validate business term exists and user has access
 */
export function validateFieldAccess(
  businessTerm: string, 
  userRole: string,
  isAuthenticated: boolean
): { valid: boolean; reason?: string } {
  const mapping = getFieldMapping(businessTerm);
  
  if (!mapping) {
    return { valid: false, reason: 'Field not found' };
  }
  
  if (mapping.requiresAuth && !isAuthenticated) {
    return { valid: false, reason: 'Authentication required' };
  }
  
  // Role-based access control
  if (mapping.accessLevel === FieldAccessLevel.RESTRICTED && userRole !== 'super_admin') {
    return { valid: false, reason: 'Insufficient permissions - super admin required' };
  }
  
  if (mapping.accessLevel === FieldAccessLevel.SENSITIVE && 
      !['admin', 'super_admin'].includes(userRole)) {
    return { valid: false, reason: 'Insufficient permissions - admin required' };
  }
  
  if (mapping.accessLevel === FieldAccessLevel.PROTECTED && 
      !['admin', 'super_admin', 'analyst'].includes(userRole)) {
    return { valid: false, reason: 'Insufficient permissions - analyst required' };
  }
  
  return { valid: true };
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): string[] {
  const categories = new Set<string>();
  Object.values(BUSINESS_FIELD_MAPPINGS).forEach(mapping => {
    categories.add(mapping.category);
  });
  return Array.from(categories).sort();
}

/**
 * Critical mapping aliases for backwards compatibility
 * Fixes the schema mismatch issue by providing legacy field name support
 */
export const LEGACY_FIELD_ALIASES: Record<string, string> = {
  // Current segment format → Business field mapping
  'has_email': 'has_email',
  'has_phone': 'has_phone', 
  'has_first_name': 'has_first_name',
  'has_last_name': 'has_last_name',
  
  // Legacy camelCase format → Business field mapping  
  'hasEmail': 'has_email',
  'hasPhone': 'has_phone',
  'hasFirstName': 'has_first_name',
  'hasLastName': 'has_last_name',
  
  // Direct field aliases
  'customerSegment': 'customer_segment',
  'lifetimeValue': 'lifetime_value',
  'dataQualityScore': 'data_quality_score',
  'lastActiveAt': 'last_active_at',
  'dateOfBirth': 'date_of_birth',
  'phoneNumber': 'phone_number',
  'firstName': 'first_name',
  'lastName': 'last_name'
};

/**
 * Resolve field name through alias mapping
 */
export function resolveFieldAlias(fieldName: string): string {
  return LEGACY_FIELD_ALIASES[fieldName] || fieldName;
}