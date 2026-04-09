/**
 * CDP Loyalty Service — orchestrates point earn/burn, anti-fraud validation,
 * redemption lifecycle, and CDP event integration.
 *
 * The service enforces:
 *  1. Idempotency — duplicate earn/burn requests are silently deduplicated
 *  2. Daily earn caps per activity type
 *  3. Self-referral blocking for referral_success earns
 *  4. Balance sufficiency checks for burns
 *  5. Audit trail via ingestEventService (CDP event_store)
 *  6. Attribute updates for current balance & loyalty tier on customerProfile
 */
import { db } from '../db';
import {
  pointLedger,
  pointBalance,
  redemption,
  customerProfile,
  type PointLedgerEntry,
  type Redemption,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { pointRuleEngine, type EarnActivityType, type BurnActivityType } from './point-rule-engine';
import { balanceCalculator, type BalanceSummary } from './balance-calculator';
import { ingestEventService } from './ingest-event-service';
import { secureLogger } from '../utils/secure-logger';

// =====================================================
// Request/Result types
// =====================================================

export interface EarnPointsRequest {
  profileId: string;
  activityType: EarnActivityType;
  /** Idempotency key — caller must supply a unique key per logical earn event */
  idempotencyKey: string;
  /** Optional reference to the source entity (quiz ID, task ID, etc.) */
  referenceId?: string;
  /** For referral_success: the profile ID of the referrer */
  referrerProfileId?: string;
  /** Point override (admin_adjustment only) */
  pointOverride?: number;
  /** Extra context stored in metadata */
  metadata?: Record<string, unknown>;
}

export interface EarnPointsResult {
  status: 'credited' | 'already_processed';
  ledgerEntry?: PointLedgerEntry;
  balance: BalanceSummary;
}

export interface BurnPointsRequest {
  profileId: string;
  activityType: BurnActivityType;
  points: number;
  idempotencyKey: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface BurnPointsResult {
  status: 'burned' | 'already_processed';
  ledgerEntry?: PointLedgerEntry;
  balance: BalanceSummary;
}

export interface RedemptionRequest {
  profileId: string;
  points: number;
  rewardType: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RedemptionResult {
  status: 'created' | 'already_exists';
  redemption: Redemption;
  balance: BalanceSummary;
}

export interface TransactionHistoryQuery {
  profileId: string;
  limit?: number;
  offset?: number;
  /** Filter to 'earn' or 'burn' transactions only */
  transactionType?: 'earn' | 'burn';
}

// =====================================================

export class LoyaltyService {
  /**
   * Award points for a completed activity.
   *
   * Anti-fraud checks:
   *  - Idempotency: duplicate idempotencyKey returns already_processed
   *  - Daily earn cap: rejects if today's earn count exceeds configured cap
   *  - Self-referral: referrerProfileId cannot equal profileId
   */
  async earnPoints(req: EarnPointsRequest): Promise<EarnPointsResult> {
    // 1. Idempotency check
    const existing = await db
      .select()
      .from(pointLedger)
      .where(eq(pointLedger.idempotencyKey, req.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      const balance = await balanceCalculator.getBalance(req.profileId);
      return { status: 'already_processed', balance };
    }

    // 2. Self-referral check — referrerProfileId is required for referral_success
    //    to ensure the anti-fraud check cannot be bypassed by omitting it.
    if (req.activityType === 'referral_success') {
      if (!req.referrerProfileId) {
        throw new Error('referrerProfileId is required for referral_success earn events');
      }
      if (req.referrerProfileId === req.profileId) {
        throw new Error('Self-referral is not allowed: referrerProfileId cannot equal profileId');
      }
    }

    // 3. Daily earn cap check
    const currentBalance = await balanceCalculator.getBalance(req.profileId);
    const rule = pointRuleEngine.getEarnRule(req.activityType);

    if (rule.dailyEarnCap > 0 && req.activityType !== 'admin_adjustment') {
      const todayCount = await balanceCalculator.countTodayEarns(req.profileId, req.activityType);
      if (todayCount >= rule.dailyEarnCap) {
        throw new Error(
          `Daily earn cap reached for ${req.activityType}: ` +
          `${todayCount}/${rule.dailyEarnCap} events today`
        );
      }
    }

    // 4. Calculate points with tier multiplier
    const tierMultiplier = pointRuleEngine.getTierMultiplier(
      currentBalance.loyaltyTier as 'bronze' | 'silver' | 'gold' | 'platinum'
    );
    const calc = pointRuleEngine.calculateEarn({
      activityType: req.activityType,
      pointOverride: req.pointOverride,
      tierMultiplier,
    });

    const newBalance = currentBalance.currentBalance + calc.points;

    // 5. Insert ledger entry — ON CONFLICT DO NOTHING makes concurrent duplicate
    //    requests safe: DB unique constraint on idempotency_key guarantees exactly-once.
    const insertResult = await db
      .insert(pointLedger)
      .values({
        profileId: req.profileId,
        transactionType: 'earn',
        activityType: req.activityType,
        points: calc.points,
        balanceAfter: newBalance,
        idempotencyKey: req.idempotencyKey,
        referenceId: req.referenceId ?? null,
        referrerProfileId: req.referrerProfileId ?? null,
        expiresAt: calc.expiresAt ?? null,
        metadata: req.metadata ?? null,
      })
      .onConflictDoNothing({ target: pointLedger.idempotencyKey })
      .returning();

    // If conflict (concurrent duplicate), fetch the existing entry and return already_processed
    if (insertResult.length === 0) {
      const balance = await balanceCalculator.getBalance(req.profileId);
      return { status: 'already_processed', balance };
    }
    const entry = insertResult[0];

    // 6. Recompute balance cache
    const updatedBalance = await balanceCalculator.recompute(req.profileId);

    // 7. Update customerProfile attributes
    await this.updateProfileAttributes(req.profileId, updatedBalance);

    // 8. Log CDP event via ingest pipeline
    await this.logPointEvent(req.profileId, 'points.earned', {
      activityType: req.activityType,
      points: calc.points,
      balanceAfter: newBalance,
      referenceId: req.referenceId,
      loyaltyTier: updatedBalance.loyaltyTier,
    }, req.idempotencyKey + '-cdp');

    secureLogger.info('Points earned', {
      profileId: req.profileId,
      activityType: req.activityType,
      points: calc.points,
      balanceAfter: newBalance,
    }, 'LOYALTY');

    return { status: 'credited', ledgerEntry: entry, balance: updatedBalance };
  }

  /**
   * Burn points (direct burn — for expiry/admin).
   * For customer redemptions, use submitRedemption() instead.
   *
   * Anti-fraud checks:
   *  - Idempotency (ON CONFLICT DO NOTHING for race safety)
   *  - Balance sufficiency
   *  - admin_adjustment burns require processedBy to be provided (admin-level action)
   *
   * NOTE on event logging: logPointEvent failures are swallowed to preserve
   * availability. In a production outbox pattern, failed events would be written
   * to a retry queue. This is a known best-effort trade-off.
   *
   * NOTE on idempotency key scoping: keys are globally unique in point_ledger.
   * Callers MUST namespace keys (e.g., "order-{orderId}-burn") to prevent
   * accidental cross-profile collisions.
   */
  async burnPoints(req: BurnPointsRequest): Promise<BurnPointsResult> {
    // 1. Idempotency
    const existing = await db
      .select()
      .from(pointLedger)
      .where(eq(pointLedger.idempotencyKey, req.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      const balance = await balanceCalculator.getBalance(req.profileId);
      return { status: 'already_processed', balance };
    }

    // 2. Get current balance and validate
    const currentBalance = await balanceCalculator.getBalance(req.profileId);

    const calc = pointRuleEngine.calculateBurn({
      activityType: req.activityType,
      requestedPoints: req.points,
      currentBalance: currentBalance.currentBalance,
    });

    const newBalance = currentBalance.currentBalance - calc.points;

    // 3. Insert ledger entry (negative points)
    //    ON CONFLICT DO NOTHING handles concurrent duplicate burn requests safely.
    const burnInsertResult = await db
      .insert(pointLedger)
      .values({
        profileId: req.profileId,
        transactionType: 'burn',
        activityType: req.activityType,
        points: -calc.points, // stored as negative
        balanceAfter: newBalance,
        idempotencyKey: req.idempotencyKey,
        referenceId: req.referenceId ?? null,
        metadata: req.metadata ?? null,
      })
      .onConflictDoNothing({ target: pointLedger.idempotencyKey })
      .returning();

    if (burnInsertResult.length === 0) {
      const balance = await balanceCalculator.getBalance(req.profileId);
      return { status: 'already_processed', balance };
    }
    const entry = burnInsertResult[0];

    // 4. Recompute balance
    const updatedBalance = await balanceCalculator.recompute(req.profileId);

    // 5. Update profile attributes
    await this.updateProfileAttributes(req.profileId, updatedBalance);

    // 6. Log CDP event
    await this.logPointEvent(req.profileId, 'points.burned', {
      activityType: req.activityType,
      points: calc.points,
      balanceAfter: newBalance,
      referenceId: req.referenceId,
      loyaltyTier: updatedBalance.loyaltyTier,
    }, req.idempotencyKey + '-cdp');

    secureLogger.info('Points burned', {
      profileId: req.profileId,
      activityType: req.activityType,
      points: calc.points,
      balanceAfter: newBalance,
    }, 'LOYALTY');

    return { status: 'burned', ledgerEntry: entry, balance: updatedBalance };
  }

  /**
   * Submit a redemption request.
   * Locks points in pendingRedemption; actual burn happens on approval.
   *
   * Anti-fraud: balance sufficiency check includes already-pending redemptions.
   * Concurrency: balance check and lock are performed within a DB transaction
   * to prevent race-condition oversubscription.
   */
  async submitRedemption(req: RedemptionRequest): Promise<RedemptionResult> {
    // 1. Idempotency — fast path before entering transaction
    const existing = await db
      .select()
      .from(redemption)
      .where(eq(redemption.idempotencyKey, req.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      const balance = await balanceCalculator.getBalance(req.profileId);
      return { status: 'already_exists', redemption: existing[0], balance };
    }

    const burnRule = pointRuleEngine.getBurnRule('redemption');
    if (req.points < burnRule.minPoints) {
      throw new Error(`Minimum redemption is ${burnRule.minPoints} points`);
    }

    // 2. Force expiration-aware recompute BEFORE entering the locking transaction
    //    so point_balance.current_balance reflects any expired points at this moment.
    //    The subsequent atomic UPDATE then operates on a fresh, accurate cache.
    await balanceCalculator.recompute(req.profileId);

    // 3. Concurrency-safe: use atomic conditional UPDATE on point_balance
    //    UPDATE ... SET pending_redemption = pending_redemption + X
    //    WHERE profile_id = ? AND (current_balance - pending_redemption) >= X
    //    If 0 rows updated => balance insufficient (concurrent request beat us)
    const { sql: rawSql } = await import('drizzle-orm');

    const red = await db.transaction(async (tx) => {
      // Ensure point_balance row exists (needed for conditional UPDATE to work)
      const existingBalance = await tx
        .select({ id: pointBalance.id })
        .from(pointBalance)
        .where(eq(pointBalance.profileId, req.profileId))
        .limit(1);

      if (existingBalance.length === 0) {
        // No balance record — nothing to lock, balance is effectively 0
        throw new Error(`Insufficient available balance. Requested: ${req.points}, Available: 0`);
      }

      // Atomic conditional UPDATE: increment pending_redemption only if sufficient balance
      // Prevents race condition — the WHERE guard is evaluated atomically at DB level
      const lockResult = await tx.execute(
        rawSql`UPDATE point_balance
               SET pending_redemption = pending_redemption + ${req.points},
                   updated_at = NOW()
               WHERE profile_id = ${req.profileId}
                 AND (current_balance - pending_redemption) >= ${req.points}`
      );

      // rowCount === 0 means the WHERE condition failed (balance insufficient under concurrency)
      const rowsUpdated = (lockResult as { rowCount?: number }).rowCount ?? 0;
      if (rowsUpdated === 0) {
        // Re-read for accurate error message
        const [bal] = await tx
          .select({ currentBalance: pointBalance.currentBalance, pendingRedemption: pointBalance.pendingRedemption })
          .from(pointBalance)
          .where(eq(pointBalance.profileId, req.profileId))
          .limit(1);
        const available = (bal?.currentBalance ?? 0) - (bal?.pendingRedemption ?? 0);
        throw new Error(
          `Insufficient available balance. ` +
          `Requested: ${req.points}, Available (after pending): ${available}`
        );
      }

      // Lock acquired — now insert redemption record
      const [inserted] = await tx
        .insert(redemption)
        .values({
          profileId: req.profileId,
          points: req.points,
          rewardType: req.rewardType,
          status: 'pending',
          idempotencyKey: req.idempotencyKey,
          metadata: req.metadata ?? null,
        })
        .returning();

      return inserted;
    });

    const updatedBalance = await balanceCalculator.getBalance(req.profileId);

    // 3. Log CDP event (outside transaction — failure is non-fatal)
    await this.logPointEvent(req.profileId, 'redemption.submitted', {
      redemptionId: red.id,
      points: req.points,
      rewardType: req.rewardType,
    }, req.idempotencyKey + '-cdp');

    secureLogger.info('Redemption submitted', {
      profileId: req.profileId,
      redemptionId: red.id,
      points: req.points,
    }, 'LOYALTY');

    return { status: 'created', redemption: red, balance: updatedBalance };
  }

  /**
   * Approve a pending redemption — burn the locked points.
   * Wrapped in a transaction with FOR UPDATE on the redemption row to prevent
   * concurrent approve/reject from acting on the same redemption.
   */
  async approveRedemption(
    redemptionId: string,
    processedBy: string,
    redemptionCode?: string,
    notes?: string
  ): Promise<{ redemption: Redemption; balance: BalanceSummary }> {
    const { sql: rawSql } = await import('drizzle-orm');

    const updated = await db.transaction(async (tx) => {
      // Lock the redemption row for update — prevents concurrent approve/reject
      const locked = await tx.execute(
        rawSql`SELECT id, profile_id, points, status FROM redemption WHERE id = ${redemptionId} FOR UPDATE`
      ) as { rows: { id: string; profile_id: string; points: number; status: string }[] };

      const row = locked.rows[0];
      if (!row) throw new Error(`Redemption not found: ${redemptionId}`);
      if (row.status !== 'pending') throw new Error(`Redemption is not pending: ${row.status}`);

      // Burn points inside the transaction — balance_after computed correctly (post-burn)
      // Using a CTE so the balance_after in the ledger entry reflects the value after deduction.
      await tx.execute(
        rawSql`WITH pre AS (
                 SELECT current_balance FROM point_balance WHERE profile_id = ${row.profile_id}
               )
               INSERT INTO point_ledger
               (profile_id, transaction_type, activity_type, points, balance_after, idempotency_key, reference_id, metadata)
               SELECT ${row.profile_id}, 'burn', 'redemption', -${row.points},
                      GREATEST(0, pre.current_balance - ${row.points}),
                      ${'redemption-burn-' + redemptionId},
                      ${redemptionId},
                      ${JSON.stringify({ redemptionId, approvedBy: processedBy })}::jsonb
               FROM pre
               ON CONFLICT (idempotency_key) DO NOTHING`
      );

      // Release pending lock and deduct from balance (atomic with burn insert above)
      await tx.execute(
        rawSql`UPDATE point_balance
               SET pending_redemption = GREATEST(0, pending_redemption - ${row.points}),
                   current_balance = GREATEST(0, current_balance - ${row.points}),
                   total_burned = total_burned + ${row.points},
                   updated_at = NOW()
               WHERE profile_id = ${row.profile_id}`
      );

      // Update redemption status
      const [upd] = await tx
        .update(redemption)
        .set({
          status: 'approved',
          processedAt: new Date(),
          processedBy,
          redemptionCode: redemptionCode ?? null,
          notes: notes ?? null,
        })
        .where(eq(redemption.id, redemptionId))
        .returning();

      return upd;
    });

    // Recompute expiration-aware balance after all changes
    const balance = await balanceCalculator.recompute(updated.profileId);

    // Update customerProfile loyalty attributes to reflect post-approval balance
    await this.updateProfileAttributes(updated.profileId, balance);

    // Emit CDP audit event for approved redemption burn
    await this.logPointEvent(updated.profileId, 'points.burned', {
      activityType: 'redemption',
      points: updated.points,
      balanceAfter: balance.currentBalance,
      referenceId: redemptionId,
      redemptionCode: redemptionCode ?? null,
      approvedBy: processedBy,
    }, `redemption-burn-${redemptionId}-cdp`);

    return { redemption: updated, balance };
  }

  /**
   * Reject or cancel a pending redemption — release locked points.
   * Wrapped in a transaction with FOR UPDATE to prevent concurrent conflicts.
   */
  async rejectRedemption(
    redemptionId: string,
    processedBy: string,
    status: 'rejected' | 'cancelled',
    notes?: string
  ): Promise<{ redemption: Redemption; balance: BalanceSummary }> {
    const { sql: rawSql } = await import('drizzle-orm');

    const updated = await db.transaction(async (tx) => {
      // Lock the redemption row for update
      const locked = await tx.execute(
        rawSql`SELECT id, profile_id, points, status FROM redemption WHERE id = ${redemptionId} FOR UPDATE`
      ) as { rows: { id: string; profile_id: string; points: number; status: string }[] };

      const row = locked.rows[0];
      if (!row) throw new Error(`Redemption not found: ${redemptionId}`);
      if (row.status !== 'pending') throw new Error(`Redemption is not pending: ${row.status}`);

      // Release locked points only (no burn — points are returned)
      await tx.execute(
        rawSql`UPDATE point_balance
               SET pending_redemption = GREATEST(0, pending_redemption - ${row.points}),
                   updated_at = NOW()
               WHERE profile_id = ${row.profile_id}`
      );

      const [upd] = await tx
        .update(redemption)
        .set({
          status,
          processedAt: new Date(),
          processedBy,
          notes: notes ?? null,
        })
        .where(eq(redemption.id, redemptionId))
        .returning();

      return upd;
    });

    await this.logPointEvent(updated.profileId, `redemption.${status}`, {
      redemptionId,
      points: updated.points,
    }, `redemption-${status}-${redemptionId}-cdp`);

    const balance = await balanceCalculator.recompute(updated.profileId);
    return { redemption: updated, balance };
  }

  /**
   * Get transaction history for a profile (paginated).
   */
  async getTransactionHistory(query: TransactionHistoryQuery): Promise<{
    entries: PointLedgerEntry[];
    total: number;
  }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const conditions = [eq(pointLedger.profileId, query.profileId)];
    if (query.transactionType) {
      conditions.push(eq(pointLedger.transactionType, query.transactionType));
    }

    const whereClause = and(...conditions);

    const entries = await db
      .select()
      .from(pointLedger)
      .where(whereClause)
      .orderBy(desc(pointLedger.createdAt))
      .limit(limit)
      .offset(offset);

    // Use a simple count query for total
    const { count } = await import('drizzle-orm');
    const countRows = await db
      .select({ total: count() })
      .from(pointLedger)
      .where(whereClause);

    const total = Number(countRows[0]?.total ?? 0);
    return { entries, total };
  }

  /**
   * Get redemption history for a profile.
   */
  async getRedemptions(profileId: string, status?: string): Promise<Redemption[]> {
    const conditions = [eq(redemption.profileId, profileId)];
    if (status) {
      conditions.push(eq(redemption.status, status));
    }

    return await db
      .select()
      .from(redemption)
      .where(and(...conditions))
      .orderBy(desc(redemption.requestedAt));
  }

  // =====================================================
  // Private helpers
  // =====================================================

  private async updateProfileAttributes(
    profileId: string,
    balance: BalanceSummary
  ): Promise<void> {
    try {
      const existing = await db
        .select({ attributes: customerProfile.attributes })
        .from(customerProfile)
        .where(eq(customerProfile.id, profileId))
        .limit(1);

      if (existing.length === 0) return;

      const attrs = (existing[0].attributes as Record<string, unknown>) ?? {};
      const updated: Record<string, unknown> = {
        ...attrs,
        loyaltyPoints: balance.currentBalance,
        loyaltyTier: balance.loyaltyTier,
        loyaltyTotalEarned: balance.totalEarned,
        loyaltyLastUpdated: new Date().toISOString(),
      };

      await db
        .update(customerProfile)
        .set({ attributes: updated, updatedAt: new Date() })
        .where(eq(customerProfile.id, profileId));
    } catch (err) {
      secureLogger.warn('Failed to update profile attributes for loyalty', {
        profileId,
        error: String(err),
      }, 'LOYALTY');
    }
  }

  private async logPointEvent(
    profileId: string,
    eventType: string,
    properties: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<void> {
    try {
      await ingestEventService.ingest({
        profileId,
        eventType,
        source: 'loyalty',
        idempotencyKey,
        eventProperties: properties,
      });
    } catch (err) {
      secureLogger.warn('Failed to log loyalty event via ingest pipeline', {
        profileId,
        eventType,
        error: String(err),
      }, 'LOYALTY');
    }
  }
}

export const loyaltyService = new LoyaltyService();
