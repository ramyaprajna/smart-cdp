/**
 * Excel File Processor
 * Handles .xlsx and .xls file processing
 */

import * as XLSX from 'xlsx';
import { BaseFileProcessor, ProcessedFileData } from './base-processor';
import { createImportError } from '../enhanced-error-handler';
import { secureLogger } from '../utils/secure-logger';

export class ExcelProcessor extends BaseFileProcessor {
  async processFile(filePath: string): Promise<ProcessedFileData> {
    try {
      const { readFileSync } = await import('fs');
      const fileBuffer = readFileSync(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      // Convert to array of arrays
      const rawData = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: '',
        blankrows: false
      }) as any[][];

      this.validateFileContent(rawData);

      const headers = rawData[0] as string[];
      const dataRows = rawData.slice(1);

      return {
        headers: headers.map(h => this.cleanFieldName(h)),
        rows: this.arrayToObjects(rawData, headers),
        totalRows: dataRows.length
      };
    } catch (error) {
      secureLogger.error('Excel processing error:', { error: String(error) });
      const message = error instanceof Error ? error.message : String(error);
      throw createImportError('FILE_PARSING_ERROR', `Excel file processing failed: ${message}`);
    }
  }
}
