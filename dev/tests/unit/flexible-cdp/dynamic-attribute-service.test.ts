/**
 * Dynamic Attribute Service Unit Tests
 * 
 * Tests the on-the-fly custom attribute creation functionality including:
 * - Creating custom attributes
 * - Batch operations
 * - Attribute validation
 * - Data type inference
 * - Attribute suggestions
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dynamicAttributeService } from '@server/services/dynamic-attribute-service';
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

describe('Dynamic Attribute Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustomAttribute', () => {
    it('should create a custom attribute with proper sanitization', async () => {
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      await dynamicAttributeService.createCustomAttribute(
        'customer-123',
        'Customer Loyalty Tier!',
        'Gold',
        {
          attributeName: 'Customer Loyalty Tier!',
          dataType: 'text',
          category: 'demographics',
        }
      );

      expect(db.db.insert).toHaveBeenCalled();
      expect(db.db.values).toHaveBeenCalledWith({
        customerId: 'customer-123',
        attributeName: 'customer_loyalty_tier', // Sanitized
        attributeValue: 'Gold',
        dataType: 'text',
        attributeCategory: 'demographics',
        sourceSystem: 'manual_import',
        isActive: true,
      });
    });

    it('should infer data type when not provided', async () => {
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      // Test number inference
      await dynamicAttributeService.createCustomAttribute(
        'customer-123',
        'score',
        85.5,
        { attributeName: 'score', dataType: undefined as any }
      );

      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'number',
          attributeValue: 85.5,
        })
      );

      // Test boolean inference
      await dynamicAttributeService.createCustomAttribute(
        'customer-123',
        'is_active',
        true,
        { attributeName: 'is_active', dataType: undefined as any }
      );

      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'boolean',
          attributeValue: true,
        })
      );

      // Test array inference
      await dynamicAttributeService.createCustomAttribute(
        'customer-123',
        'tags',
        ['music', 'rock'],
        { attributeName: 'tags', dataType: undefined as any }
      );

      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'array',
          attributeValue: ['music', 'rock'],
        })
      );
    });

    it('should handle database errors', async () => {
      vi.mocked(db.db.values).mockRejectedValueOnce(new Error('Database error'));

      await expect(
        dynamicAttributeService.createCustomAttribute(
          'customer-123',
          'test_attr',
          'value',
          { attributeName: 'test_attr', dataType: 'text' }
        )
      ).rejects.toThrow('Database error');
    });
  });

  describe('batchCreateCustomAttributes', () => {
    it('should create multiple attributes in batch', async () => {
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      const batchData = [
        {
          customerId: 'customer-1',
          attributeName: 'Loyalty Points',
          attributeValue: 2500,
          options: { dataType: 'number' as const, category: 'demographics' as const },
        },
        {
          customerId: 'customer-1',
          attributeName: 'Favorite Brands',
          attributeValue: ['Apple', 'Nike'],
          options: { dataType: 'array' as const, category: 'preferences' as const },
        },
      ];

      await dynamicAttributeService.batchCreateCustomAttributes(batchData);

      expect(db.db.insert).toHaveBeenCalled();
      expect(db.db.values).toHaveBeenCalledWith([
        expect.objectContaining({
          customerId: 'customer-1',
          attributeName: 'loyalty_points',
          attributeValue: 2500,
          dataType: 'number',
        }),
        expect.objectContaining({
          customerId: 'customer-1',
          attributeName: 'favorite_brands',
          attributeValue: ['Apple', 'Nike'],
          dataType: 'array',
        }),
      ]);
    });

    it('should handle empty batch', async () => {
      await dynamicAttributeService.batchCreateCustomAttributes([]);
      expect(db.db.insert).not.toHaveBeenCalled();
    });
  });

  describe('getCustomerAttributes', () => {
    it('should retrieve all active attributes for a customer', async () => {
      const mockAttributes = [
        {
          attributeName: 'loyalty_tier',
          attributeValue: 'Gold',
          dataType: 'text',
          attributeCategory: 'demographics',
          sourceSystem: 'manual_import',
        },
        {
          attributeName: 'purchase_frequency',
          attributeValue: 'weekly',
          dataType: 'text',
          attributeCategory: 'behaviors',
          sourceSystem: 'manual_import',
        },
      ];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockAttributes);

      const result = await dynamicAttributeService.getCustomerAttributes('customer-123');

      expect(result).toHaveLength(2);
      expect(result[0].attributeName).toBe('loyalty_tier');
      expect(result[1].attributeName).toBe('purchase_frequency');
    });

    it('should filter by category when provided', async () => {
      const mockAttributes = [
        {
          attributeName: 'genre_preferences',
          attributeValue: ['Rock', 'Jazz'],
          dataType: 'array',
          attributeCategory: 'preferences',
          sourceSystem: 'manual_import',
        },
      ];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockAttributes);

      const result = await dynamicAttributeService.getCustomerAttributes(
        'customer-123',
        'preferences'
      );

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('preferences');
    });

    it('should deserialize complex data types', async () => {
      const mockAttributes = [
        {
          attributeName: 'contact_info',
          attributeValue: { phone: '+62812345678', email: 'test@example.com' },
          dataType: 'object',
          attributeCategory: 'demographics',
          sourceSystem: 'manual_import',
        },
      ];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockAttributes);

      const result = await dynamicAttributeService.getCustomerAttributes('customer-123');

      expect(result[0].attributeValue).toEqual({
        phone: '+62812345678',
        email: 'test@example.com',
      });
    });
  });

  describe('suggestAttributeMapping', () => {
    it('should suggest preference category for preference-related columns', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      const result = await dynamicAttributeService.suggestAttributeMapping(
        'FAVORITE_PRODUCTS',
        ['iPhone', 'MacBook', 'AirPods'],
        'retail'
      );

      expect(result.suggestedName).toBe('favorite_products');
      expect(result.suggestedType).toBe('array');
      expect(result.suggestedCategory).toBe('preferences');
      expect(result.confidence).toBeGreaterThan(60);
      expect(result.reasoning).toContain('preference-related');
    });

    it('should suggest behavior category for behavior-related columns', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      const result = await dynamicAttributeService.suggestAttributeMapping(
        'PURCHASE_FREQUENCY',
        ['weekly', 'monthly', 'daily'],
        'retail'
      );

      expect(result.suggestedCategory).toBe('behaviors');
      expect(result.reasoning).toContain('behavior-related');
    });

    it('should boost confidence when similar attribute exists', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([
        { attributeName: 'loyalty_points' },
      ]);

      const result = await dynamicAttributeService.suggestAttributeMapping(
        'LOYALTY_POINTS',
        [1000, 2500, 500],
        'retail'
      );

      expect(result.confidence).toBeGreaterThan(80);
      expect(result.reasoning).toContain('Similar attribute "loyalty_points" found');
    });

    it('should infer data type from sample values', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      // Test date inference
      let result = await dynamicAttributeService.suggestAttributeMapping(
        'REGISTRATION_DATE',
        ['2025-01-01', '2025-01-02', '2025-01-03']
      );
      expect(result.suggestedType).toBe('date');

      // Test number inference
      result = await dynamicAttributeService.suggestAttributeMapping(
        'SCORE',
        ['85', '92.5', '78']
      );
      expect(result.suggestedType).toBe('number');

      // Test mixed types (should default to text)
      result = await dynamicAttributeService.suggestAttributeMapping(
        'MIXED_DATA',
        ['123', 'ABC', true, null]
      );
      expect(result.suggestedType).toBe('text');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(db.db.limit).mockRejectedValueOnce(new Error('Database error'));

      const result = await dynamicAttributeService.suggestAttributeMapping(
        'ERROR_COLUMN',
        []
      );

      expect(result.suggestedName).toBe('error_column');
      expect(result.confidence).toBe(30);
      expect(result.reasoning).toContain('Fallback suggestion');
    });
  });

  describe('getAllCustomAttributes', () => {
    it('should aggregate and count attribute usage', async () => {
      const mockAttributes = [
        {
          attributeName: 'loyalty_points',
          dataType: 'number',
          attributeCategory: 'demographics',
          sourceSystem: 'retail_import',
        },
        {
          attributeName: 'loyalty_points',
          dataType: 'number',
          attributeCategory: 'demographics',
          sourceSystem: 'retail_import',
        },
        {
          attributeName: 'genre_preferences',
          dataType: 'array',
          attributeCategory: 'preferences',
          sourceSystem: 'music_import',
        },
      ];

      vi.mocked(db.db.where).mockResolvedValueOnce(mockAttributes);

      const result = await dynamicAttributeService.getAllCustomAttributes();

      expect(result).toHaveLength(2);
      
      const loyaltyAttr = result.find(a => a.attributeName === 'loyalty_points');
      expect(loyaltyAttr?.usageCount).toBe(2);
      
      const genreAttr = result.find(a => a.attributeName === 'genre_preferences');
      expect(genreAttr?.usageCount).toBe(1);
    });
  });

  describe('attributeExists', () => {
    it('should check if attribute exists', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([{ attributeName: 'test_attr' }]);

      const exists = await dynamicAttributeService.attributeExists('Test Attr!');
      expect(exists).toBe(true);
    });

    it('should check with source system filter', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      const exists = await dynamicAttributeService.attributeExists(
        'test_attr',
        'specific_system'
      );
      expect(exists).toBe(false);
    });
  });
});