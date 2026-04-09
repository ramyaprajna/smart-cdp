/**
 * Client-side Validation Helpers
 * Reusable validation utilities for forms and data
 */

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Email validation with comprehensive pattern matching
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!email || email.trim() === '') {
    errors.push('Email is required');
    return { isValid: false, errors, warnings };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    errors.push('Please enter a valid email address');
  }

  // Check for common issues
  if (email.includes('..')) {
    errors.push('Email cannot contain consecutive dots');
  }

  if (email.startsWith('.') || email.endsWith('.')) {
    errors.push('Email cannot start or end with a dot');
  }

  // Warnings for suspicious patterns
  if (email.includes('+')) {
    warnings.push('Email contains plus sign - ensure this is intentional');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Phone number validation with international support
 */
export function validatePhoneNumber(phone: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!phone || phone.trim() === '') {
    errors.push('Phone number is required');
    return { isValid: false, errors, warnings };
  }

  // Clean phone number (remove spaces, parentheses, dashes)
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // Basic pattern: optional + followed by 7-15 digits
  const phonePattern = /^[\+]?[\d]{7,15}$/;
  if (!phonePattern.test(cleanPhone)) {
    errors.push('Please enter a valid phone number');
  }

  // Check for obviously invalid patterns
  if (/^0+$/.test(cleanPhone)) {
    errors.push('Phone number cannot be all zeros');
  }

  if (cleanPhone.length < 7) {
    errors.push('Phone number is too short');
  }

  if (cleanPhone.length > 15) {
    errors.push('Phone number is too long');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generic field validation using rules
 */
export function validateField(value: any, rules: ValidationRule, fieldName = 'Field'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required check
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    errors.push(`${fieldName} is required`);
    return { isValid: false, errors, warnings };
  }

  // Skip other validations if value is empty and not required
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { isValid: true, errors, warnings };
  }

  const stringValue = String(value);

  // Length validations
  if (rules.minLength && stringValue.length < rules.minLength) {
    errors.push(`${fieldName} must be at least ${rules.minLength} characters`);
  }

  if (rules.maxLength && stringValue.length > rules.maxLength) {
    errors.push(`${fieldName} cannot exceed ${rules.maxLength} characters`);
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(stringValue)) {
    errors.push(`${fieldName} format is invalid`);
  }

  // Custom validation
  if (rules.custom) {
    const customResult = rules.custom(value);
    if (typeof customResult === 'string') {
      errors.push(customResult);
    } else if (customResult === false) {
      errors.push(`${fieldName} is invalid`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate multiple fields at once
 */
export function validateForm(
  data: Record<string, any>,
  rules: Record<string, ValidationRule>
): { isValid: boolean; errors: Record<string, string[]>; warnings: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  let isValid = true;

  Object.entries(rules).forEach(([fieldName, fieldRules]) => {
    const result = validateField(data[fieldName], fieldRules, fieldName);

    if (!result.isValid) {
      isValid = false;
      errors[fieldName] = result.errors;
    }

    if (result.warnings.length > 0) {
      warnings[fieldName] = result.warnings;
    }
  });

  return { isValid, errors, warnings };
}

/**
 * File validation utilities
 */
export function validateFile(file: File, options: {
  maxSize?: number; // bytes
  allowedTypes?: string[];
  allowedExtensions?: string[];
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!file) {
    errors.push('No file selected');
    return { isValid: false, errors, warnings };
  }

  // Size validation
  if (options.maxSize && file.size > options.maxSize) {
    const maxSizeMB = options.maxSize / (1024 * 1024);
    errors.push(`File size cannot exceed ${maxSizeMB.toFixed(1)}MB`);
  }

  // Type validation
  if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }

  // Extension validation
  if (options.allowedExtensions) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !options.allowedExtensions.includes(extension)) {
      errors.push(`File extension .${extension} is not allowed`);
    }
  }

  // Warnings for large files
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > 10) {
    warnings.push('Large file detected - upload may take longer');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Password strength validation
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors, warnings };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    warnings.push('Password should contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    warnings.push('Password should contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    warnings.push('Password should contain at least one number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    warnings.push('Password should contain at least one special character');
  }

  if (/^(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain repeated characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
