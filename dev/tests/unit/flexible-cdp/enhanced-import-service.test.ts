/**
 * Enhanced Import Service Unit Tests
 * 
 * Tests the complete import workflow with on-the-fly custom attribute creation:
 * - Import preview generation
 * - Column mapping management
 * - Import processing with custom attributes
 * - Error handling and edge cases
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enhancedImportService } from '@server/services/enhanced-import-service';
import { filePreviewService } from '@server/file-preview-service';
import { flexibleAIMapper } from '@server/services/flexible-ai-mapper';
import * as db from '@server/db';
import { nanoid } from 'nanoid';

// Mock dependencies
vi.mock('@server/file-preview-service');
vi.mock('@server/services/flexible-ai-mapper');
vi.mock('@server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}));
vi.mock('nanoid');

describe('Enhanced Import Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nanoid).mockReturnValue('test-import-id');
  });

  describe('createImportPreview', () => {
    it('should create preview with AI-suggested mappings', async () => {
      // Mock file preview data
      const mockFileData = {
        headers: ['NAMA_LENGKAP', 'EMAIL', 'GENRE_FAVORIT', 'LOYALTY_POINTS'],
        rows: [
          {
            NAMA_LENGKAP: 'Ahmad',
            EMAIL: 'ahmad@example.com',
            GENRE_FAVORIT: 'Rock, Jazz',
            LOYALTY_POINTS: '2500',
          },
        ],
        metadata: { totalRows: 100 },
      };

      vi.mocked(filePreviewService.generatePreview).mockResolvedValueOnce(mockFileData);

      // Mock AI analysis
      const mockAIAnalysis = {
        mappings: [
          {
            columnName: 'NAMA_LENGKAP',
            originalName: 'NAMA_LENGKAP',
            targetSystem: 'core',
            suggestedField: 'firstName',
            dataType: 'text',
            confidence: 90,
          },
          {
            columnName: 'EMAIL',
            originalName: 'EMAIL',
            targetSystem: 'core',
            suggestedField: 'email',
            dataType: 'email',
            confidence: 95,
          },
          {
            columnName: 'GENRE_FAVORIT',
            originalName: 'GENRE_FAVORIT',
            targetSystem: 'attributes',
            dataType: 'array',
            attributeCategory: 'preferences',
            confidence: 85,
          },
          {
            columnName: 'LOYALTY_POINTS',
            originalName: 'LOYALTY_POINTS',
            targetSystem: 'attributes',
            dataType: 'number',
            attributeCategory: 'demographics',
            confidence: 80,
          },
        ],
        overallConfidence: 87,
        suggestedDataSource: 'mixed',
        flexibilityScore: 50,
      };

      vi.mocked(flexibleAIMapper.analyzeFileColumns).mockResolvedValueOnce(mockAIAnalysis);
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      const result = await enhancedImportService.createImportPreview(
        '/temp/test.csv',
        'test.csv',
        1024
      );

      expect(result.importId).toBe('test-import-id');
      expect(result.fileName).toBe('test.csv');
      expect(result.totalRows).toBe(100);
      expect(result.headers).toEqual(mockFileData.headers);
      expect(result.suggestedMappings).toHaveLength(4);

      // Verify core field mappings
      const nameMapping = result.suggestedMappings.find(m => m.columnName === 'NAMA_LENGKAP');
      expect(nameMapping?.mappingType).toBe('core');
      expect(nameMapping?.targetField).toBe('firstName');

      // Verify custom attribute mappings
      const genreMapping = result.suggestedMappings.find(m => m.columnName === 'GENRE_FAVORIT');
      expect(genreMapping?.mappingType).toBe('custom');
      expect(genreMapping?.customAttribute?.attributeName).toBe('genre_favorit');
      expect(genreMapping?.customAttribute?.dataType).toBe('array');
      expect(genreMapping?.customAttribute?.category).toBe('preferences');

      // Verify data import record created
      expect(db.db.insert).toHaveBeenCalled();
      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-import-id',
          fileName: 'test.csv',
          fileSize: 1024,
          importType: 'csv',
          importStatus: 'preview',
        })
      );
    });

    it('should handle empty file gracefully', async () => {
      vi.mocked(filePreviewService.generatePreview).mockResolvedValueOnce({
        headers: [],
        rows: [],
        metadata: { totalRows: 0 },
      });

      await expect(
        enhancedImportService.createImportPreview('/temp/empty.csv', 'empty.csv', 0)
      ).rejects.toThrow('File contains no headers or is empty');
    });

    it('should detect file type correctly', async () => {
      const mockFileData = {
        headers: ['COL1'],
        rows: [{ COL1: 'data' }],
        metadata: { totalRows: 1 },
      };

      vi.mocked(filePreviewService.generatePreview).mockResolvedValue(mockFileData);
      vi.mocked(flexibleAIMapper.analyzeFileColumns).mockResolvedValue({
        mappings: [],
        overallConfidence: 0,
        suggestedDataSource: 'general',
        flexibilityScore: 0,
      });
      vi.mocked(db.db.values).mockResolvedValue(undefined);

      // Test Excel file
      await enhancedImportService.createImportPreview(
        '/temp/test.xlsx',
        'test.xlsx',
        2048
      );

      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          importType: 'excel',
        })
      );

      // Test CSV file
      await enhancedImportService.createImportPreview(
        '/temp/test.csv',
        'test.csv',
        1024
      );

      expect(db.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          importType: 'csv',
        })
      );
    });

    it('should handle skip mappings for unrecognized columns', async () => {
      const mockFileData = {
        headers: ['UNKNOWN_FIELD'],
        rows: [{ UNKNOWN_FIELD: 'data' }],
        metadata: { totalRows: 1 },
      };

      vi.mocked(filePreviewService.generatePreview).mockResolvedValueOnce(mockFileData);

      const mockAIAnalysis = {
        mappings: [
          {
            columnName: 'UNKNOWN_FIELD',
            originalName: 'UNKNOWN_FIELD',
            targetSystem: 'skip',
            dataType: 'text',
            confidence: 0,
          },
        ],
        overallConfidence: 0,
        suggestedDataSource: 'general',
        flexibilityScore: 0,
      };

      vi.mocked(flexibleAIMapper.analyzeFileColumns).mockResolvedValueOnce(mockAIAnalysis);
      vi.mocked(db.db.values).mockResolvedValueOnce(undefined);

      const result = await enhancedImportService.createImportPreview(
        '/temp/test.csv',
        'test.csv',
        1024
      );

      const skipMapping = result.suggestedMappings.find(m => m.columnName === 'UNKNOWN_FIELD');
      expect(skipMapping?.mappingType).toBe('skip');
    });
  });

  describe('updateColumnMappings', () => {
    it('should update mappings for an import', async () => {
      vi.mocked(db.db.where).mockResolvedValueOnce(undefined);

      const newMappings = [
        {
          columnName: 'CUSTOM_FIELD',
          originalName: 'CUSTOM_FIELD',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'custom_field',
            dataType: 'text' as const,
            category: 'demographics' as const,
            description: 'User-defined custom field',
          },
        },
      ];

      await enhancedImportService.updateColumnMappings('import-123', newMappings);

      expect(db.db.update).toHaveBeenCalled();
      expect(db.db.set).toHaveBeenCalledWith({
        fieldMappings: newMappings,
        importMetadata: expect.objectContaining({
          userModified: true,
        }),
      });
    });
  });

  describe('processImport', () => {
    it('should process import with core fields and custom attributes', async () => {
      // Mock import record
      const mockImportRecord = {
        id: 'import-123',
        fileName: 'test.csv',
        importStatus: 'preview',
      };

      vi.mocked(db.db.limit).mockResolvedValueOnce([mockImportRecord]);
      vi.mocked(db.db.where).mockResolvedValue(undefined);

      // Mock file reprocessing
      const mockFileData = {
        rows: [
          {
            NAME: 'John Doe',
            EMAIL: 'john@example.com',
            LOYALTY_TIER: 'Gold',
            SPENDING_SCORE: '85',
          },
          {
            NAME: 'Jane Smith',
            EMAIL: 'jane@example.com',
            LOYALTY_TIER: 'Silver',
            SPENDING_SCORE: '65',
          },
        ],
        headers: ['NAME', 'EMAIL', 'LOYALTY_TIER', 'SPENDING_SCORE'],
      };

      // Mock customer creation
      vi.mocked(db.db.returning).mockResolvedValue([
        { id: 'customer-1' },
        { id: 'customer-2' },
      ]);

      // Override private method for testing
      vi.spyOn(enhancedImportService as any, 'reprocessFile').mockResolvedValueOnce(
        mockFileData
      );

      const columnMappings = [
        {
          columnName: 'NAME',
          originalName: 'NAME',
          mappingType: 'core' as const,
          targetField: 'firstName',
        },
        {
          columnName: 'EMAIL',
          originalName: 'EMAIL',
          mappingType: 'core' as const,
          targetField: 'email',
        },
        {
          columnName: 'LOYALTY_TIER',
          originalName: 'LOYALTY_TIER',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'loyalty_tier',
            dataType: 'text' as const,
            category: 'demographics' as const,
          },
        },
        {
          columnName: 'SPENDING_SCORE',
          originalName: 'SPENDING_SCORE',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'spending_score',
            dataType: 'number' as const,
            category: 'behaviors' as const,
          },
        },
      ];

      const result = await enhancedImportService.processImport({
        importId: 'import-123',
        columnMappings,
      });

      expect(result.success).toBe(true);
      expect(result.customersCreated).toBe(2);
      expect(result.customAttributesCreated).toBe(4); // 2 customers × 2 custom attributes
      expect(result.errors).toHaveLength(0);

      // Verify status updates
      expect(db.db.set).toHaveBeenCalledWith({ importStatus: 'processing' });
      expect(db.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          importStatus: 'completed',
          recordsProcessed: 2,
          recordsSuccessful: 2,
          recordsFailed: 0,
        })
      );
    });

    it('should handle row processing errors gracefully', async () => {
      const mockImportRecord = {
        id: 'import-123',
        fileName: 'test.csv',
        importStatus: 'preview',
      };

      vi.mocked(db.db.limit).mockResolvedValueOnce([mockImportRecord]);
      vi.mocked(db.db.where).mockResolvedValue(undefined);

      const mockFileData = {
        rows: [
          { NAME: 'Valid User', EMAIL: 'valid@example.com' },
          { NAME: null, EMAIL: 'invalid@example.com' }, // Will cause error
        ],
        headers: ['NAME', 'EMAIL'],
      };

      // First customer succeeds, second fails
      vi.mocked(db.db.returning)
        .mockResolvedValueOnce([{ id: 'customer-1' }])
        .mockRejectedValueOnce(new Error('Null constraint violation'));

      vi.spyOn(enhancedImportService as any, 'reprocessFile').mockResolvedValueOnce(
        mockFileData
      );

      const columnMappings = [
        {
          columnName: 'NAME',
          originalName: 'NAME',
          mappingType: 'core' as const,
          targetField: 'firstName',
        },
        {
          columnName: 'EMAIL',
          originalName: 'EMAIL',
          mappingType: 'core' as const,
          targetField: 'email',
        },
      ];

      const result = await enhancedImportService.processImport({
        importId: 'import-123',
        columnMappings,
      });

      expect(result.success).toBe(true);
      expect(result.customersCreated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        rowNumber: 2,
        error: 'Null constraint violation',
      });
    });

    it('should handle missing import record', async () => {
      vi.mocked(db.db.limit).mockResolvedValueOnce([]);

      await expect(
        enhancedImportService.processImport({
          importId: 'non-existent',
          columnMappings: [],
        })
      ).rejects.toThrow('Import record not found');
    });

    it('should serialize different data types correctly', async () => {
      const mockImportRecord = {
        id: 'import-123',
        fileName: 'test.csv',
      };

      vi.mocked(db.db.limit).mockResolvedValueOnce([mockImportRecord]);
      vi.mocked(db.db.where).mockResolvedValue(undefined);

      const mockFileData = {
        rows: [
          {
            EMAIL: 'test@example.com',
            SCORE: '85.5',
            IS_ACTIVE: 'true',
            TAGS: 'music,rock,jazz',
            METADATA: '{"premium": true}',
            JOINED_DATE: '2025-01-01',
          },
        ],
        headers: ['EMAIL', 'SCORE', 'IS_ACTIVE', 'TAGS', 'METADATA', 'JOINED_DATE'],
      };

      vi.mocked(db.db.returning).mockResolvedValue([{ id: 'customer-1' }]);
      vi.spyOn(enhancedImportService as any, 'reprocessFile').mockResolvedValueOnce(
        mockFileData
      );

      const columnMappings = [
        {
          columnName: 'EMAIL',
          originalName: 'EMAIL',
          mappingType: 'core' as const,
          targetField: 'email',
        },
        {
          columnName: 'SCORE',
          originalName: 'SCORE',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'score',
            dataType: 'number' as const,
            category: 'demographics' as const,
          },
        },
        {
          columnName: 'IS_ACTIVE',
          originalName: 'IS_ACTIVE',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'is_active',
            dataType: 'boolean' as const,
            category: 'technical' as const,
          },
        },
        {
          columnName: 'TAGS',
          originalName: 'TAGS',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'tags',
            dataType: 'array' as const,
            category: 'preferences' as const,
          },
        },
        {
          columnName: 'METADATA',
          originalName: 'METADATA',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'metadata',
            dataType: 'object' as const,
            category: 'technical' as const,
          },
        },
        {
          columnName: 'JOINED_DATE',
          originalName: 'JOINED_DATE',
          mappingType: 'custom' as const,
          customAttribute: {
            attributeName: 'joined_date',
            dataType: 'date' as const,
            category: 'demographics' as const,
          },
        },
      ];

      await enhancedImportService.processImport({
        importId: 'import-123',
        columnMappings,
      });

      // Verify custom attributes were created with proper serialization
      expect(db.db.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            attributeName: 'score',
            attributeValue: 85.5, // Parsed as number
          }),
          expect.objectContaining({
            attributeName: 'is_active',
            attributeValue: true, // Parsed as boolean
          }),
          expect.objectContaining({
            attributeName: 'tags',
            attributeValue: ['music', 'rock', 'jazz'], // Parsed as array
          }),
          expect.objectContaining({
            attributeName: 'metadata',
            attributeValue: { premium: true }, // Parsed as object
          }),
          expect.objectContaining({
            attributeName: 'joined_date',
            attributeValue: '2025-01-01T00:00:00.000Z', // Parsed as ISO date
          }),
        ])
      );
    });
  });
});