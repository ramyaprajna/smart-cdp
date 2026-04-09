/**
 * Vector Search Data Masking and Privacy Controls
 * 
 * Enterprise-grade data masking and privacy protection for vector search responses.
 * Implements comprehensive PII protection, data minimization, and secure data handling.
 * 
 * @module VectorDataMasking
 * @privacy_features
 * - PII masking for customer information in search results
 * - Data minimization based on user roles and permissions
 * - Secure handling of sensitive customer similarity data
 * - Configurable privacy levels for different use cases
 * - Audit logging for data access and masking decisions
 * 
 * @created September 18, 2025
 * @last_updated September 18, 2025
 */

import { secureLogger } from './secure-logger';
import type { CustomerSimilarityResult } from '../vector-engine';

/**
 * Privacy Levels for Data Masking
 */
export enum PrivacyLevel {
  FULL_ACCESS = 'FULL_ACCESS',        // Full data access (admin, analyst)
  BUSINESS_ACCESS = 'BUSINESS_ACCESS', // Business-relevant data (marketing)
  LIMITED_ACCESS = 'LIMITED_ACCESS',   // Minimal data (viewer)
  ANONYMIZED = 'ANONYMIZED'           // Fully anonymized data
}

/**
 * User Role to Privacy Level Mapping
 */
const ROLE_PRIVACY_MAPPING: Record<string, PrivacyLevel> = {
  admin: PrivacyLevel.FULL_ACCESS,
  analyst: PrivacyLevel.FULL_ACCESS,
  marketing: PrivacyLevel.BUSINESS_ACCESS,
  viewer: PrivacyLevel.LIMITED_ACCESS,
  guest: PrivacyLevel.ANONYMIZED
};

/**
 * Data Field Classifications
 */
enum DataClassification {
  PUBLIC = 'PUBLIC',                  // No masking required
  INTERNAL = 'INTERNAL',              // Internal business data
  CONFIDENTIAL = 'CONFIDENTIAL',     // Sensitive business data
  RESTRICTED = 'RESTRICTED',          // Highly sensitive/regulated data
  PII = 'PII'                        // Personally identifiable information
}

/**
 * Field Security Configuration
 */
interface FieldSecurityConfig {
  classification: DataClassification;
  requiresRole?: string[];            // Roles that can access this field
  maskingStrategy: 'redact' | 'hash' | 'partial' | 'remove' | 'anonymize';
  auditAccess?: boolean;              // Log access to this field
}

/**
 * Customer Data Field Security Mapping
 */
const CUSTOMER_FIELD_SECURITY: Record<string, FieldSecurityConfig> = {
  // PII Fields (highest security)
  firstName: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'partial',
    auditAccess: true
  },
  lastName: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'partial',
    auditAccess: true
  },
  email: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'partial',
    auditAccess: true
  },
  phoneNumber: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'partial',
    auditAccess: true
  },
  dateOfBirth: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'anonymize',
    auditAccess: true
  },
  currentAddress: {
    classification: DataClassification.PII,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'partial',
    auditAccess: true
  },
  
  // Business Data (moderate security)
  customerSegment: {
    classification: DataClassification.INTERNAL,
    requiresRole: ['admin', 'analyst', 'marketing'],
    maskingStrategy: 'redact'
  },
  lifetimeValue: {
    classification: DataClassification.CONFIDENTIAL,
    requiresRole: ['admin', 'analyst', 'marketing'],
    maskingStrategy: 'partial'
  },
  lastActiveAt: {
    classification: DataClassification.INTERNAL,
    requiresRole: ['admin', 'analyst', 'marketing'],
    maskingStrategy: 'anonymize'
  },
  dataQualityScore: {
    classification: DataClassification.INTERNAL,
    requiresRole: ['admin', 'analyst'],
    maskingStrategy: 'redact'
  },
  
  // Technical Data (low security)
  customerId: {
    classification: DataClassification.INTERNAL,
    requiresRole: ['admin', 'analyst', 'marketing', 'viewer'],
    maskingStrategy: 'hash'
  },
  similarity: {
    classification: DataClassification.PUBLIC,
    maskingStrategy: 'partial'
  },
  embeddingType: {
    classification: DataClassification.PUBLIC,
    maskingStrategy: 'redact'
  },
  
  // System Data (restricted)
  importId: {
    classification: DataClassification.RESTRICTED,
    requiresRole: ['admin'],
    maskingStrategy: 'redact'
  },
  sourceRowNumber: {
    classification: DataClassification.RESTRICTED,
    requiresRole: ['admin'],
    maskingStrategy: 'redact'
  },
  sourceFileHash: {
    classification: DataClassification.RESTRICTED,
    requiresRole: ['admin'],
    maskingStrategy: 'hash'
  },
  dataLineage: {
    classification: DataClassification.RESTRICTED,
    requiresRole: ['admin'],
    maskingStrategy: 'remove'
  }
};

/**
 * Data Masking Utilities
 */
export class VectorDataMasking {
  
  /**
   * Get privacy level for user role
   */
  static getPrivacyLevel(userRole: string): PrivacyLevel {
    return ROLE_PRIVACY_MAPPING[userRole] || PrivacyLevel.ANONYMIZED;
  }
  
  /**
   * Mask email address preserving domain information
   */
  private static maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '[REDACTED]';
    
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    return `${localPart.substring(0, 2)}***@${domain}`;
  }
  
  /**
   * Mask phone number preserving country/area codes
   */
  private static maskPhoneNumber(phone: string): string {
    if (!phone) return '[REDACTED]';
    
    // Remove non-digit characters for processing
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length >= 10) {
      // Show first 3 and last 2 digits
      return `${digits.substring(0, 3)}***${digits.substring(digits.length - 2)}`;
    }
    return '***';
  }
  
  /**
   * Mask personal name
   */
  private static maskName(name: string): string {
    if (!name || name.length === 0) return '[REDACTED]';
    if (name.length === 1) return name[0] + '*';
    return name[0] + '*'.repeat(Math.min(name.length - 1, 5));
  }
  
  /**
   * Anonymize date of birth (show only year or age range)
   */
  private static anonymizeDateOfBirth(dob: Date | string | null): string | null {
    if (!dob) return null;
    
    const date = new Date(dob);
    if (isNaN(date.getTime())) return null;
    
    const currentYear = new Date().getFullYear();
    const birthYear = date.getFullYear();
    const age = currentYear - birthYear;
    
    // Return age range instead of exact date
    if (age < 18) return '< 18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    return '65+';
  }
  
  /**
   * Mask address information
   */
  private static maskAddress(address: any): any {
    if (!address || typeof address !== 'object') return '[REDACTED]';
    
    const masked: any = {};
    
    // Preserve city and country, mask specific address
    if (address.city) masked.city = address.city;
    if (address.country) masked.country = address.country;
    if (address.state) masked.state = address.state;
    if (address.postalCode) {
      // Show only first part of postal code
      const postal = String(address.postalCode);
      masked.postalCode = postal.length > 3 ? postal.substring(0, 3) + '***' : '***';
    }
    
    // Remove specific street address
    if (address.street || address.address1 || address.address) {
      masked.street = '[REDACTED]';
    }
    
    return masked;
  }
  
  /**
   * Create hash of sensitive identifier
   */
  private static hashValue(value: string): string {
    // Simple hash for demonstration - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `HASH_${Math.abs(hash).toString(36).toUpperCase()}`;
  }
  
  /**
   * Apply masking strategy to a field value
   */
  private static applyMaskingStrategy(
    value: any,
    strategy: string,
    fieldName: string
  ): any {
    if (value === null || value === undefined) return value;
    
    switch (strategy) {
      case 'redact':
        return '[REDACTED]';
        
      case 'remove':
        return undefined;
        
      case 'hash':
        return this.hashValue(String(value));
        
      case 'anonymize':
        if (fieldName === 'dateOfBirth') {
          return this.anonymizeDateOfBirth(value);
        }
        if (fieldName === 'lastActiveAt') {
          // Convert to relative time instead of exact timestamp
          const date = new Date(value);
          const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff < 7) return 'This week';
          if (daysDiff < 30) return 'This month';
          if (daysDiff < 90) return 'Last 3 months';
          return 'More than 3 months ago';
        }
        return '[ANONYMIZED]';
        
      case 'partial':
        if (fieldName === 'email') return this.maskEmail(String(value));
        if (fieldName === 'phoneNumber') return this.maskPhoneNumber(String(value));
        if (fieldName === 'firstName' || fieldName === 'lastName') {
          return this.maskName(String(value));
        }
        if (fieldName === 'currentAddress') return this.maskAddress(value);
        if (fieldName === 'lifetimeValue' && typeof value === 'number') {
          // Round to nearest 1000 for privacy
          return Math.round(value / 1000) * 1000;
        }
        if (fieldName === 'similarity' && typeof value === 'number') {
          // Round similarity to 2 decimal places
          return Math.round(value * 100) / 100;
        }
        return String(value).substring(0, 3) + '***';
        
      default:
        return value;
    }
  }
  
  /**
   * Check if user has access to a specific field
   */
  private static hasFieldAccess(
    fieldName: string,
    userRole: string,
    privacyLevel: PrivacyLevel
  ): boolean {
    const fieldConfig = CUSTOMER_FIELD_SECURITY[fieldName];
    if (!fieldConfig) return true; // Allow access to unconfigured fields
    
    // Check role-based access
    if (fieldConfig.requiresRole) {
      if (!fieldConfig.requiresRole.includes(userRole)) {
        return false;
      }
    }
    
    // Check privacy level access
    switch (privacyLevel) {
      case PrivacyLevel.FULL_ACCESS:
        return true;
      case PrivacyLevel.BUSINESS_ACCESS:
        return fieldConfig.classification !== DataClassification.PII &&
               fieldConfig.classification !== DataClassification.RESTRICTED;
      case PrivacyLevel.LIMITED_ACCESS:
        return fieldConfig.classification === DataClassification.PUBLIC ||
               fieldConfig.classification === DataClassification.INTERNAL;
      case PrivacyLevel.ANONYMIZED:
        return fieldConfig.classification === DataClassification.PUBLIC;
      default:
        return false;
    }
  }
  
  /**
   * Log data access for audit trail
   */
  private static logDataAccess(
    fieldName: string,
    accessGranted: boolean,
    userRole: string,
    userId: string,
    customerId: string,
    requestId: string
  ): void {
    const fieldConfig = CUSTOMER_FIELD_SECURITY[fieldName];
    if (!fieldConfig?.auditAccess) return;
    
    secureLogger.info('Customer data field access', {
      fieldName,
      fieldClassification: fieldConfig.classification,
      accessGranted,
      userRole,
      userId,
      customerId: customerId.substring(0, 8) + '***', // Partial customer ID for audit
      requestId,
      timestamp: new Date().toISOString()
    }, 'DATA_ACCESS_AUDIT');
  }
  
  /**
   * Mask a single customer similarity result
   */
  static maskCustomerSimilarityResult(
    customer: CustomerSimilarityResult,
    userRole: string,
    userId: string,
    requestId: string
  ): Partial<CustomerSimilarityResult> {
    const privacyLevel = this.getPrivacyLevel(userRole);
    const maskedCustomer: Partial<CustomerSimilarityResult> = {};
    
    // Process each field in the customer object
    for (const [fieldName, value] of Object.entries(customer)) {
      const hasAccess = this.hasFieldAccess(fieldName, userRole, privacyLevel);
      
      // Log data access for audit trail
      this.logDataAccess(fieldName, hasAccess, userRole, userId, customer.customerId, requestId);
      
      if (!hasAccess) {
        // Apply masking or remove field
        const fieldConfig = CUSTOMER_FIELD_SECURITY[fieldName];
        if (fieldConfig) {
          const maskedValue = this.applyMaskingStrategy(value, fieldConfig.maskingStrategy, fieldName);
          if (maskedValue !== undefined) {
            (maskedCustomer as any)[fieldName] = maskedValue;
          }
        }
      } else {
        // User has access - include original value
        (maskedCustomer as any)[fieldName] = value;
      }
    }
    
    return maskedCustomer;
  }
  
  /**
   * Mask an array of customer similarity results
   */
  static maskCustomerSimilarityResults(
    customers: CustomerSimilarityResult[],
    userRole: string,
    userId: string,
    requestId: string
  ): Partial<CustomerSimilarityResult>[] {
    return customers.map(customer => 
      this.maskCustomerSimilarityResult(customer, userRole, userId, requestId)
    );
  }
  
  /**
   * Create data access summary for response metadata
   */
  static createDataAccessSummary(
    userRole: string,
    privacyLevel: PrivacyLevel,
    requestedFields: string[]
  ): {
    privacyLevel: PrivacyLevel;
    accessibleFields: string[];
    maskedFields: string[];
    removedFields: string[];
  } {
    const accessibleFields: string[] = [];
    const maskedFields: string[] = [];
    const removedFields: string[] = [];
    
    for (const fieldName of requestedFields) {
      const hasAccess = this.hasFieldAccess(fieldName, userRole, privacyLevel);
      const fieldConfig = CUSTOMER_FIELD_SECURITY[fieldName];
      
      if (!hasAccess) {
        if (fieldConfig?.maskingStrategy === 'remove') {
          removedFields.push(fieldName);
        } else {
          maskedFields.push(fieldName);
        }
      } else {
        accessibleFields.push(fieldName);
      }
    }
    
    return {
      privacyLevel,
      accessibleFields,
      maskedFields,
      removedFields
    };
  }
}

/**
 * Export convenience functions
 */
export const maskVectorSearchResults = VectorDataMasking.maskCustomerSimilarityResults;
export const maskSingleCustomer = VectorDataMasking.maskCustomerSimilarityResult;
export const getDataAccessSummary = VectorDataMasking.createDataAccessSummary;