import type { Express } from 'express';
import { segmentationEngine, ValidationError } from '../services/segmentation-engine-service';
import { requireAuth } from '../jwt-utils';
import { z } from 'zod';

const ALLOWED_FIELDS = [
  'firstName', 'lastName', 'email', 'phoneNumber', 'whatsappId',
  'dateOfBirth', 'gender', 'dataQualityScore', 'createdAt', 'updatedAt',
];

const segmentConditionSchema = z.object({
  field: z.string().min(1).refine(f => ALLOWED_FIELDS.includes(f), {
    message: `field must be one of: ${ALLOWED_FIELDS.join(', ')}`,
  }),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'within_days', 'contains', 'not_contains', 'is_null', 'is_not_null']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const segmentRulesSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(
      z.union([
        segmentConditionSchema,
        segmentRulesSchema,
      ])
    ).min(1),
  })
);

function errorResponse(error: unknown, res: any) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (error instanceof ValidationError) {
    return res.status(400).json({ success: false, error: message });
  }
  if (message.includes('not found')) {
    return res.status(404).json({ success: false, error: message });
  }
  if (message.includes('not in SegmentRules format')) {
    return res.status(422).json({ success: false, error: message });
  }
  return res.status(500).json({ success: false, error: message });
}

export function setupSegmentationEngineRoutes(app: Express): void {
  app.post('/api/segmentation-engine/evaluate/:segmentId', requireAuth, async (req, res) => {
    try {
      const { segmentId } = req.params;
      if (!segmentId) {
        return res.status(400).json({ error: 'segmentId is required' });
      }

      const result = await segmentationEngine.evaluateSegment(segmentId);
      res.json({ success: true, result });
    } catch (error) {
      errorResponse(error, res);
    }
  });

  app.post('/api/segmentation-engine/evaluate-all', requireAuth, async (req, res) => {
    try {
      const results = await segmentationEngine.evaluateAllActiveSegments();
      res.json({
        success: true,
        evaluated: results.length,
        results,
      });
    } catch (error) {
      errorResponse(error, res);
    }
  });

  app.get('/api/segmentation-engine/members/:segmentId', requireAuth, async (req, res) => {
    try {
      const { segmentId } = req.params;
      const limit = Math.max(0, Math.min(Number(req.query.limit) || 100, 1000));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const result = await segmentationEngine.getSegmentMembers(segmentId, limit, offset);
      res.json({ success: true, ...result });
    } catch (error) {
      errorResponse(error, res);
    }
  });

  app.post('/api/segmentation-engine/validate-rules', requireAuth, async (req, res) => {
    try {
      const parseResult = segmentRulesSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          valid: false,
          errors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }
      res.json({ valid: true });
    } catch (error) {
      res.status(500).json({ valid: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
