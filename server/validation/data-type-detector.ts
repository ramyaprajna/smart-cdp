/**
 * Data Type Detection Utilities
 * Analyzes data to determine column types automatically
 */

export interface DataTypeInfo {
  type: 'email' | 'phone' | 'number' | 'date' | 'text' | 'boolean';
  confidence: number; // 0-1 scale
  samples: string[];
}

export class DataTypeDetector {
  private sampleSize: number;

  constructor(sampleSize: number = 10) {
    this.sampleSize = sampleSize;
  }

  /**
   * Detect data types for all columns
   */
  detectTypes(rows: any[]): Record<string, string> {
    const dataTypes: Record<string, string> = {};

    if (rows.length === 0) return dataTypes;

    // Get all unique column keys
    const columns = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!key.startsWith('_')) columns.add(key);
      });
    });

    // Analyze each column
    columns.forEach(column => {
      const typeInfo = this.analyzeColumn(column, rows);
      dataTypes[column] = typeInfo.type;
    });

    return dataTypes;
  }

  private analyzeColumn(columnName: string, rows: any[]): DataTypeInfo {
    // Extract non-empty values for analysis
    const values = rows
      .map(row => row[columnName])
      .filter(val => val !== null && val !== undefined && val !== '')
      .map(val => String(val).trim())
      .filter(val => val.length > 0)
      .slice(0, this.sampleSize);

    if (values.length === 0) {
      return { type: 'text', confidence: 0, samples: [] };
    }

    // Test each data type
    const typeTests = [
      { type: 'email' as const, test: this.isEmailType.bind(this) },
      { type: 'phone' as const, test: this.isPhoneType.bind(this) },
      { type: 'boolean' as const, test: this.isBooleanType.bind(this) },
      { type: 'number' as const, test: this.isNumberType.bind(this) },
      { type: 'date' as const, test: this.isDateType.bind(this) }
    ];

    // Find the best matching type
    let bestMatch: DataTypeInfo = { type: 'text', confidence: 0, samples: values.slice(0, 3) };

    for (const { type, test } of typeTests) {
      const confidence = test(values);
      if (confidence > bestMatch.confidence) {
        bestMatch = { type, confidence, samples: values.slice(0, 3) };
      }
    }

    return bestMatch;
  }

  private isEmailType(values: string[]): number {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const matches = values.filter(val => emailRegex.test(val)).length;
    return matches / values.length;
  }

  private isPhoneType(values: string[]): number {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{8,}$/;
    const matches = values.filter(val => phoneRegex.test(val)).length;
    return matches / values.length;
  }

  private isNumberType(values: string[]): number {
    const matches = values.filter(val => {
      const num = parseFloat(val.replace(/[,$]/g, ''));
      return !isNaN(num) && isFinite(num);
    }).length;
    return matches / values.length;
  }

  private isDateType(values: string[]): number {
    const matches = values.filter(val => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && date.getFullYear() > 1900;
    }).length;
    return matches / values.length;
  }

  private isBooleanType(values: string[]): number {
    const booleanValues = ['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'];
    const matches = values.filter(val =>
      booleanValues.includes(val.toLowerCase())
    ).length;
    return matches / values.length;
  }
}
