/**
 * CDP Ingest Event Service — shared internal ingest pipeline
 *
 * Encapsulates the core event ingestion logic (idempotency, identity
 * resolution, event_store insert, attribute processing) so it can be
 * reused by both the HTTP ingest route and internal system services
 * (e.g., ConsentService audit logging) without duplicating pipeline behavior.
 */
import { db } from '../db';
import { eventStore } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { identityResolutionService } from './identity-resolution-service';
import { attributeProcessor } from './attribute-processor';
import { secureLogger } from '../utils/secure-logger';

export interface IngestEventInput {
  /** Resolved profile ID — skip identity resolution when provided */
  profileId?: string;
  /** Identifiers used for identity resolution when profileId is not known */
  identifiers?: { type: string; value: string; sourceSystem?: string }[];
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
  profileId: string | null;  // null for anonymous events
  isNewProfile?: boolean;
  isAnonymous?: boolean;
}

export class IngestEventService {
  /**
   * Ingest a single event through the CDP pipeline.
   *
   * Behaviour mirrors the HTTP ingest route:
   *  1. Idempotency check — return existing event if already processed
   *  2. Identity resolution — resolve profileId from identifiers (if needed)
   *  3. Insert into event_store with ON CONFLICT DO NOTHING
   *  4. Trigger attribute processing for downstream enrichment
   */
  async ingest(input: IngestEventInput): Promise<IngestEventResult> {
    // 1. Idempotency check
    const existing = await db
      .select({ id: eventStore.id, profileId: eventStore.profileId })
      .from(eventStore)
      .where(eq(eventStore.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return {
        status: 'already_processed',
        eventId: existing[0].id,
        profileId: existing[0].profileId,
      };
    }

    // 2. Identity resolution (skip if profileId already known)
    let resolvedProfileId: string | null = input.profileId ?? null;
    let isNewProfile = false;
    let isAnonymous = false;

    if (!resolvedProfileId) {
      if (input.identifiers && input.identifiers.length > 0) {
        // Has identifiers — resolve to profile
        const resolveResult = await identityResolutionService.resolve(
          input.identifiers.map(id => ({
            type: id.type === 'wa_id' ? 'whatsapp' : id.type,
            value: id.value,
            sourceSystem: id.sourceSystem ?? input.source,
          }))
        );
        resolvedProfileId = resolveResult.profileId;
        isNewProfile = resolveResult.isNew;
      } else {
        // No identifiers, no profileId — anonymous event
        // Store with profileId = null; can be linked later via Late Binding
        isAnonymous = true;
        secureLogger.info('Anonymous event ingested (no identifiers)', {
          eventType: input.eventType,
          source: input.source,
          idempotencyKey: input.idempotencyKey,
        }, 'INGEST');
      }
    }

    // 3. Insert event (profileId may be null for anonymous events)
    const inserted = await db
      .insert(eventStore)
      .values({
        profileId: resolvedProfileId,
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
      };
    }

    const event = inserted[0];

    // 4. Attribute processing
    try {
      await attributeProcessor.processEvent(event);
    } catch (err) {
      secureLogger.warn('Attribute processing failed for ingest event', {
        eventId: event.id,
        eventType: input.eventType,
        error: String(err),
      }, 'INGEST');
    }

    return {
      status: 'created',
      eventId: event.id,
      profileId: resolvedProfileId,
      isNewProfile,
      isAnonymous,
    };
  }
}

export const ingestEventService = new IngestEventService();
