/**
 * Campaign Dispatcher — Channel Routing & Auto-Completion
 *
 * Bridges the gap between campaign execution (audience resolution + message generation)
 * and actual message delivery. Routes to the appropriate channel broadcaster
 * and auto-completes the campaign when broadcast finishes.
 *
 * Supported channels:
 *   - whatsapp: delegates to wabaService.broadcastCampaign()
 *   - email:    built-in email broadcast loop using sendEmail()
 *   - sms:      placeholder (not yet implemented)
 *   - push:     placeholder (not yet implemented)
 *
 * Usage:
 *   POST /api/campaigns/:id/dispatch
 *   → campaignDispatcher.dispatch(campaignId)
 *
 * @module CampaignDispatcher
 */

import { db } from '../db';
import { campaign, campaignMessage } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { campaignService } from './campaign-service';
import { wabaService } from './waba-service';
import { sendEmail } from './email-service';
import { applicationLogger } from './application-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Max concurrent sends per batch (WhatsApp: 1-50, Email: 1-20) */
  concurrency?: number;
  /** Delay in ms between batches for rate limiting */
  batchDelayMs?: number;
  /** Whether to auto-complete campaign after broadcast */
  autoComplete?: boolean;
}

export interface DispatchResult {
  campaignId: string;
  channel: string;
  sent: number;
  failed: number;
  skipped: number;
  completed: boolean;
  error?: string;
}

interface EmailBroadcastResult {
  campaignId: string;
  sent: number;
  failed: number;
  skipped: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_DEFAULT_CONCURRENCY = 10;
const EMAIL_DEFAULT_BATCH_DELAY_MS = 500;
const EMAIL_PAGE_SIZE = 200;
const WHATSAPP_DEFAULT_CONCURRENCY = 5;
const WHATSAPP_DEFAULT_BATCH_DELAY_MS = 1000;

// ─── Campaign Dispatcher ──────────────────────────────────────────────────────

export class CampaignDispatcher {

  /**
   * Dispatch a campaign to its channel broadcaster.
   *
   * Precondition: campaign must be in 'sending' status (executeCampaign already called).
   * If the campaign is still 'draft' or 'scheduled', this will call executeCampaign first.
   */
  async dispatch(
    campaignId: string,
    options: DispatchOptions = {}
  ): Promise<DispatchResult> {
    const { autoComplete = true } = options;

    // 1. Fetch campaign
    const [camp] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!camp) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    applicationLogger.info('cdp', `Starting dispatch for campaign "${camp.name}" (${camp.id}), channel=${camp.channel}, status=${camp.status}`);

    // 2. Auto-execute if not yet sending
    if (camp.status === 'draft' || camp.status === 'scheduled') {
      applicationLogger.info('cdp', `Campaign ${campaignId} is ${camp.status}, auto-executing first...`);
      await campaignService.executeCampaign(campaignId);
    } else if (camp.status !== 'sending') {
      throw new Error(`Campaign ${campaignId} is in status "${camp.status}" — cannot dispatch. Expected "draft", "scheduled", or "sending".`);
    }

    // 3. Route to channel broadcaster
    let result: DispatchResult;

    try {
      switch (camp.channel) {
        case 'whatsapp':
          result = await this.dispatchWhatsApp(campaignId, camp.channel, options);
          break;

        case 'email':
          result = await this.dispatchEmail(campaignId, camp.channel, options);
          break;

        case 'sms':
          result = {
            campaignId,
            channel: 'sms',
            sent: 0,
            failed: 0,
            skipped: 0,
            completed: false,
            error: 'SMS channel not yet implemented. Configure an SMS provider to enable.',
          };
          applicationLogger.warn('cdp', 'SMS channel not implemented', { campaignId });
          break;

        case 'push':
          result = {
            campaignId,
            channel: 'push',
            sent: 0,
            failed: 0,
            skipped: 0,
            completed: false,
            error: 'Push notification channel not yet implemented.',
          };
          applicationLogger.warn('cdp', 'Push channel not implemented', { campaignId });
          break;

        default:
          throw new Error(`Unknown channel "${camp.channel}" for campaign ${campaignId}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      applicationLogger.error('cdp', `Broadcast failed for campaign ${campaignId}`, error instanceof Error ? error : undefined, { campaignId });
      result = {
        campaignId,
        channel: camp.channel,
        sent: 0,
        failed: 0,
        skipped: 0,
        completed: false,
        error: errorMsg,
      };
    }

    // 4. Auto-complete if enabled and broadcast was successful
    if (autoComplete && !result.error && (result.sent > 0 || result.skipped > 0)) {
      try {
        await campaignService.completeCampaign(campaignId);
        result.completed = true;
        applicationLogger.info('cdp', `Campaign ${campaignId} auto-completed`, { sent: result.sent, failed: result.failed, skipped: result.skipped });
      } catch (completeError) {
        applicationLogger.warn('cdp', `Auto-complete failed for campaign ${campaignId}`, { error: completeError instanceof Error ? completeError.message : String(completeError) });
        // Don't override the dispatch result — messages were sent successfully
      }
    }

    return result;
  }

  // ─── WhatsApp Dispatch ────────────────────────────────────────────────────

  private async dispatchWhatsApp(
    campaignId: string,
    channel: string,
    options: DispatchOptions
  ): Promise<DispatchResult> {
    const concurrency = options.concurrency ?? WHATSAPP_DEFAULT_CONCURRENCY;
    const batchDelayMs = options.batchDelayMs ?? WHATSAPP_DEFAULT_BATCH_DELAY_MS;

    applicationLogger.info('cdp', `WhatsApp broadcast: concurrency=${concurrency}, batchDelay=${batchDelayMs}ms`, { campaignId });

    const broadcastResult = await wabaService.broadcastCampaign(
      campaignId,
      concurrency,
      batchDelayMs
    );

    return {
      campaignId: broadcastResult.campaignId,
      channel,
      sent: broadcastResult.sent,
      failed: broadcastResult.failed,
      skipped: broadcastResult.skipped,
      completed: false, // will be set by auto-complete
    };
  }

  // ─── Email Dispatch ───────────────────────────────────────────────────────

  private async dispatchEmail(
    campaignId: string,
    channel: string,
    options: DispatchOptions
  ): Promise<DispatchResult> {
    const concurrency = Math.min(options.concurrency ?? EMAIL_DEFAULT_CONCURRENCY, 20);
    const batchDelayMs = options.batchDelayMs ?? EMAIL_DEFAULT_BATCH_DELAY_MS;

    applicationLogger.info('cdp', `Email broadcast: concurrency=${concurrency}, batchDelay=${batchDelayMs}ms`, { campaignId });

    const result = await this.broadcastEmailCampaign(campaignId, concurrency, batchDelayMs);

    return {
      campaignId: result.campaignId,
      channel,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      completed: false,
    };
  }

  /**
   * Email broadcast engine — iterates pending campaign_message records
   * and sends via SendGrid, mirroring wabaService.broadcastCampaign() pattern.
   */
  private async broadcastEmailCampaign(
    campaignId: string,
    concurrency: number,
    batchDelayMs: number
  ): Promise<EmailBroadcastResult> {
    // Fetch campaign for template/payload info
    const [camp] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!camp) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const senderEmail = process.env.SENDGRID_VERIFIED_SENDER || 'subs@think.web.id';
    const counters = { sent: 0, failed: 0, skipped: 0 };

    let hasMore = true;

    while (hasMore) {
      // Always query from offset 0 — processed messages leave the pending filter
      const pendingMessages = await db
        .select()
        .from(campaignMessage)
        .where(
          and(
            eq(campaignMessage.campaignId, campaignId),
            eq(campaignMessage.status, 'pending')
          )
        )
        .limit(EMAIL_PAGE_SIZE);

      if (pendingMessages.length === 0) {
        hasMore = false;
        break;
      }

      // Process in batches of `concurrency`
      for (let i = 0; i < pendingMessages.length; i += concurrency) {
        const batch = pendingMessages.slice(i, i + concurrency);

        const batchPromises = batch.map(async (msg) => {
          // Skip messages without recipient address
          if (!msg.recipientAddress) {
            await db
              .update(campaignMessage)
              .set({
                status: 'failed',
                failureReason: 'no_recipient_address',
                failedAt: new Date(),
              })
              .where(eq(campaignMessage.id, msg.id));
            counters.skipped++;
            return;
          }

          try {
            // Build email content from template payload
            const subject = this.resolveEmailSubject(camp, msg);
            const html = this.resolveEmailBody(camp, msg);

            const success = await sendEmail({
              to: msg.recipientAddress,
              from: senderEmail,
              subject,
              html,
            });

            if (success) {
              await db
                .update(campaignMessage)
                .set({
                  status: 'sent',
                  sentAt: new Date(),
                })
                .where(eq(campaignMessage.id, msg.id));
              counters.sent++;
            } else {
              await db
                .update(campaignMessage)
                .set({
                  status: 'failed',
                  failureReason: 'sendgrid_send_failed',
                  failedAt: new Date(),
                })
                .where(eq(campaignMessage.id, msg.id));
              counters.failed++;
            }
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'unknown_error';
            await db
              .update(campaignMessage)
              .set({
                status: 'failed',
                failureReason: reason.slice(0, 255),
                failedAt: new Date(),
              })
              .where(eq(campaignMessage.id, msg.id));
            counters.failed++;
          }
        });

        await Promise.all(batchPromises);

        // Rate limit delay between batches
        if (i + concurrency < pendingMessages.length && batchDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
        }
      }

      // If we got fewer than PAGE_SIZE, we've processed everything
      if (pendingMessages.length < EMAIL_PAGE_SIZE) {
        hasMore = false;
      }
    }

    // Refresh campaign analytics counters
    try {
      await campaignService.refreshAnalytics(campaignId);
    } catch {
      applicationLogger.warn('cdp', `Failed to refresh analytics for campaign ${campaignId}`);
    }

    applicationLogger.info('cdp', `Email broadcast complete for ${campaignId}`, { sent: counters.sent, failed: counters.failed, skipped: counters.skipped });

    return {
      campaignId,
      ...counters,
    };
  }

  /**
   * Resolve email subject from campaign template payload.
   * Falls back to campaign name if no subject configured.
   */
  private resolveEmailSubject(
    camp: typeof campaign.$inferSelect,
    msg: typeof campaignMessage.$inferSelect
  ): string {
    const payload = (msg.personalizedPayload ?? camp.templatePayload) as Record<string, unknown> | null;
    if (payload && typeof payload === 'object' && 'subject' in payload) {
      return String(payload.subject);
    }
    return camp.name;
  }

  /**
   * Resolve email HTML body from campaign template payload.
   * Supports simple variable replacement: {{variable}} → value from personalizedPayload.
   */
  private resolveEmailBody(
    camp: typeof campaign.$inferSelect,
    msg: typeof campaignMessage.$inferSelect
  ): string {
    const payload = (msg.personalizedPayload ?? camp.templatePayload) as Record<string, unknown> | null;

    // Get base template
    let html = '';
    if (payload && typeof payload === 'object') {
      if ('html' in payload) {
        html = String(payload.html);
      } else if ('body' in payload) {
        html = String(payload.body);
      } else if ('text' in payload) {
        html = `<p>${String(payload.text)}</p>`;
      }
    }

    if (!html) {
      html = `<p>${camp.description || camp.name}</p>`;
    }

    // Replace {{variable}} placeholders with personalized values
    if (msg.personalizedPayload && typeof msg.personalizedPayload === 'object') {
      const vars = msg.personalizedPayload as Record<string, unknown>;
      html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return vars[key] !== undefined ? String(vars[key]) : match;
      });
    }

    return html;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const campaignDispatcher = new CampaignDispatcher();
