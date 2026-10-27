// =============================================================================
// lib/analysis/buildup.ts — Per-strike buildup classifier
// =============================================================================
// Classification rules (standard F&O interpretation):
//   price↑  OI↑  → LONG_BUILDUP    (fresh longs entering)
//   price↓  OI↑  → SHORT_BUILDUP   (fresh shorts entering)
//   price↑  OI↓  → SHORT_COVERING  (shorts unwinding)
//   price↓  OI↓  → LONG_UNWINDING  (longs exiting)
//
// CE LONG_BUILDUP  = bullish signal for index
// PE LONG_BUILDUP  = bearish signal for index (puts being bought)
// CE SHORT_BUILDUP = bearish resistance building
// PE SHORT_BUILDUP = bullish support building (puts being shorted/sold)
// =============================================================================

import { config } from '../config';
import type { BuildupKind, BuildupSignal, StrikeComparison } from './types';

/**
 * Classify a single strike+type comparison into a buildup kind.
 * Returns null if the change is below the configured thresholds.
 */
export function classifyBuildup(comp: StrikeComparison): BuildupSignal | null {
  const { prevLTP, currLTP, prevOI, currOI, strike, type } = comp;

  // Need both periods to have data
  if (
    prevLTP == null || currLTP == null ||
    prevOI == null || currOI == null ||
    prevOI === 0
  ) {
    return null;
  }

  const oiChangeAbs = currOI - prevOI;
  const oiChangePct = ((currOI - prevOI) / prevOI) * 100;
  const ltpChangePct = prevLTP === 0
    ? currLTP > 0 ? 100 : 0
    : ((currLTP - prevLTP) / prevLTP) * 100;

  // Apply thresholds — ignore tiny moves
  if (
    Math.abs(oiChangePct) < config.analysis.oiChangePct &&
    Math.abs(oiChangeAbs) < config.analysis.oiChangeAbs
  ) {
    return null;
  }

  const ltpUp = ltpChangePct > 0;
  const oiUp = oiChangeAbs > 0;

  let kind: BuildupKind;
  if (ltpUp && oiUp)   kind = 'LONG_BUILDUP';
  else if (!ltpUp && oiUp)  kind = 'SHORT_BUILDUP';
  else if (ltpUp && !oiUp)  kind = 'SHORT_COVERING';
  else                      kind = 'LONG_UNWINDING';

  return {
    strike,
    optionType: type,
    kind,
    oiChangePct: parseFloat(oiChangePct.toFixed(2)),
    oiChangeAbs,
    ltpChangePct: parseFloat(ltpChangePct.toFixed(2)),
    currentOI: currOI,
    currentLTP: currLTP,
  };
}

/**
 * Classify all strikes from two snapshots.
 * Returns only rows that meet threshold criteria.
 */
export function classifyAllBuildups(
  comparisons: StrikeComparison[]
): BuildupSignal[] {
  return comparisons
    .map(classifyBuildup)
    .filter((b): b is BuildupSignal => b !== null);
}

/**
 * Sort buildups by absolute OI change, descending.
 */
export function sortByOIChange(buildups: BuildupSignal[]): BuildupSignal[] {
  return [...buildups].sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs));
}

/**
 * Build comparison pairs from current and previous snapshot rows.
 */
export function buildComparisons(
  curr: Array<{ strike: number; type: 'CE' | 'PE'; ltp: number | null; oi: number | null }>,
  prev: Array<{ strike: number; type: 'CE' | 'PE'; ltp: number | null; oi: number | null }>
): StrikeComparison[] {
  const prevMap = new Map<string, typeof prev[0]>();
  for (const row of prev) {
    prevMap.set(`${row.strike}_${row.type}`, row);
  }

  return curr.map((row) => {
    const key = `${row.strike}_${row.type}`;
    const p = prevMap.get(key);
    return {
      strike: row.strike,
      type: row.type,
      prevLTP: p?.ltp ?? null,
      currLTP: row.ltp,
      prevOI: p?.oi ?? null,
      currOI: row.oi,
    };
  });
}
