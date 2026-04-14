/**
 * Late Binding Resolution Service
 *
 * Solves Gap #4 + #3: "Smart linking data di kemudian hari"
 *
 * Scans anonymous events (profileId IS NULL) and rawEntities (status = 'pending')
 * and attempts to resolve them to known profiles based on:
 *   - Matching identifier patterns in eventProperties or raw data
 *   - Session/device ID that later got linked to a profile
 *   - Temporal proximity heuristics
 *
 * Designed to run as a periodic background job (e.g., every 5 minutes)
 * or triggered on-demand after new identity data arrives.
 *
 * @module LateBidingService
 */

import { db } from '../db';
import { eventStore, rawEntities, customerIdentity, customerProfile } from '@shared/schema';
import { eq, isNull, and, sql, inArray } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// ── Types ───────────────────────────────────────────────────────

export interface BindingResult {
  totalScanned: number;
  eventsResolved: number;
  entitiesResolved: number;
  errors: number;
  details: Array<{
    type: 'event' | 'entity';
    id: string;
    profileId: string;
    matchedVia: string;
  }>;
}

// ── Identifier extraction patterns ──────────────────────────────

const IDENTIFIER_PATTERNS: Array<{
  type: string;
  fields: string[];
  normalize: (value: string) => string;
}> = [
  {
    type: 'email',
    fields: ['email', 'user_email', 'contact_email', 'emailAddress', 'e_mail'],
    normalize: (v) => v.trim().toLowerCase(),
  },
  {
    type: 'phone',
    fields: ['phone', 'phoneNumber', 'phone_number', 'mobile', 'telephone', 'hp'],
    normalize: (v) => v.replace(/[\s\-\(\)\.]+/g, ''),
  },
  {
    type: 'whatsapp',
    fields: ['whatsapp', 'wa_id', 'whatsappId', 'wa_number'],
    normalize: (v) => v.replace(/[\s\-\(\)\.]+/g, ''),
  },
  {
    type: 'external_id',
    fields: ['user_id', 'userId', 'customer_id', 'customerId', 'member_id', 'memberId', 'account_id'],
    normalize: (v) => v.trim(),
  },
  {
    type: 'device_id',
    fields: ['device_id', 'deviceId', 'device_fingerprint'],
    normalize: (v) => v.trim(),
  },
  {
    type: 'session_id',
    fields: ['session_id', 'sessionId', 'session'],
    normalize: (v) => v.trim(),
  },
];

// ── Service ─────────────────────────────────────────────────────

class LateBidingService {
  /**
   * Run a full late-binding scan.
   *
   * 1. Fetch unresolved events (profileId IS NULL, up to batchSize)
   * 2. Extract identifiers from eventProperties / rawPayload
   * 3. Look up each identifier in customerIdentity
   * 4. If match found, UPDATE eventStore SET profileId = matched
   * 5. Same for rawEntities with status = 'pending' or 'classified'
   */
  async resolve(batchSize = 200): Promise<BindingResult> {
    const result: BindingResult = {
      totalScanned: 0,
      eventsResolved: 0,
      entitiesResolved: 0,
      errors: 0,
      details: [],
    };

    // ── Phase 1: Resolve anonymous events ───────────────────
    try {
      const unresolvedEvents = await db
        .select({
          id: eventStore.id,
          eventProperties: eventStore.eventProperties,
          rawPayload: eventStore.rawPayload,
          source: eventStore.source,
        })
        .from(eventStore)
        .where(isNull(eventStore.profileId))
        .limit(batchSize);

      result.totalScanned += unresolvedEvents.length;

      for (const event of unresolvedEvents) {
        try {
          const identifiers = this.extractIdentifiers(
            event.eventProperties as Record<string, unknown>,
            event.rawPayload as Record<string, unknown>
          );

          if (identifiers.length === 0) continue;

          const profileId = await this.lookupProfile(identifiers);
          if (!profileId) continue;

          await db
            .update(eventStore)
            .set({ profileId })
            .where(eq(eventStore.id, event.id));

          result.eventsResolved++;
          result.details.push({
            type: 'event',
            id: event.id,
            profileId,
            matchedVia: identifiers[0].type + ':' + identifiers[0].value.substring(0, 8) + '...',
          });
        } catch (err) {
          result.errors++;
        }
      }
    } catch (err) {
      secureLogger.error('Late binding event scan failed', { error: String(err) });
    }

    // ── Phase 2: Resolve raw entities ───────────────────────
    try {
      const unresolvedEntities = await db
        .select({
          id: rawEntities.id,
          data: rawEntities.data,
          entityType: rawEntities.entityType,
        })
        .from(rawEntities)
        .where(
          and(
            isNull(rawEntities.profileId),
            inArray(rawEntities.status, ['pending', 'classified'])
          )
        )
        .limit(batchSize);

      result.totalScanned += unresolvedEntities.length;

      for (const entity of unresolvedEntities) {
        try {
          const identifiers = this.extractIdentifiers(
            entity.data as Record<string, unknown>
          );

          if (identifiers.length === 0) continue;

          const profileId = await this.lookupProfile(identifiers);
          if (!profileId) continue;

          await db
            .update(rawEntities)
            .set({
              profileId,
              status: 'resolved',
              processedAt: new Date(),
            })
            .where(eq(rawEntities.id, entity.id));

          result.entitiesResolved++;
          result.details.push({
            type: 'entity',
            id: entity.id,
            profileId,
            matchedVia: identifiers[0].type + ':' + identifiers[0].value.substring(0, 8) + '...',
          });
        } catch (err) {
          result.errors++;
        }
      }
    } catch (err) {
      secureLogger.error('Late binding entity scan failed', { error: String(err) });
    }

    if (result.eventsResolved > 0 || result.entitiesResolved > 0) {
      secureLogger.info('Late binding resolution complete', {
        totalScanned: result.totalScanned,
        eventsResolved: result.eventsResolved,
        entitiesResolved: result.entitiesResolved,
        errors: result.errors,
      });
    }

    return result;
  }

  // ── Identifier Extraction ─────────────────────────────────

  private extractIdentifiers(
    ...dataSources: (Record<string, unknown> | null | undefined)[]
  ): Array<{ type: string; value: string }> {
    const found: Array<{ type: string; value: string }> = [];
    const seen = new Set<string>();

    for (const data of dataSources) {
      if (!data || typeof data !== 'object') continue;

      for (const pattern of IDENTIFIER_PATTERNS) {
        for (const field of pattern.fields) {
          // Check top-level
          const value = data[field];
          if (typeof value === 'string' && value.trim()) {
            const normalized = pattern.normalize(value);
            const key = `${pattern.type}:${normalized}`;
            if (!seen.has(key)) {
              seen.add(key);
              found.push({ type: pattern.type, value: normalized });
            }
          }

          // Check nested properties (e.g., eventProperties.email)
          const props = data.properties as Record<string, unknown> | undefined;
          if (props && typeof props === 'object') {
            const nestedValue = props[field];
            if (typeof nestedValue === 'string' && nestedValue.trim()) {
              const normalized = pattern.normalize(nestedValue);
              const key = `${pattern.type}:${normalized}`;
              if (!seen.has(key)) {
                seen.add(key);
                found.push({ type: pattern.type, value: normalized });
              }
            }
          }
        }
      }
    }

    return found;
  }

  // ── Profile Lookup ────────────────────────────────────────

  private async lookupProfile(
    identifiers: Array<{ type: string; value: string }>
  ): Promise<string | null> {
    for (const id of identifiers) {
      const match = await db
        .select({ profileId: customerIdentity.profileId })
        .from(customerIdentity)
        .where(
          and(
            eq(customerIdentity.identifierType, id.type),
            eq(customerIdentity.identifierValue, id.value)
          )
        )
        .limit(1);

      if (match.length > 0) {
        return match[0].profileId;
      }
    }

    // Fallback: check customerProfile directly for email/phone
    for (const id of identifiers) {
      if (id.type === 'email') {
        const match = await db
          .select({ id: customerProfile.id })
          .from(customerProfile)
          .where(eq(customerProfile.email, id.value))
          .limit(1);
        if (match.length > 0) return match[0].id;
      }
      if (id.type === 'phone' || id.type === 'whatsapp') {
        const field = id.type === 'whatsapp' ? customerProfile.whatsappId : customerProfile.phoneNumber;
        const match = await db
          .select({ id: customerProfile.id })
          .from(customerProfile)
          .where(eq(field, id.value))
          .limit(1);
        if (match.length > 0) return match[0].id;
      }
    }

    return null;
  }
}

export const lateBindingService = new LateBidingService();
