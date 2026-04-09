/**
 * ⚠️ CRITICAL SECURITY MODULE - ENVIRONMENT VARIABLE PROTECTION ⚠️
 * 
 * Comprehensive environment variable security validation and protection.
 * Prevents credential exposure through logging, validation errors, and debug output.
 * 
 * @module EnvironmentSecurity
 * @created September 16, 2025
 * @security_level CRITICAL
 * 
 * @features
 * - Safe environment variable access with automatic redaction
 * - Production environment validation
 * - Credential leak prevention in error messages
 * - Development vs production environment segregation
 * - Environment variable existence validation without value exposure
 */

import { secureLogger } from './secure-logger';

export interface EnvironmentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingVariables: string[];
  environment: string;
  securityLevel: 'safe' | 'warning' | 'critical';
}

export interface EnvironmentConfig {
  requiredInProduction: string[];
  requiredInDevelopment: string[];
  sensitiveVariables: string[];
  optionalVariables: string[];
}

export class EnvironmentSecurity {
  private static readonly SENSITIVE_VARIABLES = [
    'DATABASE_URL',
    'PROD_DATABASE_URL', 
    'JWT_SECRET',
    'SESSION_SECRET',
    'OPENAI_API_KEY',
    'SENDGRID_API_KEY',
    'STRIPE_SECRET_KEY',
    'GITHUB_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'PROD_PGPASSWORD',
    'PROD_PGUSER',
    'API_SECRET',
    'PRIVATE_KEY',
    'ENCRYPTION_KEY',
    'WEBHOOK_SECRET',
    'PII_MASKING_SALT'
  ];

  private static readonly REQUIRED_PRODUCTION_VARS = [
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'SESSION_SECRET',
    'PII_MASKING_SALT'
  ];

  private static readonly REQUIRED_DEVELOPMENT_VARS = [
    'NODE_ENV',
    'DATABASE_URL'
  ];

  /**
   * Safely access environment variable without logging its value
   * Returns existence status and sanitized value if needed
   */
  static safeGet(varName: string, options: {
    required?: boolean;
    defaultValue?: string;
    logAccess?: boolean;
  } = {}): { exists: boolean; value?: string; error?: string } {
    const { required = false, defaultValue, logAccess = true } = options;
    
    try {
      const value = process.env[varName];
      const exists = value !== undefined && value !== '';
      
      if (logAccess && this.SENSITIVE_VARIABLES.includes(varName)) {
        secureLogger.debug(`Environment variable access: ${varName}`, 
          { 
            exists,
            isSensitive: true,
            required 
          }, 
          'ENV_SECURITY'
        );
      }
      
      if (required && !exists && !defaultValue) {
        const error = `Required environment variable ${varName} is not set`;
        secureLogger.error(error, { varName, required }, 'ENV_SECURITY');
        return { exists: false, error };
      }
      
      return { 
        exists,
        value: exists ? value : defaultValue
      };
      
    } catch (error) {
      const errorMsg = `Failed to access environment variable ${varName}`;
      secureLogger.error(errorMsg, { varName, error }, 'ENV_SECURITY');
      return { exists: false, error: errorMsg };
    }
  }

  /**
   * Validate all required environment variables for current environment
   */
  static validateEnvironment(): EnvironmentValidationResult {
    const environment = process.env.NODE_ENV || 'development';
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingVariables: string[] = [];
    
    // Determine required variables based on environment
    const requiredVars = environment === 'production' 
      ? this.REQUIRED_PRODUCTION_VARS 
      : this.REQUIRED_DEVELOPMENT_VARS;
    
    // Check required variables
    for (const varName of requiredVars) {
      const result = this.safeGet(varName, { required: true, logAccess: false });
      if (!result.exists) {
        errors.push(`Missing required environment variable: ${varName}`);
        missingVariables.push(varName);
      }
    }
    
    // Production-specific security checks
    if (environment === 'production') {
      this.validateProductionSecurity(warnings, errors);
    }
    
    // Development-specific warnings
    if (environment === 'development') {
      this.validateDevelopmentSecurity(warnings);
    }
    
    // Security level assessment
    let securityLevel: 'safe' | 'warning' | 'critical' = 'safe';
    if (errors.length > 0) {
      securityLevel = 'critical';
    } else if (warnings.length > 0) {
      securityLevel = 'warning';
    }
    
    const result: EnvironmentValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingVariables,
      environment,
      securityLevel
    };
    
    // Log validation results
    if (result.isValid) {
      secureLogger.info(`✅ Environment validation passed for ${environment}`, 
        { 
          environment,
          warningCount: warnings.length,
          securityLevel 
        }, 
        'ENV_SECURITY'
      );
    } else {
      secureLogger.error(`❌ Environment validation failed for ${environment}`, 
        { 
          environment,
          errorCount: errors.length,
          warningCount: warnings.length,
          securityLevel 
        }, 
        'ENV_SECURITY'
      );
    }
    
    return result;
  }
  
  /**
   * Production environment security validation
   */
  private static validateProductionSecurity(warnings: string[], errors: string[]): void {
    // Check for development-style configurations in production
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv !== 'production') {
      errors.push(`NODE_ENV must be 'production' in production environment, got: ${nodeEnv}`);
    }
    
    // Check for weak JWT secrets
    const jwtSecret = this.safeGet('JWT_SECRET', { logAccess: false });
    if (jwtSecret.exists && jwtSecret.value) {
      if (jwtSecret.value.length < 32) {
        warnings.push('JWT_SECRET should be at least 32 characters long for production');
      }
      if (jwtSecret.value.includes('change-in-production') || 
          jwtSecret.value.includes('your-super-secret')) {
        errors.push('JWT_SECRET appears to be using default/example value in production');
      }
    }
    
    // Check for development database URLs in production
    const dbUrl = this.safeGet('DATABASE_URL', { logAccess: false });
    if (dbUrl.exists && dbUrl.value) {
      if (dbUrl.value.includes('localhost') || 
          dbUrl.value.includes('127.0.0.1') ||
          dbUrl.value.includes('dev') ||
          dbUrl.value.includes('test')) {
        errors.push('DATABASE_URL appears to point to development/test database in production');
      }
    }
    
    // Check for debug mode indicators
    if (process.env.DEBUG) {
      warnings.push('DEBUG environment variable is set in production environment');
    }
    
    if (process.env.LOG_LEVEL === 'debug') {
      warnings.push('LOG_LEVEL is set to debug in production environment');
    }
  }
  
  /**
   * Development environment security validation
   */
  private static validateDevelopmentSecurity(warnings: string[]): void {
    // Check for production URLs in development
    const dbUrl = this.safeGet('DATABASE_URL', { logAccess: false });
    if (dbUrl.exists && dbUrl.value) {
      if (dbUrl.value.includes('.aws.neon.tech') && 
          !dbUrl.value.includes('dev') && 
          !dbUrl.value.includes('test')) {
        warnings.push('DATABASE_URL appears to point to production database in development');
      }
    }

    // PII_MASKING_SALT should be set in all environments for secure hashing
    const piiSalt = this.safeGet('PII_MASKING_SALT', { logAccess: false });
    if (!piiSalt.exists) {
      warnings.push('PII_MASKING_SALT is not set — PII hashing will not be secure. Set this secret before processing real customer data.');
    }
    
    // Check for missing development tools
    const requiredDevVars = ['NODE_ENV'];
    for (const varName of requiredDevVars) {
      const result = this.safeGet(varName, { logAccess: false });
      if (!result.exists) {
        warnings.push(`Development environment variable ${varName} is not set`);
      }
    }
  }
  
  /**
   * Get database connection status without exposing credentials
   */
  static getDatabaseStatus(): { 
    configured: boolean; 
    type: 'postgresql' | 'mysql' | 'mongodb' | 'unknown';
    host?: string;
    database?: string;
    ssl?: boolean;
  } {
    const dbUrl = this.safeGet('DATABASE_URL', { logAccess: false });
    
    if (!dbUrl.exists || !dbUrl.value) {
      return { configured: false, type: 'unknown' };
    }
    
    try {
      const url = new URL(dbUrl.value);
      const type = url.protocol.slice(0, -1) as any;
      
      return {
        configured: true,
        type: ['postgresql', 'postgres'].includes(type) ? 'postgresql' : 
              type === 'mysql' ? 'mysql' :
              ['mongodb', 'mongo'].includes(type) ? 'mongodb' : 'unknown',
        host: url.hostname ? `${url.hostname}:${url.port || 5432}` : undefined,
        database: url.pathname ? url.pathname.slice(1) : undefined,
        ssl: url.searchParams.get('sslmode') === 'require' || 
             url.searchParams.get('ssl') === 'true'
      };
    } catch (error) {
      secureLogger.warn('Failed to parse DATABASE_URL format', 
        { error: error instanceof Error ? error.message : String(error) }, 
        'ENV_SECURITY'
      );
      return { configured: true, type: 'unknown' };
    }
  }
  
  /**
   * Create production-safe environment summary
   */
  static getEnvironmentSummary(): {
    environment: string;
    database: ReturnType<typeof EnvironmentSecurity.getDatabaseStatus>;
    requiredVariablesSet: boolean;
    sensitiveVariablesCount: number;
    securityWarnings: string[];
  } {
    const validation = this.validateEnvironment();
    const database = this.getDatabaseStatus();
    
    // Count sensitive variables that are set (without logging values)
    const sensitiveVariablesCount = this.SENSITIVE_VARIABLES
      .filter(varName => this.safeGet(varName, { logAccess: false }).exists)
      .length;
    
    return {
      environment: validation.environment,
      database,
      requiredVariablesSet: validation.isValid,
      sensitiveVariablesCount,
      securityWarnings: validation.warnings
    };
  }
  
  /**
   * Prevent credential exposure in error messages
   */
  static sanitizeErrorMessage(message: string): string {
    let sanitized = message;
    
    // Remove database URLs
    sanitized = sanitized.replace(
      /postgresql:\/\/[^@\s]+:[^@\s]+@[^\s\/]+\/[^\s]+/gi,
      'postgresql://[REDACTED]@[REDACTED]/[REDACTED]'
    );
    
    sanitized = sanitized.replace(
      /postgres:\/\/[^@\s]+:[^@\s]+@[^\s\/]+\/[^\s]+/gi,
      'postgres://[REDACTED]@[REDACTED]/[REDACTED]'
    );
    
    // Remove environment variable values  
    for (const varName of this.SENSITIVE_VARIABLES) {
      const pattern = new RegExp(`${varName}[=:\\s]+[^\\s,}"']+`, 'gi');
      sanitized = sanitized.replace(pattern, `${varName}=[REDACTED]`);
    }
    
    return sanitized;
  }
}

// Global validation function for startup
export function validateApplicationEnvironment(): EnvironmentValidationResult {
  secureLogger.info('🔐 Starting environment security validation...', {}, 'ENV_SECURITY');
  
  const result = EnvironmentSecurity.validateEnvironment();
  
  if (!result.isValid) {
    secureLogger.critical('❌ Environment validation failed - application cannot start safely', 
      {
        errors: result.errors,
        warnings: result.warnings,
        environment: result.environment
      }, 
      'ENV_SECURITY'
    );
    
    // In production, fail hard on validation errors
    if (result.environment === 'production' && result.securityLevel === 'critical') {
      throw new Error(`Environment validation failed: ${result.errors.join(', ')}`);
    }
  }
  
  return result;
}

// Safe environment variable getter for application use
export const safeEnv = {
  get: (varName: string, defaultValue?: string) => 
    EnvironmentSecurity.safeGet(varName, { defaultValue }).value,
  required: (varName: string) => 
    EnvironmentSecurity.safeGet(varName, { required: true }).value,
  exists: (varName: string) => 
    EnvironmentSecurity.safeGet(varName).exists,
  getDatabaseStatus: () => EnvironmentSecurity.getDatabaseStatus(),
  getEnvironmentSummary: () => EnvironmentSecurity.getEnvironmentSummary()
};