/**
 * CSV Stream Processor
 *
 * High-performance streaming processor for very large CSV files
 * to prevent memory exhaustion and provide real-time progress updates.
 */

import fs from 'node:fs';
import csv from 'csv-parser';
import { secureLogger } from '../utils/secure-logger';
// @ts-ignore - csv-parser types may not be available
declare module 'csv-parser';
import { Transform } from 'node:stream';
import { schemaMapper } from './schema-mapper';

export interface StreamProcessorOptions {
  batchSize: number;
  maxMemoryMB: number;
  progressCallback?: (processed: number, total: number) => void;
  errorCallback?: (error: Error, rowNumber: number) => void;
}

export interface StreamProcessingResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  memoryPeakMB: number;
}

export class CSVStreamProcessor {
  private options: StreamProcessorOptions;
  private processedRows = 0;
  private successfulRows = 0;
  private failedRows = 0;
  private errors: Array<{ row: number; error: string }> = [];
  private currentBatch: any[] = [];
  private memoryPeakMB = 0;

  constructor(options: StreamProcessorOptions) {
    this.options = {
      batchSize: options.batchSize || 1000,
      maxMemoryMB: options.maxMemoryMB || 512,
      progressCallback: options.progressCallback,
      errorCallback: options.errorCallback
    };
  }

  /**
   * Process large CSV file using streaming to handle files that don't fit in memory
   */
  async processLargeCSV(filePath: string, processingCallback: (batch: any[]) => Promise<void>): Promise<StreamProcessingResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let rowCount = 0;

      secureLogger.info(`🌊 [Streaming] Starting CSV stream processing for: ${filePath}`);

      const transformStream = new Transform({
        objectMode: true,
        transform: (row: any, encoding, callback) => {
          (async () => {
            try {
              rowCount++;
              this.processedRows = rowCount;

              // Memory monitoring
              const memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
              this.memoryPeakMB = Math.max(this.memoryPeakMB, memoryUsageMB);

              // Memory pressure warning
              if (memoryUsageMB > this.options.maxMemoryMB * 0.8) {
                secureLogger.warn(`⚠️ [Memory] High memory usage: ${Math.round(memoryUsageMB)}MB (${Math.round((memoryUsageMB / this.options.maxMemoryMB) * 100)}%)`);

                // Force garbage collection if available
                if (global.gc) {
                  global.gc();
                }
              }

              // Add to current batch
              this.currentBatch.push(row);

              // Process batch when it reaches the configured size
              if (this.currentBatch.length >= this.options.batchSize) {
                await this.processBatch(processingCallback);
              }

              // Progress reporting
              if (this.options.progressCallback && rowCount % 100 === 0) {
                this.options.progressCallback(rowCount, -1); // Total unknown in streaming
              }

              callback();
            } catch (error) {
              this.failedRows++;
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.errors.push({ row: rowCount, error: errorMessage });

              if (this.options.errorCallback) {
                this.options.errorCallback(error as Error, rowCount);
              }

              callback();
            }
          })();
        },
        flush: (callback) => {
          (async () => {
            // Process remaining records in final batch
            if (this.currentBatch.length > 0) {
              await this.processBatch(processingCallback);
            }
            callback();
          })();
        }
      });

      fs.createReadStream(filePath)
        .pipe(csv())
        .pipe(transformStream)
        .on('end', () => {
          const processingTime = Date.now() - startTime;
          secureLogger.info(`✅ [Streaming] Completed in ${Math.round(processingTime / 1000)}s`);
          secureLogger.info(`💾 [Memory] Peak usage: ${Math.round(this.memoryPeakMB)}MB`);

          resolve({
            totalProcessed: this.processedRows,
            successful: this.successfulRows,
            failed: this.failedRows,
            errors: this.errors,
            memoryPeakMB: this.memoryPeakMB
          });
        })
        .on('error', (error) => {
          secureLogger.error(`❌ [Streaming] Failed:`, { error: String(error) });
          reject(error);
        });
    });
  }

  private async processBatch(processingCallback: (batch: any[]) => Promise<void>): Promise<void> {
    try {

      await processingCallback(this.currentBatch);

      this.successfulRows += this.currentBatch.length;
      secureLogger.info(`✅ [Batch] Completed successfully (${this.successfulRows}/${this.processedRows} total)`);

    } catch (error) {
      this.failedRows += this.currentBatch.length;
      const errorMessage = error instanceof Error ? error.message : 'Unknown batch error';

      // Log error for entire batch
      this.errors.push({
        row: this.processedRows - this.currentBatch.length + 1,
        error: `Batch error: ${errorMessage}`
      });

      secureLogger.error(`❌ [Batch] Failed:`, { error: errorMessage });
    } finally {
      this.currentBatch = []; // Clear batch
    }
  }

  /**
   * Estimate if file should use streaming based on size and available memory
   */
  static shouldUseStreaming(fileSizeBytes: number, availableMemoryMB = 512): boolean {
    const fileSizeMB = fileSizeBytes / 1024 / 1024;
    const streamingThreshold = Math.min(availableMemoryMB * 0.3, 50); // 30% of available memory or 50MB max

    return fileSizeMB > streamingThreshold;
  }

  /**
   * Get optimal batch size based on available memory and file characteristics
   */
  static getOptimalBatchSize(fileSizeBytes: number, recordCount?: number): number {
    const fileSizeMB = fileSizeBytes / 1024 / 1024;

    if (fileSizeMB > 100) return 500;   // Very large files
    if (fileSizeMB > 50) return 1000;   // Large files
    if (fileSizeMB > 10) return 2000;   // Medium files
    return 5000; // Small files
  }
}
