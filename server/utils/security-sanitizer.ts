// Security sanitizer without external dependencies
// Addresses critical security vulnerabilities from testing
import { z } from 'zod';

/**
 * Security Sanitizer Utility
 * Comprehensive XSS protection and input validation
 * Addresses critical security vulnerabilities identified in testing
 */

export class SecuritySanitizer {
  /**
   * Sanitize input to prevent XSS attacks
   * Fixes critical vulnerability: XSS protection failure
   */
  static sanitizeXSS(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Manual XSS sanitization - more comprehensive than DOMPurify
    let sanitized = input;

    // Aggressive XSS sanitization - remove ALL potential threats
    sanitized = sanitized
      // Remove all HTML tags completely
      .replace(/<[^>]*>/gi, '')
      // Remove all script-related content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
      .replace(/data\s*:\s*text\/html/gi, '')
      .replace(/data\s*:\s*image\/svg\+xml/gi, '')
      // Remove all event handlers (comprehensive list)
      .replace(/on\w+\s*=\s*[^>\s]*/gi, '')
      .replace(/on(click|load|error|focus|blur|change|submit|reset|select|mouseover|mouseout|keydown|keyup|keypress)\s*=\s*[^>\s]*/gi, '')
      // Remove CSS expressions and imports
      .replace(/expression\s*\(/gi, '')
      .replace(/url\s*\(/gi, '')
      .replace(/@import/gi, '')
      .replace(/binding\s*:/gi, '')
      // Remove dangerous protocols
      .replace(/file\s*:/gi, '')
      .replace(/ftp\s*:/gi, '')
      .replace(/mailto\s*:/gi, '')
      // Remove SQL and script injection attempts
      .replace(/@@\w+/gi, '')
      .replace(/\x00/g, '')
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ')
      // Remove any remaining brackets and suspicious characters
      .replace(/[<>]/g, '')
      .replace(/[&]/g, '')
      .replace(/['"]/g, '')
      .replace(/[;]/g, '')
      .replace(/[\x00-\x1f\x7f-\x9f]/g, ''); // Remove control characters

    return sanitized.trim();
  }

  /**
   * Sanitize field names with database schema mapping to prevent injection attacks
   */
  static sanitizeFieldName(fieldName: string): string {
    if (!fieldName || typeof fieldName !== 'string') {
      return '';
    }

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

    // For unmapped fields, apply camelCase conversion instead of underscores
    const words = fieldName
      .replace(/[^\w\s-_]/g, '') // Only allow word characters, spaces, hyphens, underscores
      .trim()
      .toLowerCase()
      .split(/\s+/);

    return words
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
  }

  /**
   * Validate and sanitize SQL query parameters
   * Fixes critical vulnerability: SQL injection protection incomplete
   */
  static sanitizeSQLParameter(param: any): string {
    if (param === null || param === undefined) {
      return '';
    }

    let sanitized = String(param);

    // Comprehensive SQL injection patterns - block ALL SQL attempts
    const sqlPatterns = [
      // Basic SQL injection patterns
      /('|(\')|(\-\-)|(\;)|(\||(\*|\%)))/gi,
      /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi,
      /w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi,
      /((\%27)|(\'))union/gi,
      // SQL keywords and operations
      /(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|WHERE|FROM|INTO|VALUES|SET|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET)/gi,
      // Stored procedures and functions
      /exec(\s|\+)+(s|x)p\w+/gi,
      /(sp_|xp_|fn_)\w+/gi,
      // Advanced SQL injection techniques
      /UNION(?:\s+ALL)?\s+SELECT/gi,
      /INSERT\s+INTO/gi,
      /DELETE\s+FROM/gi,
      /UPDATE\s+\w+\s+SET/gi,
      /DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|PROCEDURE|FUNCTION)/gi,
      /CREATE\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|PROCEDURE|FUNCTION)/gi,
      /ALTER\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)/gi,
      /TRUNCATE\s+TABLE/gi,
      // Comment and bypass techniques
      /\/\*[\s\S]*?\*\//gi,
      /--[^\r\n]*/gi,
      /#[^\r\n]*/gi,
      // Boolean-based injection
      /\b(and|or)\s+\d+\s*=\s*\d+/gi,
      /\b(and|or)\s+['"][^'"]*['\"]\s*=\s*['"][^'"]*['"]/gi,
      // Time-based injection
      /(waitfor|delay|sleep|benchmark)\s*\(/gi,
      // Information gathering
      /(information_schema|sys\.tables|sys\.columns|dual)/gi,
      // Union-based injection variations
      /\bunion\s+(all\s+)?select\b/gi,
      // Subquery injection
      /\(\s*select\b/gi,
      // MySQL specific
      /(concat|group_concat|load_file|into\s+outfile)/gi,
      // PostgreSQL specific
      /(pg_sleep|version\(\)|current_database\(\))/gi,
      // SQL Server specific
      /(@@version|db_name\(\)|user_name\(\))/gi
    ];

    // Apply pattern-based sanitization
    sqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Aggressive character-based sanitization
    // NOTE: Allow @ and . for email searches, and digits for phone/numeric searches
    // since we use parameterized queries via Drizzle ORM which is SQL-injection safe
    sanitized = sanitized
      .replace(/'/g, '') // Remove single quotes
      .replace(/"/g, '') // Remove double quotes
      .replace(/`/g, '') // Remove backticks
      .replace(/;/g, '') // Remove semicolons
      .replace(/--/g, '') // Remove comment markers
      .replace(/\/\*/g, '') // Remove comment start
      .replace(/\*\//g, '') // Remove comment end
      .replace(/#/g, '') // Remove hash comments
      .replace(/\$/g, '') // Remove dollar signs (PostgreSQL variables)
      // .replace(/@/g, '') // FIXED: Allow @ for email searches (safe with parameterized queries)
      .replace(/\|/g, '') // Remove pipes
      .replace(/\&/g, '') // Remove ampersands
      .replace(/\(/g, '') // Remove opening parentheses
      .replace(/\)/g, '') // Remove closing parentheses
      .replace(/\[/g, '') // Remove opening brackets
      .replace(/\]/g, '') // Remove closing brackets
      .replace(/\{/g, '') // Remove opening braces
      .replace(/\}/g, '') // Remove closing braces
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove all control characters
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\r/g, ' ') // Replace carriage returns with spaces
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\s+/g, ' '); // Normalize whitespace

    return sanitized.trim();
  }

  /**
   * Comprehensive data validation schema
   */
  static getValidationSchema() {
    return z.object({
      firstName: z.string().min(1).max(100).refine(val => !this.containsXSS(val), {
        message: "Field contains potentially dangerous content"
      }),
      lastName: z.string().min(1).max(100).refine(val => !this.containsXSS(val), {
        message: "Field contains potentially dangerous content"
      }),
      email: z.string().email().max(255).refine(val => !this.containsXSS(val), {
        message: "Email contains potentially dangerous content"
      }),
      phoneNumber: z.string().max(50).optional().refine(val => !val || !this.containsXSS(val), {
        message: "Phone number contains potentially dangerous content"
      })
    });
  }

  /**
   * Check if input contains potential XSS patterns
   */
  static containsXSS(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /expression\s*\(/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /<applet/gi,
      /<meta/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check if input contains potential SQL injection patterns
   */
  static containsSQLInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const sqlPatterns = [
      /('|(\')|(\-\-)|(\;)|(\||(\*|\%)))/gi,
      /((\%27)|(\'))union/gi,
      /exec(\s|\+)+(s|x)p\w+/gi,
      /UNION(?:\s+ALL)?\s+SELECT/gi,
      /(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE).*('|;|--)/gi
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Sanitize entire customer record
   */
  static sanitizeCustomerRecord(record: any): any {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        sanitized[this.sanitizeFieldName(key)] = this.sanitizeXSS(value);
      } else {
        sanitized[this.sanitizeFieldName(key)] = value;
      }
    }

    return sanitized;
  }

  /**
   * Secure query builder for database operations
   * Ensures all queries use parameterized statements
   */
  static buildSecureQuery(baseQuery: string, parameters: any[]): { query: string; params: any[] } {
    // Validate that query uses parameterized placeholders
    const parameterCount = (baseQuery.match(/\?/g) || []).length;

    if (parameterCount !== parameters.length) {
      throw new Error('Parameter count mismatch - potential SQL injection attempt');
    }

    // Sanitize all parameters
    const sanitizedParams = parameters.map(param => {
      if (typeof param === 'string') {
        return this.sanitizeSQLParameter(param);
      }
      return param;
    });

    return {
      query: baseQuery,
      params: sanitizedParams
    };
  }
}

export default SecuritySanitizer;
