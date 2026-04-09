/**
 * Base File Processor - Abstract class for file processing
 * Provides common functionality for all file processors
 */

export interface ProcessedFileData {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

export abstract class BaseFileProcessor {
  protected maxRows: number;

  constructor(maxRows: number = 10) {
    this.maxRows = maxRows;
  }

  /**
   * Abstract method for processing files - must be implemented by subclasses
   */
  abstract processFile(filePath: string): Promise<ProcessedFileData>;

  /**
   * Enhanced field name cleaning with proper database schema mapping
   */
  protected cleanFieldName(fieldName: string): string {
    if (!fieldName || typeof fieldName !== 'string') return 'unknown_field';

    // Define exact mapping from Excel headers to database fields
    const fieldMappings: Record<string, string> = {
      'first name': 'firstName',
      'first name *': 'firstName',
      'firstname': 'firstName',
      'last name': 'lastName',
      'last name *': 'lastName',
      'lastname': 'lastName',
      'email': 'email',
      'email address': 'email',
      'email address *': 'email',
      'phone': 'phoneNumber',
      'phone number': 'phoneNumber',
      'phonenumber': 'phoneNumber',
      'date of birth': 'dateOfBirth',
      'dateofbirth': 'dateOfBirth',
      'dob': 'dateOfBirth',
      'gender': 'gender',
      'customer segment': 'customerSegment',
      'customersegment': 'customerSegment',
      'segment': 'customerSegment',
      'lifetime value': 'lifetimeValue',
      'lifetimevalue': 'lifetimeValue',
      'ltv': 'lifetimeValue',
      'current address': 'currentAddress',
      'currentaddress': 'currentAddress',
      'address': 'currentAddress'
    };

    // Clean and normalize the field name
    const normalized = fieldName
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special chars including *
      .replace(/\s+/g, ' '); // Normalize spaces

    // Return mapped field name or fallback to camelCase conversion
    if (fieldMappings[normalized]) {
      return fieldMappings[normalized];
    }

    // Fallback: convert to camelCase for unmapped fields
    return normalized
      .split(' ')
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('')
      .substring(0, 50);
  }

  /**
   * Add row numbering to processed records
   */
  protected addRowNumbers(rows: any[]): Record<string, any>[] {
    return rows.map((row, index) => ({
      _rowNumber: index + 2, // +2 for header and 0-index
      ...row
    }));
  }

  /**
   * Convert array of arrays to objects using headers
   */
  protected arrayToObjects(rawData: any[][], headers: string[]): Record<string, any>[] {
    if (rawData.length === 0) return [];

    const dataRows = rawData.slice(1); // Skip header row
    const previewRows = dataRows.slice(0, this.maxRows);

    return previewRows.map((row, index) => {
      const record: any = { _rowNumber: index + 2 };
      headers.forEach((header, colIndex) => {
        const cleanHeader = this.cleanFieldName(header);
        record[cleanHeader] = row[colIndex] || '';
      });
      return record;
    });
  }

  /**
   * Validate that file has content
   */
  protected validateFileContent(data: any[][]): void {
    if (!data || data.length === 0) {
      throw new Error('File appears to be empty or corrupted');
    }
  }
}
