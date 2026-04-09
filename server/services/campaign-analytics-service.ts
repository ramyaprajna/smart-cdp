/**
 * Campaign Analytics Service — CDP Phase 2E
 *
 * Aggregates campaign_message status rows into performance metrics per campaign.
 *
 * Status funnel (additive downstream):
 *   sent      → messages transmitted to WABA gateway
 *   delivered → gateway confirmed delivery to device
 *   read      → recipient opened / viewed the message (WABA read receipt)
 *   failed    → gateway error / undeliverable
 *   suppressed → suppressed before send (consent / channel opt-out)
 *   pending   → queued but not yet transmitted
 *
 * Funnel-correct counting:
 *   In our schema, `status` is the *terminal* state of a message row.
 *   A row with status='read' is also delivered and also sent.
 *   A row with status='delivered' is also sent.
 *   Therefore:
 *     sentCount      = rows where status IN ('sent', 'delivered', 'read')
 *     deliveredCount = rows where status IN ('delivered', 'read')
 *     openCount      = rows where status = 'read'   (WABA read receipt = open)
 *     failedCount    = rows where status = 'failed'
 *     suppressedCount= rows where status = 'suppressed'
 *     pendingCount   = rows where status = 'pending'
 *
 * Click & Conversion:
 *   WABA does not provide link-click callbacks in the current integration.
 *   Click and conversion events are tracked via event_store with event_type
 *   'campaign.link_clicked' and 'campaign.converted' respectively, carrying
 *   event_properties->>'campaign_id'. This allows future webhook / UTM enrichment to
 *   populate these metrics without schema changes.
 */
import { db } from '../db';
import { campaign, campaignMessage } from '@shared/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

// -------------------------------------------------------
// Typed SQL row shapes — avoids `any` casts
// -------------------------------------------------------

interface StatusCountRow {
  status: string;
  cnt: string | number;
}

interface AvgMsRow {
  avg_ms: string | number | null;
}

interface CountRow {
  total: string | number;
}

interface EventCountRow {
  cnt: string | number;
}

interface TimeSeriesRow {
  date: string;
  sent: string | number;
  delivered: string | number;
  opened: string | number;
  failed: string | number;
  clicked: string | number;
  converted: string | number;
}

// -------------------------------------------------------
// Public types
// -------------------------------------------------------

export interface CampaignPerformanceMetrics {
  campaignId: string;
  campaignName: string;
  channel: string;
  status: string;
  executedAt: string | null;

  /** Recipients that were targeted */
  totalRecipients: number;
  /** Transmitted to gateway (includes delivered + read) */
  sentCount: number;
  /** Confirmed delivery (includes read) */
  deliveredCount: number;
  /** Read receipt received (= open in WABA) */
  openCount: number;
  /** Gateway-level failure */
  failedCount: number;
  /** Suppressed before send */
  suppressedCount: number;
  /** Still queued */
  pendingCount: number;
  /** Clicked a link tracked via event_store */
  clickedCount: number;
  /** Converted (purchase / goal) tracked via event_store */
  convertedCount: number;

  /** sentCount / totalRecipients × 100 */
  sendRate: number;
  /** deliveredCount / sentCount × 100 */
  deliveryRate: number;
  /** openCount / deliveredCount × 100 (WABA read = open) */
  openRate: number;
  /** clickedCount / deliveredCount × 100 */
  clickRate: number;
  /** convertedCount / deliveredCount × 100 */
  conversionRate: number;
  /** failedCount / totalRecipients × 100 */
  failureRate: number;
  /** suppressedCount / totalRecipients × 100 */
  suppressionRate: number;

  avgDeliveryTimeMs: number | null;
  avgTimeToOpenMs: number | null;
}

export interface CampaignAnalyticsSummary {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalMessagesSent: number;
  avgDeliveryRate: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgConversionRate: number;
  avgFailureRate: number;
  topCampaigns: CampaignPerformanceMetrics[];
}

export interface CampaignTimeSeriesPoint {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  clicked: number;
  converted: number;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

/** Safe percentage, rounded to 1 decimal place. */
const pct = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

const toNum = (v: string | number | null | undefined): number =>
  v == null ? 0 : Number(v);

// -------------------------------------------------------
// Service
// -------------------------------------------------------

class CampaignAnalyticsService {
  /**
   * Get performance metrics for a single campaign.
   *
   * Funnel-correct: counts each status group as cumulative downstream.
   * Click + conversion rates derived from event_store entries.
   */
  async getCampaignMetrics(campaignId: string): Promise<CampaignPerformanceMetrics | null> {
    const [camp] = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, campaignId))
      .limit(1);

    if (!camp) return null;

    // Funnel counts via single SQL aggregate — avoids N queries
    const funnelResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')) AS sent_count,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))          AS delivered_count,
        COUNT(*) FILTER (WHERE status = 'read')                          AS open_count,
        COUNT(*) FILTER (WHERE status = 'failed')                        AS failed_count,
        COUNT(*) FILTER (WHERE status = 'suppressed')                    AS suppressed_count,
        COUNT(*) FILTER (WHERE status = 'pending')                       AS pending_count,
        COUNT(*)                                                          AS total_recipients
      FROM campaign_message
      WHERE campaign_id = ${campaignId}
    `);

    interface FunnelRow {
      sent_count: string | number;
      delivered_count: string | number;
      open_count: string | number;
      failed_count: string | number;
      suppressed_count: string | number;
      pending_count: string | number;
      total_recipients: string | number;
    }

    const funnel = funnelResult.rows[0] as unknown as FunnelRow;
    const sentCount       = toNum(funnel?.sent_count);
    const deliveredCount  = toNum(funnel?.delivered_count);
    const openCount       = toNum(funnel?.open_count);
    const failedCount     = toNum(funnel?.failed_count);
    const suppressedCount = toNum(funnel?.suppressed_count);
    const pendingCount    = toNum(funnel?.pending_count);
    const totalRecipients = toNum(funnel?.total_recipients);

    // Click + conversion counts from event_store (campaign_id in metadata)
    const clickResult = await db.execute(sql`
      SELECT COUNT(*)::bigint AS cnt
      FROM event_store
      WHERE event_type = 'campaign.link_clicked'
        AND event_properties->>'campaign_id' = ${campaignId}
    `);
    const convertResult = await db.execute(sql`
      SELECT COUNT(*)::bigint AS cnt
      FROM event_store
      WHERE event_type = 'campaign.converted'
        AND event_properties->>'campaign_id' = ${campaignId}
    `);

    const clickedCount    = toNum((clickResult.rows[0] as unknown as EventCountRow)?.cnt);
    const convertedCount  = toNum((convertResult.rows[0] as unknown as EventCountRow)?.cnt);

    // Average delivery time (sent_at → delivered_at)
    const deliveryTimeResult = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at)) * 1000)::bigint AS avg_ms
      FROM campaign_message
      WHERE campaign_id = ${campaignId}
        AND delivered_at IS NOT NULL
        AND sent_at IS NOT NULL
    `);
    const avgDeliveryTimeMs = toNum((deliveryTimeResult.rows[0] as unknown as AvgMsRow)?.avg_ms) || null;

    // Average time to open (delivered_at → read_at)
    const openTimeResult = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (read_at - delivered_at)) * 1000)::bigint AS avg_ms
      FROM campaign_message
      WHERE campaign_id = ${campaignId}
        AND read_at IS NOT NULL
        AND delivered_at IS NOT NULL
    `);
    const avgTimeToOpenMs = toNum((openTimeResult.rows[0] as unknown as AvgMsRow)?.avg_ms) || null;

    return {
      campaignId:     camp.id,
      campaignName:   camp.name,
      channel:        camp.channel,
      status:         camp.status,
      executedAt:     camp.executedAt?.toISOString() ?? null,

      totalRecipients,
      sentCount,
      deliveredCount,
      openCount,
      failedCount,
      suppressedCount,
      pendingCount,
      clickedCount,
      convertedCount,

      sendRate:        pct(sentCount,      totalRecipients),
      deliveryRate:    pct(deliveredCount, sentCount),
      openRate:        pct(openCount,      deliveredCount),
      clickRate:       pct(clickedCount,   deliveredCount),
      conversionRate:  pct(convertedCount, deliveredCount),
      failureRate:     pct(failedCount,    totalRecipients),
      suppressionRate: pct(suppressedCount, totalRecipients),

      avgDeliveryTimeMs,
      avgTimeToOpenMs,
    };
  }

  /**
   * Get analytics summary across all campaigns.
   */
  async getAnalyticsSummary(limit = 10): Promise<CampaignAnalyticsSummary> {
    const allCampaigns = await db
      .select({
        id:             campaign.id,
        status:         campaign.status,
        totalRecipients: campaign.totalRecipients,
        sentCount:      campaign.sentCount,
        deliveredCount: campaign.deliveredCount,
        readCount:      campaign.readCount,
        failedCount:    campaign.failedCount,
      })
      .from(campaign)
      .orderBy(desc(campaign.createdAt));

    const totalCampaigns     = allCampaigns.length;
    const activeCampaigns    = allCampaigns.filter(c => ['scheduled', 'sending'].includes(c.status)).length;
    const completedCampaigns = allCampaigns.filter(c => ['sent', 'completed'].includes(c.status)).length;
    const totalMessagesSent  = allCampaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0);

    // Weighted-average rates across campaigns with activity
    const active = allCampaigns.filter(c => (c.totalRecipients ?? 0) > 0);
    const n = active.length;

    const avg = (fn: (c: typeof active[number]) => number) =>
      n > 0 ? Math.round(active.reduce((s, c) => s + fn(c), 0) / n * 10) / 10 : 0;

    const avgDeliveryRate = avg(c => {
      const sent = c.sentCount ?? 0;
      const del  = c.deliveredCount ?? 0;
      return sent > 0 ? del / sent * 100 : 0;
    });
    const avgOpenRate = avg(c => {
      const del  = c.deliveredCount ?? 0;
      const read = c.readCount ?? 0;
      return del > 0 ? read / del * 100 : 0;
    });
    const avgFailureRate = avg(c => {
      const total  = c.totalRecipients ?? 0;
      const failed = c.failedCount ?? 0;
      return total > 0 ? failed / total * 100 : 0;
    });

    // Top N campaigns by delivered count — fetch full metrics including click/conversion
    const topCampaignIds = [...allCampaigns]
      .sort((a, b) => (b.deliveredCount ?? 0) - (a.deliveredCount ?? 0))
      .slice(0, limit)
      .map(c => c.id);

    const topCampaigns: CampaignPerformanceMetrics[] = [];
    for (const id of topCampaignIds) {
      const m = await this.getCampaignMetrics(id);
      if (m) topCampaigns.push(m);
    }

    // Compute click/conversion averages from the full campaign set via event_store
    // Use a single aggregate query for efficiency instead of per-campaign lookups
    const clickConvertResult = await db.execute(sql`
      SELECT
        AVG(
          CASE WHEN cm_del.delivered > 0
            THEN clicks.cnt::numeric / cm_del.delivered
            ELSE 0
          END
        ) * 100 AS avg_click_rate,
        AVG(
          CASE WHEN cm_del.delivered > 0
            THEN converts.cnt::numeric / cm_del.delivered
            ELSE 0
          END
        ) * 100 AS avg_conversion_rate
      FROM campaign
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))::int AS delivered
        FROM campaign_message WHERE campaign_id = campaign.id
      ) cm_del ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM event_store
        WHERE event_type = 'campaign.link_clicked'
          AND event_properties->>'campaign_id' = campaign.id::text
      ) clicks ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM event_store
        WHERE event_type = 'campaign.converted'
          AND event_properties->>'campaign_id' = campaign.id::text
      ) converts ON true
    `);

    interface ClickConvertRow { avg_click_rate: string | null; avg_conversion_rate: string | null; }
    const ccRow = clickConvertResult.rows[0] as unknown as ClickConvertRow | undefined;
    const avgClickRate      = Math.round(Number(ccRow?.avg_click_rate      ?? 0) * 10) / 10;
    const avgConversionRate = Math.round(Number(ccRow?.avg_conversion_rate ?? 0) * 10) / 10;

    return {
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      totalMessagesSent,
      avgDeliveryRate,
      avgOpenRate,
      avgClickRate,
      avgConversionRate,
      avgFailureRate,
      topCampaigns,
    };
  }

  /**
   * Get time-series performance data for a campaign (grouped by day).
   *
   * Uses funnel-correct aggregation in SQL:
   *   sent      = status IN ('sent', 'delivered', 'read')
   *   delivered = status IN ('delivered', 'read')
   *   opened    = status = 'read'
   * Click/converted counts pulled from event_store per day.
   */
  async getCampaignTimeSeries(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CampaignTimeSeriesPoint[]> {
    const result = await db.execute(sql`
      SELECT
        DATE(COALESCE(sent_at, created_at)) AS date,
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')) AS sent,
        COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))          AS delivered,
        COUNT(*) FILTER (WHERE status = 'read')                          AS opened,
        COUNT(*) FILTER (WHERE status = 'failed')                        AS failed
      FROM campaign_message
      WHERE campaign_id = ${campaignId}
        ${startDate ? sql`AND COALESCE(sent_at, created_at) >= ${startDate}` : sql``}
        ${endDate   ? sql`AND COALESCE(sent_at, created_at) <= ${endDate}`   : sql``}
      GROUP BY DATE(COALESCE(sent_at, created_at))
      ORDER BY date ASC
    `);

    // Click/conversion per day from event_store
    const eventResult = await db.execute(sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) FILTER (WHERE event_type = 'campaign.link_clicked') AS clicked,
        COUNT(*) FILTER (WHERE event_type = 'campaign.converted')    AS converted
      FROM event_store
      WHERE event_properties->>'campaign_id' = ${campaignId}
        ${startDate ? sql`AND created_at >= ${startDate}` : sql``}
        ${endDate   ? sql`AND created_at <= ${endDate}`   : sql``}
      GROUP BY DATE(created_at)
    `);

    interface EventDayRow { date: string; clicked: string | number; converted: string | number; }
    const eventMap = new Map<string, { clicked: number; converted: number }>();
    for (const r of eventResult.rows as unknown as EventDayRow[]) {
      eventMap.set(String(r.date), {
        clicked:   toNum(r.clicked),
        converted: toNum(r.converted),
      });
    }

    return (result.rows as unknown as TimeSeriesRow[]).map(row => {
      const dateStr = String(row.date);
      const ev = eventMap.get(dateStr) ?? { clicked: 0, converted: 0 };
      return {
        date:      dateStr,
        sent:      toNum(row.sent),
        delivered: toNum(row.delivered),
        opened:    toNum(row.opened),
        failed:    toNum(row.failed),
        clicked:   ev.clicked,
        converted: ev.converted,
      };
    });
  }

  /**
   * List all campaigns with basic performance metrics (for dashboard table).
   */
  async listCampaignsWithMetrics(
    limit = 20,
    offset = 0
  ): Promise<{ campaigns: CampaignPerformanceMetrics[]; total: number }> {
    const countResult = await db.execute(sql`SELECT COUNT(*)::int AS total FROM campaign`);
    const total = toNum((countResult.rows[0] as unknown as CountRow)?.total);

    const camps = await db
      .select()
      .from(campaign)
      .orderBy(desc(campaign.createdAt))
      .limit(limit)
      .offset(offset);

    const metrics: CampaignPerformanceMetrics[] = [];
    for (const camp of camps) {
      const m = await this.getCampaignMetrics(camp.id);
      if (m) metrics.push(m);
    }

    return { campaigns: metrics, total };
  }
}

export const campaignAnalyticsService = new CampaignAnalyticsService();
