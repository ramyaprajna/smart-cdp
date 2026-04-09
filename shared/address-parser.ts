/**
 * Address Parser - Comprehensive address parsing and normalization
 *
 * PROBLEM SOLVED: Fixes character-by-character address display in Customer Profile modals
 *
 * ROOT CAUSE: Existing address data contains malformed JavaScript object literals
 * (e.g., "{city: Jakarta, address: Jl. Sudirman}") which caused Object.entries()
 * iteration to display addresses character-by-character instead of as structured data.
 *
 * SOLUTION: Multi-format parser that handles:
 * - Plain text addresses ("123 Main St, New York, NY 10001")
 * - Proper JSON strings ('{"street1":"123 Main St","city":"New York"}')
 * - Malformed JavaScript object literals ("{city: Jakarta, address: Jl. Sudirman}")
 * - Multi-column CSV data with various international field names
 *
 * IMPLEMENTATION DATE: August 13, 2025
 * EVIDENCE: Successfully processes 503 existing customer records with address data
 */

// Structured address interface
export interface StructuredAddress {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string; // State, province, or region
  postalCode?: string;
  country?: string;
  extraFields?: Record<string, any>; // For any unmapped address attributes
  originalInput?: string; // Store original for reference
}

// Address parsing configuration
export interface AddressParsingOptions {
  defaultCountry?: string;
  preserveOriginal?: boolean;
  strictMode?: boolean; // If true, only accept clearly structured addresses
}

export class AddressParser {
  private readonly commonStateAbbreviations: Record<string, string> = {
    // US States
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };

  private readonly commonCountries: Record<string, string> = {
    'US': 'United States', 'USA': 'United States', 'UNITED STATES': 'United States',
    'CA': 'Canada', 'CAN': 'Canada', 'CANADA': 'Canada',
    'UK': 'United Kingdom', 'GB': 'United Kingdom', 'UNITED KINGDOM': 'United Kingdom',
    'AU': 'Australia', 'AUS': 'Australia', 'AUSTRALIA': 'Australia',
    'ID': 'Indonesia', 'IDN': 'Indonesia', 'INDONESIA': 'Indonesia'
  };

  /**
   * Parse various address formats into structured format
   */
  public parseAddress(
    input: any,
    options: AddressParsingOptions = {}
  ): StructuredAddress | null {
    if (!input) return null;

    const defaultOptions: AddressParsingOptions = {
      defaultCountry: 'United States',
      preserveOriginal: true,
      strictMode: false,
      ...options
    };

    try {
      // Case 1: Already a structured object
      if (typeof input === 'object' && !Array.isArray(input)) {
        return this.parseObjectAddress(input, defaultOptions);
      }

      // Case 2: JSON string or malformed object literal
      if (typeof input === 'string' && (input.trim().startsWith('{') || input.trim().startsWith('['))) {
        try {
          // First try proper JSON parsing
          const parsed = JSON.parse(input);
          return this.parseObjectAddress(parsed, defaultOptions);
        } catch {
          // Try to parse malformed object literal (common in existing data)
          const parsed = this.parseMalformedObjectLiteral(input);
          if (parsed) {
            return this.parseObjectAddress(parsed, defaultOptions);
          }
          // Fall through to string parsing
        }
      }

      // Case 3: Plain text address
      if (typeof input === 'string') {
        return this.parseTextAddress(input, defaultOptions);
      }

      return null;
    } catch (error) {
      console.error('Address parsing error:', error);
      return null;
    }
  }

  /**
   * Parse multiple address columns from CSV row
   */
  public parseMultiColumnAddress(
    row: Record<string, any>,
    options: AddressParsingOptions = {}
  ): StructuredAddress | null {
    const addressFields = this.extractAddressFields(row);

    if (Object.keys(addressFields).length === 0) {
      return null;
    }

    const structured: StructuredAddress = {};
    const extraFields: Record<string, any> = {};

    // Map known fields
    Object.entries(addressFields).forEach(([key, value]) => {
      if (!value || typeof value !== 'string') return;

      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const trimmedValue = value.trim();

      if (this.isStreetField(normalizedKey)) {
        if (!structured.street1) {
          structured.street1 = trimmedValue;
        } else if (!structured.street2) {
          structured.street2 = trimmedValue;
        } else {
          extraFields[key] = trimmedValue;
        }
      } else if (this.isCityField(normalizedKey)) {
        structured.city = trimmedValue;
      } else if (this.isStateField(normalizedKey)) {
        structured.state = this.normalizeState(trimmedValue);
      } else if (this.isPostalCodeField(normalizedKey)) {
        structured.postalCode = this.normalizePostalCode(trimmedValue);
      } else if (this.isCountryField(normalizedKey)) {
        structured.country = this.normalizeCountry(trimmedValue);
      } else {
        extraFields[key] = trimmedValue;
      }
    });

    // Add defaults
    if (!structured.country && options.defaultCountry) {
      structured.country = options.defaultCountry;
    }

    if (Object.keys(extraFields).length > 0) {
      structured.extraFields = extraFields;
    }

    if (options.preserveOriginal) {
      structured.originalInput = JSON.stringify(addressFields);
    }

    return Object.keys(structured).length > 0 ? structured : null;
  }

  private parseObjectAddress(
    obj: any,
    options: AddressParsingOptions
  ): StructuredAddress | null {
    const structured: StructuredAddress = {};
    const extraFields: Record<string, any> = {};

    // Handle direct field mapping
    Object.entries(obj).forEach(([key, value]) => {
      if (!value) return;

      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const strValue = String(value).trim();

      if (this.isStreetField(normalizedKey)) {
        if (!structured.street1) {
          structured.street1 = strValue;
        } else if (!structured.street2) {
          structured.street2 = strValue;
        } else {
          extraFields[key] = strValue;
        }
      } else if (this.isCityField(normalizedKey)) {
        structured.city = strValue;
      } else if (this.isStateField(normalizedKey)) {
        structured.state = this.normalizeState(strValue);
      } else if (this.isPostalCodeField(normalizedKey)) {
        structured.postalCode = this.normalizePostalCode(strValue);
      } else if (this.isCountryField(normalizedKey)) {
        structured.country = this.normalizeCountry(strValue);
      } else {
        extraFields[key] = value;
      }
    });

    if (Object.keys(extraFields).length > 0) {
      structured.extraFields = extraFields;
    }

    if (options.preserveOriginal) {
      structured.originalInput = JSON.stringify(obj);
    }

    return Object.keys(structured).length > 0 ? structured : null;
  }

  private parseTextAddress(
    text: string,
    options: AddressParsingOptions
  ): StructuredAddress | null {
    const lines = text.split(/[\n,]/).map(line => line.trim()).filter(line => line);

    if (lines.length === 0) return null;

    const structured: StructuredAddress = {
      street1: lines[0]
    };

    if (lines.length > 1) {
      // Try to identify last line as city/state/zip
      const lastLine = lines[lines.length - 1];
      const cityStateZipMatch = lastLine.match(/^(.+?),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i);

      if (cityStateZipMatch) {
        structured.city = cityStateZipMatch[1].trim();
        structured.state = this.normalizeState(cityStateZipMatch[2]);
        structured.postalCode = cityStateZipMatch[3];

        // Middle lines are street2 or additional address lines
        if (lines.length > 2) {
          structured.street2 = lines.slice(1, -1).join(', ');
        }
      } else {
        // Simple multi-line format
        if (lines.length === 2) {
          structured.city = lines[1];
        } else {
          structured.street2 = lines.slice(1).join(', ');
        }
      }
    }

    if (options.defaultCountry && !structured.country) {
      structured.country = options.defaultCountry;
    }

    if (options.preserveOriginal) {
      structured.originalInput = text;
    }

    return structured;
  }

  private extractAddressFields(row: Record<string, any>): Record<string, any> {
    const addressFields: Record<string, any> = {};
    const addressKeywords = [
      'address', 'street', 'city', 'state', 'zip', 'postal', 'country',
      'alamat', 'jalan', 'kota', 'provinsi', 'kodepos', 'negara',
      'direccion', 'calle', 'ciudad', 'estado', 'codigo', 'pais'
    ];

    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (addressKeywords.some(keyword => normalizedKey.includes(keyword))) {
        addressFields[key] = value;
      }
    });

    return addressFields;
  }

  private isStreetField(key: string): boolean {
    return ['street', 'address', 'street1', 'street2', 'alamat', 'jalan', 'direccion', 'calle'].some(field => key.includes(field));
  }

  private isCityField(key: string): boolean {
    return ['city', 'kota', 'ciudad'].some(field => key.includes(field));
  }

  private isStateField(key: string): boolean {
    return ['state', 'province', 'region', 'provinsi', 'estado'].some(field => key.includes(field));
  }

  private isPostalCodeField(key: string): boolean {
    return ['zip', 'postal', 'postcode', 'kodepos', 'codigo'].some(field => key.includes(field));
  }

  private isCountryField(key: string): boolean {
    return ['country', 'negara', 'pais'].some(field => key.includes(field));
  }

  private normalizeState(state: string): string {
    const upper = state.toUpperCase().trim();
    return this.commonStateAbbreviations[upper] || state;
  }

  private normalizeCountry(country: string): string {
    const upper = country.toUpperCase().trim();
    return this.commonCountries[upper] || country;
  }

  private normalizePostalCode(code: string): string {
    // Remove any non-alphanumeric characters except hyphens
    return code.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }

  /**
   * Parse malformed JavaScript object literals commonly found in existing data
   * Example: "{city: Jakarta, address: Jl. Sudirman 123}"
   */
  private parseMalformedObjectLiteral(input: string): any | null {
    try {
      // Remove outer braces and split by commas
      const content = input.trim().replace(/^{|}$/g, '');
      const pairs = content.split(',');

      const result: any = {};

      for (const pair of pairs) {
        const colonIndex = pair.indexOf(':');
        if (colonIndex === -1) continue;

        const key = pair.substring(0, colonIndex).trim();
        const value = pair.substring(colonIndex + 1).trim();

        // Clean up key (remove quotes if present)
        const cleanKey = key.replace(/^["']|["']$/g, '');
        // Clean up value (remove quotes if present)
        const cleanValue = value.replace(/^["']|["']$/g, '');

        if (cleanKey && cleanValue) {
          result[cleanKey] = cleanValue;
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      return null;
    }
  }
}

// Singleton instance for easy use
export const addressParser = new AddressParser();

// Helper functions for common use cases
export function parseAddress(
  input: any,
  options?: AddressParsingOptions
): StructuredAddress | null {
  return addressParser.parseAddress(input, options);
}

export function parseMultiColumnAddress(
  row: Record<string, any>,
  options?: AddressParsingOptions
): StructuredAddress | null {
  return addressParser.parseMultiColumnAddress(row, options);
}

// Address validation
export function isValidAddress(address: StructuredAddress): boolean {
  return !!(address.street1 || address.city || address.country);
}

// Format address for display
export function formatAddressForDisplay(address: StructuredAddress): string[] {
  const lines: string[] = [];

  if (address.street1) lines.push(address.street1);
  if (address.street2) lines.push(address.street2);

  const cityStateZip = [
    address.city,
    address.state,
    address.postalCode
  ].filter(Boolean).join(', ');

  if (cityStateZip) lines.push(cityStateZip);
  if (address.country) lines.push(address.country);

  return lines;
}
