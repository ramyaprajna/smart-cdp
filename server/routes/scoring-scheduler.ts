/**
 * Scoring Batch Scheduler
 *
 * Periodically recalculates engagement scores for all active customer profiles.
 * Uses setInterval for simplicity — does not use a cron library to avoid
 * adding dependencies.
 *
 * Default schedule: every 6 hours.
 * Configurable via SCORING_BATCH_INTERVAL_MS environment variable.
 *
 * The first run is intentionally delayed by 5 minutes after startup to avoid
 * a flood of DB queries during cold start when many services initialize at once.
 */
import { scoringEngine as engine } from '../services/scoring-engine-service';
import { secureLogger } from '../utils/secure-logger';

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS    = 5 * 60 * 1000;       // 5 minutes

class ScoringScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private started = false;

  startScheduler(): void {
    // Idempotency guard — only start once regardless of how many times called
    if (this.started) {
      secureLogger.warn('Scoring batch scheduler already started — ignoring duplicate call', {}, 'SCORING_SCHEDULER');
      return;
    }
    this.started = true;

    const MIN_INTERVAL_MS  = 5 * 60 * 1000; // 5-minute safety floor
    const rawInterval      = parseInt(process.env.SCORING_BATCH_INTERVAL_MS ?? '', 10);
    const intervalMs = Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
      ? rawInterval
      : DEFAULT_INTERVAL_MS;

    secureLogger.info('Scoring batch scheduler initialized', {
      intervalMs,
      startupDelayMs: STARTUP_DELAY_MS,
    }, 'SCORING_SCHEDULER');

    // Delay first run to avoid startup load spike
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      this.runBatch().catch(() => {});

      this.timer = setInterval(() => {
        this.runBatch().catch(() => {});
      }, intervalMs);
    }, STARTUP_DELAY_MS);
  }

  stopScheduler(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    secureLogger.info('Scoring batch scheduler stopped', {}, 'SCORING_SCHEDULER');
  }

  private async runBatch(): Promise<void> {
    if (this.isRunning) {
      secureLogger.warn('Scoring batch already in progress — skipping scheduled run', {}, 'SCORING_SCHEDULER');
      return;
    }

    this.isRunning = true;
    const startedAt = new Date().toISOString();

    secureLogger.info('Scoring batch scheduled run started', { startedAt }, 'SCORING_SCHEDULER');

    try {
      const result = await engine.batchCalculateScores();
      secureLogger.info('Scoring batch scheduled run complete', {
        processed: result.processed,
        durationMs: result.durationMs,
        distribution: result.distribution,
      }, 'SCORING_SCHEDULER');
    } catch (err) {
      secureLogger.error('Scoring batch scheduled run failed', {
        error: String(err),
      }, 'SCORING_SCHEDULER');
    } finally {
      this.isRunning = false;
    }
  }
}

export const scoringEngine = new ScoringScheduler();
