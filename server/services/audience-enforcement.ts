/**
 * CDP Phase 2A: Audience Enforcement
 *
 * Single combined enforcement gate that checks consent + suppression
 * (and optionally frequency caps) in one pass before any campaign send.
 *
 * Campaign services MUST call enforce() instead of calling consent and
 * suppression services independently to guarantee regulatory compliance.
 */
import { consentService } from './consent-service';
import { suppressionService } from './suppression-service';
import { secureLogger } from '../utils/secure-logger';

export interface EnforceInput {
  profileIds: string[];
  channel: string;
  checkFrequencyCaps?: boolean;
}

export interface ExcludedProfile {
  profileId: string;
  reason: string;
  stage: 'suppression' | 'consent' | 'frequency_cap';
}

export interface EnforceResult {
  eligible: string[];
  excluded: ExcludedProfile[];
}

export class AudienceEnforcement {
  /**
   * Combined enforcement gate.
   *
   * Pass order (fail-fast per profile):
   *   1. Suppression check  — removes globally/channel-suppressed profiles
   *   2. Consent check      — removes profiles without active opt-in for channel
   *   3. Frequency cap      — (optional) removes profiles that hit daily/weekly limits
   *
   * Returns the final list of eligible profile IDs and structured exclusion reasons.
   */
  async enforce(input: EnforceInput): Promise<EnforceResult> {
    const { profileIds, channel, checkFrequencyCaps = false } = input;

    if (profileIds.length === 0) {
      return { eligible: [], excluded: [] };
    }

    const excluded: ExcludedProfile[] = [];
    let remaining = [...profileIds];

    // ── Stage 1: Suppression ─────────────────────────────────────────────────
    const suppressionResult = await suppressionService.filterAudience(remaining, channel);

    for (const s of suppressionResult.suppressed) {
      excluded.push({ profileId: s.profileId, reason: s.reason, stage: 'suppression' });
    }
    remaining = suppressionResult.eligible;

    if (remaining.length === 0) {
      return { eligible: [], excluded };
    }

    // ── Stage 2: Consent ─────────────────────────────────────────────────────
    const consentResult = await consentService.checkBulkConsent(remaining, channel);

    for (const c of consentResult.ineligible) {
      excluded.push({ profileId: c.profileId, reason: c.reason, stage: 'consent' });
    }
    remaining = consentResult.eligible;

    if (remaining.length === 0 || !checkFrequencyCaps) {
      return { eligible: remaining, excluded };
    }

    // ── Stage 3: Frequency Caps (optional) ───────────────────────────────────
    const capEligible: string[] = [];

    // Check caps in parallel batches to avoid sequential bottlenecks
    const CAP_BATCH = 50;
    for (let i = 0; i < remaining.length; i += CAP_BATCH) {
      const batch = remaining.slice(i, i + CAP_BATCH);
      const results = await Promise.all(
        batch.map(profileId => consentService.isFrequencyCapped(profileId, channel))
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j].capped) {
          excluded.push({
            profileId: batch[j],
            reason: results[j].reason ?? 'frequency_cap_reached',
            stage: 'frequency_cap',
          });
        } else {
          capEligible.push(batch[j]);
        }
      }
    }

    secureLogger.info('Audience enforcement complete', {
      channel,
      total: profileIds.length,
      eligible: capEligible.length,
      excluded: excluded.length,
      checkFrequencyCaps,
    }, 'CONSENT');

    return { eligible: capEligible, excluded };
  }
}

export const audienceEnforcement = new AudienceEnforcement();
