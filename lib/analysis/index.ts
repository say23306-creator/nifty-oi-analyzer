// =============================================================================
// lib/analysis/index.ts — runAnalysis() orchestrator
// =============================================================================

import { config } from '../config';
import { logger } from '../utils/logger';
import {
  getLatestSnapshot,
  getSnapshotNMinutesAgo,
  getRecentSnapshots,
  getChainRows,
  type DbSnapshot,
} from '../db/queries';
import { buildComparisons, classifyAllBuildups, sortByOIChange } from './buildup';
import { computePCR, computeMaxPain, computeSupportResistance } from './aggregates';
import { computeBias } from './bias';
import { generateTradeDecision } from './decision-engine';
import type { AnalysisResult } from './types';

/**
 * Run the full analysis engine for a given expiry.
 * Returns null if there are not enough snapshots to compare.
 */
export async function runAnalysis(
  expiry: string,
  windowMinutes?: number
): Promise<AnalysisResult | null> {
  // ── Get current snapshot ──────────────────────────────────────────────────
  const curr = await getLatestSnapshot(expiry);
  if (!curr) {
    logger.warn(`[analysis] No current snapshot for expiry ${expiry}`);
    return null;
  }

  // ── Get comparison snapshot (N minutes ago, defaults to 60 for 1-hr change) ─
  const effectiveWindow = windowMinutes ?? config.analysis.windowMinutes;
  let prev = await getSnapshotNMinutesAgo(expiry, effectiveWindow);

  // Fallback to previous snapshot if window hasn't elapsed yet
  if (!prev) {
    const recent = await getRecentSnapshots(5, expiry);
    if (recent.length > 1) {
      // Pick earlier snapshot that isn't current
      prev = recent.find((s: DbSnapshot) => s.id !== curr.id) ?? null;
    }
  }

  // ── Fetch chain rows ──────────────────────────────────────────────────────
  const currRows = await getChainRows(curr.id);

  let prevRows: typeof currRows = [];
  if (prev) {
    prevRows = await getChainRows(prev.id);
  }

  logger.info(`[analysis] curr snapshot ${curr.id} (${currRows.length} rows), prev ${prev?.id ?? 'none'} (${prevRows.length} rows, window: ${effectiveWindow}m)`);

  // ── Buildups ──────────────────────────────────────────────────────────────
  const comparisons = buildComparisons(
    currRows.map((r) => ({ strike: r.strike, type: r.type, ltp: r.ltp, oi: r.oi })),
    prevRows.map((r) => ({ strike: r.strike, type: r.type, ltp: r.ltp, oi: r.oi }))
  );
  const buildups = classifyAllBuildups(comparisons);
  const topBuildups = sortByOIChange(buildups).slice(0, 10);

  // ── Aggregates ────────────────────────────────────────────────────────────
  const pcr = computePCR(currRows, null); // TODO: pass prev PCR from DB for delta
  const maxPain = computeMaxPain(currRows);
  const { support, resistance } = computeSupportResistance(currRows, curr.spot);

  // ── Bias ──────────────────────────────────────────────────────────────────
  const strikes = [...new Set(currRows.map((r) => r.strike))].sort((a, b) => a - b);
  const bias = computeBias({
    spot: curr.spot,
    prevSpot: prev?.spot ?? null,
    pcr,
    buildups,
    support,
    resistance,
    strikes,
  });

  // ── Professional Trade Decision Framework ─────────────────────────────────
  const decision = generateTradeDecision({
    spot: curr.spot,
    pcr,
    bias,
    support,
    resistance,
    maxPain,
    buildups,
  });

  return {
    snapshotId: curr.id,
    prevSnapshotId: prev?.id ?? null,
    expiry,
    spot: curr.spot,
    ts: curr.ts,
    buildups,
    topBuildups,
    pcr,
    maxPain,
    support,
    resistance,
    bias,
    decision,
  };
}
