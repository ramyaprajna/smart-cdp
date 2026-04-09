/**
 * Shared Progress Tracking Utilities
 * 
 * Purpose: Centralized progress tracking and WebSocket broadcasting
 * 
 * Key Features:
 * - Real-time progress updates
 * - WebSocket broadcasting to subscribed clients
 * - Database persistence for progress state
 * - ETA calculation and throughput monitoring
 * - Comprehensive metrics collection
 * 
 * @module SharedProgress
 * @created September 23, 2025 - Extracted from embedding-progress-websocket.ts and progress tracking logic
 */

import { db } from '../../db';
import { embeddingProgress } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { secureLogger } from '../../utils/secure-logger';

export interface ProgressState {
  importId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused';
  totalCustomers: number;
  processedCustomers: number;
  generatedEmbeddings: number;
  failedEmbeddings: number;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  
  // Timing metrics
  estimatedTimeRemainingMs?: number;
  averageBatchTimeMs?: number;
  lastBatchTimeMs?: number;
  throughputPerSecond?: number;
  
  // Health monitoring
  isStalled: boolean;
  retryAttempts: number;
  lastUpdatedAt: Date;
  
  // Error tracking
  errors: any[];
}

export interface ProgressUpdate {
  type: 'progress_update';
  importId: string;
  data: ProgressState;
}

export interface ProgressMetrics {
  startTime: Date;
  batchTimes: number[];
  errorCount: number;
  stallCount: number;
  totalBatches: number;
  completedBatches: number;
}

export type ProgressSubscriber = (update: ProgressUpdate) => void;

/**
 * Progress Tracker with real-time updates and persistence
 */
export class ProgressTracker {
  private state: ProgressState;
  private metrics: ProgressMetrics;
  private subscribers: Set<ProgressSubscriber> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 1000; // 1 second updates

  constructor(importId: string, totalCustomers: number, batchSize: number) {
    this.state = {
      importId,
      status: 'pending',
      totalCustomers,
      processedCustomers: 0,
      generatedEmbeddings: 0,
      failedEmbeddings: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(totalCustomers / batchSize),
      batchSize,
      isStalled: false,
      retryAttempts: 0,
      lastUpdatedAt: new Date(),
      errors: []
    };

    this.metrics = {
      startTime: new Date(),
      batchTimes: [],
      errorCount: 0,
      stallCount: 0,
      totalBatches: this.state.totalBatches,
      completedBatches: 0
    };
  }

  /**
   * Subscribe to progress updates
   */
  subscribe(subscriber: ProgressSubscriber): () => void {
    this.subscribers.add(subscriber);
    
    // Send current state immediately
    subscriber(this.createProgressUpdate());
    
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Start progress tracking and periodic updates
   */
  start(): void {
    this.state.status = 'processing';
    this.metrics.startTime = new Date();
    
    // Start periodic database updates and notifications
    this.updateInterval = setInterval(() => {
      this.persistToDatabase();
      this.notifySubscribers();
      this.checkForStall();
    }, this.UPDATE_INTERVAL_MS);
    
    this.notifySubscribers();
  }

  /**
   * Update batch progress
   */
  updateBatch(
    batchNumber: number,
    processedInBatch: number,
    generatedInBatch: number,
    failedInBatch: number,
    batchTimeMs: number
  ): void {
    this.state.currentBatch = batchNumber;
    this.state.processedCustomers += processedInBatch;
    this.state.generatedEmbeddings += generatedInBatch;
    this.state.failedEmbeddings += failedInBatch;
    this.state.lastBatchTimeMs = Math.round(batchTimeMs);
    this.state.lastUpdatedAt = new Date();
    
    // Update metrics
    this.metrics.batchTimes.push(batchTimeMs);
    this.metrics.completedBatches = batchNumber;
    
    // Keep only recent batch times for accurate averaging
    if (this.metrics.batchTimes.length > 10) {
      this.metrics.batchTimes.shift();
    }
    
    // Calculate performance metrics
    this.calculatePerformanceMetrics();
    
    // Reset stall status since we have progress
    this.state.isStalled = false;
  }

  /**
   * Add error to tracking
   */
  addError(error: any): void {
    this.state.errors.push({
      timestamp: new Date(),
      error: typeof error === 'string' ? error : error.message || String(error)
    });
    
    this.metrics.errorCount++;
    
    // Keep only recent errors
    if (this.state.errors.length > 50) {
      this.state.errors.shift();
    }
  }

  /**
   * Mark as completed
   */
  complete(): void {
    this.state.status = 'completed';
    this.state.processedCustomers = this.state.totalCustomers;
    this.state.currentBatch = this.state.totalBatches;
    this.state.estimatedTimeRemainingMs = 0;
    this.state.lastUpdatedAt = new Date();
    
    this.cleanup();
    this.persistToDatabase();
    this.notifySubscribers();
  }

  /**
   * Mark as failed
   */
  fail(error?: string): void {
    this.state.status = 'failed';
    this.state.lastUpdatedAt = new Date();
    
    if (error) {
      this.addError(error);
    }
    
    this.cleanup();
    this.persistToDatabase();
    this.notifySubscribers();
  }

  /**
   * Mark as cancelled
   */
  cancel(): void {
    this.state.status = 'cancelled';
    this.state.lastUpdatedAt = new Date();
    
    this.cleanup();
    this.persistToDatabase();
    this.notifySubscribers();
  }

  /**
   * Pause tracking
   */
  pause(): void {
    this.state.status = 'paused';
    this.state.lastUpdatedAt = new Date();
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.persistToDatabase();
    this.notifySubscribers();
  }

  /**
   * Resume tracking
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.start();
    }
  }

  /**
   * Get current state
   */
  getState(): ProgressState {
    return { ...this.state };
  }

  /**
   * Get metrics
   */
  getMetrics(): ProgressMetrics {
    return { ...this.metrics };
  }

  private calculatePerformanceMetrics(): void {
    if (this.metrics.batchTimes.length === 0) return;
    
    // Calculate average batch time
    const avgBatchTime = this.metrics.batchTimes.reduce((sum, time) => sum + time, 0) / this.metrics.batchTimes.length;
    this.state.averageBatchTimeMs = Math.round(avgBatchTime);
    
    // Calculate throughput (customers per second)
    if (avgBatchTime > 0) {
      this.state.throughputPerSecond = (this.state.batchSize / avgBatchTime) * 1000;
    }
    
    // Calculate ETA
    const remainingBatches = this.state.totalBatches - this.state.currentBatch;
    if (remainingBatches > 0 && avgBatchTime > 0) {
      this.state.estimatedTimeRemainingMs = Math.round(remainingBatches * avgBatchTime);
    } else {
      this.state.estimatedTimeRemainingMs = 0;
    }
  }

  private checkForStall(): void {
    const timeSinceLastUpdate = Date.now() - this.state.lastUpdatedAt.getTime();
    const stallThresholdMs = 120000; // 2 minutes
    
    if (timeSinceLastUpdate > stallThresholdMs && this.state.status === 'processing') {
      if (!this.state.isStalled) {
        this.state.isStalled = true;
        this.metrics.stallCount++;
        this.notifySubscribers();
      }
    }
  }

  private async persistToDatabase(): Promise<void> {
    try {
      const updateData = {
        status: this.state.status,
        processedCustomers: this.state.processedCustomers,
        generatedEmbeddings: this.state.generatedEmbeddings,
        failedEmbeddings: this.state.failedEmbeddings,
        currentBatch: this.state.currentBatch,
        estimatedTimeRemainingMs: this.state.estimatedTimeRemainingMs ? Math.round(this.state.estimatedTimeRemainingMs) : null,
        averageBatchTimeMs: this.state.averageBatchTimeMs ? Math.round(this.state.averageBatchTimeMs) : null,
        lastBatchTimeMs: this.state.lastBatchTimeMs ? Math.round(this.state.lastBatchTimeMs) : null,
        throughputPerSecond: this.state.throughputPerSecond,
        isStalled: this.state.isStalled,
        retryAttempts: this.state.retryAttempts,
        errors: this.state.errors,
        lastUpdatedAt: new Date()
      };

      await db
        .update(embeddingProgress)
        .set(updateData)
        .where(eq(embeddingProgress.importId, this.state.importId));
        
    } catch (error) {
      secureLogger.error('Failed to persist progress to database:', { error: String(error) });
    }
  }

  private notifySubscribers(): void {
    const update = this.createProgressUpdate();
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(update);
      } catch (error) {
        secureLogger.error('Error notifying progress subscriber:', { error: String(error) });
      }
    });
  }

  private createProgressUpdate(): ProgressUpdate {
    return {
      type: 'progress_update',
      importId: this.state.importId,
      data: { ...this.state }
    };
  }

  private cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

/**
 * Progress Manager for handling multiple concurrent progress trackers
 */
export class ProgressManager {
  private static instance: ProgressManager;
  private trackers: Map<string, ProgressTracker> = new Map();

  static getInstance(): ProgressManager {
    if (!ProgressManager.instance) {
      ProgressManager.instance = new ProgressManager();
    }
    return ProgressManager.instance;
  }

  /**
   * Create a new progress tracker
   */
  createTracker(importId: string, totalCustomers: number, batchSize: number): ProgressTracker {
    const tracker = new ProgressTracker(importId, totalCustomers, batchSize);
    this.trackers.set(importId, tracker);
    
    // Auto-cleanup when completed/failed/cancelled
    tracker.subscribe((update) => {
      if (['completed', 'failed', 'cancelled'].includes(update.data.status)) {
        setTimeout(() => {
          this.trackers.delete(importId);
        }, 30000); // Keep for 30 seconds after completion
      }
    });
    
    return tracker;
  }

  /**
   * Get existing tracker
   */
  getTracker(importId: string): ProgressTracker | undefined {
    return this.trackers.get(importId);
  }

  /**
   * Remove tracker
   */
  removeTracker(importId: string): boolean {
    return this.trackers.delete(importId);
  }

  /**
   * Get all active trackers
   */
  getAllTrackers(): Map<string, ProgressTracker> {
    return new Map(this.trackers);
  }
}