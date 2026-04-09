/**
 * Address Import Service - Handles address parsing during data import
 *
 * INTEGRATION POINT: Processes addresses during CSV import to prevent malformed data storage
 * STRATEGIES: Single-field detection and multi-column parsing for international data
 * EVIDENCE-BASED: Provides detailed import statistics and parsing success metrics
 *
 * Created: August 13, 2025
 */
import { AddressParser, StructuredAddress, parseAddress, parseMultiColumnAddress } from '@shared/address-parser';

export interface AddressImportResult {
  structuredAddress: StructuredAddress | null;
  parseSuccess: boolean;
  parseMethod: 'single-field' | 'multi-column' | 'failed';
  originalData: any;
  warnings: string[];
}

export class AddressImportService {
  private readonly parser = new AddressParser();

  /**
   * Process address data from import row
   */
  processAddressFromRow(row: Record<string, any>): AddressImportResult {
    const warnings: string[] = [];
    let structuredAddress: StructuredAddress | null = null;
    let parseMethod: 'single-field' | 'multi-column' | 'failed' = 'failed';
    let originalData: any = null;

    // Strategy 1: Look for direct currentAddress/address field
    const directAddressFields = ['currentAddress', 'current_address', 'address', 'alamat', 'direccion'];
    const directField = directAddressFields.find(field =>
      row[field] && String(row[field]).trim()
    );

    if (directField && row[directField]) {
      originalData = row[directField];
      structuredAddress = this.parser.parseAddress(row[directField], {
        preserveOriginal: true,
        defaultCountry: 'United States'
      });

      if (structuredAddress) {
        parseMethod = 'single-field';
      } else {
        warnings.push(`Failed to parse address from field: ${directField}`);
      }
    }

    // Strategy 2: Look for multiple address columns if single field failed
    if (!structuredAddress) {
      const multiColumnAddress = this.parser.parseMultiColumnAddress(row, {
        preserveOriginal: true,
        defaultCountry: 'United States'
      });

      if (multiColumnAddress) {
        structuredAddress = multiColumnAddress;
        parseMethod = 'multi-column';
        originalData = this.extractAddressFieldsFromRow(row);
      }
    }

    // Validation and warnings
    if (structuredAddress) {
      if (!structuredAddress.street1 && !structuredAddress.city) {
        warnings.push('Address lacks essential components (street or city)');
      }

      if (!structuredAddress.country) {
        warnings.push('No country specified, defaulted to United States');
      }

      // Clean up empty fields
      structuredAddress = this.cleanEmptyFields(structuredAddress);
    }

    return {
      structuredAddress,
      parseSuccess: !!structuredAddress,
      parseMethod,
      originalData,
      warnings
    };
  }

  /**
   * Convert row data into appropriate format for database storage
   */
  prepareAddressForDatabase(importResult: AddressImportResult): any {
    if (!importResult.structuredAddress) {
      // Store original data if parsing failed
      return importResult.originalData || null;
    }

    // Return the structured address as JSON for JSONB storage
    return importResult.structuredAddress;
  }

  /**
   * Extract all address-related fields from import row
   */
  private extractAddressFieldsFromRow(row: Record<string, any>): Record<string, any> {
    const addressFields: Record<string, any> = {};
    const addressKeywords = [
      'address', 'street', 'city', 'state', 'zip', 'postal', 'country',
      'alamat', 'jalan', 'kota', 'provinsi', 'kodepos', 'negara',
      'direccion', 'calle', 'ciudad', 'estado', 'codigo', 'pais',
      'apt', 'suite', 'unit', 'floor', 'building'
    ];

    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (addressKeywords.some(keyword => normalizedKey.includes(keyword))) {
        addressFields[key] = value;
      }
    });

    return addressFields;
  }

  /**
   * Remove empty/null fields from structured address
   */
  private cleanEmptyFields(address: StructuredAddress): StructuredAddress {
    const cleaned: StructuredAddress = {};

    Object.entries(address).forEach(([key, value]) => {
      if (key === 'extraFields' && value && typeof value === 'object') {
        const cleanedExtras: Record<string, any> = {};
        Object.entries(value).forEach(([k, v]) => {
          if (v && String(v).trim()) {
            cleanedExtras[k] = v;
          }
        });
        if (Object.keys(cleanedExtras).length > 0) {
          cleaned.extraFields = cleanedExtras;
        }
      } else if (value && String(value).trim()) {
        (cleaned as any)[key] = value;
      }
    });

    return cleaned;
  }

  /**
   * Generate import summary for addresses
   */
  generateImportSummary(results: AddressImportResult[]): {
    totalProcessed: number;
    successfulParsing: number;
    singleFieldParsing: number;
    multiColumnParsing: number;
    failedParsing: number;
    commonWarnings: string[];
  } {
    const successful = results.filter(r => r.parseSuccess);
    const singleField = results.filter(r => r.parseMethod === 'single-field');
    const multiColumn = results.filter(r => r.parseMethod === 'multi-column');
    const failed = results.filter(r => r.parseMethod === 'failed');

    // Collect and count warnings
    const warningCounts: Record<string, number> = {};
    results.forEach(result => {
      result.warnings.forEach(warning => {
        warningCounts[warning] = (warningCounts[warning] || 0) + 1;
      });
    });

    const commonWarnings = Object.entries(warningCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([warning, count]) => `${warning} (${count} occurrences)`);

    return {
      totalProcessed: results.length,
      successfulParsing: successful.length,
      singleFieldParsing: singleField.length,
      multiColumnParsing: multiColumn.length,
      failedParsing: failed.length,
      commonWarnings
    };
  }
}

// Singleton instance for easy use
export const addressImportService = new AddressImportService();
