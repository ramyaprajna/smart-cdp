/**
 * Import Orchestrator — Lite CDP v2
 *
 * Orchestrates the full import flow:
 *   upload → sample → analyze → deploy → import → resolve
 *
 * Step 1: uploadAndExtractSample  — extract sample rows + heuristic hints
 * Step 2: analyzeWithAI           — call GPT-4o, auto-save results to stream
 * Step 3: importRecords           — parse full file, bulk-insert, track import job
 * Step 4: resolveIdentities       — run identity resolution for stream
 *
 * @module ImportOrchestrator
 * @created 2025 — Lite CDP v2 Sprint 5
 */

import { SampleExtractor } from './sample-extractor';
import { StreamAnalyzerService } from './stream-analyzer-service';
import { StreamDeployService } from './stream-deploy-service';
import { IdentityResolutionServiceV2 } from './identity-resolution-service-v2';
import { DataStreamService } from './data-stream-service';
import { RecordService } from './record-service';
import { db } from '../../db';
import { dataImportsV2 } from '@shared/schema-v2';
import type { SampleData } from './sample-extractor';
import type { AIAnalysisResult } from './stream-analyzer-service';
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';

// xlsx is already in package.json — import for full-file Excel parsing
import * as XLSX from 'xlsx';

export class ImportOrchestrator {
  private sampleExtractor = new SampleExtractor();
  private streamAnalyzer = new StreamAnalyzerService();
  private streamDeployer = new StreamDeployService();
  private identityResolver = new IdentityResolutionServiceV2();
  private streamService = new DataStreamService();
  private recordService = new RecordService();

  // ─── Step 1: Upload file and extract sample ──────────────────────────────────

  /**
   * Extract a representative sample from an uploaded file and compute
   * heuristic hints.  Stores the file path in the stream's aiAnalysis
   * metadata so it can be referenced during the import step.
   *
   * @param streamId  UUID of the target data stream (must exist, status=draft)
   * @param filePath  Absolute path to the uploaded file on disk
   * @param fileType  'csv' | 'xlsx'
   * @returns sampleData (headers + rows + stats) and pre-AI heuristic hints
   */
  async uploadAndExtractSample(
    streamId: string,
    filePath: string,
    fileType: 'csv' | 'xlsx',
  ): Promise<{
    sampleData: SampleData;
    heuristicHints: Array<{ field: string; hint: string; confidence: number }>;
  }> {
    // 1. Extract sample
    const sampleData =
      fileType === 'csv'
        ? await this.sampleExtractor.extractFromCSV(filePath)
        : await this.sampleExtractor.extractFromExcel(filePath);

    // 2. Compute heuristic hints
    const heuristicHints = this.sampleExtractor.computeHeuristicHints(
      sampleData.headers,
      sampleData.fieldStats,
    );

    // 3. Persist file path + sample in stream metadata so later steps can
    //    reference it without the caller having to pass it again.
    const existingStream = await this.streamService.getStream(streamId);
    const existingAnalysis =
      (existingStream?.aiAnalysis as Record<string, unknown> | null) ?? {};

    await this.streamService.updateStreamSchema(streamId, {
      aiAnalysis: {
        ...existingAnalysis,
        _uploadedFilePath: filePath,
        _uploadedFileType: fileType,
        _sampleData: sampleData,
      },
    });

    return { sampleData, heuristicHints };
  }

  // ─── Step 2: Run AI analysis on sample ──────────────────────────────────────

  /**
   * Run GPT-4o analysis on the provided sample, then auto-save the
   * results (schema definition, entity type, identity fields, AI analysis)
   * back to the stream record so the user can review without extra API calls.
   *
   * @param streamId     UUID of the stream
   * @param sampleData   Sample extracted in Step 1
   * @param hints        Optional heuristic hints from Step 1
   * @returns Full AIAnalysisResult from StreamAnalyzerService
   */
  async analyzeWithAI(
    streamId: string,
    sampleData: SampleData,
    hints?: Array<{ field: string; hint: string; confidence: number }>,
  ): Promise<AIAnalysisResult> {
    // 1. Run AI analysis
    const analysis = await this.streamAnalyzer.analyzeStream(sampleData, hints);

    // 2. Auto-save all derived properties back to the stream
    await this.streamService.updateStreamSchema(streamId, {
      entityType: analysis.entityType,
      schemaDefinition: {
        version: '1.0',
        fields: analysis.fieldDefinitions,
      },
      identityFields: analysis.suggestedIdentityFields.map((f) => ({
        key: f.key,
        identifierType: f.identifierType,
        confidence: f.confidence,
        isPrimary: f.confidence >= 0.9,
      })),
      aiAnalysis: {
        streamType: analysis.streamType,
        entityType: analysis.entityType,
        embeddingTemplate: analysis.embeddingTemplate,
        suggestedSegments: analysis.suggestedSegments,
        analyticsConfig: analysis.analyticsConfig,
        analysisConfidence: analysis.analysisConfidence,
        chatbotContext: analysis.chatbotContext,
      },
    });

    return analysis;
  }

  // ─── Step 3: Import all records from the uploaded file ───────────────────────

  /**
   * Parse the full uploaded file (not just the sample), map each row to
   * a record attributes object using the stream's schema, bulk-insert in
   * batches, and track everything in a data_imports_v2 job row.
   *
   * @param streamId  UUID of the target stream (must be active)
   * @param filePath  Absolute path to the file on disk
   * @param fileType  'csv' | 'xlsx'
   * @param projectId UUID of the project
   * @returns Import summary: importId, totalRows, imported, duplicates, errors
   */
  async importRecords(
    streamId: string,
    filePath: string,
    fileType: 'csv' | 'xlsx',
    projectId: string,
  ): Promise<{
    importId: string;
    totalRows: number;
    imported: number;
    duplicates: number;
    errors: string[];
  }> {
    // 1. Create import tracking record (status = 'in_progress')
    const [importRecord] = await db
      .insert(dataImportsV2)
      .values({
        streamId,
        projectId,
        importType: fileType,
        importStatus: 'in_progress',
        totalRows: 0,
        processedRows: 0,
        failedRows: 0,
        duplicateRows: 0,
        errorLog: [],
        importConfig: { filePath, fileType },
        createdAt: new Date(),
      })
      .returning();

    const importId = importRecord.id;

    try {
      // 2. Parse full file — returns ALL rows (not capped at sample size)
      const allRows = await this.parseFullFile(filePath, fileType);
      const totalRows = allRows.length;

      // 3. Load stream schema to map row keys → attribute keys
      const stream = await this.streamService.getStream(streamId);
      const schemaFields =
        (stream?.schemaDefinition as { version: string; fields: Array<{ key: string }> } | null)
          ?.fields ?? [];
      const fieldKeys = schemaFields.map((f) => f.key);

      // 4. Map each row to { attributes } using schema field keys.
      //    If no schema is defined yet, pass raw row data as-is.
      const recordPayloads = allRows.map((row) => {
        let attributes: Record<string, unknown>;

        if (fieldKeys.length > 0) {
          // Only include keys that appear in the schema definition
          attributes = {};
          for (const key of fieldKeys) {
            if (Object.prototype.hasOwnProperty.call(row, key)) {
              attributes[key] = row[key];
            }
          }
          // Also include any unmapped keys under their original names
          // so data is never silently dropped
          for (const rawKey of Object.keys(row)) {
            if (!Object.prototype.hasOwnProperty.call(attributes, rawKey)) {
              attributes[rawKey] = row[rawKey];
            }
          }
        } else {
          attributes = { ...row };
        }

        return {
          attributes,
          originalSourceData: row,
          idempotencyKey: undefined as string | undefined,
        };
      });

      // 5. Bulk-insert in batches via RecordService
      const result = await this.recordService.bulkInsertRecords({
        streamId,
        projectId,
        importId,
        records: recordPayloads,
      });

      // 6. Update import record: completed
      await db
        .update(dataImportsV2)
        .set({
          importStatus: 'completed',
          totalRows,
          processedRows: result.inserted,
          duplicateRows: result.duplicates,
          failedRows: result.errors.length,
          errorLog: result.errors,
          completedAt: new Date(),
        })
        .where(eq(dataImportsV2.id, importId));

      // 7. Refresh stream aggregate counts
      await this.streamService.updateStreamCounts(streamId);

      return {
        importId,
        totalRows,
        imported: result.inserted,
        duplicates: result.duplicates,
        errors: result.errors,
      };
    } catch (err) {
      // Mark import as failed before re-throwing
      await db
        .update(dataImportsV2)
        .set({
          importStatus: 'failed',
          errorLog: [err instanceof Error ? err.message : String(err)],
          completedAt: new Date(),
        })
        .where(eq(dataImportsV2.id, importId));

      throw err;
    }
  }

  // ─── Step 4: Run identity resolution ─────────────────────────────────────────

  /**
   * Trigger identity resolution for all unlinked records in the stream.
   * Updates stream counts after resolution.
   *
   * @param streamId UUID of the stream
   * @returns Resolution summary: processedRecords, newClusters, linkedToExisting, unresolvable
   */
  async resolveIdentities(streamId: string): Promise<{
    processedRecords: number;
    newClusters: number;
    linkedToExisting: number;
    unresolvable: number;
  }> {
    // 1. Run identity resolution
    const result = await this.identityResolver.resolveStream(streamId);

    // 2. Refresh stream aggregate counts
    await this.streamService.updateStreamCounts(streamId);

    return result;
  }

  // ─── Full flow helper ─────────────────────────────────────────────────────────

  /**
   * Execute the full import pipeline in a single call:
   *   analyze → import → resolve
   *
   * Expects the stream to already have sampleData stored from uploadAndExtractSample().
   *
   * @param streamId  UUID of the stream
   * @param filePath  Absolute path to the uploaded file
   * @param fileType  'csv' | 'xlsx'
   * @param projectId UUID of the project
   * @returns Combined results from all three steps
   */
  async executeFullFlow(
    streamId: string,
    filePath: string,
    fileType: 'csv' | 'xlsx',
    projectId: string,
  ): Promise<{
    analysis: AIAnalysisResult;
    import: { totalRows: number; imported: number; duplicates: number };
    identity: { newClusters: number; linkedToExisting: number; unresolvable: number };
  }> {
    // Retrieve stored sample data from stream metadata
    const stream = await this.streamService.getStream(streamId);
    const storedMeta = (stream?.aiAnalysis as Record<string, unknown> | null) ?? {};
    const sampleData = storedMeta._sampleData as SampleData | undefined;

    if (!sampleData) {
      throw new Error(
        `ImportOrchestrator.executeFullFlow: no stored sampleData found for stream ${streamId}. ` +
          'Run uploadAndExtractSample() first.',
      );
    }

    // Recompute heuristic hints from stored sample
    const hints = this.sampleExtractor.computeHeuristicHints(
      sampleData.headers,
      sampleData.fieldStats,
    );

    // Step 2: Analyze
    const analysis = await this.analyzeWithAI(streamId, sampleData, hints);

    // Step 3: Import
    const importSummary = await this.importRecords(streamId, filePath, fileType, projectId);

    // Step 4: Resolve
    const identitySummary = await this.resolveIdentities(streamId);

    return {
      analysis,
      import: {
        totalRows: importSummary.totalRows,
        imported: importSummary.imported,
        duplicates: importSummary.duplicates,
      },
      identity: {
        newClusters: identitySummary.newClusters,
        linkedToExisting: identitySummary.linkedToExisting,
        unresolvable: identitySummary.unresolvable,
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /**
   * Parse a CSV or Excel file and return ALL rows (no row-count cap).
   * Reuses the built-in CSV/Excel parsing logic from SampleExtractor by
   * reading the raw text/workbook directly.
   *
   * @param filePath Absolute path to the file
   * @param fileType 'csv' | 'xlsx'
   * @returns Array of row objects keyed by header names
   */
  private async parseFullFile(
    filePath: string,
    fileType: 'csv' | 'xlsx',
  ): Promise<Record<string, unknown>[]> {
    if (fileType === 'csv') {
      return this.parseFullCSV(filePath);
    }
    return this.parseFullExcel(filePath);
  }

  /** Parse entire CSV file without sample row cap. */
  private async parseFullCSV(filePath: string): Promise<Record<string, unknown>[]> {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split(/\r?\n/);

    if (lines.length === 0) return [];

    // Parse header line using minimal quoted-CSV parser
    const headers = this.parseCSVLine(lines[0]);
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const row: Record<string, unknown> = {};

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j].trim();
        if (!header) continue;
        const raw = values[j] ?? '';
        row[header] = raw === '' ? null : raw;
      }

      rows.push(row);
    }

    return rows;
  }

  /** Parse entire Excel file without sample row cap. */
  private async parseFullExcel(filePath: string): Promise<Record<string, unknown>[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const sheet = workbook.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (raw.length === 0) return [];

    const headers = (raw[0] as unknown[]).map((h) => String(h ?? '').trim());
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < raw.length; i++) {
      const rowArr = raw[i] as unknown[];
      // Skip entirely empty rows
      if (!rowArr || rowArr.every((v) => v === null || v === '')) continue;

      const row: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (!header) continue;
        row[header] = rowArr[j] ?? null;
      }
      rows.push(row);
    }

    return rows;
  }

  /**
   * Minimal RFC 4180-compatible CSV line parser.
   * Handles double-quoted fields and escaped double-quotes ("").
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }

      i++;
    }

    result.push(current);
    return result;
  }
}
