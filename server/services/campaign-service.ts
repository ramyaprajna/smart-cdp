/**
 * CDP Campaign Service — orchestrates campaign lifecycle
 *
 * Responsibilities:
 *  1. CRUD — create, update, cancel campaigns
 *  2. Audience resolution — evaluate segment via SegmentationEngine, filter
 *     through ConsentService/SuppressionService to derive eligible recipients
 *  3. Execution — generate campaign_message records for each eligible recipient
 *  4. Analytics — aggregate counters per campaign (derived from campaign_message)
 *  5. Delivery status updates — update campaign_message status from channel callbacks
 *  6. CDP event logging — campaign lifecycle events emitted to event_store
 *
 * Status lifecycle: draft → scheduled → sending → completed | cancelled
 *  ('sent' is not a discrete DB status — sending transitions directly to completed
 *   once all campaign_message records reach terminal states)
 */
import { db } from '../db';
import {
  campaign,
  campaignMessage,
  segmentDefinition,
  customerProfile,
  type Campaign,
  type CampaignMessage,
} from '@shared/schema';
import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { segmentationEngine } from './segmentation-engine-service';
import { consentService } from './consent-service';
import { suppressionService } from './suppression-service';
import { ingestEventService } from './ingest-event-service';
import { secureLogger } from '../utils/secure-logger';

// =====================================================
// Request/Result types
// =====================================================

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'push';
  segmentDefinitionId?: string;
  templateId?: string;
  templatePayload?: Record<string, unknown>;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  segmentDefinitionId?: string;
  templateId?: string;
  templatePayload?: Record<string, unknown>;
  scheduledAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface ExecuteCampaignResult {
  campaignId: string;
  totalResolved: number;
  eligible: number;
  suppressed: number;
  status: Campaign['status'];
}

export interface DeliveryStatusUpdateRequest {
  campaignId: string;
  profileId?: string;
  messageId?: string; // campaign_message.id or externalMessageId
  status: 'sent' | 'delivered' | 'read' | 'failed';
  externalMessageId?: string;
  failureReason?: string;
  timestamp?: Date;
}

export interface CampaignAnalytics {
  campaignId: string;
  name: string;
  channel: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  suppressedCount: number;
  deliveryRate: number; // deliveredCount / sentCount
  readRate: number;     // readCount / deliveredCount
  failureRate: number;  // failedCount / totalRecipients
}

// =====================================================
// Campaign Service
// =====================================================

class CampaignService {
  // -------------------------------------------------------
  // CRUD
  // -------------------------------------------------------

  /**
   * Create a new campaign in draft status.
   */
  async createCampaign(req: CreateCampaignRequest): Promise<Campaign> {
    if (req.segmentDefinitionId) {
      const [segDef] = await db
        .select({ id: segmentDefinition.id })
        .from(segmentDefinition)
        .where(eq(segmentDefinition.id, req.segmentDefinitionId))
        .limit(1);

      if (!segDef) {
        throw new Error(`Segment definition not found: ${req.segmentDefinitionId}`);
      }
    }

    const [created] = await db
      .insert(campaign)
      .values({
        name: req.name,
        description: req.description ?? null,
        channel: req.channel,
        status: 'draft',
        segmentDefinitionId: req.segmentDefinitionId ?? null,
        templateId: req.templateId ?? null,
        templatePayload: req.templatePayload ?? null,
        scheduledAt: req.scheduledAt ?? null,
        createdBy: req.createdBy ?? null,
        metadata: req.metadata ?? null,
      })
      .returning();

    await this.logCampaignEvent(created.id, 'campaign.created', {
      name: req.name,
      channel: req.channel,
      segmentDefinitionId: req.segmentDefinitionId ?? null,
      scheduledAt: req.scheduledAt?.toISOString() ?? null,
    }, `campaign-created-${created.id}`);

    secureLogger.info('Campaign created', { campaignId: created.id, name: req.name }, 'CAMPAIGN');
    return created;
  }

  /**
   * Update a campaign (only allowed in draft or scheduled status).
   */
  async updateCampaign(campaignId: string, req: UpdateCampaignRequest): Promise<Campaign> {
    const [existing] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!existing) throw new Error(`Campaign not found: ${campaignId}`);
    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new Error(`Cannot update campaign in status: ${existing.status}`);
    }

    if (req.segmentDefinitionId) {
      const [segDef] = await db
        .select({ id: segmentDefinition.id })
        .from(segmentDefinition)
        .where(eq(segmentDefinition.id, req.segmentDefinitionId))
        .limit(1);

      if (!segDef) throw new Error(`Segment definition not found: ${req.segmentDefinitionId}`);
    }

    const [updated] = await db
      .update(campaign)
      .set({
        ...(req.name !== undefined && { name: req.name }),
        ...(req.description !== undefined && { description: req.description }),
        ...(req.segmentDefinitionId !== undefined && { segmentDefinitionId: req.segmentDefinitionId }),
        ...(req.templateId !== undefined && { templateId: req.templateId }),
        ...(req.templatePayload !== undefined && { templatePayload: req.templatePayload }),
        ...(req.scheduledAt !== undefined && { scheduledAt: req.scheduledAt }),
        ...(req.metadata !== undefined && { metadata: req.metadata }),
        updatedAt: new Date(),
      })
      .where(eq(campaign.id, campaignId))
      .returning();

    return updated;
  }

  /**
   * Get a single campaign by ID.
   */
  async getCampaign(campaignId: string): Promise<Campaign> {
    const [c] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!c) throw new Error(`Campaign not found: ${campaignId}`);
    return c;
  }

  /**
   * List campaigns with optional status/channel filter.
   */
  async listCampaigns(filters?: {
    status?: string;
    channel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ campaigns: Campaign[]; total: number }> {
    const limit = Math.min(filters?.limit ?? 20, 100);
    const offset = filters?.offset ?? 0;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.status) conditions.push(eq(campaign.status, filters.status));
    if (filters?.channel) conditions.push(eq(campaign.channel, filters.channel));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [campaigns, countRows] = await Promise.all([
      db.select().from(campaign).where(whereClause).limit(limit).offset(offset),
      db.select({ total: count() }).from(campaign).where(whereClause),
    ]);

    return { campaigns, total: Number(countRows[0]?.total ?? 0) };
  }

  /**
   * Schedule a campaign (draft → scheduled).
   */
  async scheduleCampaign(campaignId: string, scheduledAt: Date): Promise<Campaign> {
    const [existing] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!existing) throw new Error(`Campaign not found: ${campaignId}`);
    if (existing.status !== 'draft') {
      throw new Error(`Campaign must be in draft status to schedule. Current: ${existing.status}`);
    }
    if (scheduledAt <= new Date()) {
      throw new Error('scheduledAt must be a future date');
    }

    const [updated] = await db
      .update(campaign)
      .set({ status: 'scheduled', scheduledAt, updatedAt: new Date() })
      .where(eq(campaign.id, campaignId))
      .returning();

    await this.logCampaignEvent(campaignId, 'campaign.scheduled', {
      scheduledAt: scheduledAt.toISOString(),
    }, `campaign-scheduled-${campaignId}-${scheduledAt.getTime()}`);

    secureLogger.info('Campaign scheduled', { campaignId, scheduledAt }, 'CAMPAIGN');
    return updated;
  }

  /**
   * Cancel a campaign (draft | scheduled | sending → cancelled).
   */
  async cancelCampaign(campaignId: string): Promise<Campaign> {
    const [existing] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!existing) throw new Error(`Campaign not found: ${campaignId}`);
    if (['completed', 'cancelled'].includes(existing.status)) {
      throw new Error(`Campaign is already ${existing.status}`);
    }

    const [updated] = await db
      .update(campaign)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(campaign.id, campaignId))
      .returning();

    await this.logCampaignEvent(campaignId, 'campaign.cancelled', {}, `campaign-cancelled-${campaignId}`);
    secureLogger.info('Campaign cancelled', { campaignId }, 'CAMPAIGN');
    return updated;
  }

  // -------------------------------------------------------
  // Audience Resolution & Execution
  // -------------------------------------------------------

  /**
   * Execute a campaign:
   *  1. Evaluate segment to get all matching profile IDs
   *  2. Filter through ConsentService for the campaign channel
   *  3. Filter through SuppressionService
   *  4. Generate campaign_message records for eligible recipients
   *  5. Set campaign status → sending
   *
   * This does NOT actually send messages — that is handled by the channel
   * integration layer (WABA/email) which reads pending campaign_message records.
   */
  async executeCampaign(campaignId: string): Promise<ExecuteCampaignResult> {
    const [c] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!c) throw new Error(`Campaign not found: ${campaignId}`);
    if (!['draft', 'scheduled'].includes(c.status)) {
      throw new Error(`Campaign cannot be executed in status: ${c.status}`);
    }

    // Step 1: Resolve audience from segment definition
    let profileIds: string[] = [];

    if (c.segmentDefinitionId) {
      const { matchingProfileIds } = await segmentationEngine.evaluateSegment(c.segmentDefinitionId);
      profileIds = matchingProfileIds;
    } else {
      // No segment = all profiles (full broadcast) — use IDs only for safety
      const allProfiles = await db
        .select({ id: customerProfile.id })
        .from(customerProfile);
      profileIds = allProfiles.map(p => p.id);
    }

    const totalResolved = profileIds.length;

    // Step 2: Consent filter — keep only opted-in profiles for this channel
    const consentResult = await consentService.checkBulkConsent(profileIds, c.channel);
    const eligibleAfterConsent = consentResult.eligible;

    // Step 3: Suppression filter — remove globally suppressed profiles
    const suppressionResult = await suppressionService.filterAudience(eligibleAfterConsent, c.channel);
    const eligible = suppressionResult.eligible;

    const suppressedByConsent = profileIds.length - eligibleAfterConsent.length;
    const suppressedBySuppression = eligibleAfterConsent.length - eligible.length;
    const totalSuppressed = suppressedByConsent + suppressedBySuppression;

    // Step 4: Get recipient contact addresses for eligible profiles
    const profileRows = eligible.length > 0
      ? await db
          .select({ id: customerProfile.id, email: customerProfile.email, whatsappId: customerProfile.whatsappId, phoneNumber: customerProfile.phoneNumber })
          .from(customerProfile)
          .where(inArray(customerProfile.id, eligible))
      : [];

    const profileMap = new Map(profileRows.map(p => [p.id, p]));

    // Step 5: Build campaign_message records for eligible recipients
    const now = new Date();
    const messageValues = eligible.map(profileId => {
      const profile = profileMap.get(profileId);
      const recipientAddress = this.resolveRecipientAddress(c.channel, profile);

      return {
        campaignId,
        profileId,
        channel: c.channel,
        status: 'pending' as const,
        recipientAddress: recipientAddress ?? null,
        personalizedPayload: c.templatePayload ?? null,
      };
    });

    // Build suppressed message records (for audit trail)
    const suppressedConsent = consentResult.ineligible.map(({ profileId, reason }) => ({
      campaignId,
      profileId,
      channel: c.channel,
      status: 'suppressed' as const,
      suppressionReason: reason,
      recipientAddress: null,
      personalizedPayload: null,
    }));

    const suppressedSuppression = suppressionResult.suppressed.map(({ profileId, reason }: { profileId: string; reason: string }) => ({
      campaignId,
      profileId,
      channel: c.channel,
      status: 'suppressed' as const,
      suppressionReason: reason,
      recipientAddress: null,
      personalizedPayload: null,
    }));

    const allMessageValues = [...messageValues, ...suppressedConsent, ...suppressedSuppression];

    // Insert campaign_message records (skip duplicates — idempotent execution)
    if (allMessageValues.length > 0) {
      await db
        .insert(campaignMessage)
        .values(allMessageValues)
        .onConflictDoNothing({ target: [campaignMessage.campaignId, campaignMessage.profileId] });
    }

    // Step 6: Update campaign counters and status
    const [updatedCampaign] = await db
      .update(campaign)
      .set({
        status: 'sending',
        executedAt: now,
        totalRecipients: eligible.length,
        updatedAt: now,
      })
      .where(eq(campaign.id, campaignId))
      .returning();

    // Log CDP campaign execution event
    await this.logCampaignEvent(campaignId, 'campaign.sent', {
      totalResolved,
      eligible: eligible.length,
      suppressed: totalSuppressed,
      channel: c.channel,
    }, `campaign-sent-${campaignId}`);

    secureLogger.info('Campaign executed', {
      campaignId,
      totalResolved,
      eligible: eligible.length,
      suppressed: totalSuppressed,
    }, 'CAMPAIGN');

    return {
      campaignId,
      totalResolved,
      eligible: eligible.length,
      suppressed: totalSuppressed,
      status: updatedCampaign.status,
    };
  }

  /**
   * Preview audience for a campaign without executing — returns counts only.
   */
  async previewAudience(campaignId: string): Promise<{
    totalResolved: number;
    eligible: number;
    suppressed: number;
  }> {
    const [c] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!c) throw new Error(`Campaign not found: ${campaignId}`);

    let profileIds: string[] = [];

    if (c.segmentDefinitionId) {
      const { matchingProfileIds } = await segmentationEngine.evaluateSegment(c.segmentDefinitionId);
      profileIds = matchingProfileIds;
    } else {
      const allProfiles = await db.select({ id: customerProfile.id }).from(customerProfile);
      profileIds = allProfiles.map(p => p.id);
    }

    const totalResolved = profileIds.length;
    const consentResult = await consentService.checkBulkConsent(profileIds, c.channel);
    const eligibleAfterConsent = consentResult.eligible;
    const suppressionResult = await suppressionService.filterAudience(eligibleAfterConsent, c.channel);

    return {
      totalResolved,
      eligible: suppressionResult.eligible.length,
      suppressed: totalResolved - suppressionResult.eligible.length,
    };
  }

  // -------------------------------------------------------
  // Delivery Status Updates
  // -------------------------------------------------------

  /**
   * Update delivery status for a campaign_message.
   * Called by channel integration callbacks (WABA webhook, email events, etc.)
   * Also updates campaign-level analytics counters.
   */
  async updateDeliveryStatus(req: DeliveryStatusUpdateRequest): Promise<CampaignMessage> {
    // Find the campaign_message record
    let msgId: string | undefined;

    if (req.messageId) {
      // Direct message ID lookup — confirm it belongs to the requested campaign
      const [owned] = await db
        .select({ id: campaignMessage.id })
        .from(campaignMessage)
        .where(and(
          eq(campaignMessage.id, req.messageId),
          eq(campaignMessage.campaignId, req.campaignId)
        ))
        .limit(1);

      if (!owned) throw new Error(`Campaign message not found for campaign: ${req.campaignId}`);
      msgId = owned.id;
    } else if (req.profileId) {
      const [msg] = await db
        .select({ id: campaignMessage.id })
        .from(campaignMessage)
        .where(and(
          eq(campaignMessage.campaignId, req.campaignId),
          eq(campaignMessage.profileId, req.profileId)
        ))
        .limit(1);

      if (!msg) throw new Error(`Campaign message not found for profile: ${req.profileId}`);
      msgId = msg.id;
    } else if (req.externalMessageId) {
      const [msg] = await db
        .select({ id: campaignMessage.id })
        .from(campaignMessage)
        .where(and(
          eq(campaignMessage.campaignId, req.campaignId),
          eq(campaignMessage.externalMessageId, req.externalMessageId)
        ))
        .limit(1);

      if (!msg) throw new Error(`Campaign message not found for externalMessageId: ${req.externalMessageId}`);
      msgId = msg.id;
    } else {
      throw new Error('One of messageId, profileId, or externalMessageId must be provided');
    }

    const ts = req.timestamp ?? new Date();
    const updateFields: Record<string, unknown> = {
      status: req.status,
      updatedAt: new Date(),
    };

    if (req.externalMessageId) updateFields.externalMessageId = req.externalMessageId;

    switch (req.status) {
      case 'sent':
        updateFields.sentAt = ts;
        break;
      case 'delivered':
        updateFields.deliveredAt = ts;
        break;
      case 'read':
        updateFields.readAt = ts;
        break;
      case 'failed':
        updateFields.failedAt = ts;
        if (req.failureReason) updateFields.failureReason = req.failureReason;
        break;
    }

    const [updated] = await db
      .update(campaignMessage)
      .set(updateFields)
      .where(eq(campaignMessage.id, msgId))
      .returning();

    // Refresh campaign analytics from message records
    await this.refreshCampaignAnalytics(req.campaignId);

    return updated;
  }

  /**
   * Mark sending complete — transition campaign from 'sending' to 'completed'.
   * Should be called when all campaign_message records are in terminal states.
   */
  async completeCampaign(campaignId: string): Promise<Campaign> {
    const [c] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!c) throw new Error(`Campaign not found: ${campaignId}`);
    if (c.status !== 'sending') {
      throw new Error(`Campaign must be in 'sending' status to complete. Current: ${c.status}`);
    }

    await this.refreshCampaignAnalytics(campaignId);

    const [updated] = await db
      .update(campaign)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaign.id, campaignId))
      .returning();

    await this.logCampaignEvent(campaignId, 'campaign.completed', {
      sentCount: updated.sentCount,
      deliveredCount: updated.deliveredCount,
      readCount: updated.readCount,
      failedCount: updated.failedCount,
    }, `campaign-completed-${campaignId}`);

    secureLogger.info('Campaign completed', { campaignId, sentCount: updated.sentCount }, 'CAMPAIGN');
    return updated;
  }

  // -------------------------------------------------------
  // Analytics
  // -------------------------------------------------------

  /**
   * Get campaign analytics — combines campaign counters + derived rates.
   */
  async getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    const [c] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!c) throw new Error(`Campaign not found: ${campaignId}`);

    // Recompute from message records for accuracy
    const msgCounts = await db
      .select({
        status: campaignMessage.status,
        total: count(),
      })
      .from(campaignMessage)
      .where(eq(campaignMessage.campaignId, campaignId))
      .groupBy(campaignMessage.status);

    const counts: Record<string, number> = {};
    for (const row of msgCounts) {
      counts[row.status] = Number(row.total);
    }

    const sentCount = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0);
    const deliveredCount = (counts.delivered ?? 0) + (counts.read ?? 0);
    const readCount = counts.read ?? 0;
    const failedCount = counts.failed ?? 0;
    const suppressedCount = counts.suppressed ?? 0;
    const totalRecipients = c.totalRecipients || (sentCount + failedCount);

    return {
      campaignId,
      name: c.name,
      channel: c.channel,
      status: c.status,
      totalRecipients,
      sentCount,
      deliveredCount,
      readCount,
      failedCount,
      suppressedCount,
      deliveryRate: sentCount > 0 ? Number((deliveredCount / sentCount).toFixed(4)) : 0,
      readRate: deliveredCount > 0 ? Number((readCount / deliveredCount).toFixed(4)) : 0,
      failureRate: totalRecipients > 0 ? Number((failedCount / totalRecipients).toFixed(4)) : 0,
    };
  }

  /**
   * List campaign messages for a campaign (paginated).
   */
  async getCampaignMessages(campaignId: string, filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: CampaignMessage[]; total: number }> {
    const limit = Math.min(filters?.limit ?? 50, 500);
    const offset = filters?.offset ?? 0;

    const conditions = [eq(campaignMessage.campaignId, campaignId)];
    if (filters?.status) conditions.push(eq(campaignMessage.status, filters.status));
    const whereClause = and(...conditions);

    const [messages, countRows] = await Promise.all([
      db.select().from(campaignMessage).where(whereClause).limit(limit).offset(offset),
      db.select({ total: count() }).from(campaignMessage).where(whereClause),
    ]);

    return { messages, total: Number(countRows[0]?.total ?? 0) };
  }

  // -------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------

  private resolveRecipientAddress(
    channel: string,
    profile: { email: string | null; whatsappId: string | null; phoneNumber: string | null } | undefined
  ): string | null {
    if (!profile) return null;
    switch (channel) {
      case 'email': return profile.email;
      case 'whatsapp': return profile.whatsappId ?? profile.phoneNumber;
      case 'sms': return profile.phoneNumber;
      default: return null;
    }
  }

  async refreshAnalytics(campaignId: string): Promise<void> {
    return this.refreshCampaignAnalytics(campaignId);
  }

  private async refreshCampaignAnalytics(campaignId: string): Promise<void> {
    const msgCounts = await db
      .select({ status: campaignMessage.status, total: count() })
      .from(campaignMessage)
      .where(eq(campaignMessage.campaignId, campaignId))
      .groupBy(campaignMessage.status);

    const counts: Record<string, number> = {};
    for (const row of msgCounts) {
      counts[row.status] = Number(row.total);
    }

    const sentCount = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0);
    const deliveredCount = (counts.delivered ?? 0) + (counts.read ?? 0);
    const readCount = counts.read ?? 0;
    const failedCount = counts.failed ?? 0;

    await db
      .update(campaign)
      .set({
        sentCount,
        deliveredCount,
        readCount,
        failedCount,
        updatedAt: new Date(),
      })
      .where(eq(campaign.id, campaignId));
  }

  private async logCampaignEvent(
    campaignId: string,
    eventType: string,
    properties: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<void> {
    await ingestEventService.ingest({
      profileId: '00000000-0000-0000-0000-000000000000', // System profile for campaign events
      eventType,
      source: 'campaign_service',
      channel: 'internal',
      idempotencyKey,
      eventProperties: { campaignId, ...properties },
    }).catch(err => {
      secureLogger.warn('Campaign CDP event log failed (non-fatal)', {
        eventType,
        campaignId,
        error: err instanceof Error ? err.message : String(err),
      }, 'CAMPAIGN');
    });
  }
}

export const campaignService = new CampaignService();
