/**
 * Scoring & Analytics Routes — CDP Phase 2E
 *
 * Routes:
 *   GET  /api/scoring/profiles/:profileId     — Individual customer engagement score
 *   POST /api/scoring/batch                   — Trigger batch score recalculation (admin)
 *   GET  /api/scoring/distribution            — Score distribution histogram
 *   GET  /api/scoring/campaigns               — Campaign analytics list
 *   GET  /api/scoring/campaigns/:campaignId   — Single campaign performance metrics
 *   GET  /api/scoring/campaigns/:campaignId/timeseries — Time-series breakdown
 *   GET  /api/scoring/summary                 — Overall analytics dashboard summary
 */
import type { Express } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { scoringEngine } from '../services/scoring-engine-service';
import { campaignAnalyticsService } from '../services/campaign-analytics-service';
import { secureLogger } from '../utils/secure-logger';

const SCORING_WRITE_ROLES = ['admin'];
const SCORING_READ_ROLES  = ['admin', 'analyst', 'marketing'];

export function setupScoringRoutes(app: Express): void {
  // -------------------------------------------------------
  // Individual Score
  // -------------------------------------------------------

  /**
   * GET /api/scoring/profiles/:profileId
   * Returns the latest computed engagement score for a customer profile.
   * If a fresh score is requested (query: ?recalculate=true), recalculates now.
   */
  app.get(
    '/api/scoring/profiles/:profileId',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const { profileId } = req.params;
        const recalculate = req.query.recalculate === 'true';

        // Always verify the profile exists first for consistent 404 behaviour
        const { db } = await import('../db');
        const { customerProfile } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [profile] = await db
          .select({ id: customerProfile.id, attributes: customerProfile.attributes })
          .from(customerProfile)
          .where(eq(customerProfile.id, profileId))
          .limit(1);

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        // Profile exists — now serve recalculate or cached path
        if (recalculate) {
          const score = await scoringEngine.calculateCustomerScore(profileId);
          return res.json({ score, fresh: true });
        }

        const attrs = (profile.attributes as Record<string, unknown>) ?? {};
        const hasScore = typeof attrs.engagementScore === 'number';

        if (!hasScore) {
          // No cached score — compute now
          const score = await scoringEngine.calculateCustomerScore(profileId);
          return res.json({ score, fresh: true });
        }

        return res.json({
          score: {
            profileId: profile.id,
            engagementScore: attrs.engagementScore,
            scoreBand: attrs.scoreBand,
            churnRiskLevel: attrs.churnRiskLevel,
            lastActiveDays: attrs.lastActiveDays,
            activityStreak: attrs.activityStreak,
            dormancyFlag: attrs.dormancyFlag,
            totalEvents: attrs.totalEventsCount,
            loyaltyPointsBalance: attrs.loyaltyPointsBalance,
            calculatedAt: attrs.scoreCalculatedAt,
          },
          fresh: false,
        });
      } catch (err) {
        secureLogger.error('Failed to get customer score', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve customer score' });
      }
    }
  );

  // -------------------------------------------------------
  // Batch Recalculation
  // -------------------------------------------------------

  /**
   * POST /api/scoring/batch
   * Triggers a batch score recalculation for all active profiles.
   * Runs asynchronously — returns immediately with a job ID.
   * Admin-only.
   */
  app.post(
    '/api/scoring/batch',
    requireAuth,
    requireRole(SCORING_WRITE_ROLES),
    async (req, res) => {
      try {
        const jobId = `scoring-batch-${Date.now()}`;

        // Return immediately
        res.json({
          jobId,
          status: 'started',
          message: 'Batch score recalculation started in background',
          startedAt: new Date().toISOString(),
        });

        // Run batch in background (non-blocking)
        scoringEngine.batchCalculateScores().then((result) => {
          secureLogger.info('Batch score recalculation complete', {
            jobId,
            processed: result.processed,
            durationMs: result.durationMs,
          }, 'SCORING');
        }).catch((err) => {
          secureLogger.error('Batch score recalculation failed', {
            jobId,
            error: String(err),
          }, 'SCORING');
        });
      } catch (err) {
        secureLogger.error('Failed to start batch scoring', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to start batch scoring job' });
      }
    }
  );

  // -------------------------------------------------------
  // Score Distribution
  // -------------------------------------------------------

  /**
   * GET /api/scoring/distribution
   * Returns engagement score distribution across all profiles with cached scores.
   * Used for dashboard histogram / band summary.
   */
  app.get(
    '/api/scoring/distribution',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const distribution = await scoringEngine.getScoreDistribution();
        res.json({ distribution });
      } catch (err) {
        secureLogger.error('Failed to get score distribution', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve score distribution' });
      }
    }
  );

  // -------------------------------------------------------
  // Analytics Summary
  // -------------------------------------------------------

  /**
   * GET /api/scoring/summary
   * Overall analytics dashboard: campaign summary + score band overview.
   */
  app.get(
    '/api/scoring/summary',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const limit = Math.min(Number(req.query.limit ?? 5), 20);
        const [campaignSummary, scoreDistribution] = await Promise.all([
          campaignAnalyticsService.getAnalyticsSummary(limit),
          scoringEngine.getScoreDistribution(),
        ]);

        res.json({
          campaigns: campaignSummary,
          scoreDistribution,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        secureLogger.error('Failed to get analytics summary', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve analytics summary' });
      }
    }
  );

  // -------------------------------------------------------
  // High-Value Profiles (champion + active bands)
  // -------------------------------------------------------

  /**
   * GET /api/scoring/high-value
   * Returns profiles in the 'champion' or 'active' score bands.
   * These are the customers most likely to respond to campaigns.
   * Optional: ?limit=50&offset=0
   */
  app.get(
    '/api/scoring/high-value',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
        const offset = Math.max(Number(req.query.offset ?? 0), 0);

        const { db } = await import('../db');
        const { sql: drizzleSql } = await import('drizzle-orm');

        interface HighValueRow {
          id: string;
          engagement_score: string | number;
          score_band: string;
          churn_risk_level: string;
          last_active_days: string | number;
          activity_streak: string | number;
          score_calculated_at: string;
        }

        const result = await db.execute(drizzleSql`
          SELECT
            id,
            (attributes->>'engagementScore')::int          AS engagement_score,
            attributes->>'scoreBand'                        AS score_band,
            attributes->>'churnRiskLevel'                   AS churn_risk_level,
            (attributes->>'lastActiveDays')::int            AS last_active_days,
            (attributes->>'activityStreak')::int            AS activity_streak,
            attributes->>'scoreCalculatedAt'                AS score_calculated_at
          FROM customer_profile
          WHERE attributes->>'scoreBand' IN ('champion', 'active')
          ORDER BY (attributes->>'engagementScore')::int DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const countResult = await db.execute(drizzleSql`
          SELECT COUNT(*)::int AS total
          FROM customer_profile
          WHERE attributes->>'scoreBand' IN ('champion', 'active')
        `);

        interface CountRow { total: string | number; }
        const total = Number((countResult.rows[0] as unknown as CountRow)?.total ?? 0);

        const profiles = (result.rows as unknown as HighValueRow[]).map(r => ({
          profileId:         r.id,
          engagementScore:   Number(r.engagement_score ?? 0),
          scoreBand:         r.score_band ?? '',
          churnRiskLevel:    r.churn_risk_level ?? '',
          lastActiveDays:    Number(r.last_active_days ?? 0),
          activityStreak:    Number(r.activity_streak ?? 0),
          scoreCalculatedAt: r.score_calculated_at ?? null,
        }));

        res.json({ profiles, total, limit, offset });
      } catch (err) {
        secureLogger.error('Failed to get high-value profiles', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve high-value profiles' });
      }
    }
  );

  // -------------------------------------------------------
  // Churn-Risk Profiles (at_risk + dormant bands)
  // -------------------------------------------------------

  /**
   * GET /api/scoring/churn-risk
   * Returns profiles in the 'at_risk' or 'dormant' score bands.
   * These are customers flagged for re-engagement campaigns.
   * Optional: ?limit=50&offset=0
   */
  app.get(
    '/api/scoring/churn-risk',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
        const offset = Math.max(Number(req.query.offset ?? 0), 0);

        const { db } = await import('../db');
        const { sql: drizzleSql } = await import('drizzle-orm');

        interface ChurnRiskRow {
          id: string;
          engagement_score: string | number;
          score_band: string;
          churn_risk_level: string;
          last_active_days: string | number;
          dormancy_flag: string | boolean;
          score_calculated_at: string;
        }

        const result = await db.execute(drizzleSql`
          SELECT
            id,
            (attributes->>'engagementScore')::int          AS engagement_score,
            attributes->>'scoreBand'                        AS score_band,
            attributes->>'churnRiskLevel'                   AS churn_risk_level,
            (attributes->>'lastActiveDays')::int            AS last_active_days,
            (attributes->>'dormancyFlag')::boolean          AS dormancy_flag,
            attributes->>'scoreCalculatedAt'                AS score_calculated_at
          FROM customer_profile
          WHERE attributes->>'scoreBand' IN ('at_risk', 'dormant')
          ORDER BY (attributes->>'engagementScore')::int ASC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const countResult = await db.execute(drizzleSql`
          SELECT COUNT(*)::int AS total
          FROM customer_profile
          WHERE attributes->>'scoreBand' IN ('at_risk', 'dormant')
        `);

        interface CountRow { total: string | number; }
        const total = Number((countResult.rows[0] as unknown as CountRow)?.total ?? 0);

        const profiles = (result.rows as unknown as ChurnRiskRow[]).map(r => ({
          profileId:         r.id,
          engagementScore:   Number(r.engagement_score ?? 0),
          scoreBand:         r.score_band ?? '',
          churnRiskLevel:    r.churn_risk_level ?? '',
          lastActiveDays:    Number(r.last_active_days ?? 0),
          dormancyFlag:      r.dormancy_flag === true || r.dormancy_flag === 'true',
          scoreCalculatedAt: r.score_calculated_at ?? null,
        }));

        res.json({ profiles, total, limit, offset });
      } catch (err) {
        secureLogger.error('Failed to get churn-risk profiles', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve churn-risk profiles' });
      }
    }
  );

  // -------------------------------------------------------
  // Segment-Level Scoring Summary
  // -------------------------------------------------------

  /**
   * GET /api/scoring/segments
   * Returns engagement score statistics aggregated per segment_definition.
   *
   * Segment membership is derived from event_store: a profile is considered
   * a member of a segment if it has recorded events whose profile_id appears
   * in event_store AND the segment definition's criteria match that profile's
   * attributes.  Since segment membership evaluation is complex (JSONB
   * criteria), this endpoint uses a two-phase approach:
   *
   *   Phase 1 — named segments from segment_definition table: for each
   *     defined segment, aggregate scoring stats from customer_profile where
   *     the profile exists in event_store (i.e., has engagement activity).
   *     This is the Phase 2E data model — event_store.profile_id → customer_profile.
   *
   *   Phase 2 — score-band synthetic segments always included: the five
   *     engagement score bands (champion, active, engaged, at_risk, dormant)
   *     are always returned as virtual segments, providing reliable stats even
   *     when no named segments are defined.
   *
   * Response shape:
   *   { segments: SegmentScoreSummary[], total: number }
   * where virtual synthetic segments have segmentId = 'band:<name>'.
   */
  app.get(
    '/api/scoring/segments',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const { db } = await import('../db');
        const { segmentDefinition } = await import('@shared/schema');
        const { sql: drizzleSql } = await import('drizzle-orm');

        interface SegmentScoreSummary {
          segmentId: string;
          segmentName: string;
          segmentType: 'defined' | 'synthetic';
          profileCount: number;
          scoredProfileCount: number;
          avgEngagementScore: number;
          bandBreakdown: Record<string, number>;
          churnRiskBreakdown: Record<string, number>;
        }

        interface BandAggRow {
          score_band: string;
          profile_count: string | number;
          avg_score: string | null;
          high_risk: string | number;
          medium_risk: string | number;
          low_risk: string | number;
        }

        // === Phase 2: Synthetic score-band segments (always reliable) ===
        const bandAggResult = await db.execute(drizzleSql`
          SELECT
            attributes->>'scoreBand'                              AS score_band,
            COUNT(*)::int                                         AS profile_count,
            AVG((attributes->>'engagementScore')::numeric)::numeric(5,1) AS avg_score,
            COUNT(*) FILTER (WHERE attributes->>'churnRiskLevel' = 'HIGH')   AS high_risk,
            COUNT(*) FILTER (WHERE attributes->>'churnRiskLevel' = 'MEDIUM') AS medium_risk,
            COUNT(*) FILTER (WHERE attributes->>'churnRiskLevel' = 'LOW')    AS low_risk
          FROM customer_profile
          WHERE attributes->>'scoreBand' IS NOT NULL
          GROUP BY attributes->>'scoreBand'
        `);

        const bandRows = bandAggResult.rows as unknown as BandAggRow[];
        const bandMap = new Map<string, BandAggRow>();
        for (const r of bandRows) {
          bandMap.set(r.score_band ?? '', r);
        }

        const BANDS = ['champion', 'active', 'engaged', 'at_risk', 'dormant'] as const;
        const syntheticSegments: SegmentScoreSummary[] = BANDS.map(band => {
          const r = bandMap.get(band);
          return {
            segmentId:         `band:${band}`,
            segmentName:       band.charAt(0).toUpperCase() + band.replace('_', ' ').slice(1),
            segmentType:       'synthetic' as const,
            profileCount:      Number(r?.profile_count ?? 0),
            scoredProfileCount: Number(r?.profile_count ?? 0),
            avgEngagementScore: r?.avg_score != null ? Number(r.avg_score) : 0,
            bandBreakdown:     { [band]: Number(r?.profile_count ?? 0) },
            churnRiskBreakdown: {
              high:   Number(r?.high_risk   ?? 0),
              medium: Number(r?.medium_risk ?? 0),
              low:    Number(r?.low_risk    ?? 0),
            },
          };
        });

        // === Phase 1: Named segments from segment_definition ===
        const segDefs = await db.select().from(segmentDefinition);

        interface SegDefScoreRow {
          profile_count: string | number;
          scored_count: string | number;
          avg_score: string | null;
          champion: string | number; active: string | number;
          engaged: string | number; at_risk: string | number; dormant: string | number;
          high_risk: string | number; medium_risk: string | number; low_risk: string | number;
        }

        const namedSegments: SegmentScoreSummary[] = [];

        for (const seg of segDefs) {
          // Profiles are linked to segment_definition via event_store:
          // event_store.profile_id → customer_profile.id
          // We aggregate scoring stats for all profiles that have events
          // associated with this segment (event_properties->>'segmentId').
          const scoreResult = await db.execute(drizzleSql`
            SELECT
              COUNT(DISTINCT cp.id)::int                                   AS profile_count,
              COUNT(DISTINCT cp.id) FILTER (WHERE cp.attributes->>'engagementScore' IS NOT NULL)::int AS scored_count,
              AVG((cp.attributes->>'engagementScore')::numeric)::numeric(5,1) AS avg_score,
              COUNT(*) FILTER (WHERE cp.attributes->>'scoreBand' = 'champion')    AS champion,
              COUNT(*) FILTER (WHERE cp.attributes->>'scoreBand' = 'active')      AS active,
              COUNT(*) FILTER (WHERE cp.attributes->>'scoreBand' = 'engaged')     AS engaged,
              COUNT(*) FILTER (WHERE cp.attributes->>'scoreBand' = 'at_risk')     AS at_risk,
              COUNT(*) FILTER (WHERE cp.attributes->>'scoreBand' = 'dormant')     AS dormant,
              COUNT(*) FILTER (WHERE cp.attributes->>'churnRiskLevel' = 'HIGH')   AS high_risk,
              COUNT(*) FILTER (WHERE cp.attributes->>'churnRiskLevel' = 'MEDIUM') AS medium_risk,
              COUNT(*) FILTER (WHERE cp.attributes->>'churnRiskLevel' = 'LOW')    AS low_risk
            FROM customer_profile cp
            WHERE EXISTS (
              SELECT 1 FROM event_store es
              WHERE es.profile_id = cp.id
                AND es.event_properties->>'segmentId' = ${seg.id}
            )
          `);

          const sr = scoreResult.rows[0] as unknown as SegDefScoreRow | undefined;

          namedSegments.push({
            segmentId:          seg.id,
            segmentName:        seg.name,
            segmentType:        'defined',
            profileCount:       Number(sr?.profile_count ?? 0),
            scoredProfileCount: Number(sr?.scored_count  ?? 0),
            avgEngagementScore: sr?.avg_score != null ? Number(sr.avg_score) : 0,
            bandBreakdown: {
              champion: Number(sr?.champion ?? 0),
              active:   Number(sr?.active   ?? 0),
              engaged:  Number(sr?.engaged  ?? 0),
              at_risk:  Number(sr?.at_risk  ?? 0),
              dormant:  Number(sr?.dormant  ?? 0),
            },
            churnRiskBreakdown: {
              high:   Number(sr?.high_risk   ?? 0),
              medium: Number(sr?.medium_risk ?? 0),
              low:    Number(sr?.low_risk    ?? 0),
            },
          });
        }

        const allSegments = [...namedSegments, ...syntheticSegments];

        res.json({ segments: allSegments, total: allSegments.length });
      } catch (err) {
        secureLogger.error('Failed to get segment scoring summary', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve segment scoring summary' });
      }
    }
  );

  // -------------------------------------------------------
  // Campaign Analytics
  // -------------------------------------------------------

  /**
   * GET /api/scoring/campaigns
   * List all campaigns with aggregated performance metrics.
   */
  app.get(
    '/api/scoring/campaigns',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
        const offset = Math.max(Number(req.query.offset ?? 0),  0);

        const result = await campaignAnalyticsService.listCampaignsWithMetrics(limit, offset);
        res.json(result);
      } catch (err) {
        secureLogger.error('Failed to list campaign metrics', { error: String(err) }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve campaign analytics' });
      }
    }
  );

  /**
   * GET /api/scoring/campaigns/:campaignId
   * Detailed performance metrics for a single campaign.
   */
  app.get(
    '/api/scoring/campaigns/:campaignId',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const { campaignId } = req.params;
        const metrics = await campaignAnalyticsService.getCampaignMetrics(campaignId);

        if (!metrics) {
          return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({ metrics });
      } catch (err) {
        secureLogger.error('Failed to get campaign metrics', {
          campaignId: req.params.campaignId,
          error: String(err),
        }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve campaign metrics' });
      }
    }
  );

  /**
   * GET /api/scoring/campaigns/:campaignId/timeseries
   * Day-by-day performance breakdown for a campaign.
   * Optional query params: startDate, endDate (ISO 8601)
   */
  app.get(
    '/api/scoring/campaigns/:campaignId/timeseries',
    requireAuth,
    requireRole(SCORING_READ_ROLES),
    async (req, res) => {
      try {
        const { campaignId } = req.params;

        const startDateParam = req.query.startDate as string | undefined;
        const endDateParam   = req.query.endDate   as string | undefined;

        const dateSchema = z.string().datetime().optional();
        const startParsed = dateSchema.safeParse(startDateParam);
        const endParsed   = dateSchema.safeParse(endDateParam);

        if (startDateParam && !startParsed.success) {
          return res.status(400).json({ error: 'Invalid startDate — must be ISO 8601' });
        }
        if (endDateParam && !endParsed.success) {
          return res.status(400).json({ error: 'Invalid endDate — must be ISO 8601' });
        }

        const startDate = startParsed.data ? new Date(startParsed.data) : undefined;
        const endDate   = endParsed.data   ? new Date(endParsed.data)   : undefined;

        const timeseries = await campaignAnalyticsService.getCampaignTimeSeries(
          campaignId,
          startDate,
          endDate
        );

        res.json({ campaignId, timeseries });
      } catch (err) {
        secureLogger.error('Failed to get campaign timeseries', {
          campaignId: req.params.campaignId,
          error: String(err),
        }, 'SCORING');
        res.status(500).json({ error: 'Failed to retrieve campaign timeseries' });
      }
    }
  );
}
