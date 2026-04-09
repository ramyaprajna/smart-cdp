/**
 * Flexible CDP End-to-End Workflow Tests
 * 
 * Tests the complete workflow from file upload to custom attribute creation:
 * 1. Upload file
 * 2. Get AI-powered preview with suggested mappings
 * 3. Modify mappings to create custom attributes
 * 4. Process import
 * 5. Verify data storage
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupApp } from '@server/app';
import * as db from '@server/db';
import { nanoid } from 'nanoid';

// Mock database and external services
interface MockDbChain {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
}

vi.mock('@server/db', () => {
  function createChain(): MockDbChain {
    const chain: MockDbChain = {} as MockDbChain;
    const self = () => chain;
    chain.from = vi.fn(self);
    chain.where = vi.fn(self);
    chain.groupBy = vi.fn(self);
    chain.orderBy = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.offset = vi.fn(self);
    chain.leftJoin = vi.fn(self);
    chain.innerJoin = vi.fn(self);
    chain.prepare = vi.fn(() => ({ execute: vi.fn().mockResolvedValue([]) }));
    chain.execute = vi.fn().mockResolvedValue([]);
    chain.values = vi.fn(self);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.set = vi.fn(self);
    chain.onConflictDoUpdate = vi.fn(self);
    chain.onConflictDoNothing = vi.fn(self);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => createChain()),
      insert: vi.fn(() => createChain()),
      update: vi.fn(() => createChain()),
      delete: vi.fn(() => createChain()),
      query: {},
      execute: vi.fn(),
    },
    pool: { end: vi.fn() },
  };
});
vi.mock('nanoid');
vi.mock('openai');

// Mock authentication
vi.mock('@server/jwt-utils', () => ({
  requireAuth: vi.fn((req: Express.Request, res: Express.Response, next: () => void) => {
    (req as Record<string, unknown>).user = { id: 'test-user', role: 'admin' };
    next();
  }),
  requireRole: vi.fn(() => (_req: Express.Request, _res: Express.Response, next: () => void) => next()),
  generateToken: vi.fn(() => 'test-token'),
  verifyToken: vi.fn(() => ({ userId: 'test-user' })),
}));

describe('Flexible CDP E2E Workflow', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await setupApp();
    vi.mocked(nanoid).mockReturnValue('test-import-id');
  });

  describe('Complete Import Workflow with Custom Attributes', () => {
    it('should handle music industry data import end-to-end', async () => {
      // Step 1: Upload file and get preview
      const fileContent = `NAMA_LENGKAP,EMAIL,GENRE_FAVORIT,JAM_MENDENGARKAN,ARTIS_KESUKAAN
Ahmad Rizki,ahmad@music.com,"Rock, Jazz",4.5,"John Mayer, Adele"
Siti Nurhaliza,siti@music.com,Pop,6.0,"Taylor Swift"
Budi Santoso,budi@music.com,"Classical, Jazz",3.0,"Mozart, Miles Davis"`;

      const previewResponse = await request(app)
        .post('/api/flexible-cdp/import/preview')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from(fileContent), {
          filename: 'music_listeners.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      expect(previewResponse.body.success).toBe(true);
      expect(previewResponse.body.preview.importId).toBe('test-import-id');
      expect(previewResponse.body.preview.headers).toEqual([
        'NAMA_LENGKAP',
        'EMAIL',
        'GENRE_FAVORIT',
        'JAM_MENDENGARKAN',
        'ARTIS_KESUKAAN',
      ]);

      // Verify AI suggested mappings
      const mappings = previewResponse.body.preview.suggestedMappings;
      expect(mappings).toContainEqual(
        expect.objectContaining({
          columnName: 'NAMA_LENGKAP',
          mappingType: 'core',
          targetField: 'firstName',
        })
      );
      expect(mappings).toContainEqual(
        expect.objectContaining({
          columnName: 'GENRE_FAVORIT',
          mappingType: 'custom',
          customAttribute: expect.objectContaining({
            attributeName: 'genre_favorit',
            dataType: 'array',
            category: 'preferences',
          }),
        })
      );

      // Step 2: User modifies mappings to add custom description
      const modifiedMappings = [
        ...mappings,
        {
          columnName: 'CUSTOMER_SEGMENT',
          originalName: 'CUSTOMER_SEGMENT',
          mappingType: 'custom',
          customAttribute: {
            attributeName: 'customer_segment',
            dataType: 'text',
            category: 'demographics',
            description: 'Custom segmentation based on listening habits',
          },
        },
      ];

      const updateResponse = await request(app)
        .put(`/api/flexible-cdp/import/${previewResponse.body.preview.importId}/mappings`)
        .set('Authorization', 'Bearer test-token')
        .send({ columnMappings: modifiedMappings })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Step 3: Process the import
      const processResponse = await request(app)
        .post(`/api/flexible-cdp/import/${previewResponse.body.preview.importId}/process`)
        .set('Authorization', 'Bearer test-token')
        .send({
          columnMappings: mappings,
          sourceSystem: 'music_industry_import',
        })
        .expect(200);

      expect(processResponse.body.success).toBe(true);
      expect(processResponse.body.result.customersCreated).toBe(3);
      expect(processResponse.body.result.customAttributesCreated).toBeGreaterThan(0);
      expect(processResponse.body.result.errors).toHaveLength(0);

      // Step 4: Verify custom attributes were created
      const attributesResponse = await request(app)
        .get('/api/flexible-cdp/attributes')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(attributesResponse.body.success).toBe(true);
      expect(attributesResponse.body.attributes).toContainEqual(
        expect.objectContaining({
          attributeName: 'genre_favorit',
          dataType: 'array',
          category: 'preferences',
        })
      );
      expect(attributesResponse.body.attributes).toContainEqual(
        expect.objectContaining({
          attributeName: 'jam_mendengarkan',
          dataType: 'number',
          category: 'behaviors',
        })
      );
    });

    it('should handle retail data with dynamic attribute creation', async () => {
      const fileContent = `CUSTOMER_NAME,EMAIL,LOYALTY_POINTS,FAVORITE_BRANDS,LAST_PURCHASE_DATE,VIP_STATUS
John Smith,john@retail.com,2500,"Apple, Nike, Sony",2025-01-15,Gold
Jane Doe,jane@retail.com,1200,"Adidas, Samsung",2025-01-10,Silver
Bob Johnson,bob@retail.com,5000,"Apple, Tesla, Rolex",2025-01-20,Platinum`;

      // Upload and get preview
      const previewResponse = await request(app)
        .post('/api/flexible-cdp/import/preview')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from(fileContent), {
          filename: 'retail_customers.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const importId = previewResponse.body.preview.importId;

      // Process with custom mappings
      const customMappings = [
        {
          columnName: 'CUSTOMER_NAME',
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
        {
          columnName: 'FAVORITE_BRANDS',
          mappingType: 'custom',
          customAttribute: {
            attributeName: 'favorite_brands',
            dataType: 'array',
            category: 'preferences',
          },
        },
        {
          columnName: 'VIP_STATUS',
          mappingType: 'custom',
          customAttribute: {
            attributeName: 'vip_status',
            dataType: 'text',
            category: 'demographics',
          },
        },
      ];

      const processResponse = await request(app)
        .post(`/api/flexible-cdp/import/${importId}/process`)
        .set('Authorization', 'Bearer test-token')
        .send({
          columnMappings: customMappings,
          sourceSystem: 'retail_crm',
        })
        .expect(200);

      expect(processResponse.body.result.customersCreated).toBe(3);
      expect(processResponse.body.result.customAttributesCreated).toBe(9); // 3 customers × 3 attributes
    });

    it('should handle mixed data types and edge cases', async () => {
      const fileContent = `NAME,EMAIL,SCORE,IS_ACTIVE,TAGS,METADATA,NULL_FIELD
Test User,test@example.com,85.5,true,"tag1,tag2,tag3","{""key"": ""value""}",
Empty Name,,0,false,[],{},
"Special, Name",special@test.com,100.0,1,"single tag",,NULL`;

      const previewResponse = await request(app)
        .post('/api/flexible-cdp/import/preview')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from(fileContent), {
          filename: 'edge_cases.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      // Process with type-specific mappings
      const processResponse = await request(app)
        .post(`/api/flexible-cdp/import/${previewResponse.body.preview.importId}/process`)
        .set('Authorization', 'Bearer test-token')
        .send({
          columnMappings: [
            { columnName: 'NAME', mappingType: 'core', targetField: 'firstName' },
            { columnName: 'EMAIL', mappingType: 'core', targetField: 'email' },
            {
              columnName: 'SCORE',
              mappingType: 'custom',
              customAttribute: {
                attributeName: 'score',
                dataType: 'number',
                category: 'demographics',
              },
            },
            {
              columnName: 'IS_ACTIVE',
              mappingType: 'custom',
              customAttribute: {
                attributeName: 'is_active',
                dataType: 'boolean',
                category: 'technical',
              },
            },
            {
              columnName: 'TAGS',
              mappingType: 'custom',
              customAttribute: {
                attributeName: 'tags',
                dataType: 'array',
                category: 'preferences',
              },
            },
            {
              columnName: 'METADATA',
              mappingType: 'custom',
              customAttribute: {
                attributeName: 'metadata',
                dataType: 'object',
                category: 'technical',
              },
            },
            {
              columnName: 'NULL_FIELD',
              mappingType: 'skip',
            },
          ],
        })
        .expect(200);

      expect(processResponse.body.success).toBe(true);
      // Should handle null values and edge cases without failing
      expect(processResponse.body.result.errors.length).toBeLessThan(3);
    });
  });

  describe('Error Handling and Validation', () => {
    it('should reject import without file', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/import/preview')
        .set('Authorization', 'Bearer test-token')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No file uploaded');
    });

    it('should reject processing with invalid mappings', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/import/invalid-id/process')
        .set('Authorization', 'Bearer test-token')
        .send({
          columnMappings: [], // Empty mappings
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle duplicate attribute names gracefully', async () => {
      // First, create an attribute
      await request(app)
        .post('/api/flexible-cdp/attributes')
        .set('Authorization', 'Bearer test-token')
        .send({
          customerId: 'customer-123',
          attributeName: 'duplicate_test',
          attributeValue: 'first',
          dataType: 'text',
        })
        .expect(200);

      // Try to create the same attribute again
      const response = await request(app)
        .post('/api/flexible-cdp/attributes')
        .set('Authorization', 'Bearer test-token')
        .send({
          customerId: 'customer-123',
          attributeName: 'duplicate_test',
          attributeValue: 'second',
          dataType: 'text',
        })
        .expect(200); // Should succeed but handle internally

      expect(response.body.success).toBe(true);
    });
  });

  describe('Industry Detection and Schema Suggestion', () => {
    it('should detect music industry from headers', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .set('Authorization', 'Bearer test-token')
        .send({
          headers: ['NAMA_LENGKAP', 'GENRE_FAVORIT', 'ARTIS_KESUKAAN', 'JAM_MENDENGARKAN'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.schema.sourceName).toBe('music_industry');
      expect(response.body.suggestion.confidence).toBeGreaterThan(70);
    });

    it('should detect retail CRM from headers', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .set('Authorization', 'Bearer test-token')
        .send({
          headers: ['CUSTOMER_NAME', 'LOYALTY_POINTS', 'FAVORITE_BRANDS', 'PURCHASE_HISTORY'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.schema.sourceName).toBe('retail_crm');
    });

    it('should return null for unmatched headers', async () => {
      const response = await request(app)
        .post('/api/flexible-cdp/suggest-schema')
        .set('Authorization', 'Bearer test-token')
        .send({
          headers: ['RANDOM_FIELD_1', 'UNKNOWN_DATA', 'MYSTERY_COLUMN'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestion).toBeNull();
      expect(response.body.message).toContain('No specific schema match');
    });
  });

  describe('Attribute Suggestion Intelligence', () => {
    it('should suggest appropriate data types from sample values', async () => {
      const testCases = [
        {
          columnName: 'PURCHASE_AMOUNT',
          sampleValues: ['125.50', '200.00', '89.99'],
          expectedType: 'number',
        },
        {
          columnName: 'REGISTRATION_DATE',
          sampleValues: ['2025-01-01', '2025-01-15', '2025-02-01'],
          expectedType: 'date',
        },
        {
          columnName: 'IS_PREMIUM',
          sampleValues: ['true', 'false', 'true'],
          expectedType: 'boolean',
        },
        {
          columnName: 'PRODUCT_CATEGORIES',
          sampleValues: ['["Electronics", "Home"]', '["Fashion"]', '["Sports", "Outdoor"]'],
          expectedType: 'array',
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/flexible-cdp/suggest-attribute')
          .set('Authorization', 'Bearer test-token')
          .send({
            columnName: testCase.columnName,
            sampleValues: testCase.sampleValues,
          })
          .expect(200);

        expect(response.body.suggestion.suggestedType).toBe(testCase.expectedType);
      }
    });

    it('should suggest appropriate categories based on column names', async () => {
      const testCases = [
        {
          columnName: 'FAVORITE_PRODUCTS',
          expectedCategory: 'preferences',
        },
        {
          columnName: 'PURCHASE_FREQUENCY',
          expectedCategory: 'behaviors',
        },
        {
          columnName: 'USER_ENGAGEMENT_SCORE',
          expectedCategory: 'engagement',
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/flexible-cdp/suggest-attribute')
          .set('Authorization', 'Bearer test-token')
          .send({
            columnName: testCase.columnName,
            sampleValues: ['test'],
          })
          .expect(200);

        expect(response.body.suggestion.suggestedCategory).toBe(testCase.expectedCategory);
      }
    });
  });
});