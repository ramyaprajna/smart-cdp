/**
 * FileProcessor Unit Tests
 * 
 * Comprehensive test suite for file processor modules with proper mocking
 * Tests cover: valid files, invalid files, empty files, large files, field mapping, edge cases
 * 
 * @module FileProcessorTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseFileProcessor, ProcessedFileData } from '@server/file-processors/base-processor';
import { CsvProcessor } from '@server/file-processors/csv-processor';
import { ExcelProcessor } from '@server/file-processors/excel-processor';
import { TextProcessor } from '@server/file-processors/text-processor';
import { DocxProcessor } from '@server/file-processors/docx-processor';
import { Readable } from 'node:stream';

// Mock the error handler module
vi.mock('@server/enhanced-error-handler', () => ({
  createImportError: (type: string, details: string, rowNumber?: number) => {
    const error = new Error(details) as any;
    error.code = type;
    error.isOperational = true;
    error.statusCode = type === 'FILE_PARSING_ERROR' ? 422 : 400;
    error.rowNumber = rowNumber;
    return error;
  }
}));

// Mock fs module - synchronous mock without async wrapper
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
  existsSync: vi.fn(() => true),
  default: {
    readFileSync: vi.fn(),
    createReadStream: vi.fn(),
    existsSync: vi.fn(() => true)
  }
}));

// Mock csv-parser
vi.mock('csv-parser', () => {
  return {
    default: vi.fn((options: any) => {
      const { PassThrough } = require('stream');
      const transform = new PassThrough({ objectMode: true });
      
      // Store the mapHeaders function for later use
      (transform as any).mapHeadersFn = options?.mapHeaders || ((h: any) => h.header);
      
      return transform;
    })
  };
});

// Mock xlsx
vi.mock('xlsx', () => ({
  default: {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn()
    }
  },
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn()
  }
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn()
  },
  extractRawText: vi.fn()
}));

import { createReadStream, readFileSync } from 'node:fs';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

describe('BaseFileProcessor', () => {
  // Create a concrete implementation for testing abstract class
  class TestProcessor extends BaseFileProcessor {
    async processFile(filePath: string): Promise<ProcessedFileData> {
      return {
        headers: ['test'],
        rows: [{ test: 'value' }],
        totalRows: 1
      };
    }
  }

  describe('Field Name Cleaning', () => {
    let processor: TestProcessor;

    beforeEach(() => {
      processor = new TestProcessor();
    });

    it('should map "first name" to "firstName"', () => {
      const result = (processor as any).cleanFieldName('first name');
      expect(result).toBe('firstName');
    });

    it('should map "First Name *" to "firstName"', () => {
      const result = (processor as any).cleanFieldName('First Name *');
      expect(result).toBe('firstName');
    });

    it('should map "last name" to "lastName"', () => {
      const result = (processor as any).cleanFieldName('last name');
      expect(result).toBe('lastName');
    });

    it('should map "email address" to "email"', () => {
      const result = (processor as any).cleanFieldName('email address');
      expect(result).toBe('email');
    });

    it('should map "phone number" to "phoneNumber"', () => {
      const result = (processor as any).cleanFieldName('phone number');
      expect(result).toBe('phoneNumber');
    });

    it('should map "date of birth" to "dateOfBirth"', () => {
      const result = (processor as any).cleanFieldName('date of birth');
      expect(result).toBe('dateOfBirth');
    });

    it('should map "customer segment" to "customerSegment"', () => {
      const result = (processor as any).cleanFieldName('customer segment');
      expect(result).toBe('customerSegment');
    });

    it('should map "lifetime value" to "lifetimeValue"', () => {
      const result = (processor as any).cleanFieldName('lifetime value');
      expect(result).toBe('lifetimeValue');
    });

    it('should convert unmapped fields to camelCase', () => {
      const result = (processor as any).cleanFieldName('custom field name');
      expect(result).toBe('customFieldName');
    });

    it('should handle special characters in field names', () => {
      const result = (processor as any).cleanFieldName('field-name@#$%');
      expect(result).toBe('fieldname');
    });

    it('should handle empty or invalid field names', () => {
      expect((processor as any).cleanFieldName('')).toBe('unknown_field');
      expect((processor as any).cleanFieldName(null)).toBe('unknown_field');
      expect((processor as any).cleanFieldName(undefined)).toBe('unknown_field');
    });

    it('should truncate very long field names to 50 characters', () => {
      const longName = 'this is a very long field name that exceeds the fifty character limit and should be truncated';
      const result = (processor as any).cleanFieldName(longName);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should normalize whitespace in field names', () => {
      const result = (processor as any).cleanFieldName('field   with    spaces');
      expect(result).toBe('fieldWithSpaces');
    });
  });

  describe('Row Numbering', () => {
    let processor: TestProcessor;

    beforeEach(() => {
      processor = new TestProcessor();
    });

    it('should add row numbers starting from 2', () => {
      const rows = [
        { name: 'John' },
        { name: 'Jane' },
        { name: 'Bob' }
      ];

      const result = (processor as any).addRowNumbers(rows);
      
      expect(result[0]._rowNumber).toBe(2);
      expect(result[1]._rowNumber).toBe(3);
      expect(result[2]._rowNumber).toBe(4);
    });

    it('should preserve original row data', () => {
      const rows = [{ name: 'John', age: 30 }];
      const result = (processor as any).addRowNumbers(rows);
      
      expect(result[0].name).toBe('John');
      expect(result[0].age).toBe(30);
    });

    it('should handle empty array', () => {
      const result = (processor as any).addRowNumbers([]);
      expect(result).toEqual([]);
    });
  });

  describe('Array to Objects Conversion', () => {
    let processor: TestProcessor;

    beforeEach(() => {
      processor = new TestProcessor();
    });

    it('should convert array data to objects with cleaned headers', () => {
      const rawData = [
        ['First Name', 'Last Name', 'Email'],
        ['John', 'Doe', 'john@example.com'],
        ['Jane', 'Smith', 'jane@example.com']
      ];
      const headers = rawData[0] as string[];

      const result = (processor as any).arrayToObjects(rawData, headers);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        _rowNumber: 2,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });
    });

    it('should handle empty cells as empty strings', () => {
      const rawData = [
        ['Name', 'Email'],
        ['John', ''],
        ['', 'jane@example.com']
      ];
      const headers = rawData[0] as string[];

      const result = (processor as any).arrayToObjects(rawData, headers);

      expect(result[0].email).toBe('');
      expect(result[1].name).toBe('');
    });

    it('should respect maxRows limit', () => {
      const processor = new TestProcessor(3);
      const rawData = [
        ['Name'],
        ['Row1'],
        ['Row2'],
        ['Row3'],
        ['Row4'],
        ['Row5']
      ];
      const headers = rawData[0] as string[];

      const result = (processor as any).arrayToObjects(rawData, headers);

      expect(result).toHaveLength(3);
    });

    it('should handle empty data array', () => {
      const result = (processor as any).arrayToObjects([], []);
      expect(result).toEqual([]);
    });
  });

  describe('File Content Validation', () => {
    let processor: TestProcessor;

    beforeEach(() => {
      processor = new TestProcessor();
    });

    it('should throw error for empty file', () => {
      expect(() => {
        (processor as any).validateFileContent([]);
      }).toThrow('File appears to be empty or corrupted');
    });

    it('should throw error for null data', () => {
      expect(() => {
        (processor as any).validateFileContent(null);
      }).toThrow('File appears to be empty or corrupted');
    });

    it('should not throw for valid data', () => {
      expect(() => {
        (processor as any).validateFileContent([['header'], ['data']]);
      }).not.toThrow();
    });
  });

  describe('Constructor and Configuration', () => {
    it('should use default maxRows of 10', () => {
      const processor = new TestProcessor();
      expect((processor as any).maxRows).toBe(10);
    });

    it('should accept custom maxRows', () => {
      const processor = new TestProcessor(25);
      expect((processor as any).maxRows).toBe(25);
    });
  });
});

describe('CsvProcessor', () => {
  let processor: CsvProcessor;

  beforeEach(() => {
    processor = new CsvProcessor(10);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default maxRows', () => {
      const proc = new CsvProcessor();
      expect((proc as any).maxRows).toBe(10);
    });

    it('should accept custom maxRows', () => {
      const proc = new CsvProcessor(25);
      expect((proc as any).maxRows).toBe(25);
    });
  });

  describe('Field Name Mapping (inherited from BaseFileProcessor)', () => {
    it('should map CSV header variations to standard fields', () => {
      const testCases = [
        { input: 'First Name', expected: 'firstName' },
        { input: 'Last Name *', expected: 'lastName' },
        { input: 'Email Address', expected: 'email' },
        { input: 'Phone Number', expected: 'phoneNumber' },
        { input: 'Customer Segment', expected: 'customerSegment' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = (processor as any).cleanFieldName(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle special characters in headers', () => {
      const result = (processor as any).cleanFieldName('Name@#$%*');
      expect(result).toBe('name');
    });

    it('should convert unmapped fields to camelCase', () => {
      const result = (processor as any).cleanFieldName('custom field name');
      expect(result).toBe('customFieldName');
    });
  });

  describe('Row Number Management', () => {
    it('should add row numbers starting from 2', () => {
      const rows = [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' }
      ];
      
      const numberedRows = (processor as any).addRowNumbers(rows);
      
      expect(numberedRows[0]._rowNumber).toBe(2);
      expect(numberedRows[1]._rowNumber).toBe(3);
      expect(numberedRows[0].name).toBe('John');
      expect(numberedRows[1].email).toBe('jane@example.com');
    });

    it('should preserve all original data when adding row numbers', () => {
      const rows = [{ name: 'Test', age: 30, active: true }];
      const numbered = (processor as any).addRowNumbers(rows);
      
      expect(numbered[0].name).toBe('Test');
      expect(numbered[0].age).toBe(30);
      expect(numbered[0].active).toBe(true);
      expect(numbered[0]._rowNumber).toBe(2);
    });
  });

  describe('Data Validation', () => {
    it('should validate file content', () => {
      expect(() => {
        (processor as any).validateFileContent([]);
      }).toThrow('empty');

      expect(() => {
        (processor as any).validateFileContent([['header'], ['data']]);
      }).not.toThrow();
    });
  });

  describe('Array to Objects Conversion', () => {
    it('should convert array data to objects with cleaned headers', () => {
      const rawData = [
        ['First Name', 'Last Name', 'Email'],
        ['John', 'Doe', 'john@example.com'],
        ['Jane', 'Smith', 'jane@example.com']
      ];
      const headers = rawData[0] as string[];

      const result = (processor as any).arrayToObjects(rawData, headers);

      expect(result).toHaveLength(2);
      expect(result[0].firstName).toBe('John');
      expect(result[0].lastName).toBe('Doe');
      expect(result[0].email).toBe('john@example.com');
      expect(result[0]._rowNumber).toBe(2);
    });

    it('should respect maxRows limit', () => {
      const smallProcessor = new CsvProcessor(3);
      const rawData = [
        ['Name'],
        ['Person1'],
        ['Person2'],
        ['Person3'],
        ['Person4'],
        ['Person5']
      ];
      const headers = rawData[0] as string[];

      const result = (smallProcessor as any).arrayToObjects(rawData, headers);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should handle empty cells', () => {
      const rawData = [
        ['Name', 'Email'],
        ['John', ''],
        ['', 'jane@example.com']
      ];
      const headers = rawData[0] as string[];

      const result = (processor as any).arrayToObjects(rawData, headers);

      expect(result[0].email).toBe('');
      expect(result[1].name).toBe('');
    });
  });
});

describe('ExcelProcessor', () => {
  let processor: ExcelProcessor;

  beforeEach(() => {
    processor = new ExcelProcessor(10);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Valid Excel Files', () => {
    it('should process valid Excel file', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['First Name', 'Last Name', 'Email'],
        ['John', 'Doe', 'john@example.com'],
        ['Jane', 'Smith', 'jane@example.com']
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await processor.processFile('/test/file.xlsx');

      expect(result.headers).toEqual(['firstName', 'lastName', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.rows[0].firstName).toBe('John');
    });

    it('should handle multiple sheets (uses first sheet)', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1', 'Sheet2', 'Sheet3'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
          Sheet3: {}
        }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['Name'],
        ['John']
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await processor.processFile('/test/multi-sheet.xlsx');

      expect(XLSX.utils.sheet_to_json).toHaveBeenCalledWith(
        mockWorkbook.Sheets['Sheet1'],
        expect.any(Object)
      );
    });

    it('should respect maxRows limit', async () => {
      const smallProcessor = new ExcelProcessor(3);
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['Name'],
        ['Row1'],
        ['Row2'],
        ['Row3'],
        ['Row4'],
        ['Row5']
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await smallProcessor.processFile('/test/large.xlsx');

      expect(result.rows.length).toBeLessThanOrEqual(3);
    });

    it('should handle cells with default values', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['Name', 'Email'],
        ['John', ''], // Empty cell
        ['Jane', 'jane@example.com']
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await processor.processFile('/test/empty-cells.xlsx');

      expect(result.rows[0].email).toBe('');
    });
  });

  describe('Invalid Excel Files', () => {
    it('should reject empty Excel files', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([]);

      await expect(processor.processFile('/test/empty.xlsx')).rejects.toThrow('empty');
    });

    it('should handle file read errors', async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(processor.processFile('/test/missing.xlsx')).rejects.toThrow();
    });

    it('should handle corrupted Excel files', async () => {
      const mockFileBuffer = Buffer.from('corrupted data');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);
      
      vi.mocked(XLSX.read).mockImplementation(() => {
        throw new Error('File is corrupted');
      });

      await expect(processor.processFile('/test/corrupted.xlsx')).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in headers', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['First Name *', 'Last Name!', 'Email@Address'],
        ['John', 'Doe', 'john@example.com']
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await processor.processFile('/test/special.xlsx');

      expect(result.headers).toContain('firstName');
      expect(result.headers).toContain('lastName');
    });

    it('should handle numeric values in cells', async () => {
      const mockFileBuffer = Buffer.from('fake excel content');
      
      vi.mocked(readFileSync).mockReturnValue(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const mockData = [
        ['Name', 'Age', 'Score'],
        ['John', 30, 95.5],
        ['Jane', 25, 87.3]
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const result = await processor.processFile('/test/numbers.xlsx');

      expect(result.rows[0].age).toBe(30);
      expect(result.rows[0].score).toBe(95.5);
    });
  });
});

describe('TextProcessor', () => {
  let processor: TextProcessor;

  beforeEach(() => {
    processor = new TextProcessor(10);
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default maxRows', () => {
      const proc = new TextProcessor();
      expect((proc as any).maxRows).toBe(10);
    });

    it('should accept custom maxRows', () => {
      const proc = new TextProcessor(25);
      expect((proc as any).maxRows).toBe(25);
    });
  });

  describe('Field Name Cleaning', () => {
    it('should clean field names from text key-value pairs', () => {
      const testCases = [
        { input: 'First Name', expected: 'firstName' },
        { input: 'Last Name', expected: 'lastName' },
        { input: 'Email Address', expected: 'email' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = (processor as any).cleanFieldName(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Data Validation', () => {
    it('should validate file content', () => {
      expect(() => {
        (processor as any).validateFileContent([]);
      }).toThrow('empty');

      expect(() => {
        (processor as any).validateFileContent([['content'], ['line1']]);
      }).not.toThrow();
    });
  });

  describe('Integration: processFile', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should process structured key-value text file', async () => {
      const textContent = `First Name: John
Last Name: Doe
Email: john@example.com

First Name: Jane
Last Name: Smith
Email: jane@example.com`;

      vi.mocked(readFileSync).mockReturnValue(textContent as any);

      const result = await processor.processFile('/test/structured.txt');

      expect(result.headers).toContain('firstName');
      expect(result.headers).toContain('lastName');
      expect(result.headers).toContain('email');
      expect(result.rows.length).toBe(2);
      expect(result.totalRows).toBe(2);
    });

    it('should process simple line-by-line text file', async () => {
      const textContent = `Line 1 content
Line 2 content
Line 3 content`;

      vi.mocked(readFileSync).mockReturnValue(textContent as any);

      const result = await processor.processFile('/test/simple.txt');

      expect(result.headers).toEqual(['content']);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].content).toBe('Line 1 content');
      expect(result.rows[0]._rowNumber).toBe(2);
    });

    it('should filter empty lines', async () => {
      const textContent = `Line 1

Line 3`;

      vi.mocked(readFileSync).mockReturnValue(textContent as any);

      const result = await processor.processFile('/test/with-empty.txt');

      expect(result.rows).toHaveLength(2);
    });

    it('should reject empty text files', async () => {
      vi.mocked(readFileSync).mockReturnValue('' as any);

      await expect(processor.processFile('/test/empty.txt')).rejects.toThrow('empty');
    });

    it('should handle file read errors', async () => {
      vi.mocked(readFileSync).mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      await expect(processor.processFile('/test/missing.txt')).rejects.toThrow();
    });
  });

});

describe('DocxProcessor', () => {
  let processor: DocxProcessor;

  beforeEach(() => {
    processor = new DocxProcessor(10);
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default maxRows', () => {
      const proc = new DocxProcessor();
      expect((proc as any).maxRows).toBe(10);
    });

    it('should accept custom maxRows', () => {
      const proc = new DocxProcessor(25);
      expect((proc as any).maxRows).toBe(25);
    });
  });

  describe('Field Name Cleaning', () => {
    it('should clean field names from DOCX content', () => {
      const result = (processor as any).cleanFieldName('First Name');
      expect(result).toBe('firstName');
    });

    it('should handle special characters', () => {
      const result = (processor as any).cleanFieldName('Email *');
      expect(result).toBe('email');
    });
  });

  describe('Data Validation', () => {
    it('should validate file content', () => {
      expect(() => {
        (processor as any).validateFileContent([]);
      }).toThrow('empty');

      expect(() => {
        (processor as any).validateFileContent([['content'], ['text']]);
      }).not.toThrow();
    });
  });
});

describe('Edge Cases and Performance', () => {
  describe('MaxRows Configuration', () => {
    it('should respect maxRows limit in processor', () => {
      const processor = new CsvProcessor(5);
      expect((processor as any).maxRows).toBe(5);
      
      const largeProcessor = new CsvProcessor(100);
      expect((largeProcessor as any).maxRows).toBe(100);
    });

    it('should limit rows using arrayToObjects method', () => {
      const processor = new CsvProcessor(3);
      
      const rawData = [
        ['Name'],
        ['Person1'],
        ['Person2'],
        ['Person3'],
        ['Person4'],
        ['Person5']
      ];
      const headers = rawData[0] as string[];
      
      const result = (processor as any).arrayToObjects(rawData, headers);
      
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('File Path Handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should handle absolute file paths', async () => {
      const mockFileBuffer = Buffer.from('content');
      vi.mocked(readFileSync).mockReturnValueOnce(mockFileBuffer);

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      };
      vi.mocked(XLSX.read).mockReturnValueOnce(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce([['Name'], ['John']]);

      const processor = new ExcelProcessor();
      await processor.processFile('/absolute/path/to/file.xlsx');

      expect(readFileSync).toHaveBeenCalledWith('/absolute/path/to/file.xlsx');
    });

  });

  describe('Data Validation', () => {
    it('should validate file content', () => {
      const processor = new ExcelProcessor();
      
      expect(() => {
        (processor as any).validateFileContent([]);
      }).toThrow('empty');
      
      expect(() => {
        (processor as any).validateFileContent([['header'], ['data']]);
      }).not.toThrow();
    });
  });
});
