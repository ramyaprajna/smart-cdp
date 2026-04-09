/**
 * CDP WABA Service — WhatsApp Business API integration layer
 *
 * Wraps the Meta Cloud API (v20.0) for outbound message sending.
 * Provides:
 *  1. sendTemplate     — send HSM template message to a single recipient
 *  2. sendText         — send plain text message
 *  3. sendInteractive  — send interactive button/list message
 *  4. getTemplates     — list approved templates from WABA account
 *  5. getCachedTemplates — return locally cached templates
 *  6. broadcastCampaign — batch-send a campaign's pending campaign_message records
 *
 * Environment variables required:
 *   WABA_ACCESS_TOKEN        — Meta/BSP system user access token
 *   WABA_PHONE_NUMBER_ID     — WhatsApp-linked phone number ID
 *   WABA_BUSINESS_ACCOUNT_ID — WABA business account ID (for template listing)
 *
 * Rate limiting:
 *   Meta enforces per-second and per-day sending limits.
 *   The broadcast executor applies configurable concurrency + inter-batch delay.
 *   callMetaApi retries on 429/5xx with exponential backoff (up to MAX_RETRIES).
 */
import { db } from '../db';
import { campaignMessage, wabaTemplate } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { campaignService } from './campaign-service';
import { secureLogger } from '../utils/secure-logger';

// =====================================================
// Config helpers
// =====================================================

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function isWabaConfigured(): boolean {
  return !!(
    process.env.WABA_ACCESS_TOKEN &&
    process.env.WABA_PHONE_NUMBER_ID &&
    process.env.WABA_BUSINESS_ACCOUNT_ID
  );
}

const META_API_BASE = 'https://graph.facebook.com/v20.0';

// Retry configuration for transient Meta API errors
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// Meta error codes that should be retried
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

// =====================================================
// Request / Response types
// =====================================================

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: Array<{
    type: 'text' | 'image' | 'document' | 'video' | 'currency' | 'date_time' | 'payload';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
    payload?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
  }>;
}

export interface SendTemplateRequest {
  to: string;                          // E.164 phone number e.g. "628123456789"
  templateName: string;
  languageCode?: string;               // defaults to 'id' (Bahasa Indonesia)
  components?: TemplateComponent[];
  campaignMessageId?: string;          // used for status linking
}

export interface SendTextRequest {
  to: string;
  text: string;
  previewUrl?: boolean;
  campaignMessageId?: string;
}

export interface SendInteractiveRequest {
  to: string;
  interactive: {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: Record<string, unknown>;
  };
  campaignMessageId?: string;
}

export interface WabaSendResult {
  waMessageId: string;
  recipientPhone: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface WabaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: unknown[];
}

export interface BroadcastResult {
  campaignId: string;
  sent: number;
  failed: number;
  skipped: number;
}

// =====================================================
// WABA Service
// =====================================================

class WabaService {
  // -------------------------------------------------------
  // Low-level Meta API caller with retry/backoff
  // -------------------------------------------------------

  /**
   * Call the Meta Graph API with automatic retry on transient errors.
   *
   * Retries on HTTP 429 (rate limit) and 5xx errors using exponential backoff.
   * For 429, respects the Retry-After header if present.
   * Throws immediately on 4xx (except 429) as these are non-retryable client errors.
   */
  private async callMetaApi(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const token = getRequiredEnv('WABA_ACCESS_TOKEN');
    const url = `${META_API_BASE}/${path}`;

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (networkErr) {
        // Network-level failure — retryable
        lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          secureLogger.warn('WABA API network error — retrying', {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            delayMs: delay,
            error: lastError.message,
          }, 'WABA');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }

      const json = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        const errObj = (json as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
        const errMsg = errObj?.message ?? 'Unknown Meta API error';
        const errCode = errObj?.code ?? response.status;
        lastError = Object.assign(new Error(`Meta API error ${errCode}: ${errMsg}`), {
          metaErrorCode: errCode,
          metaErrorSubcode: errObj?.error_subcode,
          httpStatus: response.status,
        });

        if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          // Respect Retry-After for 429
          let delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const retryAfterMs = parseInt(retryAfter, 10) * 1000;
            if (!isNaN(retryAfterMs) && retryAfterMs > 0) delay = retryAfterMs;
          }

          secureLogger.warn('WABA API error — retrying', {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            httpStatus: response.status,
            errCode,
            delayMs: delay,
          }, 'WABA');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable or out of retries
        throw lastError;
      }

      return json;
    }

    // Should not reach here, but satisfy TypeScript
    throw lastError;
  }

  // -------------------------------------------------------
  // Send Template
  // -------------------------------------------------------

  /**
   * Send an approved WhatsApp template message to a single recipient.
   */
  async sendTemplate(req: SendTemplateRequest): Promise<WabaSendResult> {
    const phoneNumberId = getRequiredEnv('WABA_PHONE_NUMBER_ID');

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: req.to,
      type: 'template',
      template: {
        name: req.templateName,
        language: { code: req.languageCode ?? 'id' },
        ...(req.components && req.components.length > 0 && { components: req.components }),
      },
    };

    try {
      const result = await this.callMetaApi('POST', `${phoneNumberId}/messages`, body) as {
        messages?: Array<{ id: string }>;
      };

      const waMessageId = result.messages?.[0]?.id ?? 'unknown';

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ externalMessageId: waMessageId, status: 'sent', sentAt: new Date(), updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      secureLogger.info('WABA template sent', {
        to: req.to.slice(-4).padStart(req.to.length, '*'),
        waMessageId,
        templateName: req.templateName,
      }, 'WABA');

      return { waMessageId, recipientPhone: req.to, status: 'sent' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      secureLogger.error('WABA sendTemplate failed', { error, templateName: req.templateName }, 'WABA');

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ status: 'failed', failedAt: new Date(), failureReason: error, updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      return { waMessageId: '', recipientPhone: req.to, status: 'failed', error };
    }
  }

  // -------------------------------------------------------
  // Send Text
  // -------------------------------------------------------

  /**
   * Send a plain text message. Requires an active conversation window (24h).
   */
  async sendText(req: SendTextRequest): Promise<WabaSendResult> {
    const phoneNumberId = getRequiredEnv('WABA_PHONE_NUMBER_ID');

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: req.to,
      type: 'text',
      text: {
        body: req.text,
        preview_url: req.previewUrl ?? false,
      },
    };

    try {
      const result = await this.callMetaApi('POST', `${phoneNumberId}/messages`, body) as {
        messages?: Array<{ id: string }>;
      };

      const waMessageId = result.messages?.[0]?.id ?? 'unknown';

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ externalMessageId: waMessageId, status: 'sent', sentAt: new Date(), updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      return { waMessageId, recipientPhone: req.to, status: 'sent' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      secureLogger.error('WABA sendText failed', { error }, 'WABA');

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ status: 'failed', failedAt: new Date(), failureReason: error, updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      return { waMessageId: '', recipientPhone: req.to, status: 'failed', error };
    }
  }

  // -------------------------------------------------------
  // Send Interactive
  // -------------------------------------------------------

  /**
   * Send an interactive button or list message.
   */
  async sendInteractive(req: SendInteractiveRequest): Promise<WabaSendResult> {
    const phoneNumberId = getRequiredEnv('WABA_PHONE_NUMBER_ID');

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: req.to,
      type: 'interactive',
      interactive: req.interactive,
    };

    try {
      const result = await this.callMetaApi('POST', `${phoneNumberId}/messages`, body) as {
        messages?: Array<{ id: string }>;
      };

      const waMessageId = result.messages?.[0]?.id ?? 'unknown';

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ externalMessageId: waMessageId, status: 'sent', sentAt: new Date(), updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      return { waMessageId, recipientPhone: req.to, status: 'sent' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      secureLogger.error('WABA sendInteractive failed', { error }, 'WABA');

      if (req.campaignMessageId) {
        await db
          .update(campaignMessage)
          .set({ status: 'failed', failedAt: new Date(), failureReason: error, updatedAt: new Date() })
          .where(eq(campaignMessage.id, req.campaignMessageId));
      }

      return { waMessageId: '', recipientPhone: req.to, status: 'failed', error };
    }
  }

  // -------------------------------------------------------
  // Template Management
  // -------------------------------------------------------

  /**
   * Fetch and cache all WABA message templates from Meta.
   *
   * Pagination: Meta returns up to 200 templates per page. This method follows
   * the `paging.cursors.after` cursor until no more pages remain, ensuring the
   * full template library is captured for large WABA accounts.
   *
   * All templates (regardless of status) are persisted to the local cache so
   * campaign operators can see which templates are pending review vs. approved.
   * The `getTemplates` method filters to APPROVED-only for campaign selection safety.
   *
   * @param forceRefresh - Skip cache and re-fetch from Meta API
   */
  async getTemplates(forceRefresh = false): Promise<WabaTemplate[]> {
    if (!isWabaConfigured()) {
      secureLogger.warn('WABA not configured — getTemplates returning empty list', {}, 'WABA');
      return [];
    }

    const businessAccountId = getRequiredEnv('WABA_BUSINESS_ACCOUNT_ID');

    if (!forceRefresh) {
      // Return APPROVED templates from local cache (filtered for campaign safety)
      const cached = await db.select().from(wabaTemplate).where(eq(wabaTemplate.status, 'APPROVED'));
      if (cached.length > 0) {
        return cached.map(t => ({
          id: t.externalTemplateId,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language,
          components: (t.components as unknown[]) ?? [],
        }));
      }
    }

    // Paginate through Meta template API using cursor pagination
    type MetaTemplate = { id: string; name: string; status: string; category: string; language: string; components: unknown[] };
    type MetaTemplateResponse = { data?: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } };

    const allTemplates: MetaTemplate[] = [];
    let afterCursor: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 20; // Safety guard — 20 × 200 = 4,000 templates max

    do {
      const cursorParam = afterCursor ? `&after=${afterCursor}` : '';
      const result = await this.callMetaApi(
        'GET',
        `${businessAccountId}/message_templates?fields=id,name,status,category,language,components&limit=200${cursorParam}`
      ) as MetaTemplateResponse;

      const page = result.data ?? [];
      allTemplates.push(...page);

      afterCursor = result.paging?.cursors?.after;
      pageCount++;

      // Stop if no next page or empty page
      if (!result.paging?.next || page.length === 0) break;
    } while (afterCursor && pageCount < MAX_PAGES);

    secureLogger.info('WABA templates fetched from Meta', {
      totalTemplates: allTemplates.length,
      pages: pageCount,
    }, 'WABA');

    // Upsert all templates (all statuses) into local cache
    for (const t of allTemplates) {
      await db
        .insert(wabaTemplate)
        .values({
          externalTemplateId: t.id,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language,
          components: t.components,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: wabaTemplate.externalTemplateId,
          set: {
            name: t.name,
            status: t.status,
            category: t.category,
            language: t.language,
            components: t.components,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    // Return APPROVED-only for campaign selection safety
    const approvedTemplates = allTemplates.filter(t => t.status === 'APPROVED');
    secureLogger.info('WABA templates synced', {
      total: allTemplates.length,
      approved: approvedTemplates.length,
    }, 'WABA');
    return approvedTemplates;
  }

  /**
   * Get locally cached templates without calling Meta API.
   * Returns all statuses — useful for admin audit views.
   * For campaign selection, prefer `getTemplates()` which filters to APPROVED.
   */
  async getCachedTemplates(): Promise<WabaTemplate[]> {
    const cached = await db.select().from(wabaTemplate);
    return cached.map(t => ({
      id: t.externalTemplateId,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: (t.components as unknown[]) ?? [],
    }));
  }

  // -------------------------------------------------------
  // Broadcast Executor
  // -------------------------------------------------------

  /**
   * Execute a campaign broadcast:
   *  1. Page through ALL 'pending' campaign_message records for the campaign
   *     directly from the DB (bypasses getCampaignMessages 500-row cap)
   *  2. For each recipient, resolve the template and personalized payload
   *  3. Send via sendTemplate / sendText with rate limiting (concurrency + delay)
   *  4. Write per-message status back atomically via the send methods
   *
   * @param campaignId      - The campaign to broadcast
   * @param concurrency     - Max simultaneous sends per batch (default: 5)
   * @param batchDelayMs    - Delay between batches in ms (default: 1000)
   */
  async broadcastCampaign(
    campaignId: string,
    concurrency = 5,
    batchDelayMs = 1000
  ): Promise<BroadcastResult> {
    if (!isWabaConfigured()) {
      secureLogger.warn('WABA not configured — broadcastCampaign is a no-op', { campaignId }, 'WABA');
      return { campaignId, sent: 0, failed: 0, skipped: 0 };
    }

    const campaign = await campaignService.getCampaign(campaignId);
    if (campaign.channel !== 'whatsapp') {
      throw new Error(`Campaign channel must be 'whatsapp', got '${campaign.channel}'`);
    }
    if (!['draft', 'scheduled', 'sending'].includes(campaign.status)) {
      throw new Error(`Campaign must be in draft/scheduled/sending status, got '${campaign.status}'`);
    }

    const templateName = campaign.templateId ?? '';
    const templatePayload = (campaign.templatePayload as Record<string, unknown>) ?? {};

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Page through ALL pending messages directly — bypasses the 500-row cap
    // in getCampaignMessages which is designed for UI pagination.
    const PAGE_SIZE = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const pendingMessages = await db
        .select()
        .from(campaignMessage)
        .where(
          and(
            eq(campaignMessage.campaignId, campaignId),
            eq(campaignMessage.status, 'pending')
          )
        )
        .limit(PAGE_SIZE)
        .offset(offset);

      if (pendingMessages.length === 0) {
        hasMore = false;
        break;
      }

      // Process current page in concurrency-limited batches
      for (let i = 0; i < pendingMessages.length; i += concurrency) {
        const batch = pendingMessages.slice(i, i + concurrency);

        const sendPromises = batch.map(async (msg) => {
          if (!msg.recipientAddress) {
            secureLogger.warn('Skipping message — no recipient address', { messageId: msg.id }, 'WABA');
            await db
              .update(campaignMessage)
              .set({ status: 'failed', failedAt: new Date(), failureReason: 'no_recipient_address', updatedAt: new Date() })
              .where(eq(campaignMessage.id, msg.id));
            skipped++;
            return;
          }

          if (!templateName) {
            // Fallback: send as text if no template configured
            const textBody = (msg.personalizedPayload as Record<string, unknown>)?.body as string
              ?? (templatePayload.body as string)
              ?? '[No message body]';

            const result = await this.sendText({
              to: msg.recipientAddress,
              text: textBody,
              campaignMessageId: msg.id,
            });

            if (result.status === 'sent') sent++;
            else failed++;
            return;
          }

          // Build personalized components from personalizedPayload
          const personalizedComponents = this.buildTemplateComponents(
            (msg.personalizedPayload as Record<string, unknown>) ?? templatePayload
          );

          const result = await this.sendTemplate({
            to: msg.recipientAddress,
            templateName,
            languageCode: (templatePayload.languageCode as string) ?? 'id',
            components: personalizedComponents,
            campaignMessageId: msg.id,
          });

          if (result.status === 'sent') sent++;
          else failed++;
        });

        await Promise.all(sendPromises);

        // Rate limiting delay between batches within a page
        if (i + concurrency < pendingMessages.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelayMs));
        }
      }

      // If we got a full page, there may be more
      if (pendingMessages.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        // Note: offset stays at same position because processed messages are
        // now in 'sent' or 'failed' status and won't match 'pending' filter
        // Do NOT increment offset — re-query from offset 0 until empty
        offset = 0;
      }

      // Delay between pages
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }

    // Update campaign analytics
    await campaignService.refreshAnalytics(campaignId);

    secureLogger.info('Campaign broadcast complete', { campaignId, sent, failed, skipped }, 'WABA');
    return { campaignId, sent, failed, skipped };
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  /**
   * Build template components from a personalized payload object.
   * Expects payload keys: bodyParams (array), headerParams (array), buttons (array)
   */
  private buildTemplateComponents(payload: Record<string, unknown>): TemplateComponent[] {
    const components: TemplateComponent[] = [];

    const headerParams = payload.headerParams as Array<{ type: string; text?: string }> | undefined;
    if (headerParams && headerParams.length > 0) {
      components.push({
        type: 'header',
        parameters: headerParams.map(p => ({
          type: (p.type as 'text' | 'image') ?? 'text',
          text: p.text,
        })),
      });
    }

    const bodyParams = payload.bodyParams as Array<{ type: string; text?: string }> | undefined;
    if (bodyParams && bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map(p => ({
          type: (p.type as 'text') ?? 'text',
          text: p.text ?? String(p),
        })),
      });
    }

    const buttons = payload.buttons as Array<{ sub_type: string; index: number; text?: string; payload?: string }> | undefined;
    if (buttons && buttons.length > 0) {
      for (const btn of buttons) {
        components.push({
          type: 'button',
          sub_type: (btn.sub_type as 'quick_reply' | 'url') ?? 'quick_reply',
          index: btn.index,
          parameters: [{
            type: btn.sub_type === 'url' ? 'text' : 'payload',
            text: btn.text,
            payload: btn.payload,
          }],
        });
      }
    }

    return components;
  }

  /**
   * Check if WABA credentials are configured.
   */
  isConfigured(): boolean {
    return isWabaConfigured();
  }
}

export const wabaService = new WabaService();
