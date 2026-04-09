/**
 * Customer Template Routes
 *
 * Provides downloadable customer profile templates that align exactly with the backend schema.
 * Templates include mandatory field markers, data type examples, and validation-ready sample data.
 *
 * @module TemplateRoutes
 * @created August 15, 2025
 */

import { applicationLogger } from '../services/application-logger';
import { Router } from 'express';
import { sendSuccess, sendError } from '../utils/response-utils';
import { errorHandler } from '../enhanced-error-handler';

const router = Router();

/**
 * Get template metadata
 * Returns field definitions, validation rules, and sample data info
 *
 * @route GET /metadata
 * @returns {Object} Template metadata with field definitions and validation rules
 */
router.get('/metadata', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    // Generating template metadata

    const { templateGenerator } = await import('../services/template-generator-service');
    const metadata = await templateGenerator.generateTemplateMetadata();

    sendSuccess(res, {
      metadata,
      fieldsCount: metadata.fields.length,
      requiredFieldsCount: metadata.fields.filter(f => f.required).length,
      sampleRowsCount: metadata.sampleData.length,
      lastGenerated: metadata.lastGenerated
    }, 'Template metadata generated successfully');

  } catch (error) {
    // Template metadata generation failed
    sendError(res, error instanceof Error ? error : new Error('Failed to generate template metadata'), 'template_metadata', 500, { correlationId });
  }
});

/**
 * Download CSV template
 *
 * @route GET /download/csv
 * @returns {text/csv} CSV template with headers, descriptions, and sample data
 */
router.get('/download/csv', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    // Generating CSV template

    const { templateGenerator } = await import('../services/template-generator-service');
    const csvContent = await templateGenerator.generateCSVTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.csv"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(csvContent);

    // CSV template download completed

  } catch (error) {
    // CSV template generation failed
    sendError(res, error instanceof Error ? error : new Error('Failed to generate CSV template'), 'csv_template', 500, { correlationId });
  }
});

/**
 * Download JSON template
 *
 * @route GET /download/json
 * @returns {application/json} JSON template with metadata and sample customer objects
 */
router.get('/download/json', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {

    const { templateGenerator } = await import('../services/template-generator-service');
    const jsonContent = await templateGenerator.generateJSONTemplate();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.json"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(jsonContent);

    applicationLogger.info('template', 'JSON template downloaded', {
      correlationId,
      size: jsonContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'JSON generation failed:', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate JSON template'), 'json_template', 500, { correlationId });
  }
});

/**
 * Download TXT template
 *
 * @route GET /download/txt
 * @returns {text/plain} Tab-delimited template with headers and sample data
 */
router.get('/download/txt', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {

    const { templateGenerator } = await import('../services/template-generator-service');
    const txtContent = await templateGenerator.generateTXTTemplate();

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.txt"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(txtContent);

    applicationLogger.info('template', 'TXT template downloaded', {
      correlationId,
      size: txtContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'TXT generation failed:', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate TXT template'), 'txt_template', 500, { correlationId });
  }
});

/**
 * Generate DOCX template
 *
 * @route GET /download/docx
 * @returns {application/vnd.openxmlformats-officedocument.wordprocessingml.document} Word document template
 */
router.get('/download/docx', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {

    // Generate CSV content first
    const { templateGenerator } = await import('../services/template-generator-service');
    const csvContent = await templateGenerator.generateCSVTemplate();

    // For now, return CSV content as plain text with DOCX headers
    // TODO: Integrate with mammoth or docx library for proper Word document generation
    const docxContent = [
      'Customer Profile Import Template',
      '=====================================',
      '',
      'Instructions:',
      '1. Fill in customer data according to the field descriptions below',
      '2. Required fields are marked with *',
      '3. Use the exact field names as headers when importing',
      '4. Follow the data formats specified in descriptions',
      '',
      'Template Data (Copy to Excel or CSV format):',
      '============================================',
      '',
      csvContent
    ].join('\n');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.docx"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(docxContent);

    applicationLogger.info('template', 'DOCX template downloaded', {
      correlationId,
      size: docxContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'DOCX generation failed:', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate DOCX template'), 'docx_template', 500, { correlationId });
  }
});

/**
 * Validate template data
 * Validates uploaded template data against the customer schema
 *
 * @route POST /validate
 * @body {Object} { data: Array<Object> } - Array of customer objects to validate
 * @returns {Object} Validation results with errors if any
 */
router.post('/validate', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return sendError(res, new Error('Data must be an array of customer objects'), 'template_validation', 400, { correlationId });
    }

    applicationLogger.info('template', 'Validating template data');

    const { templateGenerator } = await import('../services/template-generator-service');
    const validation = await templateGenerator.validateTemplateData(data);

    sendSuccess(res, {
      validation,
      recordCount: data.length,
      validRecords: validation.valid ? data.length : data.length - validation.errors.length,
      invalidRecords: validation.errors.length
    }, validation.valid ? 'All records are valid' : `Found ${validation.errors.length} validation errors`);

    applicationLogger.info('template', 'Validation completed', {
      correlationId,
      valid: validation.valid,
      errorCount: validation.errors.length
    });

  } catch (error) {
    applicationLogger.error('template', 'Validation failed:', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to validate template data'), 'template_validation', 500, { correlationId });
  }
});

/**
 * Convenience Routes (Shorter Paths)
 * These routes provide shorter, more intuitive paths for frontend integration
 */

// Convenience route for CSV download (matches frontend calls to /api/templates/csv)
router.get('/csv', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    applicationLogger.info('template', 'Generating CSV template (convenience route)');

    const { templateGenerator } = await import('../services/template-generator-service');
    const csvContent = await templateGenerator.generateCSVTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.csv"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(csvContent);

    applicationLogger.info('template', 'CSV template downloaded (convenience)', {
      correlationId,
      size: csvContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'CSV generation failed (convenience):', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate CSV template'), 'csv_template', 500, { correlationId });
  }
});

// Convenience route for JSON download (matches frontend calls to /api/templates/json)
router.get('/json', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    applicationLogger.info('template', 'Generating JSON template (convenience route)');

    const { templateGenerator } = await import('../services/template-generator-service');
    const jsonContent = await templateGenerator.generateJSONTemplate();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.json"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(jsonContent);

    applicationLogger.info('template', 'JSON template downloaded (convenience)', {
      correlationId,
      size: jsonContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'JSON generation failed (convenience):', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate JSON template'), 'json_template', 500, { correlationId });
  }
});

// Convenience route for TXT download (matches frontend calls to /api/templates/txt)
router.get('/txt', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    applicationLogger.info('template', 'Generating TXT template (convenience route)');

    const { templateGenerator } = await import('../services/template-generator-service');
    const txtContent = await templateGenerator.generateTXTTemplate();

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.txt"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(txtContent);

    applicationLogger.info('template', 'TXT template downloaded (convenience)', {
      correlationId,
      size: txtContent.length
    });

  } catch (error) {
    applicationLogger.error('template', 'TXT generation failed (convenience):', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate TXT template'), 'txt_template', 500, { correlationId });
  }
});

// Convenience route for Excel download (matches frontend calls to /api/templates/xlsx)
router.get('/xlsx', async (req, res) => {
  const correlationId = errorHandler.generateCorrelationId();

  try {
    applicationLogger.info('template', 'Generating Excel template (convenience route)');

    const { templateGenerator } = await import('../services/template-generator-service');
    const excelBuffer = await templateGenerator.generateXLSXTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_profile_template.xlsx"');
    res.setHeader('X-Correlation-ID', correlationId);

    res.send(excelBuffer);

    applicationLogger.info('template', 'Excel template downloaded (convenience)', {
      correlationId,
      size: excelBuffer.length
    });

  } catch (error) {
    applicationLogger.error('template', 'Excel generation failed (convenience):', error instanceof Error ? error : undefined);
    sendError(res, error instanceof Error ? error : new Error('Failed to generate Excel template'), 'xlsx_template', 500, { correlationId });
  }
});

export default router;
