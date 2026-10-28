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

  // ── Factor 1: Pro-grade 5-Zone PCR Analysis ───────────────────────────────
  // Literature (Larry McMillan / NISM):
  //   ≥ 1.60: Extreme Overbought (put writers crowded, reversal/unwinding risk)
  //   1.20 – 1.60: Healthy Bullish Put Writing dominance
  //   0.85 – 1.20: Neutral / Balanced Range
  //   0.60 – 0.85: Healthy Bearish Call Writing dominance
  //   < 0.60: Extreme Oversold (call writers crowded, short squeeze alert)
  if (pcr.oi >= 1.60) {
    bullishScore -= 5;
    reasons.push(`PCR ${pcr.oi.toFixed(2)} ≥ 1.60: Extreme Overbought / Complacency zone (Reversal warning)`);
  } else if (pcr.oi >= 1.20) {
    bullishScore += 15;
    reasons.push(`PCR ${pcr.oi.toFixed(2)}: Bullish Put-Writing dominance`);
  } else if (pcr.oi < 0.60) {
    bullishScore += 5;
    reasons.push(`PCR ${pcr.oi.toFixed(2)} < 0.60: Extreme Oversold / Short Squeeze alert (Contrarian bounce setup)`);
  } else if (pcr.oi <= 0.80) {
    bullishScore -= 15;
    reasons.push(`PCR ${pcr.oi.toFixed(2)}: Bearish Call-Writing dominance (≤0.80)`);
  } else {
    reasons.push(`PCR ${pcr.oi.toFixed(2)}: Balanced Neutral zone (0.80 - 1.20)`);
  }

  // ── Factor 2: PCR trend (ΔPCR Velocity) ───────────────────────────────────
  if (pcr.oiChange > 0.05) {
    bullishScore += 10;
    reasons.push(`ΔPCR velocity +${pcr.oiChange.toFixed(2)}: Intraday Put writing accelerating`);
  } else if (pcr.oiChange < -0.05) {
    bullishScore -= 10;
    reasons.push(`ΔPCR velocity ${pcr.oiChange.toFixed(2)}: Intraday Call writing accelerating`);
  }

  // ── Factor 3: Near-ATM Buildup Grid (Moneyness Weighted) ──────────────────
  const atmStrikes = getATMStrikes(strikes, spot, 5);
  const atmBuildups = buildups.filter((b) => atmStrikes.includes(b.strike));

  let atmBullScore = 0;
  for (const b of atmBuildups) {
    const isCE = b.optionType === 'CE';
    switch (b.kind) {
      case 'LONG_BUILDUP':
        atmBullScore += isCE ? 3 : -3; // Fresh buyers entering
        break;
      case 'SHORT_BUILDUP':
        atmBullScore += isCE ? -3 : 3; // Institutional writers building walls
        break;
      case 'SHORT_COVERING':
        atmBullScore += isCE ? 1.5 : -1.5; // Short covering squeeze relief
        break;
      case 'LONG_UNWINDING':
        atmBullScore += isCE ? -1.5 : 1.5; // Long liquidation / profit taking
        break;
    }
  }

  const clampedAtm = Math.max(-25, Math.min(25, Math.round(atmBullScore)));
  bullishScore += clampedAtm;
  if (atmBuildups.length > 0) {
    reasons.push(
      `ATM buildups: ${atmBuildups.length} active strikes near ATM (net score ${atmBullScore > 0 ? '+' : ''}${atmBullScore})`
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
