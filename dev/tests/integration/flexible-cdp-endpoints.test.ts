/**
 * Flexible CDP API Endpoints Integration Tests
 * 
 * Tests all flexible CDP endpoints including:
 * - Schema management
 * - Attribute suggestions
 * - Enhanced import workflow
 * - Industry insights
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import flexibleCdpRoutes from '@server/routes/flexible-cdp-routes';
import { requireAuth } from '@server/jwt-utils';
import { schemaRegistryService } from '@server/services/schema-registry-service';
import { dynamicAttributeService } from '@server/services/dynamic-attribute-service';
import { enhancedImportService } from '@server/services/enhanced-import-service';
import { flexibleAIMapper } from '@server/services/flexible-ai-mapper';

// Mock dependencies
vi.mock('@server/jwt-utils', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  }),
}));

vi.mock('@server/services/schema-registry-service');
vi.mock('@server/services/dynamic-attribute-service');
vi.mock('@server/services/enhanced-import-service');
vi.mock('@server/services/flexible-ai-mapper');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/flexible-cdp', flexibleCdpRoutes);
  return app;
};

describe.skip('Flexible CDP API Endpoints', { timeout: 30000 }, () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/flexible-cdp/schemas', () => {
    it('should return available schemas', async () => {
      const mockSchemas = [
        {
          sourceName: 'music_industry',
          displayName: 'Music Industry',
          description: 'Music industry schema',
          schemaVersion: '1.0',
          fieldDefinitions: { genre_preferences: {} },
          mappingTemplates: { GENRE_FAVORIT: 'genre_preferences' },
        },
        {
          sourceName: 'retail_crm',
          displayName: 'Retail CRM',
          description: 'Retail schema',
          schemaVersion: '1.0',
          fieldDefinitions: { loyalty_points: {} },
          mappingTemplates: {},
        },
      ];

      vi.mocked(schemaRegistryService.getAvailableSchemas).mockResolvedValueOnce(mockSchemas);

      const response = await request(app)
        .get('/api/flexible-cdp/schemas')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.schemas).toHaveLength(2);
      expect(response.body.schemas[0].sourceName).toBe('music_industry');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(schemaRegistryService.getAvailableSchemas).mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .get('/api/flexible-cdp/schemas')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch schemas');
    });
  });

  describe('POST /api/flexible-cdp/suggest-schema', () => {
    it('should suggest schema based on headers', async () => {
      const mockSuggestion = {
        schema: {
          sourceName: 'music_industry',
          displayName: 'Music Industry',
        },
        confidence: 85,
        matchedFields: ['genre_preferences', 'favorite_artists'],
      };

      vi.mocked(schemaRegistryService.suggestSchema).mockResolvedValueOnce(mockSuggestion);

      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .send({
          headers: ['GENRE_FAVORIT', 'ARTIS_KESUKAAN', 'EMAIL'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.schema.sourceName).toBe('music_industry');
      expect(response.body.suggestion.confidence).toBe(85);
    });

    it('should handle no schema match', async () => {
      vi.mocked(schemaRegistryService.suggestSchema).mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .send({
          headers: ['RANDOM_FIELD_1', 'UNKNOWN_COLUMN'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion).toBeNull();
      expect(response.body.message).toContain('No specific schema match');
    });

    it('should require headers parameter', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Headers array is required');
    });
  });

  describe('POST /api/flexible-cdp/suggest-attribute', () => {
    it('should suggest attribute mapping', async () => {
      const mockSuggestion = {
        suggestedName: 'loyalty_tier',
        suggestedType: 'text',
        suggestedCategory: 'demographics',
        confidence: 75,
        reasoning: 'Detected loyalty-related terminology',
      };

      vi.mocked(dynamicAttributeService.suggestAttributeMapping).mockResolvedValueOnce(
        mockSuggestion
      );

      const response = await request(app)
        .post('/api/flexible-cdp/suggest-attribute')
        .send({
          columnName: 'LOYALTY_TIER',
          sampleValues: ['Gold', 'Silver', 'Bronze'],
          sourceSystem: 'retail',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.suggestedName).toBe('loyalty_tier');
      expect(response.body.suggestion.suggestedType).toBe('text');
    });

    it('should require column name', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/suggest-attribute')
        .send({
          sampleValues: ['test'],
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Column name is required');
    });
  });

  describe('POST /api/flexible-cdp/attributes', () => {
    it('should create a custom attribute', async () => {
      vi.mocked(dynamicAttributeService.createCustomAttribute).mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/flexible-cdp/attributes')
        .send({
          customerId: 'customer-123',
          attributeName: 'spending_tier',
          attributeValue: 'premium',
          dataType: 'text',
          category: 'demographics',
          sourceSystem: 'manual',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Custom attribute created successfully');
      
      expect(dynamicAttributeService.createCustomAttribute).toHaveBeenCalledWith(
        'customer-123',
        'spending_tier',
        'premium',
        expect.objectContaining({
          dataType: 'text',
          category: 'demographics',
        })
      );
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/attributes')
        .send({
          customerId: 'customer-123',
          // Missing attributeName and attributeValue
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/flexible-cdp/attributes', () => {
    it('should return all custom attributes', async () => {
      const mockAttributes = [
        {
          attributeName: 'genre_preferences',
          dataType: 'array',
          category: 'preferences',
          usageCount: 150,
          sourceSystem: 'music_import',
        },
        {
          attributeName: 'loyalty_points',
          dataType: 'number',
          category: 'demographics',
          usageCount: 200,
          sourceSystem: 'retail_import',
        },
      ];

      vi.mocked(dynamicAttributeService.getAllCustomAttributes).mockResolvedValueOnce(
        mockAttributes
      );

      const response = await request(app)
        .get('/api/flexible-cdp/attributes')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.attributes).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });
  });

  describe('GET /api/flexible-cdp/industry-insights', () => {
    it('should return comprehensive industry insights', async () => {
      const mockSchemas = [
        {
          sourceName: 'music_industry',
          displayName: 'Music Industry',
          description: 'Music schema',
          fieldDefinitions: {
            genre_preferences: {},
            favorite_artists: {},
          },
        },
      ];

      const mockAttributes = [
        {
          attributeName: 'custom_field_1',
          dataType: 'text',
          category: 'demographics',
          usageCount: 50,
          sourceSystem: 'manual',
        },
      ];

      vi.mocked(schemaRegistryService.getAvailableSchemas).mockResolvedValueOnce(mockSchemas);
      vi.mocked(dynamicAttributeService.getAllCustomAttributes).mockResolvedValueOnce(
        mockAttributes
      );

      const response = await request(app)
        .get('/api/flexible-cdp/industry-insights')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.insights.availableIndustries).toBe(1);
      expect(response.body.insights.totalCustomFields).toBe(2);
      expect(response.body.insights.dynamicAttributesCount).toBe(1);
      expect(response.body.insights.totalAttributeUsage).toBe(50);
    });
  });

  describe('Enhanced Import Workflow', () => {
    describe('POST /api/flexible-cdp/import/preview', () => {
      it('should create import preview with suggested mappings', async () => {
        const mockFile = {
          path: '/temp/test.csv',
          originalname: 'test.csv',
          size: 1024,
        };

        const mockPreview = {
          importId: 'import-123',
          fileName: 'test.csv',
          totalRows: 10,
          headers: ['NAME', 'EMAIL', 'LOYALTY_POINTS'],
          sampleRows: [
            { NAME: 'John', EMAIL: 'john@example.com', LOYALTY_POINTS: '1000' },
          ],
          suggestedMappings: [
            {
              columnName: 'NAME',
              mappingType: 'core',
              targetField: 'firstName',
            },
            {
              columnName: 'EMAIL',
              mappingType: 'core',
              targetField: 'email',
            },
            {
              columnName: 'LOYALTY_POINTS',
              mappingType: 'custom',
              customAttribute: {
                attributeName: 'loyalty_points',
                dataType: 'number',
                category: 'demographics',
              },
            },
          ],
        };

        vi.mocked(enhancedImportService.createImportPreview).mockResolvedValueOnce(
          mockPreview
        );

        const response = await request(app)
          .post('/api/flexible-cdp/import/preview')
          .attach('file', Buffer.from('test data'), 'test.csv')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.preview.importId).toBe('import-123');
        expect(response.body.preview.suggestedMappings).toHaveLength(3);
      });

      it('should require file upload', async () => {
        const response = await request(app)
          .post('/api/flexible-cdp/import/preview')
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('No file uploaded');
      });
    });

    describe('PUT /api/flexible-cdp/import/:importId/mappings', () => {
      it('should update column mappings', async () => {
        vi.mocked(enhancedImportService.updateColumnMappings).mockResolvedValueOnce(undefined);

        const mappings = [
          {
            columnName: 'CUSTOM_FIELD',
            mappingType: 'custom',
            customAttribute: {
              attributeName: 'custom_field',
              dataType: 'text',
              category: 'demographics',
            },
          },
        ];

        const response = await request(app)
          .put('/api/flexible-cdp/import/import-123/mappings')
          .send({ columnMappings: mappings })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Column mappings updated');
      });
    });

    describe('POST /api/flexible-cdp/import/:importId/process', () => {
      it('should process import with custom attributes', async () => {
        const mockResult = {
          success: true,
          customersCreated: 10,
          customAttributesCreated: 30,
          errors: [],
        };

        vi.mocked(enhancedImportService.processImport).mockResolvedValueOnce(mockResult);

        const response = await request(app)
          .post('/api/flexible-cdp/import/import-123/process')
          .send({
            columnMappings: [
              { columnName: 'NAME', mappingType: 'core', targetField: 'firstName' },
              { columnName: 'CUSTOM', mappingType: 'custom', customAttribute: {} },
            ],
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.result.customersCreated).toBe(10);
        expect(response.body.result.customAttributesCreated).toBe(30);
      });
    });
  });

  describe('POST /api/flexible-cdp/analyze', () => {
    it('should analyze file with flexible mapping', async () => {
      const mockAnalysis = {
        mappings: [
          {
            columnName: 'GENRE_FAVORIT',
            targetSystem: 'attributes',
            attributeName: 'genre_preferences',
            confidence: 85,
          },
        ],
        overallConfidence: 85,
        suggestedDataSource: 'music_industry',
        flexibilityScore: 75,
        dataQualityWarnings: [],
      };

      vi.mocked(flexibleAIMapper.analyzeFileColumns).mockResolvedValueOnce(mockAnalysis);

      const response = await request(app)
        .post('/api/flexible-cdp/analyze')
        .attach('file', Buffer.from('test data'), 'music_data.csv')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.analysis.suggestedDataSource).toBe('music_industry');
      expect(response.body.analysis.flexibilityScore).toBe(75);
    });
  });
});