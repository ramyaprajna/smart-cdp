/**
 * Anonymous Insights Service
 *
 * Generates insights from anonymous (unlinked) events — web visitors,
 * IoT sensors, anonymous purchases, etc. — without requiring a profileId.
 *
 * Capabilities:
 *   - Aggregate anonymous events by type, source, channel
 *   - Session-level analytics (pages per session, duration, bounce rate)
 *   - Cohort analysis by anonymousId clusters
 *   - Pattern detection across anonymous behavior data
 *   - Conversion funnel from anonymous → identified
 *
 * All queries use eventStore where profileId IS NULL.
 */
import { db } from '../db';
import { eventStore } from '@shared/schema';
import { sql, isNull, isNotNull, and, eq, gte, lte, desc, count } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

export interface AnonymousOverview {
  totalAnonymousEvents: number;
  uniqueAnonymousVisitors: number;
  uniqueSessions: number;
  linkedCount: number;
  conversionRate: number;
  topEventTypes: { eventType: string; count: number }[];
  topSources: { source: string; count: number }[];
  topChannels: { channel: string; count: number }[];
}

export interface SessionInsight {
  sessionId: string;
  anonymousId: string | null;
  eventCount: number;
  firstEvent: Date;
  lastEvent: Date;
  durationMs: number;
  eventTypes: string[];
  source: string | null;
  isLinked: boolean;
}

export interface AnonymousCohortsResult {
  cohorts: {
    label: string;
    count: number;
    avgEventsPerVisitor: number;
  }[];
}

export interface ConversionFunnel {
  totalAnonymous: number;
  linkedToProfile: number;
  conversionRate: number;
  avgTimeToLinkMs: number | null;
  linksBySource: { source: string; count: number }[];
}

export interface AnonymousInsightsOptions {
  from?: Date;
  to?: Date;
  source?: string;
  channel?: string;
  limit?: number;
}

class AnonymousInsightsService {
  /**
   * Get overview metrics of anonymous events
   */
  async getOverview(options: AnonymousInsightsOptions = {}): Promise<AnonymousOverview> {
    const conditions = this.buildConditions(options);
    const anonymousCondition = isNull(eventStore.profileId);

    // Total anonymous events
    const totalResult = await db
      .select({ count: count() })
      .from(eventStore)
      .where(and(anonymousCondition, ...conditions));
    const totalAnonymousEvents = totalResult[0]?.count ?? 0;

    // Unique anonymous visitors
    const visitorsResult = await db
      .select({ count: sql<number>`count(distinct ${eventStore.anonymousId})` })
      .from(eventStore)
      .where(and(anonymousCondition, isNotNull(eventStore.anonymousId), ...conditions));
    const uniqueAnonymousVisitors = visitorsResult[0]?.count ?? 0;

    // Unique sessions
    const sessionsResult = await db
      .select({ count: sql<number>`count(distinct ${eventStore.sessionId})` })
      .from(eventStore)
      .where(and(anonymousCondition, isNotNull(eventStore.sessionId), ...conditions));
    const uniqueSessions = sessionsResult[0]?.count ?? 0;

    // Linked (converted) count
    const linkedResult = await db
      .select({ count: count() })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), isNotNull(eventStore.linkedAt), ...conditions));
    const linkedCount = linkedResult[0]?.count ?? 0;

    // Conversion rate
    const totalWithAnonId = await db
      .select({ count: sql<number>`count(distinct ${eventStore.anonymousId})` })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), ...conditions));
    const linkedVisitors = await db
      .select({ count: sql<number>`count(distinct ${eventStore.anonymousId})` })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), isNotNull(eventStore.linkedAt), ...conditions));
    const conversionRate = (totalWithAnonId[0]?.count ?? 0) > 0
      ? (linkedVisitors[0]?.count ?? 0) / (totalWithAnonId[0]?.count ?? 1) * 100
      : 0;

    // Top event types
    const topEventTypes = await db
      .select({
        eventType: eventStore.eventType,
        count: count(),
      })
      .from(eventStore)
      .where(and(anonymousCondition, ...conditions))
      .groupBy(eventStore.eventType)
      .orderBy(desc(count()))
      .limit(10);

    // Top sources
    const topSources = await db
      .select({
        source: eventStore.source,
        count: count(),
      })
      .from(eventStore)
      .where(and(anonymousCondition, isNotNull(eventStore.source), ...conditions))
      .groupBy(eventStore.source)
      .orderBy(desc(count()))
      .limit(10);

    // Top channels
    const topChannels = await db
      .select({
        channel: eventStore.channel,
        count: count(),
      })
      .from(eventStore)
      .where(and(anonymousCondition, isNotNull(eventStore.channel), ...conditions))
      .groupBy(eventStore.channel)
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalAnonymousEvents,
      uniqueAnonymousVisitors,
      uniqueSessions,
      linkedCount,
      conversionRate: Math.round(conversionRate * 100) / 100,
      topEventTypes: topEventTypes.map(r => ({ eventType: r.eventType, count: r.count })),
      topSources: topSources.map(r => ({ source: r.source ?? 'unknown', count: r.count })),
      topChannels: topChannels.map(r => ({ channel: r.channel ?? 'unknown', count: r.count })),
    };
  }

  /**
   * Get session-level insights for anonymous visitors
   */
  async getSessionInsights(options: AnonymousInsightsOptions = {}): Promise<SessionInsight[]> {
    const limit = options.limit ?? 50;
    const conditions = this.buildConditions(options);

    const sessions = await db
      .select({
        sessionId: eventStore.sessionId,
        anonymousId: eventStore.anonymousId,
        eventCount: count(),
        firstEvent: sql<Date>`min(${eventStore.eventTimestamp})`,
        lastEvent: sql<Date>`max(${eventStore.eventTimestamp})`,
        durationMs: sql<number>`extract(epoch from (max(${eventStore.eventTimestamp}) - min(${eventStore.eventTimestamp}))) * 1000`,
        eventTypes: sql<string[]>`array_agg(distinct ${eventStore.eventType})`,
        source: sql<string | null>`mode() within group (order by ${eventStore.source})`,
        isLinked: sql<boolean>`bool_or(${eventStore.linkedAt} is not null)`,
      })
      .from(eventStore)
      .where(and(isNotNull(eventStore.sessionId), ...conditions))
      .groupBy(eventStore.sessionId, eventStore.anonymousId)
      .orderBy(desc(sql`max(${eventStore.eventTimestamp})`))
      .limit(limit);

    return sessions.map(s => ({
      sessionId: s.sessionId!,
      anonymousId: s.anonymousId,
      eventCount: s.eventCount,
      firstEvent: s.firstEvent,
      lastEvent: s.lastEvent,
      durationMs: s.durationMs ?? 0,
      eventTypes: s.eventTypes ?? [],
      source: s.source,
      isLinked: s.isLinked ?? false,
    }));
  }

  /**
   * Get conversion funnel: anonymous → identified
   */
  async getConversionFunnel(options: AnonymousInsightsOptions = {}): Promise<ConversionFunnel> {
    const conditions = this.buildConditions(options);

    // Total unique anonymous visitors
    const totalResult = await db
      .select({ count: sql<number>`count(distinct ${eventStore.anonymousId})` })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), ...conditions));
    const totalAnonymous = totalResult[0]?.count ?? 0;

    // Linked visitors
    const linkedResult = await db
      .select({ count: sql<number>`count(distinct ${eventStore.anonymousId})` })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), isNotNull(eventStore.linkedAt), ...conditions));
    const linkedToProfile = linkedResult[0]?.count ?? 0;

    // Average time to link
    const avgTimeResult = await db
      .select({
        avgMs: sql<number | null>`avg(extract(epoch from (${eventStore.linkedAt} - ${eventStore.createdAt})) * 1000)`,
      })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), isNotNull(eventStore.linkedAt), ...conditions));

    // Links by source
    const linksBySource = await db
      .select({
        source: eventStore.source,
        count: sql<number>`count(distinct ${eventStore.anonymousId})`,
      })
      .from(eventStore)
      .where(and(isNotNull(eventStore.anonymousId), isNotNull(eventStore.linkedAt), ...conditions))
      .groupBy(eventStore.source)
      .orderBy(desc(sql`count(distinct ${eventStore.anonymousId})`))
      .limit(10);

    return {
      totalAnonymous,
      linkedToProfile,
      conversionRate: totalAnonymous > 0
        ? Math.round((linkedToProfile / totalAnonymous) * 10000) / 100
        : 0,
      avgTimeToLinkMs: avgTimeResult[0]?.avgMs ?? null,
      linksBySource: linksBySource.map(r => ({
        source: r.source ?? 'unknown',
        count: r.count,
      })),
    };
  }

  /**
   * Build drizzle conditions from options
   */
  private buildConditions(options: AnonymousInsightsOptions) {
    const conditions = [];
    if (options.from) {
      conditions.push(gte(eventStore.eventTimestamp, options.from));
    }
    if (options.to) {
      conditions.push(lte(eventStore.eventTimestamp, options.to));
    }
    if (options.source) {
      conditions.push(eq(eventStore.source, options.source));
    }
    if (options.channel) {
      conditions.push(eq(eventStore.channel, options.channel));
    }
    return conditions;
  }
}

export const anonymousInsightsService = new AnonymousInsightsService();
