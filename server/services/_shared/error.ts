/**
 * Shared Error Handling Utilities
 * 
 * Purpose: Centralized error classification, aggregation, and recovery patterns
 * 
 * Key Features:
 * - Error classification and fingerprinting
 * - Error aggregation and grouping
 * - Recovery strategy recommendations
 * - Error metrics and monitoring
 * - Integration with logging and alerting
 * 
 * @module SharedError
 * @created September 23, 2025 - Extracted from various embedding services
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  DATABASE = 'database',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  AUTHORIZATION = 'authorization',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export enum RecoveryStrategy {
  RETRY = 'retry',
  BACKOFF = 'backoff',
  CIRCUIT_BREAKER = 'circuit_breaker',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  FAIL_FAST = 'fail_fast',
  MANUAL_INTERVENTION = 'manual_intervention'
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  isRetryable: boolean;
  expectedDurationMs?: number;
  fingerprint: string;
}

export interface ErrorContext {
  operation: string;
  jobId?: string;
  batchId?: string;
  userId?: string;
  customerId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface ErrorRecord {
  id: string;
  error: Error;
  classification: ErrorClassification;
  context: ErrorContext;
  occurrence: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByRecoveryStrategy: Record<RecoveryStrategy, number>;
  retryableErrors: number;
  resolvedErrors: number;
  averageResolutionTimeMs: number;
  topErrorFingerprints: Array<{ fingerprint: string; count: number }>;
  errorRate: number; // errors per minute
}

export interface ErrorAggregator {
  addError(error: Error, context: ErrorContext): ErrorRecord;
  getErrorByFingerprint(fingerprint: string): ErrorRecord | undefined;
  getErrorsByCategory(category: ErrorCategory): ErrorRecord[];
  getErrorsBySeverity(severity: ErrorSeverity): ErrorRecord[];
  markResolved(errorId: string): void;
  getMetrics(): ErrorMetrics;
  cleanup(olderThanMs: number): number;
}

/**
 * Generate error fingerprint for grouping similar errors
 */
export function generateErrorFingerprint(error: Error, context: ErrorContext): string {
  const normalizedMessage = error.message
    .replace(/\d+/g, 'N')           // Replace numbers with N
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // Replace UUIDs
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, 'IP') // Replace IP addresses
    .replace(/https?:\/\/[^\s]+/gi, 'URL'); // Replace URLs

  const errorType = error.constructor.name;
  const operation = context.operation;
  
  // Create a hash-like fingerprint
  const baseString = `${errorType}:${operation}:${normalizedMessage}`;
  return baseString.toLowerCase().replace(/[^a-z0-9:]/g, '_');
}

/**
 * Classify error based on type, message, and context
 */
export function classifyError(error: Error, context: ErrorContext): ErrorClassification {
  const fingerprint = generateErrorFingerprint(error, context);
  
  // Network errors
  if (isNetworkError(error)) {
    return {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.RETRY,
      isRetryable: true,
      expectedDurationMs: 5000,
      fingerprint
    };
  }

  // Rate limiting errors
  if (isRateLimitError(error)) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.BACKOFF,
      isRetryable: true,
      expectedDurationMs: 60000, // 1 minute
      fingerprint
    };
  }

  // Timeout errors
  if (isTimeoutError(error)) {
    return {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.CIRCUIT_BREAKER,
      isRetryable: true,
      expectedDurationMs: 30000,
      fingerprint
    };
  }

  // Database errors
  if (isDatabaseError(error)) {
    return {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.RETRY,
      isRetryable: true,
      expectedDurationMs: 10000,
      fingerprint
    };
  }

  // API errors
  if (isApiError(error)) {
    const statusCode = extractStatusCode(error);
    
    if (statusCode && statusCode >= 500) {
      return {
        category: ErrorCategory.API,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.RETRY,
        isRetryable: true,
        expectedDurationMs: 15000,
        fingerprint
      };
    } else if (statusCode && statusCode >= 400) {
      return {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        recoveryStrategy: RecoveryStrategy.FAIL_FAST,
        isRetryable: false,
        fingerprint
      };
    }
  }

  // Authorization errors
  if (isAuthorizationError(error)) {
    return {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.CRITICAL,
      recoveryStrategy: RecoveryStrategy.MANUAL_INTERVENTION,
      isRetryable: false,
      fingerprint
    };
  }

  // Default unknown error
  return {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy.RETRY,
    isRetryable: true,
    expectedDurationMs: 5000,
    fingerprint
  };
}

/**
 * Error aggregator implementation
 */
export class ErrorAggregatorImpl implements ErrorAggregator {
  private errors: Map<string, ErrorRecord> = new Map();
  private fingerprintIndex: Map<string, string> = new Map(); // fingerprint -> error ID
  private nextId = 1;

  addError(error: Error, context: ErrorContext): ErrorRecord {
    const classification = classifyError(error, context);
    const existingId = this.fingerprintIndex.get(classification.fingerprint);
    
    if (existingId) {
      // Update existing error record
      const existing = this.errors.get(existingId)!;
      existing.occurrence++;
      existing.lastSeen = new Date();
      existing.context = context; // Update with latest context
      return existing;
    } else {
      // Create new error record
      const id = `err_${this.nextId++}`;
      const record: ErrorRecord = {
        id,
        error,
        classification,
        context,
        occurrence: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        resolved: false
      };
      
      this.errors.set(id, record);
      this.fingerprintIndex.set(classification.fingerprint, id);
      
      return record;
    }
  }

  getErrorByFingerprint(fingerprint: string): ErrorRecord | undefined {
    const id = this.fingerprintIndex.get(fingerprint);
    return id ? this.errors.get(id) : undefined;
  }

  getErrorsByCategory(category: ErrorCategory): ErrorRecord[] {
    return Array.from(this.errors.values())
      .filter(record => record.classification.category === category);
  }

  getErrorsBySeverity(severity: ErrorSeverity): ErrorRecord[] {
    return Array.from(this.errors.values())
      .filter(record => record.classification.severity === severity);
  }

  markResolved(errorId: string): void {
    const record = this.errors.get(errorId);
    if (record) {
      record.resolved = true;
      record.resolvedAt = new Date();
    }
  }

  getMetrics(): ErrorMetrics {
    const allErrors = Array.from(this.errors.values());
    const totalErrors = allErrors.length;
    
    const errorsByCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = allErrors.filter(e => e.classification.category === category).length;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    const errorsBySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = allErrors.filter(e => e.classification.severity === severity).length;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    const errorsByRecoveryStrategy = Object.values(RecoveryStrategy).reduce((acc, strategy) => {
      acc[strategy] = allErrors.filter(e => e.classification.recoveryStrategy === strategy).length;
      return acc;
    }, {} as Record<RecoveryStrategy, number>);

    const retryableErrors = allErrors.filter(e => e.classification.isRetryable).length;
    const resolvedErrors = allErrors.filter(e => e.resolved).length;
    
    const resolvedErrorsWithTime = allErrors.filter(e => e.resolved && e.resolvedAt);
    const averageResolutionTimeMs = resolvedErrorsWithTime.length > 0
      ? resolvedErrorsWithTime.reduce((sum, e) => {
          return sum + (e.resolvedAt!.getTime() - e.firstSeen.getTime());
        }, 0) / resolvedErrorsWithTime.length
      : 0;

    const fingerprintCounts = Array.from(this.fingerprintIndex.entries())
      .map(([fingerprint, id]) => ({
        fingerprint,
        count: this.errors.get(id)?.occurrence || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate error rate (errors per minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentErrors = allErrors.filter(e => e.lastSeen.getTime() > oneMinuteAgo);
    const errorRate = recentErrors.reduce((sum, e) => sum + e.occurrence, 0);

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      errorsByRecoveryStrategy,
      retryableErrors,
      resolvedErrors,
      averageResolutionTimeMs,
      topErrorFingerprints: fingerprintCounts,
      errorRate
    };
  }

  cleanup(olderThanMs: number): number {
    const cutoffTime = Date.now() - olderThanMs;
    let cleanedCount = 0;
    
    for (const [id, record] of Array.from(this.errors.entries())) {
      if (record.lastSeen.getTime() < cutoffTime && record.resolved) {
        this.errors.delete(id);
        this.fingerprintIndex.delete(record.classification.fingerprint);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }
}

// Error detection helper functions
function isNetworkError(error: Error): boolean {
  const networkCodes = ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'];
  return networkCodes.some(code => error.message.includes(code));
}

function isRateLimitError(error: Error): boolean {
  return error.message.toLowerCase().includes('rate limit') || 
         extractStatusCode(error) === 429;
}

function isTimeoutError(error: Error): boolean {
  return error.message.toLowerCase().includes('timeout') ||
         error.name === 'TimeoutError';
}

function isDatabaseError(error: Error): boolean {
  const dbKeywords = ['connection', 'database', 'query', 'transaction', 'constraint'];
  const message = error.message.toLowerCase();
  return dbKeywords.some(keyword => message.includes(keyword));
}

function isApiError(error: Error): boolean {
  return extractStatusCode(error) !== null;
}

function isAuthorizationError(error: Error): boolean {
  const statusCode = extractStatusCode(error);
  return statusCode === 401 || statusCode === 403 ||
         error.message.toLowerCase().includes('unauthorized') ||
         error.message.toLowerCase().includes('forbidden');
}

function extractStatusCode(error: Error): number | null {
  // Check for status property
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }
  
  // Check for statusCode property
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  
  // Try to extract from message
  const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }
  
  return null;
}

/**
 * Global error aggregator instance
 */
export const globalErrorAggregator = new ErrorAggregatorImpl();

/**
 * Utility function to handle and classify errors with context
 */
export function handleError(
  error: Error,
  context: ErrorContext,
  aggregator: ErrorAggregator = globalErrorAggregator
): ErrorRecord {
  return aggregator.addError(error, context);
}