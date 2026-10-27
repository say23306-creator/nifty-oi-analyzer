// =============================================================================
// lib/analysis/bias.ts — Market bias score engine
// =============================================================================
// Combines: PCR trend, dominant buildups near ATM, support/resistance shifts,
// spot momentum into a BULLISH / BEARISH / NEUTRAL score with confidence 0–100.
// =============================================================================

import { getATMStrikes } from './aggregates';
import type { BiasDirection, BiasScore, BuildupSignal, OILevel, PCRData } from './types';

interface BiasInput {
  spot: number;
  prevSpot: number | null;
  pcr: PCRData;
  buildups: BuildupSignal[];
  support: OILevel[];
  resistance: OILevel[];
  strikes: number[];
}

/**
 * Compute an overall market bias score.
 *
 * Scoring rubric (each factor contributes 0–25 to a 0–100 bullish score):
 *   1. PCR value:     >1.2 bullish, 0.8–1.2 neutral, <0.8 bearish
 *   2. PCR trend:     rising PCR = bullish, falling = bearish
 *   3. ATM buildups:  dominant LONG_BUILDUP CE or SHORT_BUILDUP PE = bullish; opposite = bearish
 *   4. Spot momentum: spot vs prevSpot
 *
 * Final bullish score 0–100:
 *   >60 → BULLISH
 *   <40 → BEARISH
 *   else → NEUTRAL
 */
export function computeBias(input: BiasInput): BiasScore {
  const { spot, prevSpot, pcr, buildups, strikes } = input;

  let bullishScore = 50; // start neutral
  const reasons: string[] = [];

  // ── Factor 1: PCR value ───────────────────────────────────────────────────
  if (pcr.oi > 1.2) {
    bullishScore += 15;
    reasons.push(`PCR ${pcr.oi.toFixed(2)} > 1.2 (bullish)`);
  } else if (pcr.oi < 0.8) {
    bullishScore -= 15;
    reasons.push(`PCR ${pcr.oi.toFixed(2)} < 0.8 (bearish)`);
  } else {
    reasons.push(`PCR ${pcr.oi.toFixed(2)} neutral zone`);
  }

  // ── Factor 2: PCR trend ───────────────────────────────────────────────────
  if (pcr.oiChange > 0.05) {
    bullishScore += 10;
    reasons.push(`PCR rising +${pcr.oiChange.toFixed(2)} (bullish)`);
  } else if (pcr.oiChange < -0.05) {
    bullishScore -= 10;
    reasons.push(`PCR falling ${pcr.oiChange.toFixed(2)} (bearish)`);
  }

  // ── Factor 3: ATM buildups ────────────────────────────────────────────────
  const atmStrikes = getATMStrikes(strikes, spot, 5);
  const atmBuildups = buildups.filter((b) => atmStrikes.includes(b.strike));

  let atmBullScore = 0;
  for (const b of atmBuildups) {
    const isCE = b.optionType === 'CE';
    switch (b.kind) {
      case 'LONG_BUILDUP':
        atmBullScore += isCE ? 2 : -2; // CE longs = bullish; PE longs = bearish
        break;
      case 'SHORT_BUILDUP':
        atmBullScore += isCE ? -2 : 2; // CE shorts = bearish resistance; PE shorts = bullish support
        break;
      case 'SHORT_COVERING':
        atmBullScore += isCE ? 1 : -1;
        break;
      case 'LONG_UNWINDING':
        atmBullScore += isCE ? -1 : 1;
        break;
    }
  }

  const clampedAtm = Math.max(-20, Math.min(20, atmBullScore));
  bullishScore += clampedAtm;
  if (atmBuildups.length > 0) {
    reasons.push(
      `ATM buildups: ${atmBuildups.length} near ATM, net score ${atmBullScore > 0 ? '+' : ''}${atmBullScore}`
    );
  }

  // ── Factor 4: Spot momentum ───────────────────────────────────────────────
  if (prevSpot != null && prevSpot !== 0) {
    const spotChangePct = ((spot - prevSpot) / prevSpot) * 100;
    if (spotChangePct > 0.1) {
      bullishScore += 5;
      reasons.push(`Spot up +${spotChangePct.toFixed(2)}%`);
    } else if (spotChangePct < -0.1) {
      bullishScore -= 5;
      reasons.push(`Spot down ${spotChangePct.toFixed(2)}%`);
    }
  }

  // ── Final classification ──────────────────────────────────────────────────
  bullishScore = Math.max(0, Math.min(100, bullishScore));

  let direction: BiasDirection;
  let confidence: number;

  if (bullishScore >= 60) {
    direction = 'BULLISH';
    confidence = Math.round(((bullishScore - 50) / 50) * 100);
  } else if (bullishScore <= 40) {
    direction = 'BEARISH';
    confidence = Math.round(((50 - bullishScore) / 50) * 100);
  } else {
    direction = 'NEUTRAL';
    confidence = Math.round((1 - Math.abs(bullishScore - 50) / 10) * 100);
  }

  return {
    direction,
    confidence: Math.max(0, Math.min(100, confidence)),
    reasons,
  };
}
