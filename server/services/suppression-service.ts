import { db } from '../db';
import {
  suppressionList,
  customerIdentity,
  type SuppressionListEntry,
} from '@shared/schema';
import { eq, and, isNull, or, gt, sql, inArray } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

export type SuppressionReason =
  | 'unsubscribe'
  | 'bounce'
  | 'complaint'
  | 'legal'
  | 'manual'
  | 'fraud';

export interface AddSuppressionInput {
  identifierType: 'profile_id' | 'email' | 'phone' | 'global';
  identifierValue: string;
  channel?: string; // null/undefined = all channels
  reason: SuppressionReason;
  addedBy?: string; // user ID
  notes?: string;
  expiresAt?: Date;
}

export interface SuppressionCheckResult {
  isSuppressed: boolean;
  reason?: string;
  channel?: string | null;
}

export interface AudienceFilterResult {
  eligible: string[];
  suppressed: { profileId: string; reason: string }[];
}

export class SuppressionService {
  /**
   * Add an entry to the suppression list.
   */
  async addToSuppressionList(input: AddSuppressionInput): Promise<SuppressionListEntry> {
    // Check for existing active record first (handles nullable channel correctly)
    const existing = await db
      .select({ id: suppressionList.id })
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.identifierType, input.identifierType),
          eq(suppressionList.identifierValue, input.identifierValue),
          input.channel
            ? eq(suppressionList.channel, input.channel)
            : isNull(suppressionList.channel)
        )
      )
      .limit(1);

    let entry: SuppressionListEntry;

    if (existing.length > 0) {
      const [updated] = await db
        .update(suppressionList)
        .set({
          reason: input.reason,
          addedBy: input.addedBy ?? null,
          notes: input.notes,
          expiresAt: input.expiresAt ?? null,
          isActive: true,
        })
        .where(eq(suppressionList.id, existing[0].id))
        .returning();
      entry = updated;
    } else {
      const [inserted] = await db
        .insert(suppressionList)
        .values({
          identifierType: input.identifierType,
          identifierValue: input.identifierValue,
          channel: input.channel ?? null,
          reason: input.reason,
          addedBy: input.addedBy ?? null,
          notes: input.notes,
          expiresAt: input.expiresAt ?? null,
          isActive: true,
        })
        .returning();
      entry = inserted;
    }

    secureLogger.info('Added to suppression list', {
      identifierType: input.identifierType,
      channel: input.channel,
      reason: input.reason,
    }, 'SUPPRESSION');

    return entry;
  }

  /**
   * Deactivate a suppression entry (soft-delete).
   */
  async removeFromSuppressionList(
    identifierType: string,
    identifierValue: string,
    channel?: string
  ): Promise<void> {
    await db
      .update(suppressionList)
      .set({ isActive: false })
      .where(
        and(
          eq(suppressionList.identifierType, identifierType),
          eq(suppressionList.identifierValue, identifierValue),
          channel
            ? eq(suppressionList.channel, channel)
            : isNull(suppressionList.channel)
        )
      );

    secureLogger.info('Removed from suppression list', {
      identifierType,
      channel,
    }, 'SUPPRESSION');
  }

  /**
   * Check whether a given profile ID is suppressed for a specific channel.
   * Checks by profile_id, and also resolves known email/phone identifiers.
   */
  async isSuppressed(profileId: string, channel?: string): Promise<SuppressionCheckResult> {
    const now = new Date();

    // Build channel filter: match global null OR specific channel
    const channelCondition = channel
      ? or(isNull(suppressionList.channel), eq(suppressionList.channel, channel))
      : isNull(suppressionList.channel);

    // Expiry: not expired or no expiry
    const notExpired = or(
      isNull(suppressionList.expiresAt),
      gt(suppressionList.expiresAt, now)
    );

    // Check by profile_id directly
    const [byProfile] = await db
      .select()
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.identifierType, 'profile_id'),
          eq(suppressionList.identifierValue, profileId),
          eq(suppressionList.isActive, true),
          channelCondition,
          notExpired
        )
      )
      .limit(1);

    if (byProfile) {
      return { isSuppressed: true, reason: byProfile.reason, channel: byProfile.channel };
    }

    // Check global suppression — applies channelCondition so that a global record
    // with channel='email' only blocks email sends, not whatsapp sends.
    // A global record with channel=null blocks all channels.
    const [global] = await db
      .select()
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.identifierType, 'global'),
          eq(suppressionList.isActive, true),
          notExpired,
          channelCondition
        )
      )
      .limit(1);

    if (global) {
      return { isSuppressed: true, reason: global.reason, channel: global.channel };
    }

    // Resolve email/phone identifiers for this profile
    const identifiers = await db
      .select({ type: customerIdentity.identifierType, value: customerIdentity.identifierValue })
      .from(customerIdentity)
      .where(
        and(
          eq(customerIdentity.profileId, profileId),
          inArray(customerIdentity.identifierType, ['email', 'phone', 'whatsapp'])
        )
      );

    for (const id of identifiers) {
      const suppType = id.type === 'whatsapp' ? 'phone' : id.type;
      const [match] = await db
        .select()
        .from(suppressionList)
        .where(
          and(
            eq(suppressionList.identifierType, suppType),
            eq(suppressionList.identifierValue, id.value),
            eq(suppressionList.isActive, true),
            channelCondition,
            notExpired
          )
        )
        .limit(1);

      if (match) {
        return { isSuppressed: true, reason: match.reason, channel: match.channel };
      }
    }

    return { isSuppressed: false };
  }

  /**
   * Filter an audience list, removing suppressed profiles.
   * Returns eligible profile IDs and a list of suppressed ones with reasons.
   */
  async filterAudience(profileIds: string[], channel?: string): Promise<AudienceFilterResult> {
    if (profileIds.length === 0) {
      return { eligible: [], suppressed: [] };
    }

    const now = new Date();

    const channelCondition = channel
      ? or(isNull(suppressionList.channel), eq(suppressionList.channel, channel))
      : isNull(suppressionList.channel);

    const notExpired = or(
      isNull(suppressionList.expiresAt),
      gt(suppressionList.expiresAt, now)
    );

    // Check global suppression first — applies channelCondition so global records with
    // a specific channel value only block that channel (not all channels).
    const [global] = await db
      .select()
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.identifierType, 'global'),
          eq(suppressionList.isActive, true),
          notExpired,
          channelCondition
        )
      )
      .limit(1);

    if (global) {
      return {
        eligible: [],
        suppressed: profileIds.map(id => ({
          profileId: id,
          reason: `global_suppression:${global.reason}`,
        })),
      };
    }

    // Batch check by profile_id
    const suppressedByProfileId = await db
      .select({ value: suppressionList.identifierValue, reason: suppressionList.reason })
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.identifierType, 'profile_id'),
          inArray(suppressionList.identifierValue, profileIds),
          eq(suppressionList.isActive, true),
          channelCondition,
          notExpired
        )
      );

    const suppressedProfileIds = new Map(
      suppressedByProfileId.map(r => [r.value, r.reason])
    );

    // Collect profiles not yet suppressed
    const remaining = profileIds.filter(id => !suppressedProfileIds.has(id));

    // Resolve identifiers for remaining profiles and check email/phone suppressions
    if (remaining.length > 0) {
      const identifiers = await db
        .select({
          profileId: customerIdentity.profileId,
          type: customerIdentity.identifierType,
          value: customerIdentity.identifierValue,
        })
        .from(customerIdentity)
        .where(
          and(
            inArray(customerIdentity.profileId, remaining),
            inArray(customerIdentity.identifierType, ['email', 'phone', 'whatsapp'])
          )
        );

      // Group by profile
      const identifiersByProfile = new Map<string, { type: string; value: string }[]>();
      for (const id of identifiers) {
        if (!identifiersByProfile.has(id.profileId)) {
          identifiersByProfile.set(id.profileId, []);
        }
        identifiersByProfile.get(id.profileId)!.push({ type: id.type, value: id.value });
      }

      // Collect all email/phone values to check in batch
      const emailValues = identifiers.filter(i => i.type === 'email').map(i => i.value);
      const phoneValues = identifiers.filter(i => i.type === 'phone' || i.type === 'whatsapp').map(i => i.value);

      const suppressedEmails = emailValues.length > 0
        ? await db
            .select({ value: suppressionList.identifierValue, reason: suppressionList.reason })
            .from(suppressionList)
            .where(
              and(
                eq(suppressionList.identifierType, 'email'),
                inArray(suppressionList.identifierValue, emailValues),
                eq(suppressionList.isActive, true),
                channelCondition,
                notExpired
              )
            )
        : [];

      const suppressedPhones = phoneValues.length > 0
        ? await db
            .select({ value: suppressionList.identifierValue, reason: suppressionList.reason })
            .from(suppressionList)
            .where(
              and(
                eq(suppressionList.identifierType, 'phone'),
                inArray(suppressionList.identifierValue, phoneValues),
                eq(suppressionList.isActive, true),
                channelCondition,
                notExpired
              )
            )
        : [];

      const suppressedEmailMap = new Map(suppressedEmails.map(r => [r.value, r.reason]));
      const suppressedPhoneMap = new Map(suppressedPhones.map(r => [r.value, r.reason]));

      for (const profileId of remaining) {
        const ids = identifiersByProfile.get(profileId) ?? [];
        for (const id of ids) {
          const isEmail = id.type === 'email' && suppressedEmailMap.has(id.value);
          const isPhone = (id.type === 'phone' || id.type === 'whatsapp') && suppressedPhoneMap.has(id.value);
          if (isEmail) {
            suppressedProfileIds.set(profileId, suppressedEmailMap.get(id.value)!);
            break;
          }
          if (isPhone) {
            suppressedProfileIds.set(profileId, suppressedPhoneMap.get(id.value)!);
            break;
          }
        }
      }
    }

    const eligible: string[] = [];
    const suppressed: { profileId: string; reason: string }[] = [];

    for (const profileId of profileIds) {
      if (suppressedProfileIds.has(profileId)) {
        suppressed.push({ profileId, reason: suppressedProfileIds.get(profileId)! });
      } else {
        eligible.push(profileId);
      }
    }

    return { eligible, suppressed };
  }

  /**
   * List suppression entries with optional filters.
   */
  async listSuppressions(options: {
    channel?: string;
    identifierType?: string;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<SuppressionListEntry[]> {
    const conditions = [];

    if (options.activeOnly !== false) {
      conditions.push(eq(suppressionList.isActive, true));
    }
    if (options.channel) {
      conditions.push(eq(suppressionList.channel, options.channel));
    }
    if (options.identifierType) {
      conditions.push(eq(suppressionList.identifierType, options.identifierType));
    }

    const query = db.select().from(suppressionList);
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    return query
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);
  }
}

export const suppressionService = new SuppressionService();
