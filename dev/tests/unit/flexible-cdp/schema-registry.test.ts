/**
 * Schema Registry Service Unit Tests
 * 
 * Tests the flexible CDP schema registry functionality including:
 * - Schema retrieval and initialization
 * - Industry detection from headers
 * - Field mapping templates
 * - Schema validation
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { schemaRegistryService } from '@server/services/schema-registry-service';
import * as db from '@server/db';

// Mock database
vi.mock('@server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  }
}));

describe('Schema Registry Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableSchemas', () => {
    it('should return all active schemas', async () => {
      const mockSchemas = [
        {
          sourceName: 'music_industry',
          displayName: 'Music Industry',
          description: 'Music industry schema',
          schemaVersion: '1.0',
          fieldDefinitions: {
            genre_preferences: { name: 'genre_preferences', type: 'array' },
            favorite_artists: { name: 'favorite_artists', type: 'array' },
          },
          mappingTemplates: {
            GENRE_FAVORIT: 'genre_preferences',
            ARTIS_KESUKAAN: 'favorite_artists',
          },
          isActive: true,
        },
        {
          sourceName: 'retail_crm',
          displayName: 'Retail CRM',
          description: 'Retail business schema',
          schemaVersion: '1.0',
          fieldDefinitions: {
            loyalty_points: { name: 'loyalty_points', type: 'number' },
          },
          isActive: true,
        },
      ];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockSchemas);

      const result = await schemaRegistryService.getAvailableSchemas();

      expect(result).toHaveLength(2);
      expect(result[0].sourceName).toBe('music_industry');
      expect(result[1].sourceName).toBe('retail_crm');
    });

    it('should handle empty schema list', async () => {
      vi.mocked(db.db.where).mockResolvedValueOnce([]);

      const result = await schemaRegistryService.getAvailableSchemas();

      expect(result).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.db.where).mockRejectedValueOnce(new Error('Database error'));

      const result = await schemaRegistryService.getAvailableSchemas();

      expect(result).toHaveLength(0);
    });
  });

  describe('suggestSchema', () => {
    it('should detect music industry headers with high confidence', async () => {
      const mockSchemas = [{
        sourceName: 'music_industry',
        displayName: 'Music Industry',
        fieldDefinitions: {
          genre_preferences: { name: 'genre_preferences', type: 'array' },
          favorite_artists: { name: 'favorite_artists', type: 'array' },
          listening_hours_daily: { name: 'listening_hours_daily', type: 'number' },
        },
        mappingTemplates: {
          GENRE_FAVORIT: 'genre_preferences',
          ARTIS_KESUKAAN: 'favorite_artists',
          JAM_MENDENGARKAN: 'listening_hours_daily',
        },
        isActive: true,
      }];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockSchemas);

      const headers = ['NAMA_LENGKAP', 'GENRE_FAVORIT', 'ARTIS_KESUKAAN', 'JAM_MENDENGARKAN'];
      const result = await schemaRegistryService.suggestSchema(headers);

      expect(result).toBeTruthy();
      expect(result?.schema.sourceName).toBe('music_industry');
      expect(result?.confidence).toBeGreaterThan(60);
      expect(result?.matchedFields).toContain('genre_preferences');
      expect(result?.matchedFields).toContain('favorite_artists');
    });

    it('should detect retail CRM headers', async () => {
      const mockSchemas = [{
        sourceName: 'retail_crm',
        displayName: 'Retail CRM',
        fieldDefinitions: {
          loyalty_points: { name: 'loyalty_points', type: 'number' },
          preferred_brands: { name: 'preferred_brands', type: 'array' },
        },
        mappingTemplates: {
          LOYALTY_POINTS: 'loyalty_points',
          FAVORITE_BRANDS: 'preferred_brands',
        },
        isActive: true,
      }];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockSchemas);

      const headers = ['CUSTOMER_NAME', 'LOYALTY_POINTS', 'FAVORITE_BRANDS'];
      const result = await schemaRegistryService.suggestSchema(headers);

      expect(result?.schema.sourceName).toBe('retail_crm');
      expect(result?.matchedFields).toContain('loyalty_points');
    });

    it('should return null for unmatched headers', async () => {
      const mockSchemas = [{
        sourceName: 'music_industry',
        displayName: 'Music Industry',
        fieldDefinitions: {},
        mappingTemplates: {
          GENRE_FAVORIT: 'genre_preferences',
        },
        isActive: true,
      }];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockSchemas);

      const headers = ['RANDOM_FIELD_1', 'UNKNOWN_COLUMN', 'MYSTERY_DATA'];
      const result = await schemaRegistryService.suggestSchema(headers);

      expect(result).toBeNull();
    });

    it('should handle empty headers array', async () => {
      const result = await schemaRegistryService.suggestSchema([]);
      expect(result).toBeNull();
    });

    it('should handle case variations in headers', async () => {
      const mockSchemas = [{
        sourceName: 'music_industry',
        displayName: 'Music Industry',
        fieldDefinitions: {
          genre_preferences: { name: 'genre_preferences', type: 'array' },
        },
        mappingTemplates: {
          GENRE_FAVORIT: 'genre_preferences',
          genre_favorit: 'genre_preferences',
          Genre_Favorit: 'genre_preferences',
        },
        isActive: true,
      }];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockSchemas);

      const headers = ['genre_favorit', 'Genre_Favorit', 'GENRE_FAVORIT'];
      const result = await schemaRegistryService.suggestSchema(headers);

      expect(result?.matchedFields).toHaveLength(1);
      expect(result?.matchedFields).toContain('genre_preferences');
    });
  });

  describe('getSchema', () => {
    it('should retrieve a specific schema by source name', async () => {
      const mockSchema = {
        sourceName: 'healthcare',
        displayName: 'Healthcare',
        description: 'Healthcare provider schema',
        fieldDefinitions: {
          appointment_frequency: { name: 'appointment_frequency', type: 'text' },
        },
        isActive: true,
      };

      vi.mocked(db.db.limit).mockResolvedValueOnce([mockSchema]);

      const result = await schemaRegistryService.getSchema('healthcare');

      expect(result).toBeTruthy();
      expect(result?.sourceName).toBe('healthcare');
      expect(result?.fieldDefinitions).toHaveProperty('appointment_frequency');
    });

    it('should return null for non-existent schema', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      const result = await schemaRegistryService.getSchema('non_existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      vi.mocked(db.db.limit).mockRejectedValueOnce(new Error('Connection failed'));

      const result = await schemaRegistryService.getSchema('any_schema');

      expect(result).toBeNull();
    });
  });

  describe('initializeSchemas', () => {
    it('should skip initialization if schemas already exist', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([{ sourceName: 'existing' }]);

      await schemaRegistryService.initializeSchemas();

      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('should initialize default schemas when none exist', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      await schemaRegistryService.initializeSchemas();

      expect(db.db.insert).toHaveBeenCalled();
      expect(db.db.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sourceName: 'music_industry' }),
          expect.objectContaining({ sourceName: 'retail_crm' }),
          expect.objectContaining({ sourceName: 'healthcare' }),
        ])
      );
    });
  });
});