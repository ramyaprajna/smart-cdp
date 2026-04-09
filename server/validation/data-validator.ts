/**
 * Data Validation Utilities
 * Centralized validation logic for data quality checks
 */

export interface ValidationResult {
  hasErrors: boolean;
  warnings: string[];
  suggestions: string[];
}

export interface ValidationOptions {
  checkEmptyValues?: boolean;
  checkEmailFormats?: boolean;
  checkPhoneFormats?: boolean;
  checkRequiredFields?: boolean;
  emptyValueThreshold?: number; // Percentage threshold for empty values warning
}

export class DataValidator {
  private options: Required<ValidationOptions>;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      checkEmptyValues: true,
      checkEmailFormats: true,
      checkPhoneFormats: true,
      checkRequiredFields: true,
      emptyValueThreshold: 30,
      ...options
    };
  }

  /**
   * Validate preview data and provide suggestions
   */
  validateData(rows: any[], headers: string[]): ValidationResult {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let hasErrors = false;

    // Check for empty data
    if (rows.length === 0) {
      hasErrors = true;
      warnings.push('No data rows found in file');
      return { hasErrors, warnings, suggestions };
    }

    // Perform various validation checks
    this.checkRequiredFields(headers, warnings, suggestions);
    this.checkDataQuality(rows, headers, warnings, suggestions);
    this.checkEmptyColumns(rows, headers, warnings, suggestions);
    this.checkDataFormats(rows, headers, warnings, suggestions);
    this.checkValueLengths(rows, headers, warnings, suggestions);
    this.generateSuggestions(headers, suggestions);

    return { hasErrors, warnings, suggestions };
  }

  private checkRequiredFields(headers: string[], warnings: string[], suggestions: string[]): void {
    if (!this.options.checkRequiredFields) return;

    const emailColumns = this.findColumnsByPattern(headers, /email/i);
    const phoneColumns = this.findColumnsByPattern(headers, /phone/i);

    if (emailColumns.length === 0 && phoneColumns.length === 0) {
      warnings.push("No email or phone columns detected - customer identification may be difficult");
      suggestions.push("Add email or phone columns for better customer identification");
    }
  }

  private checkDataQuality(rows: any[], headers: string[], warnings: string[], suggestions: string[]): void {
    if (!this.options.checkEmptyValues) return;

    const sampleRows = rows.slice(0, Math.min(5, rows.length));
    let emptyValueCount = 0;
    let totalValues = 0;

    sampleRows.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (key.startsWith('_')) return; // Skip internal fields
        totalValues++;
        if (!value || value === '') emptyValueCount++;
      });
    });

    const emptyPercentage = (emptyValueCount / totalValues) * 100;
    if (emptyPercentage > this.options.emptyValueThreshold) {
      warnings.push(`${emptyPercentage.toFixed(1)}% of values are empty - data quality may be poor`);
      suggestions.push("Review data completeness before importing");
    }
  }

  private checkDataFormats(rows: any[], headers: string[], warnings: string[], suggestions: string[]): void {
    const emailColumns = this.findColumnsByPattern(headers, /email/i);
    const phoneColumns = this.findColumnsByPattern(headers, /phone/i);

    const sampleRows = rows.slice(0, Math.min(5, rows.length));
    let invalidEmailCount = 0;
    let invalidPhoneCount = 0;

    sampleRows.forEach(row => {
      // Check email format
      if (this.options.checkEmailFormats) {
        emailColumns.forEach(col => {
          const email = row[col];
          if (email && !this.isValidEmail(email)) {
            invalidEmailCount++;
          }
        });
      }

      // Check phone format
      if (this.options.checkPhoneFormats) {
        phoneColumns.forEach(col => {
          const phone = row[col];
          if (phone && !this.isValidPhone(phone)) {
            invalidPhoneCount++;
          }
        });
      }
    });

    if (invalidEmailCount > 0) {
      warnings.push(`${invalidEmailCount} invalid email formats detected in sample data`);
      suggestions.push("Clean email data before importing");
    }

    if (invalidPhoneCount > 0) {
      warnings.push(`${invalidPhoneCount} invalid phone formats detected in sample data`);
      suggestions.push("Standardize phone number format");
    }
  }

  private checkEmptyColumns(rows: any[], headers: string[], warnings: string[], suggestions: string[]): void {
    const emptyColumns = headers.filter(header => {
      return rows.every(row => !row[header] || String(row[header]).trim() === '');
    });

    if (emptyColumns.length > 0) {
      warnings.push(`Empty columns detected: ${emptyColumns.join(', ')}`);
      suggestions.push('Consider removing empty columns before import');
    }
  }

  private checkValueLengths(rows: any[], headers: string[], warnings: string[], suggestions: string[]): void {
    const longTextWarnings = headers.filter(header => {
      return rows.some(row => String(row[header] || '').length > 1000);
    });

    if (longTextWarnings.length > 0) {
      warnings.push(`Very long text values found in: ${longTextWarnings.join(', ')}`);
      suggestions.push('Long text values may impact performance');
    }
  }

  private generateSuggestions(headers: string[], suggestions: string[]): void {
    const emailColumns = this.findColumnsByPattern(headers, /email/i);
    const nameColumns = this.findColumnsByPattern(headers, /name/i);

    if (emailColumns.length > 1) {
      suggestions.push('Multiple email columns detected. Consider mapping to a single email field.');
    }

    if (nameColumns.length === 0) {
      suggestions.push("Add customer name columns for better identification");
    }
  }

  private findColumnsByPattern(headers: string[], pattern: RegExp): string[] {
    return headers.filter(header => pattern.test(header));
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Basic phone validation - should contain digits and may have +, -, spaces, parentheses
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{8,}$/;
    return phoneRegex.test(phone);
  }
}
