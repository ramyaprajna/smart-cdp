/**
 * File Preview Service for Smart CDP Platform
 * Provides preview functionality for uploaded files before full import
 * Refactored to use modular file processors and validators
 */

import { errorHandler } from './enhanced-error-handler';
import { detectFileType, createFileProcessor } from './file-processors';
import { DataValidator } from './validation/data-validator';
import { DataTypeDetector } from './validation/data-type-detector';
import { ProcessingEstimator } from './utils/processing-estimator';
import { secureLogger } from './utils/secure-logger';

export interface PreviewData {
  headers: string[];
  rows: Record<string, any>[];
  metadata: {
    totalRows: number;
    previewRows: number;
    fileName: string;
    fileSize: number;
    fileType: string;
    encoding?: string;
    estimatedProcessingTime: string;
  };
  dataTypes: Record<string, string>;
  validation: {
    hasErrors: boolean;
    warnings: string[];
    suggestions: string[];
  };
}

export interface PreviewOptions {
  maxPreviewRows?: number;
  detectDataTypes?: boolean;
  validateData?: boolean;
  suggestMappings?: boolean;
}

export class FilePreviewService {
  private static instance: FilePreviewService;
  private dataValidator: DataValidator;
  private dataTypeDetector: DataTypeDetector;

  private constructor() {
    this.dataValidator = new DataValidator();
    this.dataTypeDetector = new DataTypeDetector();
  }

  static getInstance(): FilePreviewService {
    if (!FilePreviewService.instance) {
      FilePreviewService.instance = new FilePreviewService();
    }
    return FilePreviewService.instance;
  }

  /**
   * Generate preview data for uploaded file
   */
  async generatePreview(
    filePath: string,
    fileName: string,
    fileSize: number,
    options: PreviewOptions = {}
  ): Promise<PreviewData> {
    const correlationId = errorHandler.generateCorrelationId();

    try {
      const {
        maxPreviewRows = 10,
        detectDataTypes = true,
        validateData = true
      } = options;

      const fileType = detectFileType(fileName);

      secureLogger.info(`📊 [File Preview] Starting preview generation`, {
        correlationId,
        fileName,
        fileSize,
        fileType,
        maxPreviewRows
      });

      // Use appropriate file processor
      const processor = createFileProcessor(fileType, maxPreviewRows);
      const previewData = await processor.processFile(filePath);

      // Generate data type information
      const dataTypes = detectDataTypes ? this.dataTypeDetector.detectTypes(previewData.rows) : {};

      // Perform validation
      const validation = validateData ? this.dataValidator.validateData(previewData.rows, previewData.headers) : {
        hasErrors: false,
        warnings: [],
        suggestions: []
      };

      // Calculate estimated processing time
      const estimatedTime = ProcessingEstimator.estimateProcessingTime(
        previewData.totalRows,
        fileSize,
        fileType as any
      );

      const result: PreviewData = {
        headers: previewData.headers,
        rows: previewData.rows,
        metadata: {
          totalRows: previewData.totalRows,
          previewRows: previewData.rows.length,
          fileName,
          fileSize,
          fileType,
          estimatedProcessingTime: estimatedTime
        },
        dataTypes,
        validation
      };

      secureLogger.info(`✅ [File Preview] Preview generated successfully`, {
        correlationId,
        previewRows: result.rows.length,
        totalRows: result.metadata.totalRows,
        hasErrors: result.validation.hasErrors
      });

      return result;

    } catch (error) {
      errorHandler.logError(error as Error, {
        correlationId,
        operation: 'file_preview',
        metadata: { fileName, fileSize }
      });
      throw error;
    }
  }


}

// Export singleton instance
export const filePreviewService = FilePreviewService.getInstance();
