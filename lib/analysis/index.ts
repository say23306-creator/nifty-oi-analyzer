// =============================================================================
// lib/analysis/index.ts — runAnalysis() orchestrator
// =============================================================================

import { config } from '../config';
import { logger } from '../utils/logger';
import {
  getLatestSnapshot,
  getSnapshotNMinutesAgo,
  getChainRows,
} from '../db/queries';
import { buildComparisons, classifyAllBuildups, sortByOIChange } from './buildup';
import { computePCR, computeMaxPain, computeSupportResistance } from './aggregates';
import { computeBias } from './bias';
import type { AnalysisResult } from './types';

/**
 * Run the full analysis engine for a given expiry.
 * Returns null if there are not enough snapshots to compare.
 */
export async function runAnalysis(expiry: string): Promise<AnalysisResult | null> {
  // ── Get current snapshot ──────────────────────────────────────────────────
  const curr = await getLatestSnapshot(expiry);
  if (!curr) {
    logger.warn(`[analysis] No current snapshot for expiry ${expiry}`);
    return null;
  }

  // ── Get comparison snapshot (N minutes ago) ───────────────────────────────
  const prev = await getSnapshotNMinutesAgo(expiry, config.analysis.windowMinutes);

  // ── Fetch chain rows ──────────────────────────────────────────────────────
  const currRows = await getChainRows(curr.id);

  let prevRows: typeof currRows = [];
  if (prev) {
    prevRows = await getChainRows(prev.id);
  }

  logger.info(`[analysis] curr snapshot ${curr.id} (${currRows.length} rows), prev ${prev?.id ?? 'none'} (${prevRows.length} rows)`);

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
  const { support, resistance } = computeSupportResistance(currRows);

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
  };
}
