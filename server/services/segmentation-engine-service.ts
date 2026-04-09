import { db } from '../db';
import { customerProfile, segmentDefinition, type SegmentCondition, type SegmentRuleGroup, type SegmentRules, type SegmentEvaluationResult } from '@shared/schema';
import { sql, and, or, eq, ne, gt, lt, gte, lte, isNull, isNotNull, ilike, type SQL } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

const PROFILE_FIELDS: Record<string, any> = {
  firstName: customerProfile.firstName,
  lastName: customerProfile.lastName,
  email: customerProfile.email,
  phoneNumber: customerProfile.phoneNumber,
  whatsappId: customerProfile.whatsappId,
  dateOfBirth: customerProfile.dateOfBirth,
  gender: customerProfile.gender,
  dataQualityScore: customerProfile.dataQualityScore,
  createdAt: customerProfile.createdAt,
  updatedAt: customerProfile.updatedAt,
};

const ALLOWED_FIELDS = new Set(Object.keys(PROFILE_FIELDS));
const DATE_FIELDS = new Set(['dateOfBirth', 'createdAt', 'updatedAt']);

function isRuleGroup(condition: SegmentCondition | SegmentRuleGroup): condition is SegmentRuleGroup {
  return 'operator' in condition && 'conditions' in condition && ('AND' === (condition as any).operator || 'OR' === (condition as any).operator);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class SegmentationEngine {
  private validateCondition(condition: SegmentCondition): void {
    if (!ALLOWED_FIELDS.has(condition.field)) {
      throw new ValidationError(`Unknown field: '${condition.field}'. Allowed fields: ${Array.from(ALLOWED_FIELDS).join(', ')}`);
    }

    const needsValue = !['is_null', 'is_not_null'].includes(condition.operator);
    if (needsValue && condition.value === undefined) {
      throw new ValidationError(`Operator '${condition.operator}' requires a value for field '${condition.field}'`);
    }

    if (condition.operator === 'within_days') {
      if (!DATE_FIELDS.has(condition.field)) {
        throw new ValidationError(`'within_days' operator can only be used with date fields. '${condition.field}' is not a date field.`);
      }
      const days = Number(condition.value);
      if (isNaN(days) || days < 0) {
        throw new ValidationError(`'within_days' requires a non-negative number value, got: ${condition.value}`);
      }
    }
  }

  private validateRuleGroup(group: SegmentRuleGroup): void {
    if (!group.conditions || group.conditions.length === 0) {
      throw new ValidationError('Rule group must have at least one condition');
    }
    for (const condition of group.conditions) {
      if (isRuleGroup(condition)) {
        this.validateRuleGroup(condition);
      } else {
        this.validateCondition(condition);
      }
    }
  }

  private buildConditionSQL(condition: SegmentCondition): SQL {
    const column = PROFILE_FIELDS[condition.field];

    if (condition.operator === 'is_null') {
      return isNull(column);
    }
    if (condition.operator === 'is_not_null') {
      return isNotNull(column);
    }

    const value = condition.value;

    switch (condition.operator) {
      case 'eq':
        return eq(column, value as any);
      case 'neq':
        return ne(column, value as any);
      case 'gt':
        if (DATE_FIELDS.has(condition.field)) {
          return gt(column, new Date(value as string));
        }
        return gt(column, value as any);
      case 'lt':
        if (DATE_FIELDS.has(condition.field)) {
          return lt(column, new Date(value as string));
        }
        return lt(column, value as any);
      case 'gte':
        if (DATE_FIELDS.has(condition.field)) {
          return gte(column, new Date(value as string));
        }
        return gte(column, value as any);
      case 'lte':
        if (DATE_FIELDS.has(condition.field)) {
          return lte(column, new Date(value as string));
        }
        return lte(column, value as any);
      case 'within_days': {
        const days = Number(value);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return gte(column, cutoff);
      }
      case 'contains':
        return ilike(column, `%${value}%`);
      case 'not_contains':
        return sql`${column} NOT ILIKE ${'%' + value + '%'}`;
      default:
        throw new ValidationError(`Unsupported operator: ${condition.operator}`);
    }
  }

  private buildRuleGroupSQL(group: SegmentRuleGroup): SQL {
    const sqlConditions: SQL[] = [];

    for (const condition of group.conditions) {
      if (isRuleGroup(condition)) {
        sqlConditions.push(this.buildRuleGroupSQL(condition));
      } else {
        sqlConditions.push(this.buildConditionSQL(condition));
      }
    }

    if (sqlConditions.length === 1) return sqlConditions[0];

    const combined = group.operator === 'AND' ? and(...sqlConditions) : or(...sqlConditions);
    if (!combined) {
      throw new ValidationError('Failed to combine SQL conditions');
    }
    return combined;
  }

  async evaluateSegment(segmentDefId: string): Promise<SegmentEvaluationResult> {
    const startTime = performance.now();

    const [segDef] = await db.select().from(segmentDefinition).where(eq(segmentDefinition.id, segmentDefId)).limit(1);
    if (!segDef) {
      throw new Error(`Segment definition not found: ${segmentDefId}`);
    }

    const rulesData = segDef.rules;
    if (!rulesData || typeof rulesData !== 'object') {
      throw new Error(`Segment definition ${segmentDefId} has no valid rules`);
    }

    const rules = rulesData as unknown as SegmentRules;

    if (!rules.operator || !rules.conditions) {
      throw new Error(`Segment definition ${segmentDefId} rules are not in SegmentRules format. Expected {operator, conditions[]}.`);
    }

    this.validateRuleGroup(rules);

    const whereClause = this.buildRuleGroupSQL(rules);

    const results = await db
      .select({ id: customerProfile.id })
      .from(customerProfile)
      .where(whereClause);
    const matchingIds = results.map(r => r.id);

    await db
      .update(segmentDefinition)
      .set({
        memberCount: matchingIds.length,
        lastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(segmentDefinition.id, segmentDefId));

    const durationMs = Math.round(performance.now() - startTime);

    secureLogger.info(`Segment definition evaluated: ${segDef.name}`, {
      segmentDefId,
      memberCount: matchingIds.length,
      durationMs,
    }, 'SEGMENTATION_ENGINE');

    return {
      segmentId: segDef.id,
      segmentName: segDef.name,
      matchingProfileIds: matchingIds,
      memberCount: matchingIds.length,
      evaluatedAt: new Date().toISOString(),
      durationMs,
    };
  }

  async evaluateAllActiveSegments(): Promise<SegmentEvaluationResult[]> {
    const activeSegDefs = await db
      .select()
      .from(segmentDefinition)
      .where(eq(segmentDefinition.isActive, true));

    const results: SegmentEvaluationResult[] = [];

    for (const segDef of activeSegDefs) {
      try {
        const rules = segDef.rules as unknown as SegmentRules;
        if (!rules?.operator || !rules?.conditions) {
          secureLogger.info(`Skipping segment definition ${segDef.name}: not in SegmentRules format`, {}, 'SEGMENTATION_ENGINE');
          continue;
        }
        const result = await this.evaluateSegment(segDef.id);
        results.push(result);
      } catch (error) {
        secureLogger.error(`Failed to evaluate segment definition ${segDef.name}: ${error instanceof Error ? error.message : String(error)}`, {}, 'SEGMENTATION_ENGINE');
      }
    }

    return results;
  }

  async getSegmentMembers(segmentDefId: string, limit = 100, offset = 0): Promise<{ profileIds: string[]; total: number }> {
    if (limit < 0 || offset < 0) {
      throw new ValidationError('limit and offset must be non-negative');
    }

    const [segDef] = await db.select().from(segmentDefinition).where(eq(segmentDefinition.id, segmentDefId)).limit(1);
    if (!segDef) {
      throw new Error(`Segment definition not found: ${segmentDefId}`);
    }

    const rules = segDef.rules as unknown as SegmentRules;
    if (!rules?.operator || !rules?.conditions) {
      return { profileIds: [], total: 0 };
    }

    this.validateRuleGroup(rules);

    const whereClause = this.buildRuleGroupSQL(rules);

    const [countResult, pageResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(customerProfile).where(whereClause),
      db.select({ id: customerProfile.id }).from(customerProfile).where(whereClause).limit(limit).offset(offset),
    ]);

    return {
      profileIds: pageResult.map(r => r.id),
      total: countResult[0]?.count ?? 0,
    };
  }
}

export const segmentationEngine = new SegmentationEngine();
