/**
 * Sample Extractor Service — Lite CDP v2
 *
 * Purpose: Extract representative sample data from uploaded CSV/Excel files
 * for downstream AI analysis (StreamAnalyzerService).
 *
 * Key Features:
 * - Built-in CSV parser that handles quoted fields (no external csv library needed)
 * - Excel support via the `xlsx` package
 * - Field statistics: null rate, unique rate, data type inference, min/max length
 * - Pre-AI heuristic hints to warm the AI prompt with obvious field types
 *
 * Design Decisions:
 * - maxSampleRows = 100 keeps memory usage bounded while giving AI enough signal
 * - Heuristic hints use lowercase field name matching — case-insensitive by design
 * - Date inference is intentionally conservative (only ISO-8601 and common formats)
 *
 * Dependencies:
 * - `xlsx` package (already in package.json ≥ 0.18.5)
 * - Node.js built-in `fs` and `path`
 *
 * @module SampleExtractor
 * @created 2025 — Lite CDP v2 Sprint 2.1
 */

import * as fs from 'fs';
import * as path from 'path';

// xlsx is listed in package.json (^0.18.5). Install with: npm install xlsx
import * as XLSX from 'xlsx';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface FieldStats {
  nullRate: number;
  uniqueRate: number;
  dataTypeSample: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  sampleValues: unknown[];
  minLength?: number;  // Only present for string fields
  maxLength?: number;  // Only present for string fields
}

export interface SampleData {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRowCount: number;
  fieldStats: Record<string, FieldStats>;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Values considered null/empty for statistics purposes. */
const NULL_SENTINELS = new Set(['', 'null', 'NULL', 'n/a', 'N/A', 'na', 'NA', '-', 'undefined']);

/**
 * Determine whether a raw value from a row should be treated as null.
 */
function isNullLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return NULL_SENTINELS.has(value.trim());
  return false;
}

/**
 * Very conservative date detection.
 * Matches ISO-8601, dd/mm/yyyy, mm/dd/yyyy, dd-mm-yyyy, yyyy.mm.dd, etc.
 */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/,         // ISO-8601
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,                   // dd/mm/yyyy or mm/dd/yyyy
  /^\d{4}[\/\.]\d{2}[\/\.]\d{2}$/,                           // yyyy/mm/dd or yyyy.mm.dd
];

function looksLikeDate(value: string): boolean {
  return DATE_PATTERNS.some((re) => re.test(value.trim()));
}

// ─── Minimal CSV Parser ───────────────────────────────────────────────────────

/**
 * Parse a single CSV line respecting RFC 4180 quoted fields.
 * Handles: "field with, comma", "field with ""escaped"" quotes", plain fields.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: "" is an escaped quote, otherwise it closes the field
        if (i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      fields.push(field);
      field = '';
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  fields.push(field);
  return fields;
}

/**
 * Parse CSV text into an array of rows.
 * Returns: [headers, ...dataRows]
 */
function parseCSVText(text: string): string[][] {
  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  return nonEmpty.map(parseCSVLine);
}

// ─── Main Class ───────────────────────────────────────────────────────────────

export class SampleExtractor {
  private maxSampleRows = 100;

  // ── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Extract sample data from a CSV file.
   *
   * Uses a built-in line-by-line parser that handles quoted fields; no external
   * CSV library is required.
   *
   * @param filePath  Absolute path to the CSV file on disk
   */
  async extractFromCSV(filePath: string): Promise<SampleData> {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`CSV file not found: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const rows = parseCSVText(content);

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = rows[0].map((h) => h.trim());
    const dataRows = rows.slice(1); // All rows after header
    const totalRowCount = dataRows.length;

    // Build sample: up to maxSampleRows
    const sampleRawRows = dataRows.slice(0, this.maxSampleRows);
    const sampleRows: Record<string, unknown>[] = sampleRawRows.map((cols) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = cols[idx] !== undefined ? cols[idx] : null;
      });
      return record;
    });

    const fieldStats = this.computeFieldStats(headers, sampleRows);

    return { headers, sampleRows, totalRowCount, fieldStats };
  }

  /**
   * Extract sample data from an Excel (.xlsx / .xls) file.
   *
   * Relies on the `xlsx` package (already in package.json ^0.18.5).
   * If the package is missing, this method will throw a clear error.
   *
   * @param filePath   Absolute path to the Excel file on disk
   * @param sheetName  Optional sheet name; defaults to the first sheet
   */
  async extractFromExcel(filePath: string, sheetName?: string): Promise<SampleData> {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Excel file not found: ${resolvedPath}`);
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(resolvedPath);
    } catch (err) {
      throw new Error(
        `Failed to parse Excel file (ensure xlsx package ≥ 0.18.5 is installed): ${(err as Error).message}`
      );
    }

    const targetSheet =
      sheetName && workbook.SheetNames.includes(sheetName)
        ? sheetName
        : workbook.SheetNames[0];

    if (!targetSheet) {
      throw new Error('Excel file contains no sheets');
    }

    const worksheet = workbook.Sheets[targetSheet];

    // Convert to array-of-arrays (header: 1 = first row is used as-is)
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    }) as unknown[][];

    if (rawRows.length === 0) {
      throw new Error(`Sheet "${targetSheet}" is empty`);
    }

    const headers = (rawRows[0] as unknown[]).map((h) => (h !== null ? String(h).trim() : ''));
    const dataRows = rawRows.slice(1);
    const totalRowCount = dataRows.length;

    const sampleRawRows = dataRows.slice(0, this.maxSampleRows);
    const sampleRows: Record<string, unknown>[] = sampleRawRows.map((cols) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = (cols as unknown[])[idx] !== undefined ? (cols as unknown[])[idx] : null;
      });
      return record;
    });

    const fieldStats = this.computeFieldStats(headers, sampleRows);

    return { headers, sampleRows, totalRowCount, fieldStats };
  }

  /**
   * Generate pre-AI heuristic hints based on field names and statistics.
   *
   * These hints are passed to the AI to reduce hallucination and anchor the
   * AI's understanding before it reads the sample data.
   */
  computeHeuristicHints(
    headers: string[],
    stats: Record<string, FieldStats>
  ): Array<{ field: string; hint: string; confidence: number }> {
    const hints: Array<{ field: string; hint: string; confidence: number }> = [];

    for (const field of headers) {
      const lower = field.toLowerCase();
      const fieldStat = stats[field];

      // ── Email identifier ─────────────────────────────────────────────────
      if (lower.includes('email') || lower.includes('mail')) {
        hints.push({ field, hint: 'likely_identifier_email', confidence: 0.92 });
        continue;
      }

      // ── Phone identifier ─────────────────────────────────────────────────
      if (
        lower.includes('phone') ||
        lower.includes('hp') ||
        lower.includes('tel') ||
        lower.includes('wa') ||
        lower.includes('whatsapp')
      ) {
        hints.push({ field, hint: 'likely_identifier_phone', confidence: 0.9 });
        continue;
      }

      // ── Unique ID identifier (name contains id/no/number + high uniqueness) ─
      if (
        fieldStat &&
        fieldStat.uniqueRate >= 0.9 &&
        (lower.includes('id') || lower === 'no' || lower.endsWith('_no') || lower.includes('number'))
      ) {
        hints.push({ field, hint: 'likely_identifier_id', confidence: 0.85 });
        continue;
      }

      // ── Date field ───────────────────────────────────────────────────────
      if (fieldStat && fieldStat.dataTypeSample === 'date') {
        hints.push({ field, hint: 'likely_date', confidence: 0.88 });
        continue;
      }

      // ── Numeric field ────────────────────────────────────────────────────
      if (fieldStat && fieldStat.dataTypeSample === 'number') {
        hints.push({ field, hint: 'likely_numeric', confidence: 0.85 });
        continue;
      }
    }

    return hints;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Compute per-field statistics from a sample of rows.
   *
   * Statistics computed:
   *   - nullRate:    fraction of rows where value is null-like
   *   - uniqueRate:  fraction of distinct non-null values vs total rows
   *   - dataTypeSample: inferred primary type of the field
   *   - sampleValues: up to 5 non-null representative values
   *   - minLength / maxLength: only for string-typed fields
   */
  private computeFieldStats(
    headers: string[],
    rows: Record<string, unknown>[]
  ): Record<string, FieldStats> {
    const stats: Record<string, FieldStats> = {};

    if (rows.length === 0) {
      // Return empty stats shell for each header
      headers.forEach((h) => {
        stats[h] = {
          nullRate: 1,
          uniqueRate: 0,
          dataTypeSample: 'string',
          sampleValues: [],
        };
      });
      return stats;
    }

    for (const header of headers) {
      const allValues = rows.map((row) => row[header]);
      const totalCount = allValues.length;

      // Null accounting
      const nullCount = allValues.filter(isNullLike).length;
      const nullRate = nullCount / totalCount;

      // Non-null values for further analysis
      const nonNullValues = allValues.filter((v) => !isNullLike(v));

      // Unique rate (unique non-null / total rows)
      const uniqueSet = new Set(nonNullValues.map((v) => String(v)));
      const uniqueRate = totalCount > 0 ? uniqueSet.size / totalCount : 0;

      // Data type inference
      const dataTypeSample = this.inferDataType(nonNullValues);

      // Sample values: first 5 distinct non-null values
      const sampleValues: unknown[] = [];
      const seen = new Set<string>();
      for (const v of nonNullValues) {
        const key = String(v);
        if (!seen.has(key)) {
          seen.add(key);
          sampleValues.push(v);
          if (sampleValues.length >= 5) break;
        }
      }

      // String length stats (only meaningful for string type)
      const fieldStat: FieldStats = { nullRate, uniqueRate, dataTypeSample, sampleValues };

      if (dataTypeSample === 'string') {
        const stringValues = nonNullValues.map((v) => String(v));
        if (stringValues.length > 0) {
          const lengths = stringValues.map((s) => s.length);
          fieldStat.minLength = Math.min(...lengths);
          fieldStat.maxLength = Math.max(...lengths);
        }
      }

      stats[header] = fieldStat;
    }

    return stats;
  }

  /**
   * Infer the dominant data type from a list of non-null values.
   *
   * Type precedence: boolean > number > date > string
   * Returns 'mixed' if different categories coexist in the sample.
   */
  private inferDataType(
    values: unknown[]
  ): 'string' | 'number' | 'date' | 'boolean' | 'mixed' {
    if (values.length === 0) return 'string';

    let numericCount = 0;
    let dateCount = 0;
    let booleanCount = 0;
    let stringCount = 0;

    for (const val of values) {
      if (typeof val === 'boolean') {
        booleanCount++;
        continue;
      }

      if (typeof val === 'number' && !isNaN(val)) {
        numericCount++;
        continue;
      }

      const str = String(val).trim();

      // Boolean strings
      if (['true', 'false', 'yes', 'no', '1', '0'].includes(str.toLowerCase())) {
        booleanCount++;
        continue;
      }

      // Numeric strings (handles integers, decimals, negatives, thousand separators)
      if (/^-?[\d,]+(\.\d+)?$/.test(str.replace(/\s/g, ''))) {
        numericCount++;
        continue;
      }

      // Date strings
      if (looksLikeDate(str)) {
        dateCount++;
        continue;
      }

      stringCount++;
    }

    const total = values.length;
    const threshold = 0.8; // At least 80% of values must agree on a type

    if (booleanCount / total >= threshold) return 'boolean';
    if (numericCount / total >= threshold) return 'number';
    if (dateCount / total >= threshold) return 'date';
    if (stringCount / total >= threshold) return 'string';

    return 'mixed';
  }
}
