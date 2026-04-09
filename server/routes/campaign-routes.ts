/**
 * CDP Campaign Routes — REST API for campaign management
 *
 * All endpoints require authentication (JWT).
 * Write endpoints require admin or marketing role.
 * Read endpoints require admin, marketing, or analyst role.
 *
 * Routes:
 *   POST   /api/campaigns                          Create campaign (admin/marketing)
 *   GET    /api/campaigns                          List campaigns (all staff)
 *   GET    /api/campaigns/:id                      Get campaign (all staff)
 *   PATCH  /api/campaigns/:id                      Update campaign (admin/marketing)
 *   POST   /api/campaigns/:id/schedule             Schedule campaign (admin/marketing)
 *   POST   /api/campaigns/:id/execute              Execute campaign (admin/marketing)
 *   POST   /api/campaigns/:id/cancel               Cancel campaign (admin/marketing)
 *   POST   /api/campaigns/:id/complete             Mark sending complete (admin/marketing)
 *   GET    /api/campaigns/:id/analytics            Campaign analytics (all staff)
 *   GET    /api/campaigns/:id/messages             Campaign messages (admin/marketing/analyst)
 *   POST   /api/campaigns/:id/delivery-status      Update delivery status (admin/marketing)
 *   GET    /api/campaigns/:id/audience-preview      Audience preview (admin/marketing)
 */
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { campaignService } from '../services/campaign-service';
import { secureLogger } from '../utils/secure-logger';

const CAMPAIGN_READ_ROLES = ['admin', 'marketing', 'analyst'];
const CAMPAIGN_WRITE_ROLES = ['admin', 'marketing'];

// =====================================================
// Validation schemas
// =====================================================

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push']),
  segmentDefinitionId: z.string().uuid().optional(),
  templateId: z.string().optional(),
  templatePayload: z.record(z.unknown()).optional(),
  scheduledAt: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  metadata: z.record(z.unknown()).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  segmentDefinitionId: z.string().uuid().optional(),
  templateId: z.string().optional(),
  templatePayload: z.record(z.unknown()).optional(),
  scheduledAt: z.string().datetime().nullable().optional().transform(v => v === null ? null : v ? new Date(v) : undefined),
  metadata: z.record(z.unknown()).optional(),
});

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime().transform(v => new Date(v)),
});

const deliveryStatusSchema = z.object({
  profileId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  externalMessageId: z.string().optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  failureReason: z.string().optional(),
  timestamp: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  channel: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// =====================================================
// Route setup
// =====================================================

export function setupCampaignRoutes(app: Express): void {

  // POST /api/campaigns — create campaign
  app.post(
    '/api/campaigns',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const parsed = createCampaignSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const createdBy = (req as Request & { user?: { id?: string } }).user?.id;
        const result = await campaignService.createCampaign({
          ...parsed.data,
          createdBy,
        });

        return res.status(201).json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create campaign';
        secureLogger.error('Create campaign failed', { error: msg }, 'CAMPAIGN');
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // GET /api/campaigns — list campaigns
  app.get(
    '/api/campaigns',
    requireAuth,
    requireRole(CAMPAIGN_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await campaignService.listCampaigns(parsed.data);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to list campaigns';
        return res.status(500).json({ error: msg });
      }
    }
  );

  // GET /api/campaigns/:id — get campaign
  app.get(
    '/api/campaigns/:id',
    requireAuth,
    requireRole(CAMPAIGN_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.getCampaign(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(500).json({ error: msg });
      }
    }
  );

  // PATCH /api/campaigns/:id — update campaign
  app.patch(
    '/api/campaigns/:id',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const parsed = updateCampaignSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await campaignService.updateCampaign(req.params.id, parsed.data);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        if (msg.includes('Cannot update')) return res.status(409).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/campaigns/:id/schedule — schedule campaign
  app.post(
    '/api/campaigns/:id/schedule',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const parsed = scheduleSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await campaignService.scheduleCampaign(req.params.id, parsed.data.scheduledAt);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to schedule campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/campaigns/:id/execute — execute campaign (resolve audience + generate messages)
  app.post(
    '/api/campaigns/:id/execute',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.executeCampaign(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to execute campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/campaigns/:id/cancel — cancel campaign
  app.post(
    '/api/campaigns/:id/cancel',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.cancelCampaign(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to cancel campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/campaigns/:id/complete — mark campaign as completed
  app.post(
    '/api/campaigns/:id/complete',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.completeCampaign(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to complete campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // GET /api/campaigns/:id/analytics — campaign analytics
  app.get(
    '/api/campaigns/:id/analytics',
    requireAuth,
    requireRole(CAMPAIGN_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.getCampaignAnalytics(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get analytics';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(500).json({ error: msg });
      }
    }
  );

  // GET /api/campaigns/:id/messages — list campaign messages
  app.get(
    '/api/campaigns/:id/messages',
    requireAuth,
    requireRole(CAMPAIGN_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const rawLimit = Number(req.query.limit);
        const rawOffset = Number(req.query.offset);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;
        const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

        const result = await campaignService.getCampaignMessages(req.params.id, { status, limit, offset });
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get campaign messages';
        return res.status(500).json({ error: msg });
      }
    }
  );

  // POST /api/campaigns/:id/delivery-status — update delivery status (channel callback)
  app.post(
    '/api/campaigns/:id/delivery-status',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const parsed = deliveryStatusSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        if (!parsed.data.profileId && !parsed.data.messageId && !parsed.data.externalMessageId) {
          return res.status(400).json({
            error: 'At least one of profileId, messageId, or externalMessageId is required',
          });
        }

        const result = await campaignService.updateDeliveryStatus({
          campaignId: req.params.id,
          ...parsed.data,
        });

        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update delivery status';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );

  // GET /api/campaigns/:id/audience-preview — preview audience without executing
  app.get(
    '/api/campaigns/:id/audience-preview',
    requireAuth,
    requireRole(CAMPAIGN_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const result = await campaignService.previewAudience(req.params.id);
        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to preview audience';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );
}
