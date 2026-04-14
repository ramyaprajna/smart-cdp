/**
 * File Processors Index
 * Exports all file processors and factory function
 */

export { BaseFileProcessor } from './base-processor';
export { ExcelProcessor } from './excel-processor';
export { CsvProcessor } from './csv-processor';
export { TextProcessor } from './text-processor';
export { DocxProcessor } from './docx-processor';

import { BaseFileProcessor } from './base-processor';
import { ExcelProcessor } from './excel-processor';
import { CsvProcessor } from './csv-processor';
import { TextProcessor } from './text-processor';
import { DocxProcessor } from './docx-processor';
import { createImportError } from '../enhanced-error-handler';
import { secureLogger } from '../utils/secure-logger';

/**
 * File type detection utility
 */
export function detectFileType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return 'excel';
    case 'csv':
      return 'csv';
    case 'txt':
    case 'json':
      return 'txt';
    case 'docx':
      return 'docx';
    default:
      throw createImportError('UNSUPPORTED_FORMAT',
        `File format .${extension} is not supported. Please use Excel (.xlsx), CSV, TXT, or DOCX files.`
      );
  }
}

/**
 * Factory function to create appropriate file processor
 */
export function createFileProcessor(fileType: string, maxRows: number = 10): BaseFileProcessor {

  switch (fileType) {
    case 'excel':
      return new ExcelProcessor(maxRows);
    case 'csv':
      return new CsvProcessor(maxRows);
    case 'txt':
      return new TextProcessor(maxRows);
    case 'docx':
      return new DocxProcessor(maxRows);
    default:
      throw createImportError('UNSUPPORTED_FORMAT', `File type ${fileType} is not supported`);
  }
}
