/**
 * CDP Loyalty Routes — REST API for point earn/burn, balance, history, redemptions
 *
 * All endpoints require authentication (JWT). Redemption management (approve/reject)
 * is restricted to admin/marketing roles.
 *
 * Route ordering:
 *   GET /api/loyalty/balance/:profileId
 *   GET /api/loyalty/history/:profileId
 *   GET /api/loyalty/redemptions/:profileId
 *   POST /api/loyalty/earn
 *   POST /api/loyalty/burn
 *   POST /api/loyalty/redeem
 *   POST /api/loyalty/redemptions/:redemptionId/approve  (admin/marketing)
 *   POST /api/loyalty/redemptions/:redemptionId/reject   (admin/marketing)
 *   GET  /api/loyalty/rules                              (public-ish, requires auth)
 */
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../jwt-utils';
import { loyaltyService } from '../services/loyalty-service';
import { pointRuleEngine } from '../services/point-rule-engine';
import { balanceCalculator } from '../services/balance-calculator';
import { secureLogger } from '../utils/secure-logger';

// =====================================================
// Validation schemas
// =====================================================

const earnSchema = z.object({
  profileId: z.string().uuid(),
  activityType: z.enum([
    'quiz_complete',
    'survey_submit',
    'referral_success',
    'task_complete',
    'admin_adjustment',
  ]),
  idempotencyKey: z.string().min(1).max(256),
  referenceId: z.string().optional(),
  referrerProfileId: z.string().uuid().optional(),
  pointOverride: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const burnSchema = z.object({
  profileId: z.string().uuid(),
  activityType: z.enum(['redemption', 'expiry', 'admin_adjustment']),
  points: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(256),
  referenceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const redeemSchema = z.object({
  profileId: z.string().uuid(),
  points: z.number().int().positive(),
  rewardType: z.enum(['voucher', 'cashback', 'merchandise', 'donation']),
  idempotencyKey: z.string().min(1).max(256),
  metadata: z.record(z.unknown()).optional(),
});

const approveSchema = z.object({
  redemptionCode: z.string().optional(),
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  status: z.enum(['rejected', 'cancelled']),
  notes: z.string().optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  transactionType: z.enum(['earn', 'burn']).optional(),
});

// CDP-internal authorization roles that may access loyalty data
// This is a staff-facing internal tool — end customers do not log in here.
// All loyalty data access is restricted to staff with appropriate roles.
const LOYALTY_READ_ROLES = ['admin', 'marketing', 'analyst'];
const LOYALTY_WRITE_ROLES = ['admin', 'marketing'];

// =====================================================

export function setupLoyaltyRoutes(app: Express): void {
  // GET /api/loyalty/balance/:profileId — current balance + tier
  app.get(
    '/api/loyalty/balance/:profileId',
    requireAuth,
    requireRole(LOYALTY_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const { profileId } = req.params;
        if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
          return res.status(400).json({ error: 'Invalid profileId' });
        }

        const balance = await balanceCalculator.getBalance(profileId);
        return res.json({ balance });
      } catch (err) {
        secureLogger.error('Failed to get loyalty balance', { error: String(err) }, 'LOYALTY');
        return res.status(500).json({ error: 'Failed to retrieve balance' });
      }
    }
  );

  // GET /api/loyalty/history/:profileId — paginated transaction history
  app.get(
    '/api/loyalty/history/:profileId',
    requireAuth,
    requireRole(LOYALTY_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const { profileId } = req.params;
        if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
          return res.status(400).json({ error: 'Invalid profileId' });
        }

        const parsed = historyQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid query params', details: parsed.error.format() });
        }

        const { entries, total } = await loyaltyService.getTransactionHistory({
          profileId,
          ...parsed.data,
        });

        return res.json({ entries, total, limit: parsed.data.limit, offset: parsed.data.offset });
      } catch (err) {
        secureLogger.error('Failed to get transaction history', { error: String(err) }, 'LOYALTY');
        return res.status(500).json({ error: 'Failed to retrieve transaction history' });
      }
    }
  );

  // GET /api/loyalty/redemptions/:profileId — redemption list for profile
  app.get(
    '/api/loyalty/redemptions/:profileId',
    requireAuth,
    requireRole(LOYALTY_READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const { profileId } = req.params;
        if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
          return res.status(400).json({ error: 'Invalid profileId' });
        }

        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const redemptions = await loyaltyService.getRedemptions(profileId, status);
        return res.json({ redemptions });
      } catch (err) {
        secureLogger.error('Failed to get redemptions', { error: String(err) }, 'LOYALTY');
        return res.status(500).json({ error: 'Failed to retrieve redemptions' });
      }
    }
  );

  // GET /api/loyalty/rules — return configured earn/burn rules and tier definitions
  app.get('/api/loyalty/rules', requireAuth, requireRole(LOYALTY_READ_ROLES), async (_req: Request, res: Response) => {
    return res.json({
      earnRules: (
        ['quiz_complete', 'survey_submit', 'referral_success', 'task_complete', 'admin_adjustment'] as const
      ).map(a => pointRuleEngine.getEarnRule(a)),
      burnRules: (
        ['redemption', 'expiry', 'admin_adjustment'] as const
      ).map(a => pointRuleEngine.getBurnRule(a)),
      tiers: pointRuleEngine.getTiers(),
    });
  });

  // POST /api/loyalty/earn — earn points for an activity (admin/marketing)
  app.post('/api/loyalty/earn', requireAuth, requireRole(LOYALTY_WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const parsed = earnSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      // Only admin may use admin_adjustment earn type
      if (
        parsed.data.activityType === 'admin_adjustment' &&
        req.user?.role !== 'admin'
      ) {
        return res.status(403).json({ error: 'admin_adjustment requires admin role' });
      }

      const result = await loyaltyService.earnPoints(parsed.data);

      const statusCode = result.status === 'credited' ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to earn points';
      secureLogger.error('Earn points failed', { error: msg }, 'LOYALTY');
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/loyalty/burn — directly burn points (admin/expiry use; not for customers)
  // admin_adjustment burns are restricted to admin role only (governance policy)
  app.post('/api/loyalty/burn', requireAuth, requireRole(['admin', 'marketing']), async (req: Request, res: Response) => {
    try {
      const parsed = burnSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      // admin_adjustment burns are restricted to admin role — marketing cannot override balances
      const userRole = (req as Request & { user?: { role?: string } }).user?.role;
      if (parsed.data.activityType === 'admin_adjustment' && userRole !== 'admin') {
        return res.status(403).json({ error: 'admin_adjustment burns require admin role' });
      }

      const result = await loyaltyService.burnPoints(parsed.data);

      const statusCode = result.status === 'burned' ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to burn points';
      secureLogger.error('Burn points failed', { error: msg }, 'LOYALTY');
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/loyalty/redeem — submit redemption request (marketing/admin on behalf of customer)
  app.post('/api/loyalty/redeem', requireAuth, requireRole(LOYALTY_WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const parsed = redeemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const result = await loyaltyService.submitRedemption(parsed.data);

      const statusCode = result.status === 'created' ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit redemption';
      secureLogger.error('Submit redemption failed', { error: msg }, 'LOYALTY');
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/loyalty/redemptions/:redemptionId/approve — approve pending redemption
  app.post(
    '/api/loyalty/redemptions/:redemptionId/approve',
    requireAuth,
    requireRole(['admin', 'marketing']),
    async (req: Request, res: Response) => {
      try {
        const { redemptionId } = req.params;
        const parsed = approveSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        // processedBy is always the authenticated user — cannot be spoofed
        const processedBy = req.user!.id;

        const result = await loyaltyService.approveRedemption(
          redemptionId,
          processedBy,
          parsed.data.redemptionCode,
          parsed.data.notes
        );

        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to approve redemption';
        secureLogger.error('Approve redemption failed', { error: msg }, 'LOYALTY');
        return res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/loyalty/redemptions/:redemptionId/reject — reject or cancel
  app.post(
    '/api/loyalty/redemptions/:redemptionId/reject',
    requireAuth,
    requireRole(['admin', 'marketing']),
    async (req: Request, res: Response) => {
      try {
        const { redemptionId } = req.params;
        const parsed = rejectSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
        }

        // processedBy is always the authenticated user — cannot be spoofed
        const processedBy = req.user!.id;

        const result = await loyaltyService.rejectRedemption(
          redemptionId,
          processedBy,
          parsed.data.status,
          parsed.data.notes
        );

        return res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to reject redemption';
        secureLogger.error('Reject redemption failed', { error: msg }, 'LOYALTY');
        return res.status(400).json({ error: msg });
      }
    }
  );
}
