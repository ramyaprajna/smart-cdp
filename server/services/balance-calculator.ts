/**
 * CDP Balance Calculator — derives current balance from ledger entries
 *
 * The point_ledger is the source of truth. point_balance is a materialized
 * cache updated on every transaction for fast reads.
 *
 * Balance model — lot-aware FIFO expiration:
 *   Burns (negative entries) are consumed against earn lots in chronological order
 *   (oldest first). A lot's remaining points = earned - consumed_by_burns.
 *   If a lot has expiresAt < now() its remaining unconsumed points are excluded
 *   from currentBalance. This prevents double-penalising expired lots that
 *   already had burns applied against them.
 *
 *   totalEarned = SUM of all earn entries (all-time, for tier calculation)
 *   currentBalance = SUM of remaining unconsumed points from non-expired lots
 */
import { db } from '../db';
import { pointLedger, pointBalance } from '@shared/schema';
import { eq, and, gte, isNull, or, desc, sum, count as sqlCount, sql } from 'drizzle-orm';
import { pointRuleEngine } from './point-rule-engine';
import { secureLogger } from '../utils/secure-logger';

export interface BalanceSummary {
  profileId: string;
  currentBalance: number;
  totalEarned: number;
  totalBurned: number;
  pendingRedemption: number;
  loyaltyTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  lastTransactionAt: Date | null;
}

export class BalanceCalculator {
  /**
   * Recompute full balance from ledger for a profile and upsert into point_balance.
   * Called after every earn/burn transaction for cache consistency.
   */
  async recompute(profileId: string): Promise<BalanceSummary> {
    // ---------------------------------------------------------------------------
    // Lot-aware FIFO balance computation:
    //
    //  Burns are allocated against earn lots in chronological order (oldest-first).
    //  Each earn lot's "consumed" amount = the burns that FIFO-allocated against it.
    //  A lot's remaining = earned - consumed.
    //  If an earn lot is expired (expiresAt < now()), its remaining is excluded.
    //
    //  This avoids the aggregate-math double-penalisation problem where:
    //    activeEarned - totalBurned could go negative if burns occurred before
    //    expiry, since totalBurned includes burns that consumed already-expired lots.
    //
    //  SQL strategy:
    //  1. Assign each burn entry a running cumulative total (oldest first).
    //  2. For each earn lot (oldest first), compute the running cumulative of all
    //     earns up to and including that lot.
    //  3. The burned amount allocated to a lot = LEAST(lot.points,
    //       GREATEST(0, cumulative_burn_up_to_lot - cumulative_earn_before_lot)).
    //  4. remaining = lot.points - allocated_burn.
    //  5. If not expired, add remaining to currentBalance.
    //
    //  totalEarned = SUM of all earn entries (all-time, for tier).
    //  totalBurned = SUM of all burns (all-time, for display).
    // ---------------------------------------------------------------------------

    const result = await db.execute(sql`
      WITH
        profile_earns AS (
          SELECT id, points, expires_at, created_at,
                 SUM(points) OVER (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING) AS cum_earn
          FROM   point_ledger
          WHERE  profile_id = ${profileId}
            AND  transaction_type = 'earn'
        ),
        profile_burns AS (
          SELECT COALESCE(SUM(ABS(points)), 0) AS total_burned
          FROM   point_ledger
          WHERE  profile_id = ${profileId}
            AND  transaction_type = 'burn'
        ),
        lot_remaining AS (
          SELECT
            e.id,
            e.points,
            e.expires_at,
            e.cum_earn,
            b.total_burned,
            -- Cumulative earn BEFORE this lot (not including it)
            e.cum_earn - e.points                                           AS cum_earn_before,
            -- Burns allocated to lots before this one (consumed by older lots)
            GREATEST(0, LEAST(b.total_burned, e.cum_earn - e.points))      AS burns_before,
            -- Burns allocated to THIS lot
            GREATEST(0, LEAST(e.points,
              GREATEST(0, b.total_burned - (e.cum_earn - e.points))))       AS burns_in_lot,
            -- Remaining points in this lot after burn allocation
            e.points - GREATEST(0, LEAST(e.points,
              GREATEST(0, b.total_burned - (e.cum_earn - e.points))))       AS remaining
          FROM profile_earns e, profile_burns b
        )
      SELECT
        COALESCE(SUM(e_all.points), 0)::int                                 AS total_earned,
        (SELECT total_burned FROM profile_burns)::int                       AS total_burned,
        COALESCE(SUM(
          CASE
            WHEN lr.expires_at IS NULL OR lr.expires_at >= NOW()
            THEN lr.remaining
            ELSE 0
          END
        ), 0)::int                                                           AS current_balance
      FROM lot_remaining lr
      JOIN profile_earns e_all ON e_all.id = lr.id
    `);

    const row = (result as unknown as { rows: { total_earned: number; total_burned: number; current_balance: number }[] }).rows[0];
    const totalEarned = Number(row?.total_earned ?? 0);
    const totalBurned = Number(row?.total_burned ?? 0);
    const currentBalance = Math.max(0, Number(row?.current_balance ?? 0));
    const loyaltyTier = pointRuleEngine.deriveTier(totalEarned);

    // Get last transaction timestamp
    const lastTxRows = await db
      .select({ createdAt: pointLedger.createdAt })
      .from(pointLedger)
      .where(eq(pointLedger.profileId, profileId))
      .orderBy(desc(pointLedger.createdAt))
      .limit(1);

    const lastTransactionAt = lastTxRows[0]?.createdAt ?? null;

    // Upsert into point_balance cache
    const existing = await db
      .select({ id: pointBalance.id, pendingRedemption: pointBalance.pendingRedemption })
      .from(pointBalance)
      .where(eq(pointBalance.profileId, profileId))
      .limit(1);

    const pendingRedemption = existing[0]?.pendingRedemption ?? 0;

    const nowTs = new Date();

    if (existing.length === 0) {
      await db.insert(pointBalance).values({
        profileId,
        totalEarned,
        totalBurned,
        currentBalance,
        pendingRedemption: 0,
        loyaltyTier,
        lastTransactionAt,
        updatedAt: nowTs,
      });
    } else {
      await db
        .update(pointBalance)
        .set({
          totalEarned,
          totalBurned,
          currentBalance,
          loyaltyTier,
          lastTransactionAt,
          updatedAt: nowTs,
        })
        .where(eq(pointBalance.profileId, profileId));
    }

    return {
      profileId,
      currentBalance,
      totalEarned,
      totalBurned,
      pendingRedemption,
      loyaltyTier,
      lastTransactionAt,
    };
  }

  /**
   * Get current balance — always recomputes expiration-aware balance from ledger,
   * then updates the point_balance cache.
   *
   * This ensures currentBalance is never stale due to point expiry, even when no
   * new earn/burn transaction has occurred. The cached `pendingRedemption` field is
   * preserved across recomputes (it is managed separately by lockPoints/releaseLockedPoints).
   */
  async getBalance(profileId: string): Promise<BalanceSummary> {
    return this.recompute(profileId);
  }

  /**
   * Increment pendingRedemption by the given amount (locks points for a pending redemption).
   */
  async lockPoints(profileId: string, points: number): Promise<void> {
    const existing = await db
      .select({ id: pointBalance.id, pendingRedemption: pointBalance.pendingRedemption })
      .from(pointBalance)
      .where(eq(pointBalance.profileId, profileId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(pointBalance).values({
        profileId,
        totalEarned: 0,
        totalBurned: 0,
        currentBalance: 0,
        pendingRedemption: points,
        loyaltyTier: 'bronze',
        updatedAt: new Date(),
      });
    } else {
      const newPending = (existing[0].pendingRedemption ?? 0) + points;
      await db
        .update(pointBalance)
        .set({ pendingRedemption: newPending, updatedAt: new Date() })
        .where(eq(pointBalance.profileId, profileId));
    }
  }

  /**
   * Release locked points (when redemption is fulfilled, rejected, or cancelled).
   */
  async releaseLockedPoints(profileId: string, points: number): Promise<void> {
    const existing = await db
      .select({ id: pointBalance.id, pendingRedemption: pointBalance.pendingRedemption })
      .from(pointBalance)
      .where(eq(pointBalance.profileId, profileId))
      .limit(1);

    if (existing.length > 0) {
      const newPending = Math.max(0, (existing[0].pendingRedemption ?? 0) - points);
      await db
        .update(pointBalance)
        .set({ pendingRedemption: newPending, updatedAt: new Date() })
        .where(eq(pointBalance.profileId, profileId));
    }
  }

  /**
   * Count today's earn events for a profile+activityType (for daily cap enforcement).
   */
  async countTodayEarns(profileId: string, activityType: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await db
      .select({ n: sqlCount() })
      .from(pointLedger)
      .where(
        and(
          eq(pointLedger.profileId, profileId),
          eq(pointLedger.activityType, activityType),
          eq(pointLedger.transactionType, 'earn'),
          gte(pointLedger.createdAt, todayStart)
        )
      );

    return Number(rows[0]?.n ?? 0);
  }
}

export const balanceCalculator = new BalanceCalculator();
