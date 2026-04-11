/**
 * CDP Ingest Event Service — shared internal ingest pipeline
 *
 * Encapsulates the core event ingestion logic (idempotency, identity
 * resolution, event_store insert, attribute processing) so it can be
 * reused by both the HTTP ingest route and internal system services
 * (e.g., ConsentService audit logging) without duplicating pipeline behavior.
 *
 * Supports three ingestion modes:
 *   1. Identified   — profileId provided directly
 *   2. Resolvable   — identifiers provided → identity resolution finds/creates profile
 *   3. Anonymous     — no profileId, no identifiers → stored with anonymousId/sessionId
 *                      for later linking via identity resolution
 */
import { randomUUID } from 'crypto';
import { db } from '../db';
import { eventStore } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { identityResolutionService } from './identity-resolution-service';
import { attributeProcessor } from './attribute-processor';
import { secureLogger } from '../utils/secure-logger';

export interface IngestEventInput {
  /** Resolved profile ID — skip identity resolution when provided */
  profileId?: string;
  /** Identifiers used for identity resolution when profileId is not known */
  identifiers?: { type: string; value: string; sourceSystem?: string }[];
  /** Anonymous visitor/device ID — used when no identifiers are available */
  anonymousId?: string;
  /** Browser/device session ID — groups anonymous events into sessions */
  sessionId?: string;
  eventType: string;
  eventTimestamp?: Date;
  source: string;
  channel?: string;
  idempotencyKey: string;
  eventProperties?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}

export interface IngestEventResult {
  status: 'created' | 'already_processed';
  eventId: string;
  profileId: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  isNewProfile?: boolean;
  isAnonymous: boolean;
}

export interface LinkAnonymousResult {
  linked: number;
  profileId: string;
  anonymousId: string;
}

export class IngestEventService {
  /**
   * Ingest a single event through the CDP pipeline.
   *
   * Behaviour:
   *  1. Idempotency check — return existing event if already processed
   *  2. Identity resolution — resolve profileId from identifiers (if provided)
   *     OR accept anonymous events without any identifier
   *  3. Insert into event_store with ON CONFLICT DO NOTHING
   *  4. Trigger attribute processing for downstream enrichment (identified only)
   */
  async ingest(input: IngestEventInput): Promise<IngestEventResult> {
    // 1. Idempotency check
    const existing = await db
      .select({ id: eventStore.id, profileId: eventStore.profileId, anonymousId: eventStore.anonymousId })
      .from(eventStore)
      .where(eq(eventStore.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return {
        status: 'already_processed',
        eventId: existing[0].id,
        profileId: existing[0].profileId,
        anonymousId: existing[0].anonymousId,
        isAnonymous: !existing[0].profileId,
      };
    }

    // 2. Identity resolution (three modes)
    let resolvedProfileId: string | null = input.profileId ?? null;
    let isNewProfile = false;
    let anonymousId = input.anonymousId ?? null;
    const sessionId = input.sessionId ?? null;

    if (!resolvedProfileId && input.identifiers && input.identifiers.length > 0) {
      // Mode 2: Resolvable — identifiers provided
      const resolveResult = await identityResolutionService.resolve(
        input.identifiers.map(id => ({
          type: id.type === 'wa_id' ? 'whatsapp' : id.type,
          value: id.value,
          sourceSystem: id.sourceSystem ?? input.source,
        }))
      );
      resolvedProfileId = resolveResult.profileId;
      isNewProfile = resolveResult.isNew;
    } else if (!resolvedProfileId) {
      // Mode 3: Anonymous — generate anonymousId if not provided
      if (!anonymousId) {
        anonymousId = `anon_${randomUUID()}`;
      }
      secureLogger.info('Anonymous event ingestion', {
        anonymousId,
        sessionId,
        eventType: input.eventType,
        source: input.source,
      }, 'INGEST');
    }

    // 3. Insert event
    const inserted = await db
      .insert(eventStore)
      .values({
        profileId: resolvedProfileId,
        anonymousId,
        sessionId,
        eventType: input.eventType,
        eventTimestamp: input.eventTimestamp ?? new Date(),
        source: input.source,
        channel: input.channel ?? null,
        idempotencyKey: input.idempotencyKey,
        eventProperties: input.eventProperties ?? {},
        rawPayload: input.rawPayload ?? null,
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: eventStore.idempotencyKey })
      .returning();

    if (inserted.length === 0) {
      // Race condition — another process inserted first
      const dup = await db
        .select({ id: eventStore.id })
        .from(eventStore)
        .where(eq(eventStore.idempotencyKey, input.idempotencyKey))
        .limit(1);

      return {
        status: 'already_processed',
        eventId: dup[0]?.id ?? 'unknown',
        profileId: resolvedProfileId,
        anonymousId,
        isAnonymous: !resolvedProfileId,
      };
    }

    const event = inserted[0];

    // 4. Attribute processing (only for identified events)
    if (resolvedProfileId) {
      try {
        await attributeProcessor.processEvent(event);
      } catch (err) {
        secureLogger.warn('Attribute processing failed for ingest event', {
          eventId: event.id,
          eventType: input.eventType,
          error: String(err),
        }, 'INGEST');
      }
    }

    return {
      status: 'created',
      eventId: event.id,
      profileId: resolvedProfileId,
      anonymousId,
      sessionId,
      isNewProfile,
      isAnonymous: !resolvedProfileId,
    };
  }

  /**
   * Link anonymous events to an identified profile.
   *
   * Called when an anonymous visitor later identifies themselves (e.g., login,
   * form submission, WhatsApp message with phone number). All events with the
   * given anonymousId are bound to the resolved profileId.
   */
  async linkAnonymousEvents(
    anonymousId: string,
    profileId: string
  ): Promise<LinkAnonymousResult> {
    const updated = await db
      .update(eventStore)
      .set({
        profileId,
        linkedAt: new Date(),
      })
      .where(
        and(
          eq(eventStore.anonymousId, anonymousId),
          isNull(eventStore.profileId)
        )
      )
      .returning({ id: eventStore.id });

    secureLogger.info('Anonymous events linked to profile', {
      anonymousId,
      profileId,
      linkedCount: updated.length,
    }, 'INGEST');

    // Trigger attribute processing for the newly linked events
    for (const event of updated) {
      try {
        const fullEvent = await db
          .select()
          .from(eventStore)
          .where(eq(eventStore.id, event.id))
          .limit(1);
        if (fullEvent[0]) {
          await attributeProcessor.processEvent(fullEvent[0]);
        }
      } catch (err) {
        secureLogger.warn('Attribute processing failed for linked event', {
          eventId: event.id,
          error: String(err),
        }, 'INGEST');
      }
    }

    return {
      linked: updated.length,
      profileId,
      anonymousId,
    };
  }
}

export const ingestEventService = new IngestEventService();
