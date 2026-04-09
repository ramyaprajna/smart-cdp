/**
 * Flexible CDP API Routes
 *
 * Provides endpoints for the flexible customer data platform functionality:
 * - Schema registry management
 * - Flexible AI mapping with industry contexts
 * - Custom attribute management
 * - Data source discovery
 */

import { applicationLogger } from '../services/application-logger';
import { Router } from 'express';
import { requireAuth } from '../jwt-utils';
import { schemaRegistryService } from '../services/schema-registry-service';
import { flexibleAIMapper } from '../services/flexible-ai-mapper';
import { filePreviewService } from '../file-preview-service';
import multer from 'multer';
import fs from 'node:fs';
import { dynamicAttributeService } from '../services/dynamic-attribute-service';
import { enhancedImportService } from '../services/enhanced-import-service';

const router = Router();
const upload = multer({ dest: 'temp/' });

/**
 * Get all available data source schemas
 * GET /api/flexible-cdp/schemas
 */
router.get('/schemas', requireAuth, async (req, res) => {
  try {
    const schemas = await schemaRegistryService.getAvailableSchemas();

    res.json({
      success: true,
      schemas: schemas.map(schema => ({
        sourceName: schema.sourceName,
        displayName: schema.displayName,
        description: schema.description,
        schemaVersion: schema.schemaVersion,
        fieldCount: Object.keys(schema.fieldDefinitions || {}).length,
        isActive: schema.isActive,
        createdAt: schema.createdAt,
      })),
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to fetch schemas:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data source schemas',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get a specific data source schema with full details
 * GET /api/flexible-cdp/schemas/:sourceName
 */
router.get('/schemas/:sourceName', requireAuth, async (req, res) => {
  try {
    const { sourceName } = req.params;
    const schema = await schemaRegistryService.getSchema(sourceName);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found',
      });
    }

    res.json({
      success: true,
      schema,
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to fetch schema:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schema details',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Suggest data source schema for given headers
 * POST /api/flexible-cdp/suggest-schema
 */
router.post('/suggest-schema', requireAuth, async (req, res) => {
  try {
    const { headers } = req.body;

    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({
        success: false,
        error: 'Headers array is required',
      });
    }

    const suggestion = await schemaRegistryService.suggestSchema(headers);

    res.json({
      success: true,
      suggestion: suggestion ? {
        schema: {
          sourceName: suggestion.schema.sourceName,
          displayName: suggestion.schema.displayName,
          description: suggestion.schema.description,
        },
        confidence: suggestion.confidence,
        matchedHeaders: headers.filter(header => {
          const upperHeader = header.toUpperCase();
          return suggestion.schema.mappingTemplates && suggestion.schema.mappingTemplates[upperHeader];
        }),
      } : null,
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to suggest schema:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest data source schema',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Flexible AI analysis for uploaded files
 * POST /api/flexible-cdp/analyze
 */
router.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { maxSampleSize = 100, forceDataSource } = req.body;
    applicationLogger.info('cdp', `🔮 Starting Flexible AI analysis for file: ${req.file.originalname}`);

    // Process file to extract headers and sample data
    let fileData;
    try {
      const fileStats = await fs.promises.stat(req.file.path);
      const actualFileSize = req.file.size || fileStats.size;

      fileData = await filePreviewService.generatePreview(
        req.file.path,
        req.file.originalname,
        actualFileSize
      );
    } catch (error) {
      applicationLogger.error('cdp', 'File processing failed with exception:', error instanceof Error ? error : undefined);
      return res.status(400).json({
        success: false,
        error: 'Failed to process uploaded file',
        details: error instanceof Error ? error.message : 'File preview generation failed',
      });
    }

    if (!fileData.headers || !fileData.rows || fileData.headers.length === 0) {
      applicationLogger.error('cdp', 'File processing failed: Missing headers or rows');
      return res.status(400).json({
        success: false,
        error: 'Failed to process uploaded file',
        details: 'File preview generation failed - missing data',
      });
    }

    // Perform flexible AI analysis
    const analysisResult = await flexibleAIMapper.analyzeFileColumns(
      fileData.headers,
      fileData.rows,
      parseInt(maxSampleSize)
    );

    // File cleanup handled by temp directory cleaning

    res.json({
      success: true,
      analysis: analysisResult,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        totalRows: fileData.metadata.totalRows,
        totalColumns: fileData.headers.length,
      },
    });

  } catch (error) {
    applicationLogger.error('cdp', 'Flexible AI mapping analysis error:', error instanceof Error ? error : undefined);

    // File cleanup handled by temp directory cleaning

    res.status(500).json({
      success: false,
      error: 'Flexible AI analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get customer attributes for a specific customer
 * GET /api/flexible-cdp/customers/:customerId/attributes
 */
router.get('/customers/:customerId/attributes', requireAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { category, sourceSystem } = req.query;


    // Get customer attributes using the dynamic attribute service
    const attributes = await dynamicAttributeService.getCustomerAttributes(
      customerId,
      category === 'true' ? true : category === 'false' ? false : undefined
    );

    res.json({
      success: true,
      customerId,
      attributes,
      total: attributes.length,
      filters: {
        category: category || 'all',
        sourceSystem: sourceSystem || 'all'
      }
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to fetch customer attributes:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer attributes',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get industry statistics and insights
 * GET /api/flexible-cdp/industry-insights
 */
router.get('/industry-insights', requireAuth, async (req, res) => {
  try {
    const schemas = await schemaRegistryService.getAvailableSchemas();
    const customAttributes = await dynamicAttributeService.getAllCustomAttributes();

    // Calculate insights from available schemas and custom attributes
    const insights = {
      availableIndustries: schemas.length,
      totalCustomFields: schemas.reduce((sum, schema) =>
        sum + Object.keys(schema.fieldDefinitions || {}).length, 0
      ),
      dynamicAttributesCount: customAttributes.length,
      totalAttributeUsage: customAttributes.reduce((sum, attr) => sum + attr.usageCount, 0),
      supportedDataTypes: [
        'text', 'number', 'date', 'boolean', 'array', 'object', 'email', 'phone'
      ],
      industryBreakdown: schemas.map(schema => ({
        industry: schema.displayName,
        sourceName: schema.sourceName,
        fieldCount: Object.keys(schema.fieldDefinitions || {}).length,
        description: schema.description,
      })),
      customAttributeBreakdown: customAttributes.map(attr => ({
        name: attr.attributeName,
        type: attr.attributeType,
        usageCount: attr.usageCount,
        dataSource: attr.dataSource,
        isSystem: attr.isSystem,
      })),
    };

    res.json({
      success: true,
      insights,
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to fetch industry insights:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch industry insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Suggest custom attribute mapping for a column
 * POST /api/flexible-cdp/suggest-attribute
 */
router.post('/suggest-attribute', requireAuth, async (req, res) => {
  try {
    const { columnName, sampleValues, sourceSystem } = req.body;

    if (!columnName) {
      return res.status(400).json({
        success: false,
        error: 'Column name is required',
      });
    }

    const suggestion = await dynamicAttributeService.suggestAttributeMapping(
      columnName,
      sampleValues || [],
      sourceSystem
    );

    res.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to suggest attribute mapping:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest attribute mapping',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Create a new custom attribute for a customer
 * POST /api/flexible-cdp/attributes
 */
router.post('/attributes', requireAuth, async (req, res) => {
  try {
    const {
      customerId,
      attributeName,
      attributeValue,
      attributeType,
      dataSource,
      confidence,
      isSystem
    } = req.body;

    if (!customerId || !attributeName || attributeValue === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID, attribute name, and value are required',
      });
    }

    await dynamicAttributeService.createCustomAttribute(
      customerId,
      attributeName,
      attributeValue,
      {
        attributeName: attributeName,
        attributeType: attributeType || 'text',
        dataSource: dataSource || 'manual',
        confidence: confidence || 1.0,
        isSystem: isSystem || false,
      }
    );

    res.json({
      success: true,
      message: 'Custom attribute created successfully',
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to create custom attribute:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to create custom attribute',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get all custom attributes across the system
 * GET /api/flexible-cdp/attributes
 */
router.get('/attributes', requireAuth, async (req, res) => {
  try {
    const attributes = await dynamicAttributeService.getAllCustomAttributes();

    res.json({
      success: true,
      attributes,
      total: attributes.length,
    });
  } catch (error) {
    applicationLogger.error('cdp', 'Failed to fetch custom attributes:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch custom attributes',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Enhanced Import: Create import preview with suggested mappings
 * POST /api/flexible-cdp/import/preview
 */
router.post('/import/preview', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }


    const preview = await enhancedImportService.createImportPreview(
      req.file.path,
      req.file.originalname,
      req.file.size
    );

    res.json({
      success: true,
      preview,
    });

  } catch (error) {
    applicationLogger.error('cdp', 'Enhanced import preview failed:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to create import preview',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Enhanced Import: Update column mappings
 * PUT /api/flexible-cdp/import/:importId/mappings
 */
router.put('/import/:importId/mappings', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;
    const { columnMappings } = req.body;

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return res.status(400).json({
        success: false,
        error: 'Column mappings array is required',
      });
    }

    await enhancedImportService.updateColumnMappings(importId, columnMappings);

    res.json({
      success: true,
      message: 'Column mappings updated successfully',
    });

  } catch (error) {
    applicationLogger.error('cdp', 'Failed to update column mappings:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to update column mappings',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Enhanced Import: Process import with custom attributes
 * POST /api/flexible-cdp/import/:importId/process
 */
router.post('/import/:importId/process', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;
    const { columnMappings, sourceSystem, importMetadata } = req.body;

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return res.status(400).json({
        success: false,
        error: 'Column mappings are required for processing',
      });
    }

    const result = await enhancedImportService.processImport({
      importId,
      columnMappings,
      sourceSystem: sourceSystem || 'manual_import',
      importMetadata,
    });

    res.json({
      success: true,
      result,
    });

  } catch (error) {
    applicationLogger.error('cdp', 'Enhanced import processing failed:', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Import processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
