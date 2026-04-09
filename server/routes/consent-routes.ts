import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { consentService } from '../services/consent-service';
import { suppressionService } from '../services/suppression-service';
import { audienceEnforcement } from '../services/audience-enforcement';
import { db } from '../db';
import { consentRecord } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// ─── Validation Schemas ──────────────────────────────────────────────────────

const recordConsentSchema = z.object({
  profileId: z.string().uuid(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push', 'all']),
  status: z.enum(['opt_in', 'opt_out', 'pending', 'revoked']),
  method: z.enum(['explicit', 'implicit', 'double_opt_in', 'system']).optional(),
  source: z.enum(['web_form', 'api', 'waba', 'crm', 'import']).optional(),
  consentText: z.string().max(2000).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  maxSendsPerDay: z.number().int().positive().optional().nullable(),
  maxSendsPerWeek: z.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional(),
});

const revokeConsentSchema = z.object({
  profileId: z.string().uuid(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push', 'all']),
  reason: z.string().max(500).optional(),
  source: z.enum(['web_form', 'api', 'waba', 'crm', 'import']).optional(),
});

const bulkConsentSchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(1000),
  channel: z.string().min(1),
});

const addSuppressionSchema = z.object({
  identifierType: z.enum(['profile_id', 'email', 'phone', 'global']),
  identifierValue: z.string().min(1).max(500),
  channel: z.string().optional().nullable(),
  reason: z.enum(['unsubscribe', 'bounce', 'complaint', 'legal', 'manual', 'fraud']),
  notes: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const removeSuppressionSchema = z.object({
  identifierType: z.string().min(1),
  identifierValue: z.string().min(1),
  channel: z.string().optional().nullable(),
});

const filterAudienceSchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(10000),
  channel: z.string().optional(),
});

const enforceAudienceSchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(10000),
  channel: z.string().min(1),
  checkFrequencyCaps: z.boolean().optional().default(false),
});

const recordSendSchema = z.object({
  profileId: z.string().uuid(),
  channel: z.string().min(1),
  campaignId: z.string().uuid().optional(),
});

// ─── Route Registration ───────────────────────────────────────────────────────

export function setupConsentRoutes(app: Express): void {

  // ── Consent Endpoints ────────────────────────────────────────────────────

  /**
   * POST /api/consent
   * Record or update consent for a profile + channel.
   */
  app.post('/api/consent', requireAuth, async (req: Request, res: Response) => {
    const parsed = recordConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const record = await consentService.recordConsent(parsed.data);
      return res.status(201).json({ success: true, data: record });
    } catch (err) {
      secureLogger.error('Failed to record consent', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to record consent' });
    }
  });

  /**
   * POST /api/consent/revoke
   * Revoke consent for a profile + channel.
   */
  app.post('/api/consent/revoke', requireAuth, async (req: Request, res: Response) => {
    const parsed = revokeConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const record = await consentService.revokeConsent(
        parsed.data.profileId,
        parsed.data.channel,
        parsed.data.reason,
        parsed.data.source
      );
      return res.json({ success: true, data: record });
    } catch (err) {
      secureLogger.error('Failed to revoke consent', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to revoke consent' });
    }
  });

  /**
   * GET /api/consent/frequency-cap/:profileId/:channel
   * Check if a profile is frequency-capped for a channel.
   * IMPORTANT: Must come before /api/consent/:profileId/:channel to avoid route conflict.
   */
  app.get('/api/consent/frequency-cap/:profileId/:channel', requireAuth, async (req: Request, res: Response) => {
    const { profileId, channel } = req.params;

    try {
      const result = await consentService.isFrequencyCapped(profileId, channel);
      return res.json({ success: true, data: result });
    } catch (err) {
      secureLogger.error('Failed to check frequency cap', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to check frequency cap' });
    }
  });

  /**
   * POST /api/consent/bulk-check
   * Check consent status for multiple profiles.
   */
  app.post('/api/consent/bulk-check', requireAuth, async (req: Request, res: Response) => {
    const parsed = bulkConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const result = await consentService.checkBulkConsent(parsed.data.profileIds, parsed.data.channel);
      return res.json({ success: true, data: result });
    } catch (err) {
      secureLogger.error('Failed to bulk check consent', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to bulk check consent' });
    }
  });

  /**
   * POST /api/consent/record-send
   * Record that a message was sent (increments frequency counter).
   */
  app.post('/api/consent/record-send', requireAuth, async (req: Request, res: Response) => {
    const parsed = recordSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      await consentService.recordSend(parsed.data.profileId, parsed.data.channel, parsed.data.campaignId);
      return res.json({ success: true });
    } catch (err) {
      secureLogger.error('Failed to record send', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to record send' });
    }
  });

  /**
   * GET /api/consent/:profileId/:channel
   * Get consent status for a specific profile + channel.
   */
  app.get('/api/consent/:profileId/:channel', requireAuth, async (req: Request, res: Response) => {
    const { profileId, channel } = req.params;

    if (!profileId || !channel) {
      return res.status(400).json({ error: 'profileId and channel are required' });
    }

    try {
      const status = await consentService.getConsentStatus(profileId, channel);
      return res.json({ success: true, data: status });
    } catch (err) {
      secureLogger.error('Failed to get consent status', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to get consent status' });
    }
  });

  /**
   * GET /api/consent/:profileId
   * Get all consent records for a profile.
   */
  app.get('/api/consent/:profileId', requireAuth, async (req: Request, res: Response) => {
    const { profileId } = req.params;

    if (!profileId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    try {
      const records = await db
        .select()
        .from(consentRecord)
        .where(eq(consentRecord.profileId, profileId))
        .orderBy(desc(consentRecord.updatedAt));

      return res.json({ success: true, data: records });
    } catch (err) {
      secureLogger.error('Failed to get consent records', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to get consent records' });
    }
  });

  // ── Suppression Endpoints ────────────────────────────────────────────────

  /**
   * POST /api/suppression
   * Add an entry to the suppression list.
   */
  app.post('/api/suppression', requireAuth, requireRole(['admin', 'marketing']), async (req: Request, res: Response) => {
    const parsed = addSuppressionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const entry = await suppressionService.addToSuppressionList({
        ...parsed.data,
        channel: parsed.data.channel ?? undefined,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        addedBy: req.user?.id,
      });
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      secureLogger.error('Failed to add suppression', { error: String(err) }, 'SUPPRESSION');
      return res.status(500).json({ error: 'Failed to add to suppression list' });
    }
  });

  /**
   * DELETE /api/suppression
   * Remove (deactivate) a suppression entry.
   */
  app.delete('/api/suppression', requireAuth, requireRole(['admin', 'marketing']), async (req: Request, res: Response) => {
    const parsed = removeSuppressionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      await suppressionService.removeFromSuppressionList(
        parsed.data.identifierType,
        parsed.data.identifierValue,
        parsed.data.channel ?? undefined
      );
      return res.json({ success: true, message: 'Suppression entry deactivated' });
    } catch (err) {
      secureLogger.error('Failed to remove suppression', { error: String(err) }, 'SUPPRESSION');
      return res.status(500).json({ error: 'Failed to remove suppression' });
    }
  });

  /**
   * GET /api/suppression/check/:profileId
   * Check if a specific profile is suppressed.
   */
  app.get('/api/suppression/check/:profileId', requireAuth, async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { channel } = req.query;

    try {
      const result = await suppressionService.isSuppressed(profileId, channel as string | undefined);
      return res.json({ success: true, data: result });
    } catch (err) {
      secureLogger.error('Failed to check suppression', { error: String(err) }, 'SUPPRESSION');
      return res.status(500).json({ error: 'Failed to check suppression status' });
    }
  });

  /**
   * GET /api/suppression
   * List active suppression entries with optional filters.
   */
  app.get('/api/suppression', requireAuth, requireRole(['admin', 'marketing']), async (req: Request, res: Response) => {
    const channel = req.query.channel as string | undefined;
    const identifierType = req.query.identifierType as string | undefined;
    const activeOnly = req.query.activeOnly !== 'false';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const entries = await suppressionService.listSuppressions({
        channel,
        identifierType,
        activeOnly,
        limit,
        offset,
      });
      return res.json({ success: true, data: entries, limit, offset });
    } catch (err) {
      secureLogger.error('Failed to list suppressions', { error: String(err) }, 'SUPPRESSION');
      return res.status(500).json({ error: 'Failed to list suppressions' });
    }
  });

  /**
   * POST /api/suppression/filter-audience
   * Filter a list of profile IDs removing any suppressed profiles.
   * Main utility for campaign audience building (suppression only).
   */
  app.post('/api/suppression/filter-audience', requireAuth, async (req: Request, res: Response) => {
    const parsed = filterAudienceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const result = await suppressionService.filterAudience(
        parsed.data.profileIds,
        parsed.data.channel
      );
      return res.json({
        success: true,
        data: result,
        summary: {
          total: parsed.data.profileIds.length,
          eligible: result.eligible.length,
          suppressed: result.suppressed.length,
        },
      });
    } catch (err) {
      secureLogger.error('Failed to filter audience', { error: String(err) }, 'SUPPRESSION');
      return res.status(500).json({ error: 'Failed to filter audience' });
    }
  });

  // ── Combined Enforcement Endpoint ────────────────────────────────────────

  /**
   * POST /api/consent/enforce-audience
   * Single combined enforcement gate: applies consent + suppression (+ optional frequency caps)
   * in one pass. This is the primary API for campaign services to call before any broadcast.
   * Returns eligible profile IDs and details about why profiles were excluded.
   */
  app.post('/api/consent/enforce-audience', requireAuth, async (req: Request, res: Response) => {
    const parsed = enforceAudienceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const result = await audienceEnforcement.enforce({
        profileIds: parsed.data.profileIds,
        channel: parsed.data.channel,
        checkFrequencyCaps: parsed.data.checkFrequencyCaps,
      });
      return res.json({
        success: true,
        data: result,
        summary: {
          total: parsed.data.profileIds.length,
          eligible: result.eligible.length,
          excluded: result.excluded.length,
        },
      });
    } catch (err) {
      secureLogger.error('Failed to enforce audience', { error: String(err) }, 'CONSENT');
      return res.status(500).json({ error: 'Failed to enforce audience' });
    }
  });
}
