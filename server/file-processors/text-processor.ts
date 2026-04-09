/**
 * Text File Processor
 * Handles .txt files and extracts structured data where possible
 */

import { readFileSync } from 'node:fs';
import { BaseFileProcessor, ProcessedFileData } from './base-processor';
import { createImportError } from '../enhanced-error-handler';

export class TextProcessor extends BaseFileProcessor {
  async processFile(filePath: string): Promise<ProcessedFileData> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        throw createImportError('FILE_PARSING_ERROR', 'Text file appears to be empty');
      }

      // Try to detect structured data patterns
      const structuredData = this.extractStructuredData(lines);

      if (structuredData) {
        return structuredData;
      }

      // Fallback: treat as simple line-by-line data
      return this.processAsSimpleText(lines);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) throw error; // Re-throw our custom errors
      const message = error instanceof Error ? error.message : String(error);
      throw createImportError('FILE_PARSING_ERROR', `Text file processing failed: ${message}`);
    }
  }

  private extractStructuredData(lines: string[]): ProcessedFileData | null {
    // Check for key-value pair patterns
    const kvPattern = /^([^:]+):\s*(.*)$/;
    const customerBlocks: Record<string, any>[] = [];
    let currentCustomer: Record<string, any> = {};
    let customerCount = 0;

    for (const line of lines) {
      const match = line.match(kvPattern);

      if (match) {
        const [, key, value] = match;
        const cleanKey = this.cleanFieldName(key.trim());
        currentCustomer[cleanKey] = value.trim();
      } else if (line.trim() === '' && Object.keys(currentCustomer).length > 0) {
        // Empty line indicates end of customer record
        customerBlocks.push({
          _rowNumber: customerCount + 2,
          ...currentCustomer
        });
        currentCustomer = {};
        customerCount++;

        if (customerBlocks.length >= this.maxRows) break;
      }
    }

    // Add the last customer if exists
    if (Object.keys(currentCustomer).length > 0 && customerBlocks.length < this.maxRows) {
      customerBlocks.push({
        _rowNumber: customerCount + 2,
        ...currentCustomer
      });
      customerCount++;
    }

    if (customerBlocks.length > 0) {
      const allKeys = new Set<string>();
      customerBlocks.forEach(customer => {
        Object.keys(customer).forEach(key => {
          if (key !== '_rowNumber') allKeys.add(key);
        });
      });

      return {
        headers: Array.from(allKeys),
        rows: customerBlocks,
        totalRows: customerCount
      };
    }

    return null;
  }

  private processAsSimpleText(lines: string[]): ProcessedFileData {
    const rows = lines.slice(0, this.maxRows).map((line, index) => ({
      _rowNumber: index + 1,
      content: line.trim()
    }));

    return {
      headers: ['content'],
      rows,
      totalRows: lines.length
    };
  }
}
