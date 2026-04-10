/**
 * Lite CDP v2 — File Upload & AI Analysis Routes
 *
 * Additional routes that handle the multi-step import wizard:
 *   1. POST /upload          — upload file, extract sample, return preview data
 *   2. POST /analyze         — run GPT-4o analysis on the stored sample
 *   3. POST /import          — parse full file, bulk-insert records
 *   4. POST /resolve-identities — run identity resolution for the stream
 *
 * Mount this router at /api/lite-cdp alongside lite-cdp-routes.ts.
 *
 * NOTE: multer v2.0.2 is present in package.json — no additional install needed.
 *
 * @module LiteCdpUploadRoutes
 * @created 2025 — Lite CDP v2 Sprint 5
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { ImportOrchestrator } from '../services/lite-cdp/import-orchestrator';
import { DataStreamService } from '../services/lite-cdp/data-stream-service';

const router = Router();
const orchestrator = new ImportOrchestrator();
const streamService = new DataStreamService();

// ─── Multer configuration ─────────────────────────────────────────────────────

const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serverError(res: Response, error: unknown, context: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[lite-cdp-upload] ${context}:`, message);
  return res.status(500).json({ success: false, error: context, details: message });
}

function badRequest(res: Response, message: string): Response {
  return res.status(400).json({ success: false, error: message });
}

function notFound(res: Response, entity: string, id: string): Response {
  return res.status(404).json({ success: false, error: `${entity} not found`, id });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/lite-cdp/streams/:streamId/upload
 *
 * Upload a CSV or Excel file, extract a representative sample, and return
 * the sample data along with pre-AI heuristic hints for the preview UI.
 *
 * Multipart form field: file (the uploaded file)
 *
 * Response:
 * {
 *   success: true,
 *   sampleData: SampleData,
 *   heuristicHints: Array<{ field, hint, confidence }>,
 *   filePath: string   // stored path — pass back to /import if needed
 * }
 */
router.post(
  '/streams/:streamId/upload',
  upload.single('file'),
  async (req: Request, res: Response) => {
    const { streamId } = req.params;

    try {
      // 1. Verify the stream exists
      const stream = await streamService.getStream(streamId);
      if (!stream) return notFound(res, 'Stream', streamId);

      // 2. Validate uploaded file
      const file = req.file;
      if (!file) return badRequest(res, 'No file uploaded. Use multipart field name "file".');

      // 3. Determine file type from original extension
      const ext = path.extname(file.originalname).toLowerCase();
      const fileType: 'csv' | 'xlsx' = ext === '.csv' ? 'csv' : 'xlsx';

      // 4. Extract sample + heuristic hints (also stores file path in stream metadata)
      const { sampleData, heuristicHints } = await orchestrator.uploadAndExtractSample(
        streamId,
        file.path,
        fileType,
      );

      return res.json({
        success: true,
        sampleData,
        heuristicHints,
        filePath: file.path,
        originalName: file.originalname,
        fileType,
      });
    } catch (err) {
      return serverError(res, err, 'Failed to upload and extract sample');
    }
  },
);

/**
 * POST /api/lite-cdp/streams/:streamId/analyze
 *
 * Run GPT-4o analysis on the sample stored during the upload step.
 * Auto-saves the AI-derived schema, entity type, identity fields, and
 * analytics config back to the stream record.
 *
 * Body: { heuristicHints?: Array<{ field, hint, confidence }> }
 *       (heuristicHints are optional — re-computed from stored sample if omitted)
 *
 * Response:
 * { success: true, analysis: AIAnalysisResult }
 */
router.post('/streams/:streamId/analyze', async (req: Request, res: Response) => {
  const { streamId } = req.params;

  try {
    // 1. Load stream — sampleData should be stored in aiAnalysis._sampleData
    const stream = await streamService.getStream(streamId);
    if (!stream) return notFound(res, 'Stream', streamId);

    const meta = (stream.aiAnalysis as Record<string, unknown> | null) ?? {};
    const sampleData = meta._sampleData as Parameters<typeof orchestrator.analyzeWithAI>[1] | undefined;

    if (!sampleData) {
      return badRequest(
        res,
        'No sample data found for this stream. Upload a file first via POST /upload.',
      );
    }

    // 2. Use provided hints or fall back to an empty array
    const { heuristicHints } = req.body as {
      heuristicHints?: Array<{ field: string; hint: string; confidence: number }>;
    };

    // 3. Run AI analysis (auto-saves results to stream)
    const analysis = await orchestrator.analyzeWithAI(streamId, sampleData, heuristicHints);

    return res.json({ success: true, analysis });
  } catch (err) {
    return serverError(res, err, 'AI analysis failed');
  }
});

/**
 * POST /api/lite-cdp/streams/:streamId/import
 *
 * Parse the full uploaded file and bulk-insert all records into the stream.
 * The stream must be active (status = 'active') before import.
 *
 * Body: { filePath: string, fileType: 'csv'|'xlsx', projectId: string }
 *       filePath is the path returned by /upload (or stored in stream metadata).
 *
 * Response:
 * { success: true, importId, totalRows, imported, duplicates, errors }
 */
router.post('/streams/:streamId/import', async (req: Request, res: Response) => {
  const { streamId } = req.params;

  try {
    // 1. Load stream
    const stream = await streamService.getStream(streamId);
    if (!stream) return notFound(res, 'Stream', streamId);

    // 2. Validate stream is active
    if (stream.status !== 'active') {
      return badRequest(
        res,
        `Stream must be active before importing records. Current status: "${stream.status}". ` +
          'Activate the stream via POST /activate first.',
      );
    }

    // 3. Resolve file path and type from body or stored stream metadata
    const body = req.body as {
      filePath?: string;
      fileType?: 'csv' | 'xlsx';
      projectId?: string;
    };

    const meta = (stream.aiAnalysis as Record<string, unknown> | null) ?? {};
    const filePath = body.filePath ?? (meta._uploadedFilePath as string | undefined);
    const fileType = body.fileType ?? (meta._uploadedFileType as 'csv' | 'xlsx' | undefined) ?? 'csv';
    const projectId = body.projectId ?? stream.projectId;

    if (!filePath) {
      return badRequest(
        res,
        'filePath is required. Upload a file first via POST /upload, or provide filePath in the request body.',
      );
    }

    // 4. Import records
    const summary = await orchestrator.importRecords(streamId, filePath, fileType, projectId);

    return res.json({ success: true, ...summary });
  } catch (err) {
    return serverError(res, err, 'Record import failed');
  }
});

/**
 * POST /api/lite-cdp/streams/:streamId/resolve-identities
 *
 * Trigger identity resolution for all unlinked records in the stream.
 * Uses IdentityResolutionServiceV2 to match records into clusters.
 *
 * Response:
 * { success: true, processedRecords, newClusters, linkedToExisting, unresolvable }
 */
router.post('/streams/:streamId/resolve-identities', async (req: Request, res: Response) => {
  const { streamId } = req.params;

  try {
    // 1. Verify stream exists
    const stream = await streamService.getStream(streamId);
    if (!stream) return notFound(res, 'Stream', streamId);

    // 2. Run identity resolution
    const result = await orchestrator.resolveIdentities(streamId);

    return res.json({ success: true, ...result });
  } catch (err) {
    return serverError(res, err, 'Identity resolution failed');
  }
});

export default router;
