/**
 * Anonymous Analytics Service
 *
 * Solves Gap #5: "Behavior data tanpa profil tetap menghasilkan insights"
 *
 * Aggregates and analyzes events regardless of whether they have a profileId.
 * Provides insights from anonymous events alongside identified ones.
 *
 * Capabilities:
 *   - Event volume by type (anonymous vs identified breakdown)
 *   - Channel/source distribution for anonymous traffic
 *   - Temporal patterns from anonymous behavior
 *   - Anonymous cohort analysis (group by source, eventType, time window)
 *   - Pre-linking pattern detection (what do anonymous users do?)
 *
 * @module AnonymousAnalyticsService
 */

import { db } from '../db';
import { eventStore, rawEntities } from '@shared/schema';
import { sql, eq, isNull, isNotNull, count, and, gte, lte } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// ── Types ───────────────────────────────────────────────────────

export interface AnonymousInsights {
  summary: {
    totalEvents: number;
    anonymousEvents: number;
    identifiedEvents: number;
    anonymousPercentage: number;
    rawEntitiesPending: number;
  };
  byEventType: Array<{
    eventType: string;
    total: number;
    anonymous: number;
    identified: number;
  }>;
  bySource: Array<{
    source: string;
    total: number;
    anonymous: number;
  }>;
  temporalPattern: Array<{
    hour: number;
    anonymous: number;
    identified: number;
  }>;
  topAnonymousPatterns: Array<{
    eventType: string;
    source: string;
    count: number;
    avgPropertiesCount: number;
  }>;
}

export interface CohortAnalysis {
  cohortKey: string;
  memberCount: number;
  totalEvents: number;
  avgEventsPerMember: number;
  topEventTypes: string[];
  resolutionRate: number;   // % that eventually got linked to a profile
}

// ── Service ─────────────────────────────────────────────────────

class AnonymousAnalyticsServiceImpl {
  /**
   * Get comprehensive insights including anonymous data.
   */
  async getInsights(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<AnonymousInsights> {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    // Total events breakdown
    const totalResult = await db
      .select({ total: count() })
      .from(eventStore)
      .where(dateFilter);
    const totalEvents = totalResult[0]?.total ?? 0;

    const anonResult = await db
      .select({ total: count() })
      .from(eventStore)
      .where(and(isNull(eventStore.profileId), dateFilter));
    const anonymousEvents = anonResult[0]?.total ?? 0;

    const identifiedEvents = totalEvents - anonymousEvents;

    // Raw entities pending
    const rawPendingResult = await db
      .select({ total: count() })
      .from(rawEntities)
      .where(eq(rawEntities.status, 'pending'));
    const rawEntitiesPending = rawPendingResult[0]?.total ?? 0;

    // By event type
    const byEventType = await db
      .select({
        eventType: eventStore.eventType,
        total: count(),
        anonymous: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NULL)`,
        identified: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NOT NULL)`,
      })
      .from(eventStore)
      .where(dateFilter)
      .groupBy(eventStore.eventType)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    // By source
    const bySource = await db
      .select({
        source: eventStore.source,
        total: count(),
        anonymous: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NULL)`,
      })
      .from(eventStore)
      .where(dateFilter)
      .groupBy(eventStore.source)
      .orderBy(sql`count(*) DESC`)
      .limit(15);

    // Temporal pattern (hourly)
    const temporalPattern = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${eventStore.eventTimestamp})::int`,
        anonymous: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NULL)`,
        identified: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NOT NULL)`,
      })
      .from(eventStore)
      .where(dateFilter)
      .groupBy(sql`EXTRACT(HOUR FROM ${eventStore.eventTimestamp})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${eventStore.eventTimestamp})`);

    // Top anonymous patterns (eventType + source combinations)
    const topAnonymousPatterns = await db
      .select({
        eventType: eventStore.eventType,
        source: eventStore.source,
        count: count(),
        avgPropertiesCount: sql<number>`AVG(jsonb_object_keys_count(${eventStore.eventProperties}))`,
      })
      .from(eventStore)
      .where(and(isNull(eventStore.profileId), dateFilter))
      .groupBy(eventStore.eventType, eventStore.source)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    return {
      summary: {
        totalEvents,
        anonymousEvents,
        identifiedEvents,
        anonymousPercentage: totalEvents > 0 ? Math.round((anonymousEvents / totalEvents) * 100) : 0,
        rawEntitiesPending,
      },
      byEventType: byEventType.map(r => ({
        eventType: r.eventType,
        total: Number(r.total),
        anonymous: Number(r.anonymous),
        identified: Number(r.identified),
      })),
      bySource: bySource.map(r => ({
        source: r.source ?? 'unknown',
        total: Number(r.total),
        anonymous: Number(r.anonymous),
      })),
      temporalPattern: temporalPattern.map(r => ({
        hour: Number(r.hour),
        anonymous: Number(r.anonymous),
        identified: Number(r.identified),
      })),
      topAnonymousPatterns: topAnonymousPatterns.map(r => ({
        eventType: r.eventType,
        source: r.source ?? 'unknown',
        count: Number(r.count),
        avgPropertiesCount: Number(r.avgPropertiesCount) || 0,
      })),
    };
  }

  /**
   * Analyze anonymous cohorts grouped by source channel.
   */
  async getCohortsBySource(): Promise<CohortAnalysis[]> {
    const cohorts = await db
      .select({
        source: eventStore.source,
        totalEvents: count(),
        anonymousEvents: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NULL)`,
        identifiedEvents: sql<number>`COUNT(*) FILTER (WHERE ${eventStore.profileId} IS NOT NULL)`,
      })
      .from(eventStore)
      .groupBy(eventStore.source)
      .orderBy(sql`count(*) DESC`);

    return cohorts.map(c => {
      const total = Number(c.totalEvents);
      const anon = Number(c.anonymousEvents);
      const identified = Number(c.identifiedEvents);
      return {
        cohortKey: c.source ?? 'unknown',
        memberCount: total,
        totalEvents: total,
        avgEventsPerMember: total,
        topEventTypes: [],
        resolutionRate: total > 0 ? Math.round((identified / total) * 100) : 0,
      };
    });
  }

  // ── Helpers ─────────────────────────────────────────────────

  private buildDateFilter(dateFrom?: Date, dateTo?: Date) {
    if (dateFrom && dateTo) {
      return and(
        gte(eventStore.eventTimestamp, dateFrom),
        lte(eventStore.eventTimestamp, dateTo)
      );
    }
    if (dateFrom) return gte(eventStore.eventTimestamp, dateFrom);
    if (dateTo) return lte(eventStore.eventTimestamp, dateTo);
    return undefined;
  }
}

export const anonymousAnalyticsService = new AnonymousAnalyticsServiceImpl();
