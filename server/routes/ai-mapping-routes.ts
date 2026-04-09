/**
 * AI Column Mapping API Routes
 *
 * Provides endpoints for AI-powered column mapping functionality:
 * - POST /api/ai-mapping/analyze - Analyze file columns and suggest mappings
 * - GET /api/ai-mapping/schema - Get database schema information
 * - POST /api/ai-mapping/validate - Validate suggested mappings
 */

import { applicationLogger } from '../services/application-logger';
import { Router } from 'express';
import { aiColumnMapper, type AIColumnMappingResult } from '../services/ai-column-mapper';
import { bulkAIMapper } from '../services/bulk-ai-mapper';
import { requireAuth } from '../jwt-utils';
import multer from 'multer';
import fs from 'node:fs';
import { filePreviewService } from '../file-preview-service';

const router = Router();
const upload = multer({ dest: 'temp/' });

/**
 * Analyze uploaded file columns with AI
 * POST /api/ai-mapping/analyze
 */
router.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { aiMappingLogger } = await import('../utils/import-logging-utils');

    if (!req.file) {
      await aiMappingLogger.logAnalysisError(req, new Error('No file uploaded'), {
        message: 'AI mapping analysis attempted without file upload',
        operation: 'ai_column_mapping_no_file'
      });
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { maxSampleSize = 100 } = req.body;
    const fileInfo = {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.originalname.split('.').pop()
    };

    await aiMappingLogger.logAnalysisStart(req, fileInfo, parseInt(maxSampleSize));
    applicationLogger.info('ai-mapping', `🤖 Starting AI analysis for file: ${req.file.originalname}`);

    // Get actual file size if not provided
    const fileStats = await fs.promises.stat(req.file.path);
    const actualFileSize = req.file.size || fileStats.size;

    // Process file to extract headers and sample data
    let fileData;
    try {
      fileData = await filePreviewService.generatePreview(
        req.file.path,
        req.file.originalname,
        actualFileSize
      );
    } catch (error) {
      applicationLogger.error('ai-mapping', 'File processing failed with exception:', error instanceof Error ? error : undefined);
      await aiMappingLogger.logAnalysisError(req, error as Error, {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        message: 'AI mapping file processing failed',
        operation: 'ai_mapping_file_processing'
      });
      return res.status(400).json({
        success: false,
        error: 'Failed to process uploaded file',
        details: error instanceof Error ? error.message : 'File preview generation failed'
      });
    }



    if (!fileData.headers || !fileData.rows || fileData.headers.length === 0) {
      applicationLogger.error('ai-mapping', 'File processing failed: Missing headers or rows');
      const { importOperationLogger } = await import('../utils/import-logging-utils');
      await importOperationLogger.logValidationWarning(req, 'ai_mapping_data_validation', {
        fileName: req.file.originalname,
        hasHeaders: !!fileData.headers,
        headersLength: fileData.headers?.length,
        hasRows: !!fileData.rows,
        rowsLength: fileData.rows?.length
      });
      applicationLogger.error('ai-mapping', 'Validation details', undefined, {
        hasHeaders: !!fileData.headers,
        headersLength: fileData.headers?.length,
        hasRows: !!fileData.rows,
        rowsLength: fileData.rows?.length
      });
      return res.status(400).json({
        success: false,
        error: 'Failed to process uploaded file',
        details: 'File preview generation failed - missing data'
      });
    }

    // Perform AI analysis
    const startTime = Date.now();
    const analysisResult: AIColumnMappingResult = await aiColumnMapper.analyzeFileColumns(
      fileData.headers,
      fileData.rows,
      parseInt(maxSampleSize)
    );

    const processedFileInfo = {
      name: req.file.originalname,
      size: req.file.size,
      rowCount: fileData.metadata.totalRows,
      headerCount: fileData.headers.length,
      processingTimeMs: Date.now() - startTime
    };

    const analysisResults = {
      mappingsGenerated: analysisResult.mappings?.length || 0,
      confidenceScores: analysisResult.mappings?.map(m => m.confidence) || [],
      recommendedColumns: analysisResult.mappings?.filter(m => m.confidence > 0.8).length || 0,
      aiModelUsed: 'gpt-4o'
    };

    await aiMappingLogger.logAnalysisSuccess(req, processedFileInfo, analysisResults);

    // File cleanup handled by temp directory cleaning

    res.json({
      success: true,
      analysis: analysisResult,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        totalRows: fileData.metadata.totalRows,
        totalColumns: fileData.headers.length
      }
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'AI mapping analysis error:', error instanceof Error ? error : undefined);

    const { aiMappingLogger } = await import('../utils/import-logging-utils');
    await aiMappingLogger.logAnalysisError(req, error as Error, {
      fileName: req.file?.originalname || 'unknown',
      fileSize: req.file?.size || 0,
      message: 'AI column mapping analysis failed',
      operation: 'ai_column_mapping_analysis',
      errorType: 'analysis_failure'
    });

    // File cleanup handled by temp directory cleaning

    res.status(500).json({
      success: false,
      error: 'AI analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get database schema information for mapping reference
 * GET /api/ai-mapping/schema
 */
router.get('/schema', requireAuth, async (req, res) => {
  try {
    // Return database schema information
    const schema = {
      tables: {
        customers: {
          description: 'Main customer profiles table',
          fields: [
            {
              name: 'firstName',
              type: 'text',
              description: 'Customer first name or given name',
              required: false,
              examples: ['John', 'Sarah', 'Ahmad', 'Siti']
            },
            {
              name: 'lastName',
              type: 'text',
              description: 'Customer last name, family name, or surname',
              required: false,
              examples: ['Smith', 'Johnson', 'Santoso', 'Rahayu']
            },
            {
              name: 'email',
              type: 'email',
              description: 'Customer email address (unique)',
              required: false,
              examples: ['john@example.com', 'sarah.smith@gmail.com']
            },
            {
              name: 'phoneNumber',
              type: 'phone',
              description: 'Customer phone number in any format',
              required: false,
              examples: ['+62-21-123456', '(555) 123-4567', '08123456789']
            },
            {
              name: 'dateOfBirth',
              type: 'date',
              description: 'Customer date of birth',
              required: false,
              examples: ['1990-05-15', '15/05/1990', 'May 15, 1990']
            },
            {
              name: 'gender',
              type: 'text',
              description: 'Customer gender',
              required: false,
              examples: ['Male', 'Female', 'M', 'F', 'Laki-laki', 'Perempuan']
            },
            {
              name: 'customerSegment',
              type: 'text',
              description: 'Customer business or demographic segment',
              required: false,
              examples: ['Professional', 'Student', 'Entrepreneur', 'Regular Listener']
            },
            {
              name: 'lifetimeValue',
              type: 'number',
              description: 'Customer lifetime value in currency',
              required: false,
              examples: ['1250.50', '$1,250.50', 'Rp 1.250.500']
            },
            {
              name: 'currentAddress',
              type: 'json',
              description: 'Customer address information',
              required: false,
              examples: ['Jakarta, Indonesia', '123 Main St, Jakarta']
            }
          ]
        }
      }
    };

    res.json({
      success: true,
      schema
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Schema retrieval error:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve schema information'
    });
  }
});

/**
 * Validate and refine mapping suggestions
 * POST /api/ai-mapping/validate
 */
router.post('/validate', requireAuth, async (req, res) => {
  try {
    const { mappings, originalHeaders } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        error: 'Mappings array is required'
      });
    }

    // Validate mappings against database schema
    const validationResults = {
      validMappings: mappings.filter((m: any) =>
        m.suggestedField &&
        !m.shouldExclude &&
        m.confidence > 50
      ),
      conflicts: mappings.filter((m: any, index: number) => {
        // Check for duplicate field mappings
        return mappings.findIndex((other: any) =>
          other.suggestedField === m.suggestedField &&
          other !== m
        ) !== -1;
      }),
      lowConfidence: mappings.filter((m: any) =>
        m.confidence < 60 && !m.shouldExclude
      ),
      excluded: mappings.filter((m: any) => m.shouldExclude)
    };

    res.json({
      success: true,
      validation: validationResults,
      recommendations: {
        readyForImport: validationResults.conflicts.length === 0 &&
                       validationResults.lowConfidence.length === 0,
        requiresReview: validationResults.conflicts.length > 0 ||
                       validationResults.lowConfidence.length > 0,
        mappedFields: validationResults.validMappings.length,
        totalFields: mappings.length
      }
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Mapping validation error:', error instanceof Error ? error : undefined);
    const { importOperationLogger } = await import('../utils/import-logging-utils');
    await importOperationLogger.logFailure(req, 'mapping_validation', error as Error, {
      mappingCount: req.body.mappings?.length || 0
    });
    res.status(500).json({
      success: false,
      error: 'Mapping validation failed'
    });
  }
});

/**
 * Get AI mapping suggestions for specific column
 * POST /api/ai-mapping/suggest-column
 */
router.post('/suggest-column', requireAuth, async (req, res) => {
  try {
    const { columnName, sampleData, allHeaders } = req.body;
    const { importOperationLogger, aiMappingLogger } = await import('../utils/import-logging-utils');

    if (!columnName || !sampleData || !Array.isArray(sampleData)) {
      await importOperationLogger.logValidationWarning(req, 'column_suggestion_validation', {
        hasColumnName: !!columnName,
        hasSampleData: !!sampleData,
        isArraySampleData: Array.isArray(sampleData)
      });
      return res.status(400).json({
        success: false,
        error: 'Column name and sample data are required'
      });
    }

    await importOperationLogger.logSuccess(req, 'column_suggestion_request', {
      columnName,
      sampleDataCount: sampleData.length,
      allHeadersCount: allHeaders?.length || 0
    });

    // Create temporary instance for single column analysis
    const suggestion = await aiColumnMapper.analyzeFileColumns(
      [columnName],
      sampleData.map(data => ({ [columnName]: data })),
      Math.min(50, sampleData.length)
    );

    await importOperationLogger.logSuccess(req, 'column_suggestion_complete', {
      columnName,
      suggestedField: suggestion.mappings[0]?.suggestedField || 'none',
      confidence: suggestion.mappings[0]?.confidence || 0
    });

    res.json({
      success: true,
      suggestion: suggestion.mappings[0] || null
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Column suggestion error:', error instanceof Error ? error : undefined);
    const { importOperationLogger } = await import('../utils/import-logging-utils');
    await importOperationLogger.logFailure(req, 'column_suggestion', error as Error, {
      columnName: req.body.columnName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate column suggestion'
    });
  }
});

/**
 * Start bulk AI analysis for multiple files
 * POST /api/ai-mapping/bulk-analyze
 */
router.post('/bulk-analyze', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { aiMappingLogger } = await import('../utils/import-logging-utils');

    if (!files || files.length === 0) {
      await aiMappingLogger.logAnalysisError(req, new Error('No files uploaded'), {
        message: 'Bulk AI analysis attempted without files',
        operation: 'bulk_ai_analysis_no_files'
      });
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const { maxSampleSize = 100, enableCaching = true } = req.body;
    const options = {
      maxSampleSize: parseInt(maxSampleSize),
      enableCaching: enableCaching === 'true'
    };

    applicationLogger.info('ai-mapping', `🚀 Starting bulk AI analysis for ${files.length} files`);

    // Prepare file list for bulk processing
    const fileList = files.map(file => ({
      name: file.originalname,
      path: file.path,
      size: file.size
    }));

    // Start bulk analysis
    const jobId = await bulkAIMapper.startBulkAnalysis(fileList, options);

    await aiMappingLogger.logBulkAnalysis(req, files, jobId, options);

    res.json({
      success: true,
      jobId,
      message: `Bulk analysis started for ${files.length} files`,
      filesInfo: fileList.map(f => ({
        name: f.name,
        size: f.size
      }))
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Bulk analysis start error:', error instanceof Error ? error : undefined);

    const { aiMappingLogger } = await import('../utils/import-logging-utils');
    await aiMappingLogger.logAnalysisError(req, error as Error, {
      fileCount: (req.files as Express.Multer.File[] || []).length,
      message: 'Bulk AI analysis failed to start',
      operation: 'bulk_ai_analysis_start_failure'
    });

    // Clean up uploaded files on error
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      await Promise.all(files.map(file =>
        fs.promises.unlink(file.path).catch(() => {})
      ));
    }

    res.status(500).json({
      success: false,
      error: 'Failed to start bulk analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get bulk analysis job status
 * GET /api/ai-mapping/bulk-status/:jobId
 */
router.get('/bulk-status/:jobId', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = bulkAIMapper.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        filesCount: job.files.length,
        completedCount: job.results.length,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error
      }
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Bulk status retrieval error:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

/**
 * Get bulk analysis results
 * GET /api/ai-mapping/bulk-results/:jobId
 */
router.get('/bulk-results/:jobId', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const results = await bulkAIMapper.getBulkResults(jobId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Results not found or job not completed'
      });
    }

    res.json({
      success: true,
      results
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Bulk results retrieval error:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to get bulk results'
    });
  }
});

/**
 * Demonstrate AI mapping with sample data
 * POST /api/ai-mapping/demo
 */
router.post('/demo', requireAuth, async (req, res) => {
  try {
    applicationLogger.info('ai-mapping', '🎯 Starting AI mapping demonstration...');

    // Sample customer data for demonstration
    const sampleHeaders = [
      'Full Name', 'Email Address', 'Phone Number', 'Birth Date',
      'Gender', 'Job Title', 'Annual Income', 'City', 'Social Media'
    ];

    const sampleData = [
      {
        'Full Name': 'John Michael Smith',
        'Email Address': 'john.smith@techcorp.com',
        'Phone Number': '+1-555-123-4567',
        'Birth Date': '1990-05-15',
        'Gender': 'Male',
        'Job Title': 'Senior Software Engineer',
        'Annual Income': '95000',
        'City': 'New York',
        'Social Media': '@johnsmith_dev'
      },
      {
        'Full Name': 'Sarah Elizabeth Johnson',
        'Email Address': 'sarah.johnson@marketing.io',
        'Phone Number': '(555) 987-6543',
        'Birth Date': '1985-03-22',
        'Gender': 'Female',
        'Job Title': 'Marketing Director',
        'Annual Income': '87500',
        'City': 'Los Angeles',
        'Social Media': '@sarahmarketing'
      },
      {
        'Full Name': 'Ahmad Budi Santoso',
        'Email Address': 'ahmad.santoso@gmail.com',
        'Phone Number': '08123456789',
        'Birth Date': '1992-08-10',
        'Gender': 'Laki-laki',
        'Job Title': 'Entrepreneur',
        'Annual Income': '65000',
        'City': 'Jakarta',
        'Social Media': '@ahmad_biz'
      }
    ];

    // Perform AI analysis on sample data
    const analysisResult = await aiColumnMapper.analyzeFileColumns(
      sampleHeaders,
      sampleData,
      sampleData.length
    );

    res.json({
      success: true,
      demo: {
        sampleHeaders,
        sampleDataCount: sampleData.length,
        analysisResult,
        mappingSuggestions: analysisResult.mappings.reduce((acc, mapping) => {
          if (mapping.suggestedField && !mapping.shouldExclude) {
            acc[mapping.originalName] = mapping.suggestedField;
          }
          return acc;
        }, {} as Record<string, string>),
        confidenceScores: analysisResult.mappings.map(m => ({
          column: m.originalName,
          confidence: m.confidence,
          reasoning: m.reasoning
        }))
      }
    });

  } catch (error) {
    applicationLogger.error('ai-mapping', 'Demo analysis error:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Demo analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
