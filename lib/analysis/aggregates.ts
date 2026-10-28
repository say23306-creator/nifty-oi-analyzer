// =============================================================================
// lib/analysis/aggregates.ts — PCR, max pain, support/resistance
// =============================================================================

import { config } from '../config';
import type { OILevel, PCRData } from './types';

interface ChainRowInput {
  strike: number;
  type: 'CE' | 'PE';
  oi: number | null;
  volume: number | null;
  ltp: number | null;
}

// ─── PCR ─────────────────────────────────────────────────────────────────────

/**
 * Compute OI-based and volume-based PCR.
 * @param prevPcr — previous PCR (to compute oiChange). Pass null on first snapshot.
 */
export function computePCR(
  rows: ChainRowInput[],
  prevPcr?: number | null
): PCRData {
  let totalCeOI = 0, totalPeOI = 0;
  let totalCeVolume = 0, totalPeVolume = 0;

  for (const r of rows) {
    const oi = r.oi ?? 0;
    const vol = r.volume ?? 0;
    if (r.type === 'CE') {
      totalCeOI += oi;
      totalCeVolume += vol;
    } else {
      totalPeOI += oi;
      totalPeVolume += vol;
    }
  }

  const oiPcr = totalCeOI === 0 ? 0 : totalPeOI / totalCeOI;
  const volPcr = totalCeVolume === 0 ? 0 : totalPeVolume / totalCeVolume;
  const oiChange = prevPcr != null ? oiPcr - prevPcr : 0;

  return {
    oi: parseFloat(oiPcr.toFixed(3)),
    volume: parseFloat(volPcr.toFixed(3)),
    oiChange: parseFloat(oiChange.toFixed(3)),
    totalCeOI,
    totalPeOI,
    totalCeVolume,
    totalPeVolume,
  };
}

// ─── Max Pain ─────────────────────────────────────────────────────────────────

/**
 * Max Pain strike = the strike at which total option writers' pain (sellers' gain)
 * is minimised — i.e., total buyer losses are maximised.
 *
 * For each candidate strike K:
 *   CE pain = Σ max(0, K - strike_i) * OI_CE_i   (in-the-money CEs expire worthless for writers when K < strike_i)
 *   PE pain = Σ max(0, strike_i - K) * OI_PE_i
 *   Total pain at K = CE pain + PE pain
 *
 * Max Pain = strike with minimum total pain (Σ)
 */
export function computeMaxPain(rows: ChainRowInput[]): number {
  const strikes = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
  if (strikes.length === 0) return 0;

  const ceMap = new Map<number, number>();
  const peMap = new Map<number, number>();

  for (const r of rows) {
    const oi = r.oi ?? 0;
    if (r.type === 'CE') ceMap.set(r.strike, (ceMap.get(r.strike) ?? 0) + oi);
    else peMap.set(r.strike, (peMap.get(r.strike) ?? 0) + oi);
  }

  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  for (const K of strikes) {
    let totalPain = 0;

    // CE writers pay out when K > strike (ITM call)
    for (const [s, oi] of ceMap) {
      totalPain += Math.max(0, K - s) * oi;
    }
    // PE writers pay out when K < strike (ITM put)
    for (const [s, oi] of peMap) {
      totalPain += Math.max(0, s - K) * oi;
    }

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = K;
    }
  }

  return maxPainStrike;
}

// ─── Support & Resistance ─────────────────────────────────────────────────────

/**
 * Support levels = top N PE strikes ranked by OI (where big PE OI acts as a floor).
 * Resistance levels = top N CE strikes ranked by OI (ceiling).
 *
 * When spot is provided, calculates Active Trading Walls:
 *   - Put Wall (Support): Highest PE OI strikes below/near spot
 *   - Call Wall (Resistance): Highest CE OI strikes above/near spot
 */
export function computeSupportResistance(
  rows: ChainRowInput[],
  spot?: number
): {
  support: OILevel[];
  resistance: OILevel[];
} {
  const allPe = rows
    .filter((r) => r.type === 'PE' && (r.oi ?? 0) > 0)
    .map((r) => ({ strike: r.strike, oi: r.oi!, type: 'PE' as const }));

  const allCe = rows
    .filter((r) => r.type === 'CE' && (r.oi ?? 0) > 0)
    .map((r) => ({ strike: r.strike, oi: r.oi!, type: 'CE' as const }));

  if (spot && spot > 0) {
    // Put Wall below or at spot (floor)
    const activePe = allPe.filter((r) => r.strike <= spot + 50).sort((a, b) => b.oi - a.oi);
    // Call Wall above or at spot (ceiling)
    const activeCe = allCe.filter((r) => r.strike >= spot - 50).sort((a, b) => b.oi - a.oi);

    const support = (activePe.length > 0 ? activePe : allPe.sort((a, b) => b.oi - a.oi)).slice(
      0,
      config.analysis.topNLevels
    );
    const resistance = (activeCe.length > 0 ? activeCe : allCe.sort((a, b) => b.oi - a.oi)).slice(
      0,
      config.analysis.topNLevels
    );

    return { support, resistance };
  }

  const peRows = allPe.sort((a, b) => b.oi - a.oi).slice(0, config.analysis.topNLevels);
  const ceRows = allCe.sort((a, b) => b.oi - a.oi).slice(0, config.analysis.topNLevels);

  return { support: peRows, resistance: ceRows };
}

// ─── ATM strike ───────────────────────────────────────────────────────────────

/**
 * Returns the strike nearest to the current spot price.
 */
export function findATMStrike(strikes: number[], spot: number): number {
  if (strikes.length === 0) return 0;
  return strikes.reduce((prev, curr) =>
    Math.abs(curr - spot) < Math.abs(prev - spot) ? curr : prev
  );
}

/**
 * Returns all strikes within ±n strikes of the ATM.
 * Assumes strikes are evenly spaced (50 for Nifty).
 */
export function getATMStrikes(strikes: number[], spot: number, n: number): number[] {
  const sorted = [...new Set(strikes)].sort((a, b) => a - b);
  const atm = findATMStrike(sorted, spot);
  const atmIdx = sorted.indexOf(atm);
  return sorted.slice(Math.max(0, atmIdx - n), atmIdx + n + 1);
}
