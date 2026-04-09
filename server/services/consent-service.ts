import { db } from '../db';
import {
  consentRecord,
  consentFrequencyLog,
  type ConsentRecord,
} from '@shared/schema';
import { eq, and, or, gte, inArray, count } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';
import { ingestEventService } from './ingest-event-service';

export type ConsentChannel = 'whatsapp' | 'email' | 'sms' | 'push' | 'all';
export type ConsentStatus = 'opt_in' | 'opt_out' | 'pending' | 'revoked';
export type ConsentMethod = 'explicit' | 'implicit' | 'double_opt_in' | 'system';
export type ConsentSource = 'web_form' | 'api' | 'waba' | 'crm' | 'import';

export interface RecordConsentInput {
  profileId: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  method?: ConsentMethod;
  source?: ConsentSource;
  consentText?: string;
  ipAddress?: string;
  userAgent?: string;
  maxSendsPerDay?: number | null;
  maxSendsPerWeek?: number | null;
  notes?: string;
}

export interface ConsentStatusResult {
  profileId: string;
  channel: string;
  hasConsent: boolean;
  status: ConsentStatus | null;
  consentedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxSendsPerDay: number | null;
  maxSendsPerWeek: number | null;
}

export interface BulkConsentResult {
  eligible: string[];
  ineligible: { profileId: string; reason: string }[];
}

export class ConsentService {
  /**
   * Record or update a consent decision for a profile and channel.
   * Logs the change as an event in the event_store for audit trail.
   */
  async recordConsent(input: RecordConsentInput): Promise<ConsentRecord> {
    const now = new Date();
    const isOptIn = input.status === 'opt_in';
    const isOptOut = input.status === 'opt_out' || input.status === 'revoked';

    const values = {
      profileId: input.profileId,
      channel: input.channel,
      status: input.status,
      method: input.method ?? 'explicit',
      source: input.source ?? 'api',
      consentText: input.consentText,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      maxSendsPerDay: input.maxSendsPerDay,
      maxSendsPerWeek: input.maxSendsPerWeek,
      notes: input.notes,
      consentedAt: isOptIn ? now : undefined,
      revokedAt: isOptOut ? now : undefined,
      updatedAt: now,
    };

    const [record] = await db
      .insert(consentRecord)
      .values(values)
      .onConflictDoUpdate({
        target: [consentRecord.profileId, consentRecord.channel],
        set: {
          status: input.status,
          method: input.method ?? 'explicit',
          source: input.source ?? 'api',
          consentText: input.consentText,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          maxSendsPerDay: input.maxSendsPerDay,
          maxSendsPerWeek: input.maxSendsPerWeek,
          notes: input.notes,
          consentedAt: isOptIn ? now : undefined,
          revokedAt: isOptOut ? now : undefined,
          updatedAt: now,
        },
      })
      .returning();

    // Audit trail: log consent change as an event in event_store
    await this.logConsentEvent(input.profileId, input.status, input.channel, input.source);

    secureLogger.info('Consent recorded', {
      profileId: input.profileId,
      channel: input.channel,
      status: input.status,
    }, 'CONSENT');

    return record;
  }

  /**
   * Revoke consent for a specific channel. Convenience wrapper.
   */
  async revokeConsent(
    profileId: string,
    channel: ConsentChannel,
    reason?: string,
    source?: ConsentSource
  ): Promise<ConsentRecord> {
    return this.recordConsent({
      profileId,
      channel,
      status: 'revoked',
      method: 'explicit',
      source: source ?? 'api',
      notes: reason,
    });
  }

  /**
   * Get consent status for a specific profile + channel combination.
   * Exact channel match takes precedence over an 'all' channel record.
   */
  async getConsentStatus(profileId: string, channel: string): Promise<ConsentStatusResult> {
    // Fetch both the specific channel record and the 'all' channel record
    const records = await db
      .select()
      .from(consentRecord)
      .where(
        and(
          eq(consentRecord.profileId, profileId),
          or(eq(consentRecord.channel, channel), eq(consentRecord.channel, 'all'))
        )
      );

    // Prefer exact channel match; fall back to 'all'
    const record =
      records.find(r => r.channel === channel) ??
      records.find(r => r.channel === 'all');

    const hasConsent = record?.status === 'opt_in' &&
      (!record.expiresAt || record.expiresAt > new Date());

    return {
      profileId,
      channel,
      hasConsent,
      status: (record?.status as ConsentStatus) ?? null,
      consentedAt: record?.consentedAt ?? null,
      revokedAt: record?.revokedAt ?? null,
      expiresAt: record?.expiresAt ?? null,
      maxSendsPerDay: record?.maxSendsPerDay ?? null,
      maxSendsPerWeek: record?.maxSendsPerWeek ?? null,
    };
  }

  /**
   * Check consent for multiple profiles at once.
   * Returns eligible (opted-in, not expired) and ineligible profile IDs.
   */
  async checkBulkConsent(profileIds: string[], channel: string): Promise<BulkConsentResult> {
    if (profileIds.length === 0) {
      return { eligible: [], ineligible: [] };
    }

    const records = await db
      .select()
      .from(consentRecord)
      .where(
        and(
          inArray(consentRecord.profileId, profileIds),
          or(eq(consentRecord.channel, channel), eq(consentRecord.channel, 'all'))
        )
      );

    const consentMap = new Map<string, ConsentRecord>();
    for (const r of records) {
      // 'all' channel overridden by specific channel if both exist
      if (!consentMap.has(r.profileId) || r.channel === channel) {
        consentMap.set(r.profileId, r);
      }
    }

    const now = new Date();
    const eligible: string[] = [];
    const ineligible: { profileId: string; reason: string }[] = [];

    for (const profileId of profileIds) {
      const record = consentMap.get(profileId);
      if (!record) {
        ineligible.push({ profileId, reason: 'no_consent_record' });
      } else if (record.status !== 'opt_in') {
        ineligible.push({ profileId, reason: `status_${record.status}` });
      } else if (record.expiresAt && record.expiresAt < now) {
        ineligible.push({ profileId, reason: 'consent_expired' });
      } else {
        eligible.push(profileId);
      }
    }

    return { eligible, ineligible };
  }

  /**
   * Check whether a profile is frequency-capped for a channel.
   * Exact channel match takes precedence over an 'all' channel record.
   */
  async isFrequencyCapped(profileId: string, channel: string): Promise<{ capped: boolean; reason?: string }> {
    const capRecords = await db
      .select({ channel: consentRecord.channel, maxSendsPerDay: consentRecord.maxSendsPerDay, maxSendsPerWeek: consentRecord.maxSendsPerWeek })
      .from(consentRecord)
      .where(
        and(
          eq(consentRecord.profileId, profileId),
          or(eq(consentRecord.channel, channel), eq(consentRecord.channel, 'all'))
        )
      );

    // Prefer exact channel match; fall back to 'all'
    const consent =
      capRecords.find(r => r.channel === channel) ??
      capRecords.find(r => r.channel === 'all');

    if (!consent) return { capped: false };

    const now = new Date();

    if (consent.maxSendsPerDay !== null && consent.maxSendsPerDay !== undefined) {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      const [{ value: dayCount }] = await db
        .select({ value: count() })
        .from(consentFrequencyLog)
        .where(
          and(
            eq(consentFrequencyLog.profileId, profileId),
            eq(consentFrequencyLog.channel, channel),
            gte(consentFrequencyLog.sentAt, dayStart)
          )
        );

      if (Number(dayCount) >= consent.maxSendsPerDay) {
        return { capped: true, reason: `daily_limit_reached (${consent.maxSendsPerDay}/day)` };
      }
    }

    if (consent.maxSendsPerWeek !== null && consent.maxSendsPerWeek !== undefined) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [{ value: weekCount }] = await db
        .select({ value: count() })
        .from(consentFrequencyLog)
        .where(
          and(
            eq(consentFrequencyLog.profileId, profileId),
            eq(consentFrequencyLog.channel, channel),
            gte(consentFrequencyLog.sentAt, weekStart)
          )
        );

      if (Number(weekCount) >= consent.maxSendsPerWeek) {
        return { capped: true, reason: `weekly_limit_reached (${consent.maxSendsPerWeek}/week)` };
      }
    }

    return { capped: false };
  }

  /**
   * Increment the frequency log for a profile/channel (call when a message is sent).
   */
  async recordSend(profileId: string, channel: string, campaignId?: string): Promise<void> {
    await db.insert(consentFrequencyLog).values({
      profileId,
      channel,
      campaignId: campaignId ?? null,
      sentAt: new Date(),
    });
  }

  /**
   * Private helper: log consent change as an event via the ingest pipeline.
   * Routes through IngestEventService to apply idempotency, identity resolution
   * (skipped since profileId is known), and attribute processing — consistent
   * with all other CDP events.
   */
  private async logConsentEvent(
    profileId: string,
    status: ConsentStatus,
    channel: string,
    source?: string
  ): Promise<void> {
    const now = Date.now();
    try {
      await ingestEventService.ingest({
        profileId,
        eventType: `consent.${status}`,
        source: source ?? 'api',
        channel,
        // Idempotency key encodes profileId + channel + status + second-level timestamp
        // to prevent duplicate audit events while allowing multiple consent changes per day
        idempotencyKey: `consent-${profileId}-${channel}-${status}-${Math.floor(now / 1000)}`,
        eventProperties: { channel, status, source: source ?? 'api' },
      });
    } catch (err) {
      secureLogger.warn('Failed to log consent event via ingest pipeline', {
        profileId,
        status,
        error: String(err),
      }, 'CONSENT');
    }
  }
}

export const consentService = new ConsentService();
