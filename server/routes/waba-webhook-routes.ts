/**
 * WABA Webhook Routes — Meta WhatsApp Business API webhook handler
 *
 * Routes:
 *   GET  /api/webhooks/waba  — Meta webhook verification (hub challenge)
 *   POST /api/webhooks/waba  — Inbound event callbacks (status, messages, WA Flows)
 *
 *   GET  /api/waba/templates          — List cached WABA templates
 *   POST /api/waba/templates/sync     — Force refresh from Meta API (admin only)
 *   POST /api/waba/send/template      — Send a template message (admin/marketing)
 *   POST /api/waba/send/text          — Send a text message (admin/marketing)
 *   POST /api/waba/send/interactive   — Send an interactive message (admin/marketing)
 *   POST /api/waba/campaigns/:id/broadcast — Trigger campaign broadcast (admin/marketing)
 *
 * Security notes:
 *   - Webhook POST: raw body is captured via express.raw() before JSON parsing
 *     so HMAC-SHA256 verification uses the original byte stream (not re-serialized JSON).
 *   - WABA_WEBHOOK_SECRET MUST be set in production. Missing secret rejects all webhook
 *     POSTs in production (NODE_ENV=production) to prevent spoofed event injection.
 *   - Webhook GET verification uses WABA_WEBHOOK_VERIFY_TOKEN hub challenge.
 *   - Management endpoints (send/*, templates/*) require JWT auth + role.
 */
import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { wabaService } from '../services/waba-service';
import { campaignService } from '../services/campaign-service';
import { ingestEventService } from '../services/ingest-event-service';
import { loyaltyService } from '../services/loyalty-service';
import type { EarnActivityType } from '../services/point-rule-engine';
import { secureLogger } from '../utils/secure-logger';

/**
 * WA Flow event type → loyalty earn activity type mapping.
 *
 * Only event types that should earn points are listed here.
 * Event types absent from this map do NOT trigger point earning.
 *
 * Points values and daily caps are defined in PointRuleEngine (point-rule-engine.ts)
 * and can be adjusted without touching this mapping.
 */
const WA_FLOW_EARN_ACTIVITIES: Partial<Record<string, EarnActivityType>> = {
  'wa_flow.survey_submitted': 'survey_submit',
  'wa_flow.quiz_completed':   'quiz_complete',
};

const WABA_WRITE_ROLES = ['admin', 'marketing'];
const WABA_READ_ROLES = ['admin', 'marketing', 'analyst'];

// =====================================================
// HMAC Verification
// =====================================================

/**
 * Verify the Meta webhook payload signature.
 * Meta sends: X-Hub-Signature-256: sha256=<hmac-hex>
 *
 * Security contract:
 *   - If WABA_WEBHOOK_SECRET is set: verify HMAC against raw body bytes.
 *   - If WABA_WEBHOOK_SECRET is NOT set and NODE_ENV=production: reject (return false).
 *   - If WABA_WEBHOOK_SECRET is NOT set and NODE_ENV!=production: warn and allow
 *     (development convenience only).
 *
 * Returns: { ok: true } on pass, { ok: false, reason: string } on fail.
 */
function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string
): { ok: boolean; reason?: string } {
  const secret = process.env.WABA_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'WABA_WEBHOOK_SECRET not set in production — all webhook POSTs rejected' };
    }
    // Non-production: warn but allow for local development
    secureLogger.warn('WABA_WEBHOOK_SECRET not configured — skipping HMAC verification (non-production)', {}, 'WABA_WEBHOOK');
    return { ok: true };
  }

  if (!signature) {
    return { ok: false, reason: 'Missing X-Hub-Signature-256 header' };
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    // Buffers must be same length for timingSafeEqual
    if (signatureBuffer.length !== expectedBuffer.length) {
      return { ok: false, reason: 'Signature length mismatch' };
    }
    const valid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    return valid ? { ok: true } : { ok: false, reason: 'HMAC signature mismatch' };
  } catch {
    return { ok: false, reason: 'Signature comparison failed' };
  }
}

// =====================================================
// Webhook payload types (Meta Cloud API format)
// =====================================================

interface MetaStatusUpdate {
  id: string;                  // wa_message_id
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; origin?: { type: string } };
  errors?: Array<{ code: number; title: string }>;
}

interface MetaInboundMessage {
  id: string;                  // wa_message_id
  from: string;                // sender phone number
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  button?: { text: string; payload: string };
}

interface MetaFlowMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'interactive';
  interactive: {
    type: 'nfm_reply';
    nfm_reply: {
      name: string;
      body: string;
      response_json: string;
    };
  };
}

// =====================================================
// Validation schemas
// =====================================================

const sendTemplateSchema = z.object({
  to: z.string().min(7).max(20),
  templateName: z.string().min(1),
  languageCode: z.string().optional(),
  components: z.array(z.record(z.unknown())).optional(),
  campaignMessageId: z.string().uuid().optional(),
});

const sendTextSchema = z.object({
  to: z.string().min(7).max(20),
  text: z.string().min(1).max(4096),
  previewUrl: z.boolean().optional(),
  campaignMessageId: z.string().uuid().optional(),
});

const sendInteractiveSchema = z.object({
  to: z.string().min(7).max(20),
  interactive: z.record(z.unknown()),
  campaignMessageId: z.string().uuid().optional(),
});

const broadcastSchema = z.object({
  concurrency: z.coerce.number().int().min(1).max(50).optional(),
  batchDelayMs: z.coerce.number().int().min(0).max(30000).optional(),
});

// =====================================================
// Route setup
// =====================================================

export function setupWabaWebhookRoutes(app: Express): void {

  // -------------------------------------------------------
  // Meta Webhook Verification (GET)
  // -------------------------------------------------------
  app.get('/api/webhooks/waba', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.WABA_WEBHOOK_VERIFY_TOKEN ?? '';

    if (mode === 'subscribe' && token === expectedToken) {
      secureLogger.info('WABA webhook verified by Meta', {}, 'WABA_WEBHOOK');
      return res.status(200).send(challenge);
    }

    secureLogger.warn('WABA webhook verification failed', {
      mode,
      tokenMatch: token === expectedToken,
    }, 'WABA_WEBHOOK');

    return res.status(403).json({ error: 'Forbidden' });
  });

  // -------------------------------------------------------
  // Meta Webhook Events (POST)
  //
  // Security flow:
  //   1. req.rawBody is populated by express.json()'s verify callback in server/app.ts
  //      This fires BEFORE JSON parsing, capturing the original byte stream.
  //   2. Verify HMAC-SHA256 against raw bytes BEFORE sending any response.
  //   3. If verification fails → 401 (no 200 ack, so Meta will retry).
  //   4. If verification passes → 200 immediately, then process async.
  // -------------------------------------------------------
  app.post(
    '/api/webhooks/waba',
    async (req: Request, res: Response) => {
      // rawBody is populated by express.json()'s verify callback in server/app.ts.
      // It holds the exact bytes Meta sent, required for HMAC verification.
      const rawBody: Buffer | undefined = req.rawBody;

      if (!rawBody) {
        secureLogger.warn('WABA webhook: rawBody not available — check express.json verify config', {}, 'WABA_WEBHOOK');
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // Verify HMAC signature against raw bytes BEFORE acknowledging
      const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
      const { ok, reason } = verifyWebhookSignature(rawBody, signature);

      if (!ok) {
        secureLogger.warn('WABA webhook signature verification failed', { reason }, 'WABA_WEBHOOK');
        return res.status(401).json({ error: 'Unauthorized', reason });
      }

      // Acknowledge to Meta — must respond within 20s
      res.status(200).send('OK');

      // req.body is already parsed JSON from the global express.json() middleware
      const body = req.body as Record<string, unknown>;

      // Process async (already responded 200)
      processWebhookBody(body).catch(err => {
        secureLogger.error('WABA webhook processing error', {
          error: err instanceof Error ? err.message : String(err),
        }, 'WABA_WEBHOOK');
      });
    }
  );

  // -------------------------------------------------------
  // Template Management
  // -------------------------------------------------------

  app.get(
    '/api/waba/templates',
    requireAuth,
    requireRole(WABA_READ_ROLES),
    async (_req: Request, res: Response) => {
      try {
        const templates = await wabaService.getCachedTemplates();
        return res.json({ templates, total: templates.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get templates';
        return res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/waba/templates/sync',
    requireAuth,
    requireRole(['admin']),
    async (_req: Request, res: Response) => {
      try {
        if (!wabaService.isConfigured()) {
          return res.status(503).json({
            error: 'WABA not configured',
            details: 'Set WABA_ACCESS_TOKEN, WABA_PHONE_NUMBER_ID, and WABA_BUSINESS_ACCOUNT_ID environment variables',
          });
        }

        const templates = await wabaService.getTemplates(true);
        return res.json({ templates, total: templates.length, synced: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to sync templates';
        return res.status(500).json({ error: msg });
      }
    }
  );

  // -------------------------------------------------------
  // Send Endpoints
  // -------------------------------------------------------

  app.post(
    '/api/waba/send/template',
    requireAuth,
    requireRole(WABA_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        if (!wabaService.isConfigured()) {
          return res.status(503).json({ error: 'WABA not configured' });
        }

        const parsed = sendTemplateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await wabaService.sendTemplate(parsed.data as Parameters<typeof wabaService.sendTemplate>[0]);
        return res.status(result.status === 'sent' ? 200 : 502).json(result);
      } catch (err) {
        return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send template' });
      }
    }
  );

  app.post(
    '/api/waba/send/text',
    requireAuth,
    requireRole(WABA_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        if (!wabaService.isConfigured()) {
          return res.status(503).json({ error: 'WABA not configured' });
        }

        const parsed = sendTextSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await wabaService.sendText(parsed.data);
        return res.status(result.status === 'sent' ? 200 : 502).json(result);
      } catch (err) {
        return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send text' });
      }
    }
  );

  app.post(
    '/api/waba/send/interactive',
    requireAuth,
    requireRole(WABA_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        if (!wabaService.isConfigured()) {
          return res.status(503).json({ error: 'WABA not configured' });
        }

        const parsed = sendInteractiveSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await wabaService.sendInteractive(
          parsed.data as Parameters<typeof wabaService.sendInteractive>[0]
        );
        return res.status(result.status === 'sent' ? 200 : 502).json(result);
      } catch (err) {
        return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send interactive' });
      }
    }
  );

  app.post(
    '/api/waba/campaigns/:id/broadcast',
    requireAuth,
    requireRole(WABA_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        if (!wabaService.isConfigured()) {
          return res.status(503).json({ error: 'WABA not configured' });
        }

        const parsed = broadcastSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        const result = await wabaService.broadcastCampaign(
          req.params.id,
          parsed.data.concurrency,
          parsed.data.batchDelayMs
        );

        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to broadcast campaign';
        if (msg.includes('not found')) return res.status(404).json({ error: msg });
        return res.status(400).json({ error: msg });
      }
    }
  );
}

// =====================================================
// Webhook body processing (async, after 200 ack)
// =====================================================

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id: string; display_phone_number: string };
        statuses?: MetaStatusUpdate[];
        messages?: Array<MetaInboundMessage | MetaFlowMessage>;
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        errors?: Array<{ code: number; title: string; message: string }>;
      };
      field?: string;
    }>;
  }>;
}

async function processWebhookBody(body: Record<string, unknown>): Promise<void> {
  const wb = body as MetaWebhookBody;

  if (wb.object !== 'whatsapp_business_account') {
    secureLogger.info('WABA webhook: ignoring non-WABA object', { object: wb.object }, 'WABA_WEBHOOK');
    return;
  }

  for (const entry of wb.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value) continue;

      for (const status of value.statuses ?? []) {
        await handleDeliveryStatus(status).catch(err => {
          secureLogger.error('Failed to process WABA status update', {
            error: err instanceof Error ? err.message : String(err),
            waMessageId: status.id,
          }, 'WABA_WEBHOOK');
        });
      }

      for (const message of value.messages ?? []) {
        await handleInboundMessage(message as MetaInboundMessage | MetaFlowMessage).catch(err => {
          secureLogger.error('Failed to process WABA inbound message', {
            error: err instanceof Error ? err.message : String(err),
            waMessageId: message.id,
          }, 'WABA_WEBHOOK');
        });
      }
    }
  }
}

// =====================================================
// Webhook event handlers
// =====================================================

async function handleDeliveryStatus(status: MetaStatusUpdate): Promise<void> {
  const waMessageId = status.id;
  const recipientPhone = status.recipient_id;
  const ts = new Date(Number(status.timestamp) * 1000);
  const deliveryStatus = mapMetaStatus(status.status);

  secureLogger.info('WABA delivery status received', {
    waMessageId,
    status: deliveryStatus,
    recipientPhone: recipientPhone.slice(-4).padStart(recipientPhone.length, '*'),
  }, 'WABA_WEBHOOK');

  const { db } = await import('../db');
  const { campaignMessage } = await import('@shared/schema');
  const { eq } = await import('drizzle-orm');

  const [msg] = await db
    .select({ id: campaignMessage.id, campaignId: campaignMessage.campaignId, profileId: campaignMessage.profileId })
    .from(campaignMessage)
    .where(eq(campaignMessage.externalMessageId, waMessageId))
    .limit(1);

  if (!msg) {
    secureLogger.info('WABA status: no campaign_message found for wa_message_id', { waMessageId }, 'WABA_WEBHOOK');
    return;
  }

  const failureReason = status.errors?.[0]?.title;
  await campaignService.updateDeliveryStatus({
    campaignId: msg.campaignId,
    messageId: msg.id,
    status: deliveryStatus,
    externalMessageId: waMessageId,
    failureReason,
    timestamp: ts,
  });

  await ingestEventService.ingest({
    profileId: msg.profileId,
    eventType: `waba.message.${deliveryStatus}`,
    source: 'waba_webhook',
    channel: 'whatsapp',
    idempotencyKey: `waba-status-${waMessageId}-${deliveryStatus}`,
    eventProperties: {
      waMessageId,
      campaignId: msg.campaignId,
      campaignMessageId: msg.id,
      recipientPhone,
      status: deliveryStatus,
      timestamp: ts.toISOString(),
    },
  }).catch(err => {
    secureLogger.warn('Failed to emit CDP event for WABA delivery status', {
      error: err instanceof Error ? err.message : String(err),
      waMessageId,
    }, 'WABA_WEBHOOK');
  });
}

async function handleInboundMessage(message: MetaInboundMessage | MetaFlowMessage): Promise<void> {
  const from = message.from;
  const waMessageId = message.id;
  const ts = new Date(Number(message.timestamp) * 1000);

  secureLogger.info('WABA inbound message received', {
    type: message.type,
    from: from.slice(-4).padStart(from.length, '*'),
  }, 'WABA_WEBHOOK');

  let eventType = 'waba.message.received';
  const eventProperties: Record<string, unknown> = {
    waMessageId,
    from,
    messageType: message.type,
    timestamp: ts.toISOString(),
  };

  const flowMsg = message as MetaFlowMessage;
  if (message.type === 'interactive' && flowMsg.interactive?.type === 'nfm_reply') {
    const nfmReply = flowMsg.interactive.nfm_reply;
    const flowName = nfmReply.name ?? '';

    // Parse the response payload before classification so classifiers can inspect it
    let flowResponseData: Record<string, unknown> | undefined;
    try {
      flowResponseData = JSON.parse(nfmReply.response_json) as Record<string, unknown>;
    } catch {
      // response_json may not be valid JSON — store raw
    }

    // Classify WA Flow event based on flow name convention and/or response data.
    //
    // Meta does not provide a dedicated "event type" field on nfm_reply — we derive
    // it from the flow name (which operators control) and any embedded type signals
    // in the response payload.
    //
    // Convention: flow names ending in _survey, _quiz, etc. or containing the word
    // in any position map to the corresponding event type. The 'flow_screen' field
    // in the response identifies which screen the user submitted from; 'COMPLETE'
    // or equivalent signals full completion.
    eventType = classifyWaFlowEvent(flowName, flowResponseData);

    eventProperties.flowName = flowName;
    eventProperties.flowResponseBody = nfmReply.body;
    if (flowResponseData) {
      eventProperties.flowResponseData = flowResponseData;
      eventProperties.flowScreen = flowResponseData.flow_screen ?? flowResponseData.screen ?? null;
      eventProperties.flowToken = flowResponseData.flow_token ?? null;
    } else {
      eventProperties.flowResponseRaw = nfmReply.response_json;
    }

    secureLogger.info('WA Flow event classified', { flowName, eventType }, 'WABA_WEBHOOK');
  } else {
    const inboundMsg = message as MetaInboundMessage;
    if (inboundMsg.text) eventProperties.text = inboundMsg.text.body;
    if (inboundMsg.interactive) {
      eventProperties.interactiveType = inboundMsg.interactive.type;
      eventProperties.buttonReply = inboundMsg.interactive.button_reply;
      eventProperties.listReply = inboundMsg.interactive.list_reply;
    }
    if (inboundMsg.button) {
      eventProperties.buttonText = inboundMsg.button.text;
      eventProperties.buttonPayload = inboundMsg.button.payload;
    }
  }

  const ingestResult = await ingestEventService.ingest({
    identifiers: [
      { type: 'whatsapp', value: from, sourceSystem: 'waba_webhook' },
    ],
    eventType,
    source: 'waba_webhook',
    channel: 'whatsapp',
    idempotencyKey: `waba-inbound-${waMessageId}`,
    eventProperties,
    rawPayload: { message },
  });

  // Trigger loyalty point earning for WA Flow events where applicable.
  // This is non-fatal: a failure to earn points MUST NOT block webhook acknowledgement
  // (Meta requires a 200 response within 15 s or it will retry indefinitely).
  const earnActivityType = WA_FLOW_EARN_ACTIVITIES[eventType];
  if (earnActivityType && ingestResult.profileId) {
    loyaltyService.earnPoints({
      profileId: ingestResult.profileId,
      activityType: earnActivityType,
      idempotencyKey: `waba-earn-${waMessageId}`,
      metadata: {
        source: 'waba_webhook',
        eventType,
        flowName: eventProperties.flowName as string | undefined,
        flowToken: eventProperties.flowToken as string | undefined,
        waMessageId,
      },
    }).then((result) => {
      if (result.status === 'already_processed') {
        secureLogger.info('WA Flow loyalty earn: already processed', {
          profileId: ingestResult.profileId,
          activityType: earnActivityType,
          waMessageId,
        }, 'WABA_WEBHOOK');
      } else {
        secureLogger.info('WA Flow loyalty earn: points credited', {
          profileId: ingestResult.profileId,
          activityType: earnActivityType,
          pointsEarned: result.ledgerEntry?.points,
          newBalance: result.balance?.currentBalance,
          waMessageId,
        }, 'WABA_WEBHOOK');
      }
    }).catch((err: unknown) => {
      secureLogger.warn('WA Flow loyalty earn failed (non-fatal)', {
        profileId: ingestResult.profileId,
        activityType: earnActivityType,
        waMessageId,
        error: String(err),
      }, 'WABA_WEBHOOK');
    });
  }
}

/**
 * Classify a WA Flow nfm_reply into a specific CDP event type.
 *
 * Meta sends all WA Flow submissions as `interactive.nfm_reply` — the platform
 * does not distinguish between survey, quiz, or general flow completions at the
 * protocol level. We derive the event type from:
 *
 * 1. The `flow_token` or `event_type` field embedded in response_json (if set
 *    by the flow designer via the Flow JSON `on_success` event_data property).
 * 2. The `flow_name` convention (case-insensitive keyword matching).
 * 3. Whether `flow_screen` indicates a "start" screen vs. a "complete" screen.
 * 4. Default: `wa_flow.submission` for any unclassified nfm_reply.
 *
 * Returned event types:
 *   wa_flow.flow_started     — flow opened and first screen submitted
 *   wa_flow.flow_completed   — flow fully completed (all screens submitted)
 *   wa_flow.survey_submitted — survey flow completed
 *   wa_flow.quiz_completed   — quiz flow completed
 *   wa_flow.submission       — unclassified WA Flow submission (catch-all)
 */
function classifyWaFlowEvent(
  flowName: string,
  responseData: Record<string, unknown> | undefined
): string {
  const nameLower = flowName.toLowerCase();

  // 1. Explicit event_type embedded by flow designer in response_json
  const embeddedType = responseData?.event_type as string | undefined
    ?? responseData?.flow_event_type as string | undefined;

  if (embeddedType) {
    const knownTypes: Record<string, string> = {
      'flow_started':     'wa_flow.flow_started',
      'flow_completed':   'wa_flow.flow_completed',
      'survey_submitted': 'wa_flow.survey_submitted',
      'quiz_completed':   'wa_flow.quiz_completed',
    };
    const mapped = knownTypes[embeddedType.toLowerCase()];
    if (mapped) return mapped;
  }

  // 2. Classify by flow name convention (most common pattern in WABA flows)
  if (/survey/i.test(nameLower)) return 'wa_flow.survey_submitted';
  if (/quiz/i.test(nameLower))   return 'wa_flow.quiz_completed';

  // 3. Screen-based completion signal
  //    Designers often name their final screen 'COMPLETE', 'SUCCESS', 'DONE', etc.
  const screen = (
    responseData?.flow_screen
    ?? responseData?.screen
    ?? responseData?.current_screen
    ?? ''
  ) as string;
  const screenLower = screen.toLowerCase();

  if (/start|welcome|intro/i.test(screenLower)) return 'wa_flow.flow_started';
  if (/complete|success|done|finish|thank/i.test(screenLower)) return 'wa_flow.flow_completed';

  // 4. If no screen info, infer from flow name
  if (/start|welcome|begin/i.test(nameLower)) return 'wa_flow.flow_started';
  if (/complete|finish|done/i.test(nameLower)) return 'wa_flow.flow_completed';

  // 5. Default catch-all
  return 'wa_flow.submission';
}

function mapMetaStatus(metaStatus: string): 'sent' | 'delivered' | 'read' | 'failed' {
  switch (metaStatus) {
    case 'sent': return 'sent';
    case 'delivered': return 'delivered';
    case 'read': return 'read';
    case 'failed': return 'failed';
    default: return 'failed';
  }
}
