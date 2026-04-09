import type { Express } from "express";
import { db } from "../db";
import { eventStore } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ingestPayloadSchema, type IngestPayload } from "@shared/ingest-schemas";
import { identityResolutionService } from "../services/identity-resolution-service";
import { attributeProcessor } from "../services/attribute-processor";
import { secureLogger } from "../utils/secure-logger";
import { rateLimitMiddleware } from "../performance-middleware";

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
      const normalizedIdentifiers = payload.identifiers.map(normalizeIdentifier);
      const idempotencyKey = payload.idempotencyKey;

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

      const resolveResult = await identityResolutionService.resolve(
        normalizedIdentifiers.map((id) => ({
          type: id.type === "wa_id" ? "whatsapp" : id.type,
          value: id.value,
          sourceSystem: payload.sourceChannel,
        }))
      );

      const eventProperties = buildEventProperties(payload);

      let event;
      try {
        const inserted = await db
          .insert(eventStore)
          .values({
            profileId: resolveResult.profileId,
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

      await attributeProcessor.processEvent(event);

      return res.status(201).json({
        status: "created",
        event,
        isNewProfile: resolveResult.isNew,
      });
    } catch (error) {
      secureLogger.error("Ingest pipeline error", {
        error: String(error),
      });
      return res.status(500).json({ error: "Event ingestion failed" });
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
