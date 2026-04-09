/**
 * CSV File Processor
 * Handles .csv file processing with streaming support
 */

// CSV PROCESSOR MODULE LOADED DEBUG
// CSV Processor Module - Production ready

import csv from 'csv-parser';
import { createReadStream } from 'node:fs';
import { BaseFileProcessor, ProcessedFileData } from './base-processor';
import { createImportError } from '../enhanced-error-handler';

export class CsvProcessor extends BaseFileProcessor {
  async processFile(filePath: string): Promise<ProcessedFileData> {

    // CSV file processing started

    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      let headers: string[] = [];
      let totalRows = 0;
      let isFirstRow = true;

      const stream = createReadStream(filePath)
        .pipe(csv({
          mapHeaders: ({ header }) => this.cleanFieldName(header)
        }))
        .on('headers', (headerList: string[]) => {
          headers = headerList;
        })
        .on('data', (data) => {
          // Skip empty lines manually
          const hasData = Object.values(data).some(val => val && String(val).trim());
          if (!hasData) return;

          totalRows++;
          if (isFirstRow) {
            isFirstRow = false;
            // If headers weren't set by the headers event, extract from first row
            if (headers.length === 0) {
              headers = Object.keys(data);
            }
          }

          if (rows.length < this.maxRows) {
            rows.push({
              _rowNumber: totalRows + 1,
              ...data
            });
          }
        })
        .on('end', () => {
          if (totalRows === 0) {
            reject(createImportError('FILE_PARSING_ERROR', 'CSV file appears to be empty'));
            return;
          }

          resolve({
            headers,
            rows,
            totalRows
          });
        })
        .on('error', (error) => {
          reject(createImportError('FILE_PARSING_ERROR', `CSV parsing failed: ${error.message}`));
        });
    });
  }
}
