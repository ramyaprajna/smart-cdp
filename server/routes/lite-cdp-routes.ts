/**
 * Lite CDP v2 API Routes
 *
 * Provides REST endpoints for:
 *  - Data Streams (CRUD + status transitions)
 *  - Records (paginated list, detail)
 *  - Identity Clusters (list, detail, link, unlink, merge)
 *  - Project-level overview stats
 *
 * Mount this router under /api/lite-cdp in the main server index.
 */

import { Router, Request, Response } from 'express';
import { DataStreamService } from '../services/lite-cdp/data-stream-service';
import { RecordService } from '../services/lite-cdp/record-service';
import { IdentityClusterService } from '../services/lite-cdp/identity-cluster-service';

const router = Router();
const streamService = new DataStreamService();
const recordService = new RecordService();
const clusterService = new IdentityClusterService();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function notFound(res: Response, entity: string, id: string): Response {
  return res.status(404).json({ success: false, error: `${entity} not found`, id });
}

function serverError(res: Response, error: unknown, context: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: context, details: message });
}

function badRequest(res: Response, message: string): Response {
  return res.status(400).json({ success: false, error: message });
}

// ─── Data Streams ─────────────────────────────────────────────────────────────

/**
 * POST /api/lite-cdp/streams
 * Create a new data stream (status = draft).
 * Body: { projectId, name, description?, sourceType }
 */
router.post('/streams', async (req: Request, res: Response) => {
  try {
    const { projectId, name, sourceType, description } = req.body;

    if (!projectId) return badRequest(res, 'projectId is required');
    if (!name) return badRequest(res, 'name is required');
    if (!sourceType) return badRequest(res, 'sourceType is required');

    const stream = await streamService.createStream({ projectId, name, description, sourceType });
    return res.status(201).json({ success: true, stream });
  } catch (error) {
    return serverError(res, error, 'Failed to create stream');
  }
});

/**
 * GET /api/lite-cdp/streams
 * List streams for a project.
 * Query: projectId (required), status? (draft | active | archived)
 */
router.get('/streams', async (req: Request, res: Response) => {
  try {
    const { projectId, status } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return badRequest(res, 'projectId query param is required');
    }

    const streams = await streamService.listStreams(
      projectId,
      status as string | undefined as any,
    );
    return res.json({ success: true, streams, count: streams.length });
  } catch (error) {
    return serverError(res, error, 'Failed to list streams');
  }
});

/**
 * GET /api/lite-cdp/streams/:id
 * Get a single stream by ID.
 */
router.get('/streams/:id', async (req: Request, res: Response) => {
  try {
    const stream = await streamService.getStream(req.params.id);
    if (!stream) return notFound(res, 'Stream', req.params.id);
    return res.json({ success: true, stream });
  } catch (error) {
    return serverError(res, error, 'Failed to get stream');
  }
});

/**
 * PUT /api/lite-cdp/streams/:id/schema
 * Update a stream's schema and config. Stream must be in "draft" status.
 * Body: { entityType?, schemaDefinition?, identityFields?, aiAnalysis? }
 */
router.put('/streams/:id/schema', async (req: Request, res: Response) => {
  try {
    const { entityType, schemaDefinition, identityFields, aiAnalysis } = req.body;

    const stream = await streamService.updateStreamSchema(req.params.id, {
      entityType,
      schemaDefinition,
      identityFields,
      aiAnalysis,
    });
    return res.json({ success: true, stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) return notFound(res, 'Stream', req.params.id);
    if (message.includes('status')) return res.status(400).json({ success: false, error: message });
    return serverError(res, error, 'Failed to update stream schema');
  }
});

/**
 * POST /api/lite-cdp/streams/:id/activate
 * Transition stream from draft → active.
 */
router.post('/streams/:id/activate', async (req: Request, res: Response) => {
  try {
    const stream = await streamService.activateStream(req.params.id);
    return res.json({ success: true, stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) return notFound(res, 'Stream', req.params.id);
    if (message.includes('status') || message.includes('entityType')) {
      return res.status(400).json({ success: false, error: message });
    }
    return serverError(res, error, 'Failed to activate stream');
  }
});

/**
 * POST /api/lite-cdp/streams/:id/archive
 * Transition stream from active → archived.
 */
router.post('/streams/:id/archive', async (req: Request, res: Response) => {
  try {
    const stream = await streamService.archiveStream(req.params.id);
    return res.json({ success: true, stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) return notFound(res, 'Stream', req.params.id);
    if (message.includes('status')) return res.status(400).json({ success: false, error: message });
    return serverError(res, error, 'Failed to archive stream');
  }
});

// ─── Records ──────────────────────────────────────────────────────────────────

/**
 * GET /api/lite-cdp/streams/:streamId/records
 * List records for a stream (paginated + filterable).
 * Query: page, pageSize, sortField, sortOrder, filters (JSON array string)
 *
 * filters format: [{ "field": "email", "operator": "eq", "value": "a@b.com" }]
 */
router.get('/streams/:streamId/records', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, sortField, sortOrder, filters } = req.query;

    let parsedFilters;
    if (filters && typeof filters === 'string') {
      try {
        parsedFilters = JSON.parse(filters);
      } catch {
        return badRequest(res, 'filters must be a valid JSON array string');
      }
    }

    const result = await recordService.getRecords(req.params.streamId, {
      page: page ? parseInt(String(page), 10) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
      sortField: sortField as string | undefined,
      sortOrder: sortOrder === 'asc' ? 'asc' : sortOrder === 'desc' ? 'desc' : undefined,
      filters: parsedFilters,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return serverError(res, error, 'Failed to list records');
  }
});

/**
 * GET /api/lite-cdp/records/:id
 * Get a single record by ID.
 */
router.get('/records/:id', async (req: Request, res: Response) => {
  try {
    const record = await recordService.getRecord(req.params.id);
    if (!record) return notFound(res, 'Record', req.params.id);
    return res.json({ success: true, record });
  } catch (error) {
    return serverError(res, error, 'Failed to get record');
  }
});

// ─── Identity Clusters ────────────────────────────────────────────────────────

/**
 * GET /api/lite-cdp/clusters
 * List identity clusters for a project.
 * Query: projectId (required), page, pageSize, minStreamCount, search
 */
router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const { projectId, page, pageSize, minStreamCount, search } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return badRequest(res, 'projectId query param is required');
    }

    const result = await clusterService.listClusters(projectId, {
      page: page ? parseInt(String(page), 10) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
      minStreamCount: minStreamCount ? parseInt(String(minStreamCount), 10) : undefined,
      search: search as string | undefined,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return serverError(res, error, 'Failed to list clusters');
  }
});

/**
 * GET /api/lite-cdp/clusters/:id
 * Get a cluster's detail including all linked records.
 */
router.get('/clusters/:id', async (req: Request, res: Response) => {
  try {
    const detail = await clusterService.getClusterDetail(req.params.id);
    return res.json({ success: true, ...detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) return notFound(res, 'Cluster', req.params.id);
    return serverError(res, error, 'Failed to get cluster detail');
  }
});

/**
 * POST /api/lite-cdp/clusters/:id/link
 * Manually link a record to a cluster.
 * Body: { recordId, linkType, confidence, matchedIdentifierType?, matchedIdentifierValue?, linkedBy?, notes? }
 */
router.post('/clusters/:id/link', async (req: Request, res: Response) => {
  try {
    const { recordId, linkType, confidence, matchedIdentifierType, matchedIdentifierValue, linkedBy, notes } = req.body;

    if (!recordId) return badRequest(res, 'recordId is required');
    if (!linkType) return badRequest(res, 'linkType is required');
    if (confidence === undefined || confidence === null) return badRequest(res, 'confidence is required');

    const validLinkTypes = ['auto_matched', 'manual_linked', 'ai_suggested', 'merge_result'];
    if (!validLinkTypes.includes(linkType)) {
      return badRequest(res, `linkType must be one of: ${validLinkTypes.join(', ')}`);
    }

    const conf = parseFloat(String(confidence));
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return badRequest(res, 'confidence must be a number between 0 and 1');
    }

    await clusterService.linkRecord({
      recordId,
      clusterId: req.params.id,
      linkType,
      confidence: conf,
      matchedIdentifierType,
      matchedIdentifierValue,
      linkedBy,
      notes,
    });

    return res.json({ success: true, message: 'Record linked to cluster' });
  } catch (error) {
    return serverError(res, error, 'Failed to link record to cluster');
  }
});

/**
 * DELETE /api/lite-cdp/clusters/:id/link/:recordId
 * Unlink a record from a cluster.
 */
router.delete('/clusters/:id/link/:recordId', async (req: Request, res: Response) => {
  try {
    await clusterService.unlinkRecord(req.params.recordId);
    return res.json({ success: true, message: 'Record unlinked from cluster' });
  } catch (error) {
    return serverError(res, error, 'Failed to unlink record');
  }
});

/**
 * POST /api/lite-cdp/clusters/merge
 * Merge clusterB into clusterA (B is absorbed and deleted).
 * Body: { clusterAId, clusterBId, mergedBy, reason? }
 */
router.post('/clusters/merge', async (req: Request, res: Response) => {
  try {
    const { clusterAId, clusterBId, mergedBy, reason } = req.body;

    if (!clusterAId) return badRequest(res, 'clusterAId is required');
    if (!clusterBId) return badRequest(res, 'clusterBId is required');
    if (!mergedBy) return badRequest(res, 'mergedBy is required');
    if (clusterAId === clusterBId) return badRequest(res, 'clusterAId and clusterBId must be different');

    const cluster = await clusterService.mergeClusters(clusterAId, clusterBId, mergedBy, reason);
    return res.json({ success: true, cluster });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return res.status(404).json({ success: false, error: message });
    }
    return serverError(res, error, 'Failed to merge clusters');
  }
});

// ─── Overview Stats ───────────────────────────────────────────────────────────

/**
 * GET /api/lite-cdp/stats/:projectId
 * Return aggregated stats for a project:
 * - Total streams (by status)
 * - Record counts per stream
 * - Total clusters
 */
router.get('/stats/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const [allStreams, recordCounts, { total: totalClusters }] = await Promise.all([
      streamService.listStreams(projectId),
      recordService.getRecordCountsByStream(projectId),
      clusterService.listClusters(projectId, { pageSize: 1 }),
    ]);

    const streamsByStatus = allStreams.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    }, {});

    const totalRecords = recordCounts.reduce((sum, r) => sum + r.count, 0);

    return res.json({
      success: true,
      stats: {
        streams: {
          total: allStreams.length,
          byStatus: streamsByStatus,
        },
        records: {
          total: totalRecords,
          byStream: recordCounts,
        },
        clusters: {
          total: totalClusters,
        },
      },
    });
  } catch (error) {
    return serverError(res, error, 'Failed to fetch project stats');
  }
});

export default router;
