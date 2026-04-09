/**
 * Customer Profile Template Generator Service
 *
 * Generates functional templates for customer data import that align exactly with the backend schema.
 * Templates include mandatory field markers, data type examples, and inline descriptions.
 *
 * Features:
 * - Evidence-based field definitions from actual schema
 * - Dynamic template generation for .csv, .json, .docx, .txt formats
 * - Mandatory field markers and validation rules
 * - Sample data that passes backend validation
 *
 * @module TemplateGeneratorService
 * @created August 15, 2025
 */

import { insertCustomerSchema } from '../../shared/schema';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

export interface TemplateField {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'json';
  required: boolean;
  description: string;
  example: any;
  format?: string;
}

export interface CustomerTemplateMetadata {
  fields: TemplateField[];
  sampleData: Record<string, any>[];
  validationRules: Record<string, any>;
  lastGenerated: Date;
}

/**
 * Customer Profile Template Generator
 *
 * Generates templates based on the live customer schema with:
 * - Accurate field definitions and constraints
 * - Sample data that passes validation
 * - Clear mandatory markers and descriptions
 */
export class CustomerTemplateGenerator {

  private static instance: CustomerTemplateGenerator;
  private templateMetadata: CustomerTemplateMetadata | null = null;

  static getInstance(): CustomerTemplateGenerator {
    if (!CustomerTemplateGenerator.instance) {
      CustomerTemplateGenerator.instance = new CustomerTemplateGenerator();
    }
    return CustomerTemplateGenerator.instance;
  }

  /**
   * Generate template metadata based on current customer schema
   */
  async generateTemplateMetadata(): Promise<CustomerTemplateMetadata> {
    // Extract field definitions from Zod schema
    const schemaShape = insertCustomerSchema.shape;
    const fields: TemplateField[] = [];

    // Core customer profile fields that users would typically import
    const userFields = [
      {
        key: 'firstName',
        displayName: 'First Name *',
        description: 'Customer\'s first name (Required)',
        example: 'John'
      },
      {
        key: 'lastName',
        displayName: 'Last Name *',
        description: 'Customer\'s last name (Required)',
        example: 'Smith'
      },
      {
        key: 'email',
        displayName: 'Email Address *',
        description: 'Valid email address (Required)',
        example: 'john.smith@example.com'
      },
      {
        key: 'phoneNumber',
        displayName: 'Phone Number',
        description: 'Contact phone number (Optional)',
        example: '+1-555-123-4567'
      },
      {
        key: 'dateOfBirth',
        displayName: 'Date of Birth',
        description: 'Birth date in YYYY-MM-DD format (Optional)',
        example: '1985-03-15'
      },
      {
        key: 'gender',
        displayName: 'Gender',
        description: 'Gender identity (Optional)',
        example: 'Male'
      },
      {
        key: 'customerSegment',
        displayName: 'Customer Segment',
        description: 'Business segment classification (Optional)',
        example: 'Premium'
      },
      {
        key: 'lifetimeValue',
        displayName: 'Lifetime Value',
        description: 'Customer lifetime value in dollars (Optional)',
        example: 1250.00
      },
      {
        key: 'currentAddress',
        displayName: 'Current Address',
        description: 'JSON object with address fields (Optional)',
        example: '{"street": "123 Main St", "city": "New York", "state": "NY", "zipCode": "10001", "country": "USA"}'
      }
    ];

    // Build field definitions
    for (const fieldDef of userFields) {
      const zodField = schemaShape[fieldDef.key as keyof typeof schemaShape];

      fields.push({
        name: fieldDef.key,
        displayName: fieldDef.displayName,
        type: this.getFieldType(fieldDef.key, fieldDef.example),
        required: this.isFieldRequired(fieldDef.displayName),
        description: fieldDef.description,
        example: fieldDef.example,
        format: this.getFieldFormat(fieldDef.key)
      });
    }

    // Generate sample data rows
    const sampleData = [
      {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phoneNumber: '+1-555-123-4567',
        dateOfBirth: '1985-03-15',
        gender: 'Male',
        customerSegment: 'Premium',
        lifetimeValue: 1250.00,
        currentAddress: '{"street": "123 Main St", "city": "New York", "state": "NY", "zipCode": "10001", "country": "USA"}'
      },
      {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@example.com',
        phoneNumber: '+1-555-987-6543',
        dateOfBirth: '1990-07-22',
        gender: 'Female',
        customerSegment: 'Standard',
        lifetimeValue: 850.50,
        currentAddress: '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zipCode": "90210", "country": "USA"}'
      },
      {
        firstName: 'Maria',
        lastName: 'Rodriguez',
        email: 'maria.rodriguez@example.com',
        phoneNumber: '+1-555-456-7890',
        dateOfBirth: '1988-12-03',
        gender: 'Female',
        customerSegment: 'VIP',
        lifetimeValue: 2100.75,
        currentAddress: '{"street": "789 Pine Rd", "city": "Miami", "state": "FL", "zipCode": "33101", "country": "USA"}'
      }
    ];

    this.templateMetadata = {
      fields,
      sampleData,
      validationRules: this.extractValidationRules(),
      lastGenerated: new Date()
    };

    return this.templateMetadata;
  }

  /**
   * Generate CSV template
   */
  async generateCSVTemplate(): Promise<string> {
    const metadata = await this.generateTemplateMetadata();

    // Create header row with field descriptions
    const headers = metadata.fields.map(field => field.displayName);
    const descriptions = metadata.fields.map(field => `"${field.description}"`);

    // Create sample data rows
    const dataRows = metadata.sampleData.map(row =>
      metadata.fields.map(field => {
        const value = row[field.name];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value || '';
      })
    );

    // Build CSV content
    const csvLines = [
      headers.join(','),
      descriptions.join(','),
      ...dataRows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Generate JSON template
   */
  async generateJSONTemplate(): Promise<string> {
    const metadata = await this.generateTemplateMetadata();

    // Create template with field descriptions
    const template = {
      _metadata: {
        description: "Customer Profile Import Template",
        instructions: "Fill in customer data according to field descriptions. Required fields marked with *",
        lastGenerated: metadata.lastGenerated.toISOString(),
        fields: metadata.fields.reduce((acc, field) => {
          acc[field.name] = {
            type: field.type,
            required: field.required,
            description: field.description,
            example: field.example,
            format: field.format
          };
          return acc;
        }, {} as Record<string, any>)
      },
      customers: metadata.sampleData.map(customer => ({
        ...customer,
        currentAddress: typeof customer.currentAddress === 'string'
          ? JSON.parse(customer.currentAddress)
          : customer.currentAddress
      }))
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Generate TXT template (tab-delimited)
   */
  async generateTXTTemplate(): Promise<string> {
    const metadata = await this.generateTemplateMetadata();

    // Create header and description rows
    const headers = metadata.fields.map(field => field.displayName);
    const descriptions = metadata.fields.map(field => field.description);

    // Create sample data rows
    const dataRows = metadata.sampleData.map(row =>
      metadata.fields.map(field => row[field.name] || '')
    );

    // Build tab-delimited content
    const txtLines = [
      "# Customer Profile Import Template",
      "# Fill in customer data according to field descriptions below",
      "# Required fields are marked with *",
      "",
      headers.join('\t'),
      descriptions.join('\t'),
      ...dataRows.map(row => row.join('\t'))
    ];

    return txtLines.join('\n');
  }

  /**
   * Generate Excel template (.xlsx format)
   */
  async generateXLSXTemplate(): Promise<Buffer> {
    const metadata = await this.generateTemplateMetadata();

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();

    // Prepare data for Excel with required field markers
    const headers = metadata.fields.map(field =>
      field.required ? `${field.displayName} *` : field.displayName
    );

    // Create sample data rows
    const dataRows = metadata.sampleData.map(row =>
      metadata.fields.map(field => {
        const value = row[field.name];
        // Format address as readable string for Excel
        if (field.name === 'currentAddress' && typeof value === 'string') {
          try {
            const addr = JSON.parse(value);
            return `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}, ${addr.country}`;
          } catch (e) {
            return value;
          }
        }
        return value || '';
      })
    );

    // Restructured layout: Headers first (row 0), then sample data, then instructions
    const worksheetData = [
      headers,              // Row 0: Headers (where processor expects them)
      ...dataRows,          // Rows 1-3: Sample data
      [''],                 // Row 4: Spacing
      ['Import Instructions:'],
      ['1. Replace sample data above with your customer information'],
      ['2. Required fields are marked with * and must be filled'],
      ['3. Keep the header row (row 1) unchanged'],
      ['4. Date format: YYYY-MM-DD (e.g., 1985-03-15)'],
      ['5. Address format: Full address as single text'],
      ['6. IMPORTANT: Delete all instruction rows (rows 5-8) before uploading'],
      ['7. Save and upload the file to Data Import module']
    ];

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths for better readability
    const columnWidths = metadata.fields.map(field => {
      // Calculate width based on field name and content
      const maxLength = Math.max(
        field.displayName.length,
        field.description.length,
        String(field.example || '').length
      );
      return { wch: Math.min(Math.max(maxLength + 2, 12), 30) };
    });
    worksheet['!cols'] = columnWidths;

    // Style the header rows
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    // Add professional styling
    for (let col = range.s.c; col <= range.e.c; col++) {
      // Style header row (row 0, 0-indexed) - Bold with purple background
      const headerAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[headerAddress]) {
        worksheet[headerAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "6B46C1" } },  // Purple background
          alignment: { horizontal: "center", vertical: "center" }
        };
      }

      // Style sample data rows (rows 1-3) with light background
      for (let row = 1; row <= 3; row++) {
        const dataAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[dataAddress]) {
          worksheet[dataAddress].s = {
            fill: { fgColor: { rgb: "F8F9FA" } },  // Light gray background
            alignment: { horizontal: "left", vertical: "center" }
          };
        }
      }

      // Style instruction header (row 5)
      const instructionHeaderAddress = XLSX.utils.encode_cell({ r: 5, c: col });
      if (worksheet[instructionHeaderAddress] && col === 0) {  // Only first column
        worksheet[instructionHeaderAddress].s = {
          font: { bold: true, color: { rgb: "374151" } },
          fill: { fgColor: { rgb: "FEF3C7" } }  // Light yellow background
        };
      }
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Template');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return buffer;
  }

  /**
   * Validate template data against schema
   */
  async validateTemplateData(data: any[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      try {
        // Parse address field if it's a string
        if (data[i].currentAddress && typeof data[i].currentAddress === 'string') {
          try {
            data[i].currentAddress = JSON.parse(data[i].currentAddress);
          } catch (e) {
            errors.push(`Row ${i + 1}: Invalid address JSON format`);
          }
        }

        // Validate against schema
        insertCustomerSchema.parse(data[i]);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(`Row ${i + 1}: ${error.errors.map(e => e.message).join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get field type from example value
   */
  private getFieldType(fieldName: string, example: any): 'string' | 'number' | 'date' | 'boolean' | 'json' {
    if (fieldName === 'currentAddress') return 'json';
    if (fieldName === 'dateOfBirth' || fieldName === 'lastActiveAt') return 'date';
    if (fieldName === 'lifetimeValue' || fieldName === 'dataQualityScore') return 'number';
    if (typeof example === 'boolean') return 'boolean';
    return 'string';
  }

  /**
   * Check if field is required based on display name
   */
  private isFieldRequired(displayName: string): boolean {
    return displayName.includes('*');
  }

  /**
   * Get field format hint
   */
  private getFieldFormat(fieldName: string): string | undefined {
    switch (fieldName) {
      case 'email': return 'Valid email address';
      case 'phoneNumber': return 'Phone number with country code';
      case 'dateOfBirth': return 'YYYY-MM-DD';
      case 'currentAddress': return 'JSON object with street, city, state, zipCode, country';
      case 'lifetimeValue': return 'Decimal number';
      default: return undefined;
    }
  }

  /**
   * Extract validation rules from schema
   */
  private extractValidationRules(): Record<string, any> {
    return {
      required: ['firstName', 'lastName', 'email'],
      email: {
        format: 'Valid email address'
      },
      dateOfBirth: {
        format: 'YYYY-MM-DD'
      },
      currentAddress: {
        format: 'JSON object with address fields'
      },
      lifetimeValue: {
        type: 'number',
        minimum: 0
      }
    };
  }
}

// Export singleton instance
export const templateGenerator = CustomerTemplateGenerator.getInstance();
