/**
 * CDP Point Rule Engine — configurable earn/burn rules per activity type
 *
 * Determines how many points are awarded or deducted for each activity.
 * Rules are currently configuration-driven (in-process) but can be migrated
 * to a database-backed configuration table in a later phase.
 */

export type EarnActivityType =
  | 'quiz_complete'
  | 'survey_submit'
  | 'referral_success'
  | 'task_complete'
  | 'admin_adjustment';

export type BurnActivityType = 'redemption' | 'expiry' | 'admin_adjustment';

export type ActivityType = EarnActivityType | BurnActivityType;

export interface EarnRule {
  activityType: EarnActivityType;
  basePoints: number;
  /** Multiplier applied to basePoints (e.g. 2x for verified referrals) */
  multiplier: number;
  /** Maximum points per single earn event */
  maxPointsPerEvent: number;
  /** Daily earn cap for this activity type (0 = unlimited) */
  dailyEarnCap: number;
  /** Default expiry days from earn date (0 = never expires) */
  expiryDays: number;
}

export interface BurnRule {
  activityType: BurnActivityType;
  /** Minimum points required to initiate a burn */
  minPoints: number;
  /** Maximum points per single burn event (0 = unlimited) */
  maxPointsPerEvent: number;
}

export interface LoyaltyTierConfig {
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  /** Minimum total lifetime earned points to reach this tier */
  minLifetimePoints: number;
  /** Additional point multiplier on all earns at this tier */
  earnMultiplier: number;
}

// =====================================================
// Default configuration — override via environment or
// future DB-backed config table
// =====================================================

const DEFAULT_EARN_RULES: Record<EarnActivityType, EarnRule> = {
  quiz_complete: {
    activityType: 'quiz_complete',
    basePoints: 50,
    multiplier: 1.0,
    maxPointsPerEvent: 200,
    dailyEarnCap: 5, // max 5 quiz completions per day (count-based)
    expiryDays: 365,
  },
  survey_submit: {
    activityType: 'survey_submit',
    basePoints: 25,
    multiplier: 1.0,
    maxPointsPerEvent: 100,
    dailyEarnCap: 3,
    expiryDays: 365,
  },
  referral_success: {
    activityType: 'referral_success',
    basePoints: 200,
    multiplier: 1.0,
    maxPointsPerEvent: 500,
    dailyEarnCap: 10,
    expiryDays: 365,
  },
  task_complete: {
    activityType: 'task_complete',
    basePoints: 30,
    multiplier: 1.0,
    maxPointsPerEvent: 150,
    dailyEarnCap: 10,
    expiryDays: 365,
  },
  admin_adjustment: {
    activityType: 'admin_adjustment',
    basePoints: 1,
    multiplier: 1.0,
    maxPointsPerEvent: 100_000,
    dailyEarnCap: 0, // unlimited for admin
    expiryDays: 0,
  },
};

const DEFAULT_BURN_RULES: Record<BurnActivityType, BurnRule> = {
  redemption: {
    activityType: 'redemption',
    minPoints: 100,
    maxPointsPerEvent: 50_000,
  },
  expiry: {
    activityType: 'expiry',
    minPoints: 1,
    maxPointsPerEvent: 999_999,
  },
  admin_adjustment: {
    activityType: 'admin_adjustment',
    minPoints: 1,
    maxPointsPerEvent: 100_000,
  },
};

const LOYALTY_TIERS: LoyaltyTierConfig[] = [
  { tier: 'bronze',   minLifetimePoints: 0,     earnMultiplier: 1.0 },
  { tier: 'silver',   minLifetimePoints: 1_000,  earnMultiplier: 1.1 },
  { tier: 'gold',     minLifetimePoints: 5_000,  earnMultiplier: 1.25 },
  { tier: 'platinum', minLifetimePoints: 15_000, earnMultiplier: 1.5 },
];

// =====================================================

export interface EarnCalculationInput {
  activityType: EarnActivityType;
  /** Optional override — ignores base points and multiplier (e.g. admin adjustment) */
  pointOverride?: number;
  /** Tier multiplier from the customer's current loyalty tier */
  tierMultiplier?: number;
}

export interface EarnCalculationResult {
  points: number;
  rule: EarnRule;
  expiresAt: Date | null;
}

export interface BurnCalculationInput {
  activityType: BurnActivityType;
  requestedPoints: number;
  currentBalance: number;
}

export interface BurnCalculationResult {
  points: number;
  rule: BurnRule;
}

export class PointRuleEngine {
  private earnRules: Record<EarnActivityType, EarnRule>;
  private burnRules: Record<BurnActivityType, BurnRule>;
  private tiers: LoyaltyTierConfig[];

  constructor(
    earnRules = DEFAULT_EARN_RULES,
    burnRules = DEFAULT_BURN_RULES,
    tiers = LOYALTY_TIERS
  ) {
    this.earnRules = earnRules;
    this.burnRules = burnRules;
    this.tiers = tiers;
  }

  /**
   * Calculate points to earn for an activity.
   * Applies tier multiplier if provided.
   */
  calculateEarn(input: EarnCalculationInput): EarnCalculationResult {
    const rule = this.earnRules[input.activityType];
    if (!rule) {
      throw new Error(`No earn rule configured for activity type: ${input.activityType}`);
    }

    let points: number;

    if (input.pointOverride !== undefined && input.activityType === 'admin_adjustment') {
      points = Math.max(1, Math.round(input.pointOverride));
    } else {
      const tierMul = input.tierMultiplier ?? 1.0;
      points = Math.round(rule.basePoints * rule.multiplier * tierMul);
    }

    points = Math.min(points, rule.maxPointsPerEvent);

    const expiresAt = rule.expiryDays > 0
      ? new Date(Date.now() + rule.expiryDays * 24 * 60 * 60 * 1000)
      : null;

    return { points, rule, expiresAt };
  }

  /**
   * Calculate points to burn for a redemption or expiry.
   * Validates against balance and burn rule limits.
   */
  calculateBurn(input: BurnCalculationInput): BurnCalculationResult {
    const rule = this.burnRules[input.activityType];
    if (!rule) {
      throw new Error(`No burn rule configured for activity type: ${input.activityType}`);
    }

    if (input.requestedPoints < rule.minPoints) {
      throw new Error(
        `Minimum points for ${input.activityType} is ${rule.minPoints}. ` +
        `Requested: ${input.requestedPoints}`
      );
    }

    if (rule.maxPointsPerEvent > 0 && input.requestedPoints > rule.maxPointsPerEvent) {
      throw new Error(
        `Maximum points per ${input.activityType} event is ${rule.maxPointsPerEvent}. ` +
        `Requested: ${input.requestedPoints}`
      );
    }

    if (input.requestedPoints > input.currentBalance) {
      throw new Error(
        `Insufficient balance. Required: ${input.requestedPoints}, Available: ${input.currentBalance}`
      );
    }

    return { points: input.requestedPoints, rule };
  }

  /**
   * Derive the loyalty tier based on total lifetime points earned.
   */
  deriveTier(totalLifetimeEarned: number): 'bronze' | 'silver' | 'gold' | 'platinum' {
    const sorted = [...this.tiers].sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
    const match = sorted.find(t => totalLifetimeEarned >= t.minLifetimePoints);
    return match?.tier ?? 'bronze';
  }

  /**
   * Return tier earn multiplier for a given tier.
   */
  getTierMultiplier(tier: 'bronze' | 'silver' | 'gold' | 'platinum'): number {
    return this.tiers.find(t => t.tier === tier)?.earnMultiplier ?? 1.0;
  }

  /**
   * Get earn rule for inspection / validation.
   */
  getEarnRule(activityType: EarnActivityType): EarnRule {
    return this.earnRules[activityType];
  }

  /**
   * Get burn rule for inspection / validation.
   */
  getBurnRule(activityType: BurnActivityType): BurnRule {
    return this.burnRules[activityType];
  }

  /**
   * Get all configured tiers for reference.
   */
  getTiers(): LoyaltyTierConfig[] {
    return [...this.tiers];
  }
}

export const pointRuleEngine = new PointRuleEngine();
