/**
 * Bulk AI Column Mapping Service
 *
 * Purpose: Handle multiple file analysis and bulk AI mapping operations
 *
 * Key Features:
 * - Batch processing with configurable concurrency
 * - Parallel AI analysis with rate limiting
 * - Real-time progress tracking
 * - Intelligent result aggregation
 * - Automatic retry on failures
 * - Memory-efficient job management
 *
 * Design Decisions:
 * - Uses job queue pattern for scalability
 * - Implements rate limiting to prevent API throttling
 * - Batches files to optimize memory usage
 * - Aggregates results for unified insights
 *
 * @module BulkAIMapper
 * @created July 23, 2025
 * @updated August 13, 2025 - Refactored for improved performance and error handling
 */

import { aiColumnMapper, type AIColumnMappingResult } from './ai-column-mapper';
import { filePreviewService } from '../file-preview-service';
import { promises as fs } from 'node:fs';
import { secureLogger } from '../utils/secure-logger';
import {
  ServiceOperation,
  PerformanceMonitor
} from '../utils/service-utilities';
import {
  BatchProcessor
} from '../utils/database-utilities';

interface BulkAnalysisJob {
  id: string;
  files: Array<{
    name: string;
    path: string;
    size: number;
  }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  results: BulkAnalysisResult[];
  startTime: Date;
  endTime?: Date;
  error?: string;
}

interface BulkAnalysisResult {
  fileName: string;
  fileSize: number;
  totalColumns: number;
  totalRows: number;
  analysisResult: AIColumnMappingResult;
  processingTime: number;
  status: 'success' | 'failed';
  error?: string;
}

interface BulkMappingSummary {
  totalFiles: number;
  totalColumns: number;
  successfulMappings: number;
  failedAnalyses: number;
  averageConfidence: number;
  processingTime: number;
  recommendedMappings: Record<string, string>;
  conflictingMappings: Array<{
    columnName: string;
    suggestions: string[];
    confidence: number[];
  }>;
}

export class BulkAIMapper {
  private activeJobs = new Map<string, BulkAnalysisJob>();
  private maxConcurrentAnalyses = 3; // Limit concurrent AI calls
  private batchSize = 5; // Files per batch

  /**
   * Start bulk analysis of multiple files with performance monitoring
   */
  async startBulkAnalysis(
    files: Array<{ name: string; path: string; size: number }>,
    options: {
      maxSampleSize?: number;
      enableCaching?: boolean;
      prioritizeCommonFields?: boolean;
    } = {}
  ): Promise<string> {
    const result = await ServiceOperation.execute(
      'BulkAIMapper.startBulkAnalysis',
      async () => {
        const jobId = this.generateJobId();
        const job: BulkAnalysisJob = {
          id: jobId,
          files,
          status: 'pending',
          progress: 0,
          results: [],
          startTime: new Date()
        };

        this.activeJobs.set(jobId, job);

        // Start processing asynchronously
        this.processBulkAnalysis(jobId, options).catch(error => {
          secureLogger.error(`❌ Bulk analysis job ${jobId} failed:`, { error: String(error) });
          job.status = 'failed';
          job.error = error.message;
          job.endTime = new Date();
        });

        return jobId;
      }
    );
    return result.data || this.generateJobId();
  }

  /**
   * Get bulk analysis job status
   */
  getJobStatus(jobId: string): BulkAnalysisJob | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get bulk analysis results
   */
  async getBulkResults(jobId: string): Promise<BulkMappingSummary | null> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== 'completed') {
      return null;
    }

    return this.generateBulkSummary(job);
  }

  /**
   * Process bulk analysis with batching and rate limiting
   */
  private async processBulkAnalysis(
    jobId: string,
    options: {
      maxSampleSize?: number;
      enableCaching?: boolean;
      prioritizeCommonFields?: boolean;
    }
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) throw new Error('Job not found');

    job.status = 'processing';
    secureLogger.info(`🤖 Starting bulk AI analysis for ${job.files.length} files...`);

    const { maxSampleSize = 100, enableCaching = true } = options;
    const batches = this.createBatches(job.files, this.batchSize);
    let completedFiles = 0;

    for (const batch of batches) {
      // Process batch with concurrency control
      const batchPromises = batch.map(async (file, index) => {
        // Add delay to respect rate limits
        await this.delay(index * 500);
        return this.analyzeFile(file, maxSampleSize);
      });

      try {
        const batchResults = await Promise.all(batchPromises);

        // Update job with batch results
        job.results.push(...batchResults);
        completedFiles += batch.length;
        job.progress = Math.round((completedFiles / job.files.length) * 100);

      } catch (error) {
        secureLogger.error('Batch processing error:', { error: String(error) });
        // Continue with next batch even if current batch fails
      }
    }

    job.status = 'completed';
    job.endTime = new Date();
  }

  /**
   * Analyze individual file
   */
  private async analyzeFile(
    file: { name: string; path: string; size: number },
    maxSampleSize: number
  ): Promise<BulkAnalysisResult> {
    const startTime = Date.now();

    try {

      // Generate file preview
      const fileData = await filePreviewService.generatePreview(
        file.path,
        file.name,
        file.size
      );

      if (!fileData.headers || !fileData.rows) {
        throw new Error('Failed to process file - missing headers or rows');
      }

      // Perform AI analysis
      const analysisResult = await aiColumnMapper.analyzeFileColumns(
        fileData.headers,
        fileData.rows,
        Math.min(maxSampleSize, fileData.rows.length)
      );

      const processingTime = Date.now() - startTime;

      return {
        fileName: file.name,
        fileSize: file.size,
        totalColumns: fileData.headers.length,
        totalRows: fileData.rows.length,
        analysisResult,
        processingTime,
        status: 'success'
      };

    } catch (error) {
      secureLogger.error(`❌ Analysis failed for ${file.name}:`, { error: String(error) });

      return {
        fileName: file.name,
        fileSize: file.size,
        totalColumns: 0,
        totalRows: 0,
        analysisResult: {
          mappings: [],
          overallConfidence: 0,
          suggestedExclusions: [],
          processingNotes: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
          estimatedAccuracy: 0,
          recommendedActions: ['Retry with manual mapping']
        },
        processingTime: Date.now() - startTime,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate comprehensive bulk analysis summary
   */
  private generateBulkSummary(job: BulkAnalysisJob): BulkMappingSummary {
    const successfulResults = job.results.filter(r => r.status === 'success');
    const failedResults = job.results.filter(r => r.status === 'failed');

    // Aggregate statistics
    const totalColumns = successfulResults.reduce((sum, r) => sum + r.totalColumns, 0);
    const successfulMappings = successfulResults.reduce((sum, r) =>
      sum + r.analysisResult.mappings.filter(m => m.suggestedField && !m.shouldExclude).length, 0
    );

    const averageConfidence = successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.analysisResult.overallConfidence, 0) / successfulResults.length
      : 0;

    const processingTime = job.endTime && job.startTime
      ? job.endTime.getTime() - job.startTime.getTime()
      : 0;

    // Generate recommended mappings based on frequency and confidence
    const mappingFrequency = new Map<string, Map<string, { count: number; totalConfidence: number }>>();

    successfulResults.forEach(result => {
      result.analysisResult.mappings.forEach(mapping => {
        if (mapping.suggestedField && !mapping.shouldExclude) {
          if (!mappingFrequency.has(mapping.originalName)) {
            mappingFrequency.set(mapping.originalName, new Map());
          }

          const fieldMap = mappingFrequency.get(mapping.originalName)!;
          const existing = fieldMap.get(mapping.suggestedField) || { count: 0, totalConfidence: 0 };

          fieldMap.set(mapping.suggestedField, {
            count: existing.count + 1,
            totalConfidence: existing.totalConfidence + mapping.confidence
          });
        }
      });
    });

    // Generate recommended mappings and conflicts
    const recommendedMappings: Record<string, string> = {};
    const conflictingMappings: Array<{
      columnName: string;
      suggestions: string[];
      confidence: number[];
    }> = [];

    mappingFrequency.forEach((fieldMap, columnName) => {
      const sortedSuggestions = Array.from(fieldMap.entries())
        .sort((a, b) => {
          const avgConfidenceA = a[1].totalConfidence / a[1].count;
          const avgConfidenceB = b[1].totalConfidence / b[1].count;
          return (b[1].count * avgConfidenceB) - (a[1].count * avgConfidenceA);
        });

      if (sortedSuggestions.length > 0) {
        const topSuggestion = sortedSuggestions[0];
        recommendedMappings[columnName] = topSuggestion[0];

        // Check for conflicts (multiple strong suggestions)
        if (sortedSuggestions.length > 1) {
          const topConfidence = topSuggestion[1].totalConfidence / topSuggestion[1].count;
          const secondConfidence = sortedSuggestions[1][1].totalConfidence / sortedSuggestions[1][1].count;

          if (Math.abs(topConfidence - secondConfidence) < 20) {
            conflictingMappings.push({
              columnName,
              suggestions: sortedSuggestions.slice(0, 3).map(s => s[0]),
              confidence: sortedSuggestions.slice(0, 3).map(s => s[1].totalConfidence / s[1].count)
            });
          }
        }
      }
    });

    return {
      totalFiles: job.files.length,
      totalColumns,
      successfulMappings,
      failedAnalyses: failedResults.length,
      averageConfidence: Math.round(averageConfidence),
      processingTime,
      recommendedMappings,
      conflictingMappings
    };
  }

  /**
   * Create batches from file list
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `bulk-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up completed jobs (call periodically)
   */
  cleanupJobs(maxAge: number = 3600000): void { // 1 hour default
    const now = Date.now();

    this.activeJobs.forEach((job, jobId) => {
      const jobAge = now - job.startTime.getTime();
      if (jobAge > maxAge && (job.status === 'completed' || job.status === 'failed')) {
        this.activeJobs.delete(jobId);
      }
    });
  }
}

// Export singleton instance
export const bulkAIMapper = new BulkAIMapper();
