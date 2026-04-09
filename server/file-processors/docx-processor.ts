/**
 * DOCX File Processor
 * Handles .docx files by extracting text content
 */

import * as mammoth from 'mammoth';
import { BaseFileProcessor, ProcessedFileData } from './base-processor';
import { createImportError } from '../enhanced-error-handler';

export class DocxProcessor extends BaseFileProcessor {
  async processFile(filePath: string): Promise<ProcessedFileData> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const content = result.value;

      if (!content.trim()) {
        throw createImportError('FILE_PARSING_ERROR', 'DOCX file appears to be empty');
      }

      // Split content into paragraphs
      const paragraphs = content
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (paragraphs.length === 0) {
        throw createImportError('FILE_PARSING_ERROR', 'No readable content found in DOCX file');
      }

      // Try to extract customer information patterns
      const customerData = this.extractCustomerData(paragraphs);

      if (customerData.length > 0) {
        return {
          headers: this.getCustomerDataHeaders(customerData),
          rows: customerData.slice(0, this.maxRows),
          totalRows: customerData.length
        };
      }

      // Fallback: treat as simple text content
      return this.processAsParagraphs(paragraphs);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) throw error; // Re-throw our custom errors
      const message = error instanceof Error ? error.message : String(error);
      throw createImportError('FILE_PARSING_ERROR', `DOCX processing failed: ${message}`);
    }
  }

  private extractCustomerData(paragraphs: string[]): Record<string, any>[] {
    const customers: Record<string, any>[] = [];
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phonePattern = /[\+]?[\d\s\-\(\)]{8,}/g;

    paragraphs.forEach((paragraph, index) => {
      const emails = paragraph.match(emailPattern);
      const phones = paragraph.match(phonePattern);

      if (emails || phones) {
        const customer: Record<string, any> = {
          _rowNumber: customers.length + 2,
          content: paragraph
        };

        if (emails) customer.email = emails[0];
        if (phones) customer.phone = phones[0];

        customers.push(customer);
      }
    });

    return customers;
  }

  private getCustomerDataHeaders(customerData: Record<string, any>[]): string[] {
    const headers = new Set<string>();
    customerData.forEach(customer => {
      Object.keys(customer).forEach(key => {
        if (key !== '_rowNumber') headers.add(key);
      });
    });
    return Array.from(headers);
  }

  private processAsParagraphs(paragraphs: string[]): ProcessedFileData {
    const rows = paragraphs.slice(0, this.maxRows).map((paragraph, index) => ({
      _rowNumber: index + 1,
      content: paragraph
    }));

    return {
      headers: ['content'],
      rows,
      totalRows: paragraphs.length
    };
  }
}
