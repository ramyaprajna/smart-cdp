/**
 * ⚠️ CRITICAL SECURITY MODULE - SECURE LOGGING UTILITY ⚠️
 * 
 * Comprehensive logging sanitization to prevent credential exposure in application logs.
 * This module filters out sensitive information including database credentials, API keys,
 * passwords, tokens, and other confidential data from all log statements.
 *
 * @module SecureLogger
 * @created September 16, 2025
 * @security_level CRITICAL
 * 
 * @features
 * - Automatic credential filtering for DATABASE_URL and connection strings
 * - API key redaction for OpenAI, SendGrid, and other services
 * - Password and token sanitization in error messages
 * - Environment variable protection
 * - Production-safe logging levels
 * - Structured logging with security metadata
 *
 * @compliance
 * - Prevents credential leakage in production logs
 * - Meets security requirements for database credential protection
 * - Compliant with data protection standards
 */

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
  category?: string;
  requestId?: string;
}

export interface SecureLogConfig {
  enableDebugLogging: boolean;
  enableSensitiveDataRedaction: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  environment: 'development' | 'production' | 'test';
}

export class SecureLogger {
  private config: SecureLogConfig;
  private static instance: SecureLogger;

  // Sensitive data patterns to redact
  private static readonly SENSITIVE_PATTERNS = [
    // Database connection strings
    /postgresql:\/\/[^@]+:[^@]+@[^\/]+\/[^\s\?]+/gi,
    /postgres:\/\/[^@]+:[^@]+@[^\/]+\/[^\s\?]+/gi,
    /mysql:\/\/[^@]+:[^@]+@[^\/]+\/[^\s\?]+/gi,
    /mongodb:\/\/[^@]+:[^@]+@[^\/]+\/[^\s\?]+/gi,
    
    // API Keys and tokens
    /sk-[a-zA-Z0-9]{48,}/gi,                    // OpenAI API keys
    /pk_[a-zA-Z0-9]{24,}/gi,                    // Stripe public keys
    /sk_[a-zA-Z0-9]{24,}/gi,                    // Stripe secret keys
    /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/gi, // SendGrid API keys
    /ghp_[a-zA-Z0-9]{36}/gi,                    // GitHub personal access tokens
    /gho_[a-zA-Z0-9]{36}/gi,                    // GitHub OAuth tokens
    
    // JWT tokens
    /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
    
    // Neon database credentials
    /npg_[a-zA-Z0-9]{12,}/gi,                   // Neon password format
    /ep-[a-zA-Z0-9-]+\.c-[0-9]+\.[a-zA-Z0-9.-]+\.neon\.tech/gi, // Neon hostnames
    
    // Generic password patterns
    /password["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /pass["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /secret["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /token["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /key["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    
    // Environment variable patterns
    /DATABASE_URL["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /JWT_SECRET["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /SESSION_SECRET["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /OPENAI_API_KEY["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
    /SENDGRID_API_KEY["\s]*[:=]["\s]*[^"\s\n\r,}]+/gi,
  ];

  // Environment variables that should never be logged
  private static readonly SENSITIVE_ENV_VARS = [
    'DATABASE_URL',
    'JWT_SECRET', 
    'SESSION_SECRET',
    'OPENAI_API_KEY',
    'SENDGRID_API_KEY',
    'PROD_DATABASE_URL',
    'PROD_PGPASSWORD',
    'AWS_SECRET_ACCESS_KEY',
    'STRIPE_SECRET_KEY',
    'GITHUB_TOKEN',
    'API_SECRET',
    'PRIVATE_KEY'
  ];

  constructor(config: Partial<SecureLogConfig> = {}) {
    this.config = {
      enableDebugLogging: config.enableDebugLogging ?? (process.env.NODE_ENV === 'development'),
      enableSensitiveDataRedaction: config.enableSensitiveDataRedaction ?? true,
      logLevel: config.logLevel ?? (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
      environment: (config.environment ?? process.env.NODE_ENV ?? 'development') as any
    };
  }

  static getInstance(config?: Partial<SecureLogConfig>): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger(config);
    }
    return SecureLogger.instance;
  }

  /**
   * Sanitize sensitive data from any string or object
   * Removes database credentials, API keys, passwords, and other sensitive information
   * 
   * @param data Data to sanitize (string, object, or any other type)
   * @returns Sanitized data with sensitive information redacted
   */
  sanitizeData(data: any): any {
    if (!this.config.enableSensitiveDataRedaction) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitizeData(item));
      }

      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        // Redact sensitive keys completely
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED FOR SECURITY]';
        } else {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sanitize sensitive patterns from strings
   */
  private sanitizeString(str: string): string {
    let sanitized = str;

    // Apply all sensitive patterns
    for (const pattern of SecureLogger.SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_CREDENTIAL]');
    }

    // Additional sanitization for partial URLs
    sanitized = sanitized.replace(
      /postgresql:\/\/[^@]+@/gi, 
      'postgresql://[USER]:[PASSWORD]@'
    );
    
    sanitized = sanitized.replace(
      /postgres:\/\/[^@]+@/gi, 
      'postgres://[USER]:[PASSWORD]@'
    );

    return sanitized;
  }

  /**
   * Check if a key is sensitive and should be redacted
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    const sensitiveKeywords = [
      'password', 'pass', 'secret', 'token', 'key', 'credential',
      'auth', 'jwt', 'api_key', 'apikey', 'access_token', 'refresh_token',
      'database_url', 'connection_string', 'conn_str'
    ];

    return sensitiveKeywords.some(keyword => lowerKey.includes(keyword));
  }

  /**
   * Check if current log level should be output
   */
  private shouldLog(level: LogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error', 'critical'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Format log entry with security metadata
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp?.toISOString() || new Date().toISOString();
    const level = entry.level.toUpperCase().padEnd(8);
    const category = entry.category ? `[${entry.category}]` : '[APP]';
    const requestId = entry.requestId ? `[${entry.requestId}]` : '';
    
    let logLine = `[${timestamp}] ${level} ${category}${requestId} ${entry.message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const sanitizedMetadata = this.sanitizeData(entry.metadata);
      logLine += ` | Metadata: ${JSON.stringify(sanitizedMetadata)}`;
    }

    return logLine;
  }

  /**
   * Secure logging methods
   */
  debug(message: string, metadata?: Record<string, any>, category?: string, requestId?: string): void {
    if (!this.shouldLog('debug')) return;
    
    const entry: LogEntry = {
      level: 'debug',
      message: this.sanitizeString(message),
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      category,
      requestId,
      timestamp: new Date()
    };

    console.debug(this.formatLogEntry(entry));
  }

  info(message: string, metadata?: Record<string, any>, category?: string, requestId?: string): void {
    if (!this.shouldLog('info')) return;
    
    const entry: LogEntry = {
      level: 'info',
      message: this.sanitizeString(message),
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      category,
      requestId,
      timestamp: new Date()
    };

    console.info(this.formatLogEntry(entry));
  }

  warn(message: string, metadata?: Record<string, any>, category?: string, requestId?: string): void {
    if (!this.shouldLog('warn')) return;
    
    const entry: LogEntry = {
      level: 'warn',
      message: this.sanitizeString(message),
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      category,
      requestId,
      timestamp: new Date()
    };

    console.warn(this.formatLogEntry(entry));
  }

  error(message: string, metadata?: Record<string, any>, category?: string, requestId?: string): void {
    if (!this.shouldLog('error')) return;
    
    const entry: LogEntry = {
      level: 'error',
      message: this.sanitizeString(message),
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      category,
      requestId,
      timestamp: new Date()
    };

    console.error(this.formatLogEntry(entry));
  }

  critical(message: string, metadata?: Record<string, any>, category?: string, requestId?: string): void {
    const entry: LogEntry = {
      level: 'critical',
      message: this.sanitizeString(message),
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      category,
      requestId,
      timestamp: new Date()
    };

    console.error(this.formatLogEntry(entry));
  }

  /**
   * Validate environment safety for production
   * Returns warnings if environment variables might be exposed
   */
  validateEnvironmentSafety(): { safe: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check if debug logging is enabled in production
    if (this.config.environment === 'production' && this.config.enableDebugLogging) {
      warnings.push('Debug logging is enabled in production environment');
    }

    // Check if sensitive data redaction is disabled
    if (!this.config.enableSensitiveDataRedaction) {
      warnings.push('Sensitive data redaction is disabled - credentials may be exposed');
    }

    // Check log level in production
    if (this.config.environment === 'production' && 
        ['debug', 'info'].includes(this.config.logLevel)) {
      warnings.push(`Log level '${this.config.logLevel}' may be too verbose for production`);
    }

    // Check for environment variables that should not be set in production
    const exposedVars = SecureLogger.SENSITIVE_ENV_VARS.filter(envVar => 
      process.env[envVar] && process.env.NODE_ENV === 'production'
    );

    if (exposedVars.length > 0 && this.config.logLevel === 'debug') {
      warnings.push(`Sensitive environment variables detected with debug logging: ${exposedVars.join(', ')}`);
    }

    return {
      safe: warnings.length === 0,
      warnings
    };
  }

  /**
   * Safe environment variable getter that never logs the actual value
   */
  static safeGetEnv(varName: string, defaultValue?: string): string | undefined {
    const value = process.env[varName] || defaultValue;
    
    if (SecureLogger.SENSITIVE_ENV_VARS.includes(varName)) {
      // Log that the variable was accessed, but not its value
      console.info(`[SECURE_ENV] Accessed ${varName}: ${value ? '[SET]' : '[NOT_SET]'}`);
    }
    
    return value;
  }
}

// Global secure logger instance
export const secureLogger = SecureLogger.getInstance();

// Utility functions for existing code migration
export const secureLog = {
  debug: (message: string, metadata?: any) => secureLogger.debug(message, metadata),
  info: (message: string, metadata?: any) => secureLogger.info(message, metadata),
  warn: (message: string, metadata?: any) => secureLogger.warn(message, metadata),
  error: (message: string, metadata?: any) => secureLogger.error(message, metadata),
  critical: (message: string, metadata?: any) => secureLogger.critical(message, metadata),
  sanitize: (data: any) => secureLogger.sanitizeData(data)
};