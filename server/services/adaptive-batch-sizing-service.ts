/**
 * Adaptive Batch Sizing Service
 *
 * Purpose: Dynamically optimize batch sizes based on real-time API performance metrics
 *
 * Key Features:
 * - Real-time API response time monitoring
 * - Rate limit detection and automatic recovery
 * - Dynamic batch size adjustment algorithm
 * - Performance-based optimization with feedback loops
 * - Persistent configuration and learning
 * - Circuit breaker patterns for resilience
 *
 * Architecture:
 * - Monitors OpenAI API response times and success rates
 * - Implements adaptive algorithm: fast responses → larger batches, slow/failed → smaller batches
 * - Detects rate limiting patterns and applies backoff strategies
 * - Maintains historical performance data for trend analysis
 * - Provides real-time batch size recommendations
 *
 * @module AdaptiveBatchSizingService
 * @created September 22, 2025
 * @updated September 22, 2025 - Initial implementation with enterprise-grade monitoring
 */

import { secureLogger } from '../utils/secure-logger';
import { db } from '../db';
import { embeddingProgress } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

// Performance monitoring configuration
interface AdaptiveBatchConfig {
  // Batch size constraints
  minBatchSize: number;
  maxBatchSize: number;
  initialBatchSize: number;
  
  // Performance thresholds
  targetResponseTimeMs: number;
  maxResponseTimeMs: number;
  minSuccessRate: number;
  
  // Adaptation parameters
  aggressiveIncreaseThreshold: number;  // Very fast responses (increase by 50%)
  moderateIncreaseThreshold: number;    // Good responses (increase by 25%)
  decreaseThreshold: number;            // Slow responses (decrease by 25%)
  severeDecreaseThreshold: number;      // Very slow/failed (decrease by 50%)
  
  // Rate limiting detection
  rateLimitBackoffFactor: number;
  rateLimitRecoveryTimeMs: number;
  maxConsecutiveFailures: number;
  
  // Learning and persistence
  performanceHistorySize: number;
  adaptationCooldownMs: number;
  persistConfigurationMs: number;
}

// Real-time performance metrics
interface ApiPerformanceMetrics {
  responseTimeMs: number;
  success: boolean;
  batchSize: number;
  tokensProcessed?: number;
  errorType?: 'rate_limit' | 'timeout' | 'server_error' | 'unknown';
  timestamp: Date;
}

// Batch size recommendation with confidence
interface BatchSizeRecommendation {
  recommendedBatchSize: number;
  confidence: number; // 0-1, higher = more confident
  reasoning: string;
  adaptationApplied: 'increase' | 'decrease' | 'maintain' | 'recover';
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

// Historical performance analysis
interface PerformanceAnalysis {
  averageResponseTime: number;
  successRate: number;
  optimalBatchSize: number;
  performanceTrend: 'improving' | 'stable' | 'degrading';
  rateLimitDetected: boolean;
  recommendedAction: 'increase' | 'decrease' | 'maintain' | 'recover';
}

// Rate limiting state tracking
interface RateLimitState {
  isActive: boolean;
  detectedAt: Date | null;
  consecutiveFailures: number;
  lastFailureTime: Date | null;
  backoffMultiplier: number;
  recoveryAllowedAt: Date | null;
}

export class AdaptiveBatchSizingService {
  private static instance: AdaptiveBatchSizingService | null = null;
  private config: AdaptiveBatchConfig;
  private performanceHistory: ApiPerformanceMetrics[] = [];
  private currentBatchSize: number;
  private rateLimitState: RateLimitState;
  private lastAdaptationTime: Date = new Date(0);
  private isInitialized: boolean = false;

  private constructor() {
    // Enterprise-grade default configuration
    this.config = {
      // Batch size constraints (OpenAI API limits)
      minBatchSize: 1,
      maxBatchSize: 100,
      initialBatchSize: 25, // Conservative start
      
      // Performance targets (based on OpenAI API benchmarks)
      targetResponseTimeMs: 3000,     // Target 3s response time
      maxResponseTimeMs: 10000,       // Max 10s before considering slow
      minSuccessRate: 0.95,           // 95% success rate minimum
      
      // Adaptation algorithm parameters
      aggressiveIncreaseThreshold: 1500,  // <1.5s = very fast
      moderateIncreaseThreshold: 3000,    // <3s = good
      decreaseThreshold: 7000,            // >7s = slow
      severeDecreaseThreshold: 15000,     // >15s = very slow
      
      // Rate limiting and recovery
      rateLimitBackoffFactor: 0.5,        // Reduce batch size by 50%
      rateLimitRecoveryTimeMs: 60000,     // 1 minute recovery time
      maxConsecutiveFailures: 3,          // Max failures before severe action
      
      // Learning parameters
      performanceHistorySize: 100,        // Keep last 100 measurements
      adaptationCooldownMs: 30000,        // 30s between adaptations
      persistConfigurationMs: 300000,     // Save config every 5 minutes
    };

    this.currentBatchSize = this.config.initialBatchSize;
    this.rateLimitState = {
      isActive: false,
      detectedAt: null,
      consecutiveFailures: 0,
      lastFailureTime: null,
      backoffMultiplier: 1.0,
      recoveryAllowedAt: null
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AdaptiveBatchSizingService {
    if (!AdaptiveBatchSizingService.instance) {
      AdaptiveBatchSizingService.instance = new AdaptiveBatchSizingService();
    }
    return AdaptiveBatchSizingService.instance;
  }

  /**
   * Initialize the adaptive batch sizing service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load any persisted configuration or performance data
      await this.loadPersistedConfiguration();
      
      // Start periodic configuration persistence
      this.startConfigurationPersistence();

      this.isInitialized = true;

      secureLogger.info('🎯 Adaptive Batch Sizing Service initialized', {
        initialBatchSize: this.currentBatchSize,
        targetResponseTime: this.config.targetResponseTimeMs,
        batchRange: `${this.config.minBatchSize}-${this.config.maxBatchSize}`
      }, 'ADAPTIVE_BATCH_SERVICE');

    } catch (error) {
      secureLogger.error('❌ Failed to initialize Adaptive Batch Sizing Service', {
        error: error instanceof Error ? error.message : String(error)
      }, 'ADAPTIVE_BATCH_SERVICE');
      throw error;
    }
  }

  /**
   * Get current recommended batch size
   */
  public getBatchSizeRecommendation(importId?: string): BatchSizeRecommendation {
    if (!this.isInitialized) {
      return {
        recommendedBatchSize: this.config.initialBatchSize,
        confidence: 0.5,
        reasoning: 'Service not initialized, using default batch size',
        adaptationApplied: 'maintain',
        performanceTrend: 'stable'
      };
    }

    // Check if we're in rate limit recovery mode
    if (this.rateLimitState.isActive && this.rateLimitState.recoveryAllowedAt) {
      const now = new Date();
      if (now < this.rateLimitState.recoveryAllowedAt) {
        const recoveryBatchSize = Math.max(
          Math.floor(this.currentBatchSize * this.config.rateLimitBackoffFactor),
          this.config.minBatchSize
        );
        
        return {
          recommendedBatchSize: recoveryBatchSize,
          confidence: 0.9,
          reasoning: `Rate limit detected, using reduced batch size until ${this.rateLimitState.recoveryAllowedAt.toISOString()}`,
          adaptationApplied: 'recover',
          performanceTrend: 'degrading'
        };
      } else {
        // Recovery period ended, reset rate limit state
        this.rateLimitState = {
          isActive: false,
          detectedAt: null,
          consecutiveFailures: 0,
          lastFailureTime: null,
          backoffMultiplier: 1.0,
          recoveryAllowedAt: null
        };
      }
    }

    // Analyze recent performance to make recommendation
    const analysis = this.analyzeRecentPerformance();
    const recommendation = this.calculateOptimalBatchSize(analysis);

    return recommendation;
  }

  /**
   * Record API performance metrics for adaptive learning
   */
  public async recordApiPerformance(metrics: ApiPerformanceMetrics): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Add to performance history
      this.performanceHistory.push(metrics);
      
      // Maintain history size limit
      if (this.performanceHistory.length > this.config.performanceHistorySize) {
        this.performanceHistory = this.performanceHistory.slice(-this.config.performanceHistorySize);
      }

      // Handle rate limiting detection
      if (metrics.errorType === 'rate_limit' || (!metrics.success && metrics.responseTimeMs < 1000)) {
        await this.handleRateLimitDetection(metrics);
      } else if (metrics.success) {
        // Reset consecutive failures on success
        this.rateLimitState.consecutiveFailures = 0;
      } else {
        // Track consecutive failures
        this.rateLimitState.consecutiveFailures++;
        this.rateLimitState.lastFailureTime = new Date();
      }

      // Trigger adaptation if enough time has passed since last adaptation
      const now = new Date();
      const timeSinceLastAdaptation = now.getTime() - this.lastAdaptationTime.getTime();
      
      if (timeSinceLastAdaptation >= this.config.adaptationCooldownMs) {
        await this.adaptBatchSize();
      }

      secureLogger.debug('📊 API performance recorded', {
        responseTime: metrics.responseTimeMs,
        success: metrics.success,
        batchSize: metrics.batchSize,
        currentBatchSize: this.currentBatchSize,
        rateLimitActive: this.rateLimitState.isActive
      }, 'ADAPTIVE_BATCH_SERVICE');

    } catch (error) {
      secureLogger.error('❌ Failed to record API performance', {
        error: error instanceof Error ? error.message : String(error),
        metrics
      }, 'ADAPTIVE_BATCH_SERVICE');
    }
  }

  /**
   * Handle rate limit detection
   */
  private async handleRateLimitDetection(metrics: ApiPerformanceMetrics): Promise<void> {
    this.rateLimitState.consecutiveFailures++;
    this.rateLimitState.lastFailureTime = new Date();

    if (!this.rateLimitState.isActive) {
      this.rateLimitState.isActive = true;
      this.rateLimitState.detectedAt = new Date();
      this.rateLimitState.recoveryAllowedAt = new Date(
        Date.now() + this.config.rateLimitRecoveryTimeMs
      );

      // Immediately reduce batch size
      const newBatchSize = Math.max(
        Math.floor(this.currentBatchSize * this.config.rateLimitBackoffFactor),
        this.config.minBatchSize
      );
      
      this.currentBatchSize = newBatchSize;
      this.lastAdaptationTime = new Date();

      secureLogger.warn('🚫 Rate limit detected, reducing batch size', {
        oldBatchSize: metrics.batchSize,
        newBatchSize,
        recoveryTime: this.rateLimitState.recoveryAllowedAt?.toISOString(),
        consecutiveFailures: this.rateLimitState.consecutiveFailures
      }, 'ADAPTIVE_BATCH_SERVICE');
    }
  }

  /**
   * Analyze recent performance metrics
   */
  private analyzeRecentPerformance(): PerformanceAnalysis {
    if (this.performanceHistory.length === 0) {
      return {
        averageResponseTime: this.config.targetResponseTimeMs,
        successRate: 1.0,
        optimalBatchSize: this.config.initialBatchSize,
        performanceTrend: 'stable',
        rateLimitDetected: false,
        recommendedAction: 'maintain'
      };
    }

    // Analyze last 20 measurements for recent performance
    const recentMetrics = this.performanceHistory.slice(-20);
    const successfulMetrics = recentMetrics.filter(m => m.success);
    
    const averageResponseTime = successfulMetrics.length > 0 
      ? successfulMetrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / successfulMetrics.length
      : this.config.maxResponseTimeMs;
    
    const successRate = recentMetrics.length > 0 
      ? successfulMetrics.length / recentMetrics.length 
      : 0;

    // Determine performance trend
    const performanceTrend = this.calculatePerformanceTrend(recentMetrics);
    
    // Check for rate limiting
    const rateLimitDetected = recentMetrics.some(m => m.errorType === 'rate_limit') || 
                              this.rateLimitState.isActive;

    // Determine recommended action
    let recommendedAction: 'increase' | 'decrease' | 'maintain' | 'recover' = 'maintain';
    
    if (rateLimitDetected || successRate < this.config.minSuccessRate) {
      recommendedAction = 'recover';
    } else if (averageResponseTime < this.config.aggressiveIncreaseThreshold && performanceTrend === 'improving') {
      recommendedAction = 'increase';
    } else if (averageResponseTime > this.config.decreaseThreshold || performanceTrend === 'degrading') {
      recommendedAction = 'decrease';
    }

    return {
      averageResponseTime,
      successRate,
      optimalBatchSize: this.currentBatchSize,
      performanceTrend,
      rateLimitDetected,
      recommendedAction
    };
  }

  /**
   * Calculate performance trend from recent metrics
   */
  private calculatePerformanceTrend(metrics: ApiPerformanceMetrics[]): 'improving' | 'stable' | 'degrading' {
    if (metrics.length < 6) {
      return 'stable'; // Not enough data, assume stable
    }

    // Compare first half vs second half of recent metrics
    const midpoint = Math.floor(metrics.length / 2);
    const firstHalf = metrics.slice(0, midpoint).filter(m => m.success);
    const secondHalf = metrics.slice(midpoint).filter(m => m.success);

    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return 'stable'; // No data to compare, assume stable
    }

    const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.responseTimeMs, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.responseTimeMs, 0) / secondHalf.length;

    const improvement = (firstHalfAvg - secondHalfAvg) / firstHalfAvg;

    if (improvement > 0.1) return 'improving';    // 10% improvement
    if (improvement < -0.1) return 'degrading';   // 10% degradation
    return 'stable';
  }

  /**
   * Calculate optimal batch size based on performance analysis
   */
  private calculateOptimalBatchSize(analysis: PerformanceAnalysis): BatchSizeRecommendation {
    const { averageResponseTime, successRate, recommendedAction, performanceTrend } = analysis;
    
    let newBatchSize = this.currentBatchSize;
    let confidence = 0.5;
    let reasoning = 'Maintaining current batch size';
    let adaptationApplied: BatchSizeRecommendation['adaptationApplied'] = 'maintain';

    // Apply adaptation based on performance analysis
    switch (recommendedAction) {
      case 'increase':
        if (averageResponseTime < this.config.aggressiveIncreaseThreshold) {
          // Aggressive increase for very fast responses
          newBatchSize = Math.min(
            Math.floor(this.currentBatchSize * 1.5),
            this.config.maxBatchSize
          );
          confidence = 0.8;
          reasoning = `Very fast responses (${Math.round(averageResponseTime)}ms), increasing batch size aggressively`;
        } else {
          // Moderate increase for good responses
          newBatchSize = Math.min(
            Math.floor(this.currentBatchSize * 1.25),
            this.config.maxBatchSize
          );
          confidence = 0.7;
          reasoning = `Good response times (${Math.round(averageResponseTime)}ms), increasing batch size moderately`;
        }
        adaptationApplied = 'increase';
        break;

      case 'decrease':
        if (averageResponseTime > this.config.severeDecreaseThreshold || successRate < 0.8) {
          // Severe decrease for very slow/failing responses
          newBatchSize = Math.max(
            Math.floor(this.currentBatchSize * 0.5),
            this.config.minBatchSize
          );
          confidence = 0.9;
          reasoning = `Very slow responses (${Math.round(averageResponseTime)}ms) or low success rate (${(successRate * 100).toFixed(1)}%), decreasing batch size aggressively`;
        } else {
          // Moderate decrease for slow responses
          newBatchSize = Math.max(
            Math.floor(this.currentBatchSize * 0.75),
            this.config.minBatchSize
          );
          confidence = 0.8;
          reasoning = `Slow responses (${Math.round(averageResponseTime)}ms), decreasing batch size moderately`;
        }
        adaptationApplied = 'decrease';
        break;

      case 'recover':
        // Recovery mode - use smaller batch size
        newBatchSize = Math.max(
          Math.floor(this.currentBatchSize * 0.6),
          this.config.minBatchSize
        );
        confidence = 0.9;
        reasoning = `Rate limiting or low success rate detected, using recovery batch size`;
        adaptationApplied = 'recover';
        break;

      default:
        // Maintain current size
        confidence = 0.6;
        reasoning = `Performance stable (${Math.round(averageResponseTime)}ms, ${(successRate * 100).toFixed(1)}% success), maintaining batch size`;
        adaptationApplied = 'maintain';
    }

    return {
      recommendedBatchSize: newBatchSize,
      confidence,
      reasoning,
      adaptationApplied,
      performanceTrend
    };
  }

  /**
   * Adapt the current batch size based on recent performance
   */
  private async adaptBatchSize(): Promise<void> {
    try {
      const analysis = this.analyzeRecentPerformance();
      const recommendation = this.calculateOptimalBatchSize(analysis);

      // Only adapt if there's a significant change recommended
      if (recommendation.recommendedBatchSize !== this.currentBatchSize) {
        const oldBatchSize = this.currentBatchSize;
        this.currentBatchSize = recommendation.recommendedBatchSize;
        this.lastAdaptationTime = new Date();

        secureLogger.info('🎯 Batch size adapted', {
          oldBatchSize,
          newBatchSize: this.currentBatchSize,
          reasoning: recommendation.reasoning,
          confidence: recommendation.confidence,
          adaptationType: recommendation.adaptationApplied,
          averageResponseTime: Math.round(analysis.averageResponseTime),
          successRate: `${(analysis.successRate * 100).toFixed(1)}%`,
          performanceTrend: analysis.performanceTrend
        }, 'ADAPTIVE_BATCH_SERVICE');
      }

    } catch (error) {
      secureLogger.error('❌ Failed to adapt batch size', {
        error: error instanceof Error ? error.message : String(error)
      }, 'ADAPTIVE_BATCH_SERVICE');
    }
  }

  /**
   * Load persisted configuration (placeholder for future database storage)
   */
  private async loadPersistedConfiguration(): Promise<void> {
    // Future: Load configuration from database
    // For now, use defaults
  }

  /**
   * Start periodic configuration persistence
   */
  private startConfigurationPersistence(): void {
    setInterval(async () => {
      try {
        // Future: Persist configuration to database
        secureLogger.debug('📝 Persisting adaptive batch configuration', {
          currentBatchSize: this.currentBatchSize,
          performanceHistorySize: this.performanceHistory.length,
          rateLimitActive: this.rateLimitState.isActive
        }, 'ADAPTIVE_BATCH_SERVICE');
      } catch (error) {
        secureLogger.error('❌ Failed to persist configuration', {
          error: error instanceof Error ? error.message : String(error)
        }, 'ADAPTIVE_BATCH_SERVICE');
      }
    }, this.config.persistConfigurationMs);
  }

  /**
   * Get current service status and metrics
   */
  public getServiceStatus() {
    return {
      isInitialized: this.isInitialized,
      currentBatchSize: this.currentBatchSize,
      performanceHistorySize: this.performanceHistory.length,
      rateLimitState: {
        isActive: this.rateLimitState.isActive,
        consecutiveFailures: this.rateLimitState.consecutiveFailures,
        recoveryTime: this.rateLimitState.recoveryAllowedAt?.toISOString()
      },
      recentPerformance: this.analyzeRecentPerformance(),
      lastAdaptation: this.lastAdaptationTime.toISOString()
    };
  }
}

// Export singleton instance
export const adaptiveBatchSizingService = AdaptiveBatchSizingService.getInstance();