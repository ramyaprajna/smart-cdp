/**
 * Service Utilities - Common Patterns for Service Operations
 *
 * Centralized utilities for common service patterns including:
 * - Performance monitoring and timing
 * - AI operation logging
 * - Error handling with context
 * - Response formatting
 * - Operation lifecycle management
 *
 * Created: August 13, 2025
 * Purpose: Reduce code duplication and standardize service patterns
 */

import { applicationLogger } from '../services/application-logger';

export interface PerformanceContext {
  operationName: string;
  userId?: string;
  startTime: number;
}

export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metrics?: Record<string, any>;
}

export interface OperationContext {
  operationName: string;
  userId?: string;
  operationId?: string;
  metadata?: Record<string, any>;
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  static startOperation(operationName: string, userId?: string): PerformanceContext {
    return {
      operationName,
      userId,
      startTime: performance.now()
    };
  }

  static async endOperation(context: PerformanceContext, additionalMetrics?: Record<string, any>) {
    const processingTime = Math.round(performance.now() - context.startTime);


    if (context.userId) {
      await applicationLogger.logAI('info', `${context.operationName} completed`, {
        userId: context.userId,
        processingTime,
        status: 'completed',
        ...additionalMetrics
      });
    }

    return { processingTime, ...additionalMetrics };
  }
}

/**
 * AI operation logging utilities
 */
export class AIOperationLogger {
  static async logStart(operationName: string, userId?: string, context?: Record<string, any>) {
    applicationLogger.info('system', `[AI ${operationName}] Starting...`);

    await applicationLogger.logAI('info', `AI ${operationName} started`, {
      userId,
      initiatedAt: new Date().toISOString(),
      operation: operationName,
      ...context
    });
  }

  static async logSuccess(
    operationName: string,
    userId: string,
    inputData: Record<string, any>,
    results: Record<string, any>,
    processingTime?: number
  ) {
    await applicationLogger.logAISuggestionGeneration(
      userId,
      inputData,
      {
        ...results,
        processingTime,
        modelUsed: 'gpt-4o'
      }
    );
  }

  static async logError(
    operationName: string,
    userId: string,
    error: Error,
    context?: Record<string, any>
  ) {
    await applicationLogger.logAIError(
      userId,
      operationName,
      error,
      context
    );
  }

  static async logInsufficientData(
    operationName: string,
    userId: string,
    dataMetrics: Record<string, any>,
    reason: string
  ) {
    await applicationLogger.logAI('info', `Insufficient data for ${operationName}`, {
      userId,
      ...dataMetrics,
      reason,
      recommendation: 'Import more data or adjust criteria'
    });
  }
}

/**
 * Standardized error handling with context
 */
export class ServiceErrorHandler {
  static async handleServiceError(
    error: unknown,
    context: OperationContext,
    performanceContext?: PerformanceContext
  ): Promise<ServiceResult> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const processingTime = performanceContext ?
      Math.round(performance.now() - performanceContext.startTime) : 0;

    applicationLogger.error('system', `[${context.operationName}] Error:`, new Error(errorMessage)).catch(() => {});

    if (context.userId) {
      await applicationLogger.logAI('error', `${context.operationName} failed`, {
        userId: context.userId,
        error: errorMessage,
        processingTime,
        ...context.metadata
      });
    }

    return {
      success: false,
      error: errorMessage,
      metrics: { processingTime }
    };
  }
}

/**
 * Data validation utilities
 */
export class DataValidator {
  static validateMinimumData(
    dataCount: number,
    minimumRequired: number,
    dataType: string
  ): { isValid: boolean; message?: string } {
    if (dataCount < minimumRequired) {
      return {
        isValid: false,
        message: `Insufficient ${dataType}: ${dataCount} found, minimum ${minimumRequired} required`
      };
    }
    return { isValid: true };
  }

  static validateDiversityRatio(
    totalItems: number,
    uniqueCategories: number,
    maxRatio: number,
    categoryType: string
  ): { isValid: boolean; message?: string } {
    const ratio = uniqueCategories / totalItems;
    if (ratio > maxRatio) {
      return {
        isValid: false,
        message: `High ${categoryType} diversity: ${uniqueCategories} categories for ${totalItems} items (ratio: ${ratio.toFixed(2)})`
      };
    }
    return { isValid: true };
  }
}

/**
 * Response formatting utilities
 */
export class ResponseFormatter {
  static success<T>(data: T, metrics?: Record<string, any>): ServiceResult<T> {
    return {
      success: true,
      data,
      metrics
    };
  }

  static error(message: string, metrics?: Record<string, any>): ServiceResult {
    return {
      success: false,
      error: message,
      metrics
    };
  }

  static withMetrics<T>(data: T, processingTime: number, additionalMetrics?: Record<string, any>): ServiceResult<T> {
    return {
      success: true,
      data,
      metrics: {
        processingTime,
        ...additionalMetrics
      }
    };
  }
}

/**
 * Common service operation wrapper
 */
export class ServiceOperation {
  static async execute<T>(
    operationName: string,
    operation: () => Promise<T>,
    userId?: string,
    context?: Record<string, any>
  ): Promise<ServiceResult<T>> {
    const perfContext = PerformanceMonitor.startOperation(operationName, userId);
    const opContext: OperationContext = { operationName, userId, metadata: context };

    try {
      const result = await operation();
      const metrics = await PerformanceMonitor.endOperation(perfContext, context);
      return ResponseFormatter.withMetrics(result, metrics.processingTime, context);
    } catch (error) {
      return await ServiceErrorHandler.handleServiceError(error, opContext, perfContext);
    }
  }
}
