// =============================================================================
// lib/analysis/dedup.ts — Signal deduplication / cooldown check
// =============================================================================

import { findRecentSignal, insertSignal, markSignalSent } from '../db/queries';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { BuildupSignal } from './types';

/**
 * Check if a signal of this kind+strike+type was already sent within the cooldown.
 * If not → insert it and return its ID (caller should then send to Telegram).
 * If yes → return null (skip).
 */
export async function dedupAndInsertSignal(
  kind: string,
  detail: Record<string, unknown>,
  strike?: number,
  optionType?: 'CE' | 'PE'
): Promise<number | null> {
  const recent = await findRecentSignal(
    kind,
    config.signals.cooldownMinutes,
    strike,
    optionType
  );

  if (recent) {
    logger.debug(`[dedup] Signal ${kind} ${strike ?? ''} ${optionType ?? ''} in cooldown — skipping`, {
      lastSent: recent.ts,
    });
    return null;
  }

  const id = await insertSignal(kind, detail, strike, optionType);
  return id;
}

/**
 * Filter a list of buildups to only those that are not in cooldown,
 * insert them into signals table, and return the ones to send.
 */
export async function filterNewBuildups(
  buildups: BuildupSignal[]
): Promise<Array<BuildupSignal & { signalId: number }>> {
  const results: Array<BuildupSignal & { signalId: number }> = [];

  for (const b of buildups) {
    const id = await dedupAndInsertSignal(
      b.kind,
      {
        strike: b.strike,
        optionType: b.optionType,
        oiChangePct: b.oiChangePct,
        oiChangeAbs: b.oiChangeAbs,
        ltpChangePct: b.ltpChangePct,
        currentOI: b.currentOI,
        currentLTP: b.currentLTP,
      },
      b.strike,
      b.optionType
    );

    if (id !== null) {
      results.push({ ...b, signalId: id });
    }
  }

  return results;
}

/**
 * Mark a batch of signal IDs as sent to Telegram.
 */
export async function markSignalsSent(ids: number[]): Promise<void> {
  for (const id of ids) {
    await markSignalSent(id);
  }
}
