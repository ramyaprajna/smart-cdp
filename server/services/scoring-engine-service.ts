/**
 * CDP Scoring Engine — Engagement Score Calculator
 *
 * Computes a numerical engagement score (0–100) for each customer_profile
 * using an RFM-style model:
 *
 *   R — Recency:   how recently the customer was last active
 *   F — Frequency: how often the customer generates events
 *   M — Monetary:  lifetime value / transactional weight
 *
 * Additionally overlays campaign interaction signals (sent, delivered, read)
 * and activity type weights (wa_flow.quiz_completed, purchase, etc.).
 *
 * Score bands:
 *   0–20   → dormant       (churn_risk_level: HIGH)
 *   21–40  → at_risk       (churn_risk_level: MEDIUM)
 *   41–60  → engaged       (churn_risk_level: LOW)
 *   61–80  → active        (churn_risk_level: NONE)
 *   81–100 → champion      (churn_risk_level: NONE)
 */
import { db } from '../db';
import { customerProfile, eventStore, campaignMessage, pointLedger } from '@shared/schema';
import { eq, desc, sql, and, gte, count, isNotNull } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// -------------------------------------------------------
// Scoring Configuration
// -------------------------------------------------------

/**
 * Event type weights — higher weight = more engagement value.
 * Weights are additive (not multiplicative) per event occurrence.
 */
const EVENT_TYPE_WEIGHTS: Record<string, number> = {
  // WA Flow interactions
  'wa_flow.quiz_completed':   8,
  'wa_flow.survey_submitted': 6,
  'wa_flow.flow_completed':   4,
  'wa_flow.flow_started':     2,
  'wa_flow.submission':       3,
  // Campaign interactions
  'waba.message.read':        5,
  'waba.message.delivered':   2,
  'waba.message.received':    3,
  // Transactional
  'purchase':                 10,
  'order_completed':          10,
  'add_to_cart':              4,
  'product_view':             2,
  // General
  'page_view':                1,
  'session_start':            1,
  'app_open':                 2,
  'login':                    2,
  // Loyalty
  'points_earned':            3,
  'points_redeemed':          5,
};

const DEFAULT_EVENT_WEIGHT = 1;

/** Recency decay — event weight multiplier based on how many days ago it occurred */
function recencyMultiplier(daysSinceEvent: number): number {
  if (daysSinceEvent <= 7)  return 1.0;
  if (daysSinceEvent <= 14) return 0.8;
  if (daysSinceEvent <= 30) return 0.6;
  if (daysSinceEvent <= 60) return 0.4;
  if (daysSinceEvent <= 90) return 0.2;
  return 0.1; // > 90 days → very low weight
}

/** Map raw score to 0–100 using sigmoid-inspired normalization */
function normalizeScore(rawScore: number, maxExpectedRaw = 200): number {
  const clamped = Math.min(rawScore, maxExpectedRaw);
  return Math.round((clamped / maxExpectedRaw) * 100);
}

function getChurnRisk(score: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  if (score <= 20) return 'HIGH';
  if (score <= 40) return 'MEDIUM';
  if (score <= 60) return 'LOW';
  return 'NONE';
}

function getScoreBand(score: number): 'dormant' | 'at_risk' | 'engaged' | 'active' | 'champion' {
  if (score <= 20) return 'dormant';
  if (score <= 40) return 'at_risk';
  if (score <= 60) return 'engaged';
  if (score <= 80) return 'active';
  return 'champion';
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface CustomerScore {
  profileId: string;
  engagementScore: number;
  scoreBand: 'dormant' | 'at_risk' | 'engaged' | 'active' | 'champion';
  churnRiskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  lastActiveDays: number | null;
  activityStreak: number;
  dormancyFlag: boolean;
  totalEvents: number;
  loyaltyPointsBalance: number;
  calculatedAt: string;
}

export interface ScoreDistribution {
  band: string;
  count: number;
  percentage: number;
}

export interface BatchScoreResult {
  processed: number;
  durationMs: number;
  distribution: ScoreDistribution[];
}

// -------------------------------------------------------
// Scoring Engine
// -------------------------------------------------------

export class ScoringEngine {
  private readonly LOOKBACK_DAYS = 180; // Score based on last 6 months of activity

  /**
   * Calculate engagement score for a single customer_profile.
   *
   * Algorithm:
   * 1. Load last N events from event_store within lookback window
   * 2. Sum weighted scores: event_weight × recency_multiplier(days_ago)
   * 3. Add loyalty bonus: points_balance × 0.1 (capped at 20)
   * 4. Add campaign read bonus: read events boost score
   * 5. Normalize to 0–100 and derive indicators
   */
  async calculateCustomerScore(profileId: string): Promise<CustomerScore> {
    const now = new Date();
    const lookbackCutoff = new Date(now.getTime() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Fetch recent events
    const events = await db
      .select({
        eventType: eventStore.eventType,
        eventTimestamp: eventStore.eventTimestamp,
      })
      .from(eventStore)
      .where(
        and(
          eq(eventStore.profileId, profileId),
          gte(eventStore.eventTimestamp, lookbackCutoff)
        )
      )
      .orderBy(desc(eventStore.eventTimestamp))
      .limit(500);

    // Fetch loyalty balance
    const ledgerResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0)::int` })
      .from(pointLedger)
      .where(eq(pointLedger.profileId, profileId));

    const loyaltyBalance = ledgerResult[0]?.total ?? 0;

    // Calculate raw score
    let rawScore = 0;
    let lastEventDate: Date | null = null;
    let consecutiveDays = 0;

    for (const event of events) {
      const eventDate = event.eventTimestamp ?? now;
      const daysSince = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
      const weight = EVENT_TYPE_WEIGHTS[event.eventType] ?? DEFAULT_EVENT_WEIGHT;
      const decay = recencyMultiplier(daysSince);
      rawScore += weight * decay;

      if (!lastEventDate) {
        lastEventDate = eventDate;
        consecutiveDays = 1;
      }
    }

    // Activity streak: count distinct days with events in last 30 days
    const last30Cut = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentEventDays = new Set<string>();
    for (const event of events) {
      const eventDate = event.eventTimestamp ?? now;
      if (eventDate >= last30Cut) {
        recentEventDays.add(eventDate.toISOString().split('T')[0]);
      }
    }
    const activityStreak = recentEventDays.size;

    // Loyalty bonus (capped at 20 points)
    const loyaltyBonus = Math.min(loyaltyBalance * 0.05, 20);
    rawScore += loyaltyBonus;

    // Normalize
    const engagementScore = normalizeScore(rawScore);

    // Derived indicators
    const lastActiveDays = lastEventDate
      ? Math.floor((now.getTime() - lastEventDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const dormancyFlag = lastActiveDays === null || lastActiveDays > 60;
    const churnRiskLevel = getChurnRisk(engagementScore);
    const scoreBand = getScoreBand(engagementScore);

    const scoreResult: CustomerScore = {
      profileId,
      engagementScore,
      scoreBand,
      churnRiskLevel,
      lastActiveDays,
      activityStreak,
      dormancyFlag,
      totalEvents: events.length,
      loyaltyPointsBalance: loyaltyBalance,
      calculatedAt: now.toISOString(),
    };

    // Persist score back to customer_profile.attributes
    await this.persistScore(profileId, scoreResult);

    return scoreResult;
  }

  /**
   * Batch recalculate scores for all profiles with events in the last lookback window.
   * Processes in pages to avoid loading all profiles into memory at once.
   */
  async batchCalculateScores(): Promise<BatchScoreResult> {
    const startTime = Date.now();

    // Get all profiles that have events (limit to active ones)
    const lookbackCutoff = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const activeProfileRows = await db
      .selectDistinct({ profileId: eventStore.profileId })
      .from(eventStore)
      .where(and(gte(eventStore.eventTimestamp, lookbackCutoff), isNotNull(eventStore.profileId)))
      .limit(10000); // Safety cap

    const profileIds = activeProfileRows
      .map(r => r.profileId)
      .filter((id): id is string => id !== null);

    secureLogger.info('Scoring batch started', {
      profileCount: profileIds.length,
    }, 'SCORING_ENGINE');

    const PAGE_SIZE = 50;
    let processed = 0;
    const bandCounts: Record<string, number> = {
      champion: 0,
      active: 0,
      engaged: 0,
      at_risk: 0,
      dormant: 0,
    };

    for (let i = 0; i < profileIds.length; i += PAGE_SIZE) {
      const page = profileIds.slice(i, i + PAGE_SIZE);
      await Promise.allSettled(
        page.map(async (profileId) => {
          try {
            const score = await this.calculateCustomerScore(profileId);
            bandCounts[score.scoreBand] = (bandCounts[score.scoreBand] ?? 0) + 1;
            processed++;
          } catch (err) {
            secureLogger.warn('Batch score calc failed for profile', {
              profileId,
              error: String(err),
            }, 'SCORING_ENGINE');
          }
        })
      );
    }

    const durationMs = Date.now() - startTime;
    const total = processed;

    const distribution: ScoreDistribution[] = Object.entries(bandCounts).map(([band, cnt]) => ({
      band,
      count: cnt,
      percentage: total > 0 ? Math.round((cnt / total) * 1000) / 10 : 0,
    }));

    secureLogger.info('Scoring batch completed', {
      processed,
      durationMs,
    }, 'SCORING_ENGINE');

    return { processed, durationMs, distribution };
  }

  /**
   * Get score distribution across all profiles that have a cached score.
   * Returns band counts and percentages for dashboard histogram.
   */
  async getScoreDistribution(): Promise<ScoreDistribution[]> {
    const rows = await db
      .select({
        attributes: customerProfile.attributes,
      })
      .from(customerProfile)
      .where(sql`attributes->>'engagementScore' IS NOT NULL`);

    const bandCounts: Record<string, number> = {
      champion: 0,
      active: 0,
      engaged: 0,
      at_risk: 0,
      dormant: 0,
    };

    for (const row of rows) {
      const attrs = (row.attributes as Record<string, unknown>) ?? {};
      const band = (attrs.scoreBand as string | undefined) ?? 'dormant';
      if (band in bandCounts) {
        bandCounts[band]++;
      }
    }

    const total = rows.length;
    return Object.entries(bandCounts).map(([band, cnt]) => ({
      band,
      count: cnt,
      percentage: total > 0 ? Math.round((cnt / total) * 1000) / 10 : 0,
    }));
  }

  /**
   * Persist computed score into customer_profile.attributes JSONB column.
   * Uses a targeted merge so unrelated attributes are preserved.
   */
  private async persistScore(profileId: string, score: CustomerScore): Promise<void> {
    const scoreAttrs = {
      engagementScore: score.engagementScore,
      scoreBand: score.scoreBand,
      churnRiskLevel: score.churnRiskLevel,
      lastActiveDays: score.lastActiveDays,
      activityStreak: score.activityStreak,
      dormancyFlag: score.dormancyFlag,
      totalEventsCount: score.totalEvents,
      loyaltyPointsBalance: score.loyaltyPointsBalance,
      scoreCalculatedAt: score.calculatedAt,
    };

    // Merge score into existing attributes using PostgreSQL jsonb || operator
    await db
      .update(customerProfile)
      .set({
        attributes: sql`COALESCE(attributes, '{}'::jsonb) || ${JSON.stringify(scoreAttrs)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(customerProfile.id, profileId));
  }
}

export const scoringEngine = new ScoringEngine();
