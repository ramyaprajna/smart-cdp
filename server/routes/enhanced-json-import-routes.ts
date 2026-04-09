/**
 * Enhanced JSON Import Routes for Smart CDP Platform
 *
 * Provides REST API endpoints for the enhanced JSON import functionality
 * that stores unmapped fields as JSON within the customers table.
 *
 * Created: August 10, 2025
 * Integration Status: ✅ NEW - JSON storage enhancement routes
 */

import { Router } from 'express';
import { enhancedJsonImportService } from '../services/enhanced-json-import-service';
import { requireAuth } from '../auth-middleware';
import multer from 'multer';
import { secureLogger } from '../utils/secure-logger';

// Configure multer for file upload
const upload = multer({ dest: 'temp/' });
import { sendSuccess, sendError } from '../utils/response-utils';

const router = Router();

/**
 * Create JSON import preview with unmapped field analysis
 * POST /json-import/preview
 */
router.post('/preview', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const options = {
      storeUnmappedAsJson: req.body.storeUnmappedAsJson !== 'false',
      preserveOriginalData: req.body.preserveOriginalData !== 'false',
      maintainCustomAttributes: req.body.maintainCustomAttributes === 'true',
      jsonStorageStrategy: req.body.jsonStorageStrategy || 'replace'
    };


    const preview = await enhancedJsonImportService.createJsonImportPreview(
      req.file.path,
      req.file.originalname,
      req.file.size,
      options
    );

    res.json({
      success: true,
      preview,
      enhancementInfo: {
        jsonStorageEnabled: options.storeUnmappedAsJson,
        backwardCompatibility: options.maintainCustomAttributes,
        strategy: preview.mappingStrategy
      }
    });

  } catch (error) {
    secureLogger.error('JSON import preview failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to create JSON import preview',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Process JSON import with enhanced storage
 * POST /json-import/:importId/process
 */
router.post('/:importId/process', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;
    const { columnMappings, options } = req.body;

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return res.status(400).json({
        success: false,
        error: 'Column mappings are required for processing',
      });
    }

    const importOptions = {
      storeUnmappedAsJson: true,
      preserveOriginalData: true,
      maintainCustomAttributes: false,
      jsonStorageStrategy: 'replace',
      ...options
    };

    const result = await enhancedJsonImportService.processJsonImport(
      importId,
      columnMappings,
      importOptions
    );

    res.json({
      success: true,
      result,
      storageInfo: {
        jsonFieldsStored: result.unmappedFieldsStored,
        traditionalAttributesCreated: result.attributesCreated,
        totalCustomersProcessed: result.customersCreated
      }
    });

  } catch (error) {
    secureLogger.error('JSON import processing failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'JSON import processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Query unmapped fields for a specific customer
 * GET /json-import/customer/:customerId/unmapped-fields
 */
router.get('/customer/:customerId/unmapped-fields', requireAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { fieldName } = req.query;

    const unmappedFields = await enhancedJsonImportService.queryUnmappedFields(
      customerId,
      fieldName as string
    );

    if (!unmappedFields) {
      return res.status(404).json({
        success: false,
        error: 'No unmapped fields found for this customer'
      });
    }

    res.json({
      success: true,
      customerId,
      unmappedFields,
      fieldCount: typeof unmappedFields === 'object' ? Object.keys(unmappedFields).length : 1
    });

  } catch (error) {
    secureLogger.error('Failed to query unmapped fields:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve unmapped fields'
    });
  }
});

/**
 * Search customers by unmapped field values
 * POST /json-import/search-unmapped
 */
router.post('/search-unmapped', requireAuth, async (req, res) => {
  try {
    const { fieldName, value, operator = '=' } = req.body;

    if (!fieldName || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Field name and value are required'
      });
    }

    const customers = await enhancedJsonImportService.searchUnmappedFields(
      fieldName,
      value,
      operator
    );

    res.json({
      success: true,
      searchCriteria: { fieldName, value, operator },
      customers,
      resultCount: customers.length
    });

  } catch (error) {
    secureLogger.error('Unmapped field search failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get import mapping statistics
 * GET /json-import/:importId/stats
 */
router.get('/:importId/stats', requireAuth, async (req, res) => {
  try {
    const { importId } = req.params;

    const stats = await enhancedJsonImportService.getImportMappingStats(importId);

    res.json({
      success: true,
      importId,
      mappingStatistics: stats,
      analysis: {
        jsonStorageEfficiency: stats.customersWithUnmappedFields / stats.totalCustomers,
        dataPreservationRate: stats.customersWithOriginalData / stats.totalCustomers,
        averageJsonFieldsPerCustomer: stats.averageUnmappedFieldsPerCustomer
      }
    });

  } catch (error) {
    secureLogger.error('Failed to get import stats:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve import statistics'
    });
  }
});

/**
 * Get JSON schema information for unmapped fields
 * GET /json-import/schema-info
 */
router.get('/schema-info', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      schemaInfo: {
        jsonFields: {
          unmappedFields: {
            description: 'Stores unmapped fields with metadata',
            structure: {
              '[fieldName]': {
                value: 'actual field value',
                dataType: 'detected data type',
                confidence: 'AI mapping confidence score',
                source: 'mapping source (ai_mapping, preserved_mapping)'
              }
            }
          },
          originalSourceData: {
            description: 'Complete original row data from source file',
            structure: 'Key-value pairs matching original file structure'
          },
          fieldMappingMetadata: {
            description: 'Metadata about the mapping process',
            structure: {
              mappings: 'Array of column mapping details',
              importTimestamp: 'ISO timestamp of import processing',
              processingOptions: 'Import options used during processing'
            }
          }
        },
        indexes: [
          'customers_unmapped_fields_gin_idx (GIN index for JSON queries)',
          'customers_original_source_data_gin_idx (GIN index for JSON queries)'
        ],
        queryExamples: {
          findByUnmappedField: "SELECT * FROM customers WHERE unmapped_fields->>'fieldName' = 'value'",
          searchInOriginalData: "SELECT * FROM customers WHERE original_source_data ? 'fieldName'",
          jsonAggregation: "SELECT jsonb_object_keys(unmapped_fields) as field_names FROM customers"
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve schema information'
    });
  }
});

export default router;
