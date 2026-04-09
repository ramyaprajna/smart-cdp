// FILE PROCESSOR MODULE LOADED DEBUG
secureLogger.error('⚡⚡⚡⚡⚡ FILE PROCESSOR SERVICE LOADED ⚡⚡⚡⚡⚡');

import * as XLSX from 'xlsx';
import csv from 'csv-parser';
import * as mammoth from 'mammoth';
import { createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { dataLineageService } from './data-lineage-service';
import { storage } from './storage';
import { secureLogger } from './utils/secure-logger';

export interface FileProcessingJob {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  errors: string[];
  startedAt?: Date;
  completedAt?: Date;
  importId?: string;
}

export interface ProcessingOptions {
  batchSize: number;
  maxConcurrent: number;
  validateFields: boolean;
  skipDuplicates: boolean;
}

class FileProcessor {
  private jobs = new Map<string, FileProcessingJob>();
  private processingQueue: string[] = [];
  private isProcessing = false;

  async processFile(
    filePath: string,
    fileName: string,
    fileSize: number,
    options: ProcessingOptions = {
      batchSize: 1000,
      maxConcurrent: 3,
      validateFields: true,
      skipDuplicates: true
    }
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileType = this.getFileType(fileName);

    const job: FileProcessingJob = {
      id: jobId,
      fileName,
      fileSize,
      fileType,
      status: 'queued',
      progress: 0,
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsFailed: 0,
      errors: []
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(jobId);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue(options);
    }

    return jobId;
  }

  private async processQueue(options: ProcessingOptions): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        const jobId = this.processingQueue.shift()!;
        const job = this.jobs.get(jobId);

        if (!job) continue;

        await this.processJob(job, options);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: FileProcessingJob, options: ProcessingOptions): Promise<void> {
    try {
      job.status = 'processing';
      job.startedAt = new Date();

      // Initialize data lineage tracking
      const importId = await dataLineageService.startImport({
        fileName: job.fileName,
        importType: this.mapFileTypeToImportType(job.fileType),
        importSource: 'file_upload',
        importedBy: 'system',
        metadata: {
          fileSize: job.fileSize,
          processingOptions: options
        }
      });

      job.importId = importId;

      // Process based on file type
      let records: any[] = [];

      switch (job.fileType) {
        case 'excel':
          records = await this.processExcelFile(`temp/${job.fileName}`, job);
          break;
        case 'csv':
          records = await this.processCsvFile(`temp/${job.fileName}`, job);
          break;
        case 'docx':
          records = await this.processDocxFile(`temp/${job.fileName}`, job);
          break;
        case 'txt':
          records = await this.processTxtFile(`temp/${job.fileName}`, job);
          break;
        default:
          throw new Error(`Unsupported file type: ${job.fileType}`);
      }

      // Process records in batches
      await this.processBatches(records, job, options);

      job.status = 'completed';
      job.completedAt = new Date();
      job.progress = 100;

    } catch (error) {
      job.status = 'failed';
      job.errors.push(error instanceof Error ? error.message : 'Unknown error');
      job.completedAt = new Date();
    }
  }

  private async processExcelFile(filePath: string, job: FileProcessingJob): Promise<any[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with header row
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false
    }) as any[][];

    if (rawData.length === 0) {
      throw new Error('Excel file is empty');
    }

    const headers = rawData[0] as string[];
    const dataRows = rawData.slice(1);

    return dataRows.map((row, index) => {
      const record: any = { _sourceRowNumber: index + 2 }; // +2 because of header and 0-index
      headers.forEach((header, colIndex) => {
        const cleanHeader = this.cleanFieldName(header);
        record[cleanHeader] = row[colIndex] || '';
      });
      return record;
    });
  }

  private async processCsvFile(filePath: string, job: FileProcessingJob): Promise<any[]> {
    const records: any[] = [];
    let rowNumber = 1;

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath)
        .pipe(csv({
          headers: true
        }))
          .on('headers', (headers: string[]) => {
            // Map headers on first row
          })
        .on('data', (data: any) => {
          records.push({ ...data, _sourceRowNumber: ++rowNumber });

          // Update progress periodically
          if (records.length % 1000 === 0) {
            job.progress = Math.min(90, (records.length / 10000) * 90); // Estimate progress
          }
        })
        .on('end', () => resolve(records))
        .on('error', reject);
    });
  }

  private async processDocxFile(filePath: string, job: FileProcessingJob): Promise<any[]> {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;

    // Simple text parsing - assuming each line is a record
    // More sophisticated parsing could be implemented based on specific format
    const lines = text.split('\n').filter(line => line.trim());

    return lines.map((line, index) => ({
      text: line.trim(),
      _sourceRowNumber: index + 1
    }));
  }

  private async processTxtFile(filePath: string, job: FileProcessingJob): Promise<any[]> {
    const text = await new Promise<string>((resolve, reject) => {
      let content = '';
      createReadStream(filePath, { encoding: 'utf8' })
        .on('data', chunk => content += chunk)
        .on('end', () => resolve(content))
        .on('error', reject);
    });

    // Handle different text formats
    const lines = text.split('\n').filter(line => line.trim());

    // Try to detect if it's CSV-like or JSON-like
    if (lines[0]?.includes(',')) {
      // Treat as CSV
      return this.parseTextAsCsv(lines);
    } else if (lines[0]?.startsWith('{') || lines[0]?.startsWith('[')) {
      // Treat as JSON
      return this.parseTextAsJson(text);
    } else {
      // Treat as plain text records
      return lines.map((line, index) => ({
        text: line.trim(),
        _sourceRowNumber: index + 1
      }));
    }
  }

  private parseTextAsCsv(lines: string[]): any[] {
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => this.cleanFieldName(h.trim()));
    const dataLines = lines.slice(1);

    return dataLines.map((line, index) => {
      const values = line.split(',').map(v => v.trim());
      const record: any = { _sourceRowNumber: index + 2 };

      headers.forEach((header, colIndex) => {
        record[header] = values[colIndex] || '';
      });

      return record;
    });
  }

  private parseTextAsJson(text: string): any[] {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          ...item,
          _sourceRowNumber: index + 1
        }));
      } else {
        return [{ ...parsed, _sourceRowNumber: 1 }];
      }
    } catch (error) {
      throw new Error('Invalid JSON format in text file');
    }
  }

  private async processBatches(
    records: any[],
    job: FileProcessingJob,
    options: ProcessingOptions
  ): Promise<void> {
    const batches = this.createBatches(records, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const result = await dataLineageService.importCustomers(
          job.importId!,
          batch.map(record => this.transformToCustomer(record)),
          batch.map((_, index) => index + 1)
        );

        job.recordsProcessed += batch.length;
        job.recordsSuccessful += result.recordsSuccessful;
        job.recordsFailed += result.recordsFailed;
        job.errors.push(...result.errors);

        // Update progress
        job.progress = Math.round(((i + 1) / batches.length) * 100);

      } catch (error) {
        job.recordsFailed += batch.length;
        job.errors.push(`Batch ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private transformToCustomer(record: any): any {
    // Map common field variations to standard customer fields
    const fieldMapping: Record<string, string> = {
      'first_name': 'firstName',
      'firstname': 'firstName',
      'last_name': 'lastName',
      'lastname': 'lastName',
      'email_address': 'email',
      'phone': 'phoneNumber',
      'phone_number': 'phoneNumber',
      'segment': 'customerSegment',
      'customer_segment': 'customerSegment',
      'lifetime_value': 'lifetimeValue',
      'ltv': 'lifetimeValue',
      'data_quality': 'dataQualityScore',
      'quality_score': 'dataQualityScore'
    };

    const customer: any = {};

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('_')) continue; // Skip internal fields

      const standardKey = fieldMapping[key.toLowerCase()] || key;
      customer[standardKey] = value;
    }

    // Ensure required fields and data types
    if (customer.lifetimeValue) {
      customer.lifetimeValue = parseFloat(customer.lifetimeValue) || 0;
    }

    if (customer.dataQualityScore) {
      customer.dataQualityScore = Math.min(100, Math.max(0, parseFloat(customer.dataQualityScore) || 0));
    }

    return customer;
  }

  private cleanFieldName(fieldName: string): string {
    return fieldName
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_');
  }

  private getFileType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'csv':
        return 'csv';
      case 'docx':
        return 'docx';
      case 'txt':
        return 'txt';
      default:
        throw new Error(`Unsupported file extension: ${ext}`);
    }
  }

  private mapFileTypeToImportType(fileType: string): 'excel' | 'csv' | 'json' | 'api' {
    switch (fileType) {
      case 'excel':
        return 'excel';
      case 'csv':
      case 'txt':
        return 'csv';
      case 'docx':
        return 'json'; // Treating DOCX as structured data
      default:
        return 'json';
    }
  }

  getJob(jobId: string): FileProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): FileProcessingJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveJobs(): FileProcessingJob[] {
    return Array.from(this.jobs.values()).filter(
      job => job.status === 'queued' || job.status === 'processing'
    );
  }

  deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }
}

export const fileProcessor = new FileProcessor();
