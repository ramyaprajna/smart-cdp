import { secureLogger } from '../utils/secure-logger';
/**
 * Enhanced Security Sanitization Utilities
 *
 * Comprehensive sanitization functions for preventing XSS, SQL injection,
 * and other security vulnerabilities in user input processing.
 *
 * @created August 13, 2025 - Enhanced security for mapping review system
 */

// Security patterns for comprehensive sanitization
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed[^>]*>/gi,
  /<applet[^>]*>/gi,
  /<meta[^>]*>/gi,
  /<img[^>]*onerror[^>]*>/gi,
  /<[^>]*on\w+\s*=\s*[^>]*>/gi, // Event handlers like onclick, onload, etc.
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /expression\s*\(/gi,
  /@import/gi,
  /binding\s*:/gi
];

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
  /(\b(OR|AND)\s+\w+\s*=\s*\w+\b)/gi,
  /(';|'|"|--|\/\*|\*\/)/g,
  /(\bCAST\b|\bCONVERT\b|\bCHAR\b|\bNTEXT\b)/gi,
  /(\bWAITFOR\b|\bDELAY\b)/gi,
  /(\bsp_\w+\b|\bxp_\w+\b)/gi
];

// International character mappings for proper field name conversion
// Note: German characters prioritized with proper diacritic conversion
const INTERNATIONAL_CHAR_MAP: Record<string, string> = {
  // French characters
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u',
  'ÿ': 'y', 'ý': 'y',
  'ç': 'c',

  // German characters (prioritized - proper diacritic handling)
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',

  // Spanish characters
  'ñ': 'n'
};

/**
 * Comprehensive XSS sanitization function
 * Removes all dangerous HTML/JavaScript patterns and events
 */
export function sanitizeXSS(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Remove all XSS patterns
  XSS_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // HTML entity decode and re-encode to prevent bypass attempts
  sanitized = sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');

  // Remove any remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Encode dangerous characters
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized.trim();
}

/**
 * SQL injection prevention sanitization
 * Removes dangerous SQL keywords and patterns
 */
export function sanitizeSQL(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Remove SQL injection patterns
  SQL_INJECTION_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Remove dangerous characters commonly used in SQL injection
  sanitized = sanitized.replace(/['"`;\\]/g, '');

  return sanitized.trim();
}

/**
 * Comprehensive field name sanitization with database schema mapping
 * Handles international characters, XSS prevention, SQL injection prevention,
 * and maps common field names to database schema fields
 */
export function sanitizeFieldName(fieldName: string): string {
  if (typeof fieldName !== 'string' || fieldName.length === 0) return '';

  // Define exact mapping from common headers to database fields
  const fieldMappings: Record<string, string> = {
    'first name': 'firstName',
    'first name *': 'firstName',
    'firstname': 'firstName',
    'fname': 'firstName',
    'given_name': 'firstName',
    'last name': 'lastName',
    'last name *': 'lastName',
    'lastname': 'lastName',
    'lname': 'lastName',
    'surname': 'lastName',
    'email': 'email',
    'email address': 'email',
    'email address *': 'email',
    'email_address': 'email',
    'e_mail': 'email',
    'phone': 'phoneNumber',
    'phone number': 'phoneNumber',
    'phonenumber': 'phoneNumber',
    'phone_number': 'phoneNumber',
    'date of birth': 'dateOfBirth',
    'dateofbirth': 'dateOfBirth',
    'date_of_birth': 'dateOfBirth',
    'dob': 'dateOfBirth',
    'gender': 'gender',
    'customer segment': 'customerSegment',
    'customersegment': 'customerSegment',
    'customer_segment': 'customerSegment',
    'segment': 'customerSegment',
    'lifetime value': 'lifetimeValue',
    'lifetimevalue': 'lifetimeValue',
    'lifetime_value': 'lifetimeValue',
    'ltv': 'lifetimeValue',
    'current address': 'currentAddress',
    'currentaddress': 'currentAddress',
    'current_address': 'currentAddress',
    'address': 'currentAddress'
  };

  // First normalize for mapping check
  const normalized = fieldName
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special chars including *
    .replace(/\s+/g, ' '); // Normalize spaces

  // Check for direct field mapping first
  if (fieldMappings[normalized]) {
    return fieldMappings[normalized];
  }

  // Apply security sanitization for unmapped fields
  let sanitized = sanitizeXSS(fieldName);
  sanitized = sanitizeSQL(sanitized);

  // Convert international characters to ASCII equivalents
  sanitized = convertInternationalCharacters(sanitized);

  // Remove HTML entities that might have been left
  sanitized = sanitized.replace(/&[a-zA-Z0-9#]+;/g, '');

  // Ensure valid field name format with camelCase conversion for unmapped fields
  const words = sanitized
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_') // Replace multiple spaces with single underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .replace(/[^a-z0-9_]/g, '') // Keep only alphanumeric and underscore
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .split('_');

  // Convert to camelCase for unmapped fields
  sanitized = words
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');

  // Ensure it starts with a letter or underscore
  if (sanitized && /^[0-9]/.test(sanitized)) {
    sanitized = 'field' + sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
  }

  // Limit length for security
  sanitized = sanitized.substring(0, 50);

  // If empty after sanitization, provide fallback
  if (!sanitized) {
    sanitized = 'sanitizedField';
  }

  return sanitized;
}

/**
 * Convert international characters to ASCII equivalents
 * Handles proper conversion for international field names with robust regex escaping
 */
export function convertInternationalCharacters(input: string): string {
  if (typeof input !== 'string') return '';

  let result = input;

  try {
    // Apply character mappings with properly escaped regex patterns
    for (const [intlChar, asciiChar] of Object.entries(INTERNATIONAL_CHAR_MAP)) {
      // Escape special regex characters to prevent syntax errors
      const escapedChar = intlChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedChar, 'g');
      result = result.replace(regex, asciiChar);
    }

    // Handle common punctuation and symbols safely with direct replacement
    result = result
      .replace(/\s+/g, '_')      // Multiple spaces to single underscore
      .replace(/-+/g, '_')       // Hyphens to underscore
      .replace(/\.+/g, '_')      // Periods to underscore
      .replace(/\/+/g, '_')      // Forward slashes to underscore
      .replace(/\\+/g, '_')      // Backslashes to underscore
      .replace(/[:;,!?()[\]{}@#$%^&*+=|~`<>]+/g, '_'); // Other symbols to underscore

  } catch (regexError) {
    secureLogger.warn(`Warning: Regex conversion failed, using fallback processing:`, { error: String(regexError) });
    // Fallback: Simple character-by-character replacement
    result = input.replace(/[^\w\s-]/g, '_');
  }

  return result;
}

/**
 * Enhanced international header processing
 * Handles common international field name patterns with proper normalization
 */
export function processInternationalHeaders(headers: string[]): string[] {
  return headers.map(header => {
    if (typeof header !== 'string') return 'invalid_field';

    // Handle common international field patterns
    let processed = header.toLowerCase().trim();

    // Special handling for common international patterns
    const patterns = {
      // Email patterns
      'adresse e-mail': 'adresse_email',
      'email address': 'email_address',
      'e-mail': 'email',
      'courrier électronique': 'email',

      // Phone patterns
      'téléphone': 'telephone',
      'telefon': 'telephone',
      'telefono': 'telephone',
      'phone number': 'phone_number',
      'numéro de téléphone': 'telephone',

      // Name patterns
      'prénom': 'first_name',
      'nom de famille': 'last_name',
      'apellido': 'last_name',
      'vorname': 'first_name',
      'nachname': 'last_name',

      // Address patterns
      'adresse': 'address',
      'dirección': 'address',
      'indirizzo': 'address',

      // Common business terms
      'société': 'company',
      'empresa': 'company',
      'unternehmen': 'company',
      'ville': 'city',
      'ciudad': 'city',
      'stadt': 'city'
    };

    // Apply pattern matching first
    for (const [pattern, replacement] of Object.entries(patterns)) {
      if (processed.includes(pattern)) {
        processed = processed.replace(pattern, replacement);
        break;
      }
    }

    // Then apply standard sanitization
    return sanitizeFieldName(processed);
  });
}

/**
 * Validate that a field name meets security requirements
 */
export function validateFieldNameSecurity(fieldName: string): boolean {
  if (typeof fieldName !== 'string' || fieldName.length === 0) return false;
  if (fieldName.length > 50) return false;

  // Check for XSS patterns
  const hasXSS = XSS_PATTERNS.some(pattern => pattern.test(fieldName));
  if (hasXSS) return false;

  // Check for SQL injection patterns
  const hasSQL = SQL_INJECTION_PATTERNS.some(pattern => pattern.test(fieldName));
  if (hasSQL) return false;

  // Check valid field name format
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName);
}

/**
 * Sanitize sample data values to prevent information leakage
 */
export function sanitizeSampleData(values: any[], maxValues: number = 3): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .slice(0, maxValues)
    .map(value => {
      if (value === null || value === undefined) return '[empty]';

      let sanitized = String(value);

      // Mask potentially sensitive patterns
      sanitized = sanitized
        .replace(/\d{3}-\d{2}-\d{4}/g, 'XXX-XX-XXXX') // SSN pattern
        .replace(/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g, 'XXXX-XXXX-XXXX-XXXX') // Credit card
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]') // Email addresses
        .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]'); // Phone numbers

      // Apply XSS sanitization
      sanitized = sanitizeXSS(sanitized);

      return sanitized.substring(0, 100); // Limit length
    });
}

export const SecuritySanitization = {
  sanitizeXSS,
  sanitizeSQL,
  sanitizeFieldName,
  convertInternationalCharacters,
  processInternationalHeaders,
  validateFieldNameSecurity,
  sanitizeSampleData
};
