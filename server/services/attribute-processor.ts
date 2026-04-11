import { db } from "../db";
import { customerProfile, eventStore } from "@shared/schema";
import { eq, count } from "drizzle-orm";
import { secureLogger } from "../utils/secure-logger";
import type { EventStoreEntry } from "@shared/schema";

class AttributeProcessor {
  async processEvent(event: EventStoreEntry): Promise<void> {
    // Anonymous events (no profileId) — skip attribute enrichment
    if (!event.profileId) {
      secureLogger.info("Attribute processor: skipping anonymous event", {
        eventId: event.id,
        eventType: event.eventType,
      });
      return;
    }

    const totalEventsResult = await db
      .select({ total: count() })
      .from(eventStore)
      .where(eq(eventStore.profileId, event.profileId));

    const totalEventsCount = totalEventsResult[0]?.total ?? 0;

    const existingProfile = await db
      .select({ attributes: customerProfile.attributes })
      .from(customerProfile)
      .where(eq(customerProfile.id, event.profileId))
      .limit(1);

    if (existingProfile.length === 0) {
      secureLogger.warn("Attribute processor: profile not found", {
        profileId: event.profileId,
      });
      return;
    }

    const existingAttributes = (existingProfile[0].attributes as Record<string, unknown>) ?? {};

    const updatedAttributes: Record<string, unknown> = {
      ...existingAttributes,
      lastActivityDate: (event.eventTimestamp ?? new Date()).toISOString(),
      totalEventsCount,
      lastEventType: event.eventType,
      lastEventSource: event.source,
    };

    const enrichments = this.getEventTypeEnrichments(event, existingAttributes);
    Object.assign(updatedAttributes, enrichments);

    await db
      .update(customerProfile)
      .set({
        attributes: updatedAttributes,
        updatedAt: new Date(),
      })
      .where(eq(customerProfile.id, event.profileId));

    secureLogger.info("Attribute processor updated profile", {
      profileId: event.profileId,
      eventType: event.eventType,
      totalEventsCount,
    });
  }

  private getEventTypeEnrichments(
    event: EventStoreEntry,
    existingAttributes: Record<string, unknown>
  ): Record<string, unknown> {
    const props = (event.eventProperties as Record<string, unknown>) ?? {};

    switch (event.eventType) {
      case "purchase":
      case "order_completed": {
        const amount = typeof props.amount === "number" ? props.amount : undefined;
        if (amount !== undefined) {
          const currentLtv = typeof existingAttributes.lifetimeValue === "number"
            ? existingAttributes.lifetimeValue
            : 0;
          return { lifetimeValue: currentLtv + amount };
        }
        return {};
      }

      case "segment_change": {
        const segment = typeof props.segment === "string" ? props.segment : undefined;
        if (segment) {
          return { customerSegment: segment };
        }
        return {};
      }

      default:
        return {};
    }
  }
}

export const attributeProcessor = new AttributeProcessor();
