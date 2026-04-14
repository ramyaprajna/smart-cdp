import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eventStore } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ingestPayloadSchema, type IngestPayload } from "@shared/ingest-schemas";
import { identityResolutionService } from "../services/identity-resolution-service";
import { attributeProcessor } from "../services/attribute-processor";
import { ingestEventService } from "../services/ingest-event-service";
import { secureLogger } from "../utils/secure-logger";
import { rateLimitMiddleware } from "../performance-middleware";

// Validation schema for anonymous event ingestion
const anonymousIngestSchema = z.object({
  anonymousId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  eventType: z.string().min(1),
  eventTimestamp: z.string().datetime().optional(),
  source: z.string().min(1),
  channel: z.string().optional(),
  idempotencyKey: z.string().min(1),
  properties: z.record(z.unknown()).optional(),
});

// Validation schema for linking anonymous events to a profile
const linkAnonymousSchema = z.object({
  anonymousId: z.string().min(1),
  identifiers: z.array(z.object({
    type: z.string().min(1),
    value: z.string().min(1),
    sourceSystem: z.string().optional(),
  })).min(1),
});

function normalizeIdentifier(id: { type: string; value: string }): { type: string; value: string } {
  const value = id.value.trim();
  switch (id.type) {
    case "email":
      return { type: id.type, value: value.toLowerCase() };
    case "phone":
    case "wa_id":
      return { type: id.type, value: value.replace(/[\s\-()]/g, "") };
    default:
      return { type: id.type, value };
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    return (error as { code: string }).code === "23505";
  }
  return false;
}

export function setupIngestRoutes(app: Express): void {
  app.post("/api/ingest/event", rateLimitMiddleware(60, 60000), async (req, res) => {
    try {
      const parsed = ingestPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const payload = parsed.data;
      const identifiers = payload.identifiers ?? [];
      const normalizedIdentifiers = identifiers.map(normalizeIdentifier);
      const idempotencyKey = payload.idempotencyKey;
      const isAnonymous = normalizedIdentifiers.length === 0;

      // Idempotency check
      const existing = await db
        .select({ id: eventStore.id })
        .from(eventStore)
        .where(eq(eventStore.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing.length > 0) {
        return res.status(200).json({
          status: "already_processed",
          eventId: existing[0].id,
          message: "Duplicate event — already ingested",
        });
      }

      // Identity resolution — only if identifiers are provided
      let resolvedProfileId: string | null = null;
      let isNewProfile = false;

      if (!isAnonymous) {
        const resolveResult = await identityResolutionService.resolve(
          normalizedIdentifiers.map((id) => ({
            type: id.type === "wa_id" ? "whatsapp" : id.type,
            value: id.value,
            sourceSystem: payload.sourceChannel,
          }))
        );
        resolvedProfileId = resolveResult.profileId;
        isNewProfile = resolveResult.isNew;
      }

      const eventProperties = buildEventProperties(payload);

      let event;
      try {
        const inserted = await db
          .insert(eventStore)
          .values({
            profileId: resolvedProfileId,  // null for anonymous events
            eventType: payload.eventType,
            eventTimestamp: payload.eventTimestamp
              ? new Date(payload.eventTimestamp)
              : new Date(),
            source: payload.sourceChannel,
            channel: payload.sourceChannel,
            idempotencyKey,
            eventProperties,
            rawPayload: req.body,
            processedAt: new Date(),
          })
          .onConflictDoNothing({ target: eventStore.idempotencyKey })
          .returning();

        if (inserted.length === 0) {
          const dup = await db
            .select({ id: eventStore.id })
            .from(eventStore)
            .where(eq(eventStore.idempotencyKey, idempotencyKey))
            .limit(1);

          return res.status(200).json({
            status: "already_processed",
            eventId: dup[0]?.id,
            message: "Duplicate event — already ingested",
          });
        }

        event = inserted[0];
      } catch (insertError: unknown) {
        if (isUniqueViolation(insertError)) {
          const dup = await db
            .select({ id: eventStore.id })
            .from(eventStore)
            .where(eq(eventStore.idempotencyKey, idempotencyKey))
            .limit(1);

          return res.status(200).json({
            status: "already_processed",
            eventId: dup[0]?.id,
            message: "Duplicate event — already ingested",
          });
        }
        throw insertError;
      }

      // Attribute processing (skips internally if profileId is null)
      await attributeProcessor.processEvent(event);

      return res.status(201).json({
        status: "created",
        event,
        isNewProfile,
        isAnonymous,
      });
    } catch (error) {
      secureLogger.error("Ingest pipeline error", {
        error: String(error),
      });
      return res.status(500).json({ error: "Event ingestion failed" });
    }
  });

  // POST /api/ingest/anonymous — anonymous event ingestion (no identifier required)
  app.post("/api/ingest/anonymous", rateLimitMiddleware(120, 60000), async (req, res) => {
    try {
      const parsed = anonymousIngestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const payload = parsed.data;

      const result = await ingestEventService.ingest({
        anonymousId: payload.anonymousId,
        sessionId: payload.sessionId,
        eventType: payload.eventType,
        eventTimestamp: payload.eventTimestamp ? new Date(payload.eventTimestamp) : undefined,
        source: payload.source,
        channel: payload.channel,
        idempotencyKey: payload.idempotencyKey,
        eventProperties: payload.properties,
        rawPayload: req.body,
      });

      const statusCode = result.status === 'created' ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (error) {
      secureLogger.error("Anonymous ingest error", { error: String(error) });
      return res.status(500).json({ error: "Anonymous event ingestion failed" });
    }
  });

  // POST /api/ingest/link — link anonymous events to identified profile
  app.post("/api/ingest/link", rateLimitMiddleware(30, 60000), async (req, res) => {
    try {
      const parsed = linkAnonymousSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const { anonymousId, identifiers } = parsed.data;

      // First resolve the profile from identifiers
      const resolveResult = await identityResolutionService.resolve(
        identifiers.map(id => ({
          type: id.type === 'wa_id' ? 'whatsapp' : id.type,
          value: id.value.trim(),
          sourceSystem: id.sourceSystem ?? 'anonymous_link',
        }))
      );

      // Then link all anonymous events to this profile
      const linkResult = await ingestEventService.linkAnonymousEvents(
        anonymousId,
        resolveResult.profileId
      );

      return res.status(200).json({
        ...linkResult,
        isNewProfile: resolveResult.isNew,
      });
    } catch (error) {
      secureLogger.error("Anonymous link error", { error: String(error) });
      return res.status(500).json({ error: "Anonymous event linking failed" });
    }
  });
}

function buildEventProperties(payload: IngestPayload): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(payload.properties ?? {}) };

  switch (payload.sourceChannel) {
    case "waba":
      if (payload.wabaMetadata && Object.keys(payload.wabaMetadata).length > 0) {
        props._wabaMetadata = payload.wabaMetadata;
      }
      break;
    case "wa_flow":
      if (payload.flowMetadata && Object.keys(payload.flowMetadata).length > 0) {
        props._flowMetadata = payload.flowMetadata;
      }
      break;
    case "crm":
      if (payload.crmMetadata && Object.keys(payload.crmMetadata).length > 0) {
        props._crmMetadata = payload.crmMetadata;
      }
      break;
  }

  return props;
}
