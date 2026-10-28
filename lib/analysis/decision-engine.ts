// =============================================================================
// lib/analysis/decision-engine.ts — Institutional Trade Decision Engine
// =============================================================================
// Implements a professional 5-step derivative trading decision framework:
//
//   Step 1: Market Regime Identification (Trending, Rangebound, Overbought, Oversold)
//   Step 2: Key Battleground Levels (Active Put/Call Walls & Max Pain Gravitational Pin)
//   Step 3: Trapped Institutional Writer & Squeeze Stress Detection
//   Step 4: Derivative Strategy Selection (Credit vs Debit Spreads, Iron Condors)
//   Step 5: Execution Action, Targets, and Invalidation Stop-Loss Level
// =============================================================================

import type {
  BiasDirection,
  BiasScore,
  BuildupSignal,
  MarketRegime,
  OILevel,
  PCRData,
  TradeAction,
  TradeDecision,
  TrappedWriterInfo,
} from './types';

interface DecisionEngineInput {
  spot: number;
  pcr: PCRData;
  bias: BiasScore;
  support: OILevel[];
  resistance: OILevel[];
  maxPain: number;
  buildups: BuildupSignal[];
}

export function generateTradeDecision(input: DecisionEngineInput): TradeDecision {
  const { spot, pcr, bias, support, resistance, maxPain, buildups } = input;

  const supportWall = support[0]?.strike ?? Math.floor(spot / 50) * 50 - 100;
  const resistanceWall = resistance[0]?.strike ?? Math.ceil(spot / 50) * 50 + 100;

  // ── Step 1: Detect Trapped Writers & Squeeze Stress ─────────────────────────
  const trappedAlerts: TrappedWriterInfo[] = [];

  for (const b of buildups) {
    if (b.optionType === 'CE' && b.currentLTP > 0) {
      const breakeven = b.strike + b.currentLTP;
      // Trapped Call Writers: Spot is above strike/breakeven and OI is unwinding under stress
      if (spot >= b.strike && b.oiChangeAbs < -10000) {
        trappedAlerts.push({
          strike: b.strike,
          optionType: 'CE',
          breakeven: Math.round(breakeven),
          unwindingOI: Math.abs(b.oiChangeAbs),
          severity: spot >= breakeven ? 'CRITICAL' : 'HIGH',
          description: `Call writers trapped at ${b.strike} CE (Spot ${spot.toFixed(0)} >= Strike). Heavy short covering (-${Math.abs(b.oiChangeAbs).toLocaleString('en-IN')} OI). Squeeze rally fuel.`,
        });
      }
    } else if (b.optionType === 'PE' && b.currentLTP > 0) {
      const breakeven = b.strike - b.currentLTP;
      // Trapped Put Writers: Spot is below strike/breakeven and OI is unwinding under stress
      if (spot <= b.strike && b.oiChangeAbs < -10000) {
        trappedAlerts.push({
          strike: b.strike,
          optionType: 'PE',
          breakeven: Math.round(breakeven),
          unwindingOI: Math.abs(b.oiChangeAbs),
          severity: spot <= breakeven ? 'CRITICAL' : 'HIGH',
          description: `Put writers trapped at ${b.strike} PE (Spot ${spot.toFixed(0)} <= Strike). Panic put unwinding (-${Math.abs(b.oiChangeAbs).toLocaleString('en-IN')} OI). Downside cascade risk.`,
        });
      }
    }
  }

  // ── Step 2: Determine Market Regime ─────────────────────────────────────────
  let regime: MarketRegime = 'RANGEBOUND';

  if (pcr.oi >= 1.60) {
    regime = 'OVERBOUGHT_EXHAUSTION';
  } else if (pcr.oi < 0.60) {
    regime = 'OVERSOLD_SQUEEZE_SETUP';
  } else if (bias.direction === 'BULLISH' && pcr.oi >= 1.15 && pcr.oiChange >= -0.02) {
    regime = 'TRENDING_BULLISH';
  } else if (bias.direction === 'BEARISH' && pcr.oi <= 0.85 && pcr.oiChange <= 0.02) {
    regime = 'TRENDING_BEARISH';
  } else {
    regime = 'RANGEBOUND';
  }

  // ── Step 3: Determine Action, Strategy, & Levels ────────────────────────────
  let action: TradeAction = 'WAIT_FOR_CONFIRMATION';
  let actionHeadline = '';
  let actionSummary = '';
  let invalidationLevel = supportWall - 50;
  let targetRange: [number, number] = [supportWall, resistanceWall];
  let recommendedStrategy = '';
  let strategyRationale = '';
  const decisionSteps: string[] = [];

  switch (regime) {
    case 'TRENDING_BULLISH': {
      action = 'BUY_DIPS_AT_SUPPORT';
      actionHeadline = `Buy the Dip near ${supportWall} Put Wall`;
      actionSummary = `Institutional put writers are actively defending the ${supportWall} strike with healthy PCR (${pcr.oi.toFixed(2)}). Maximize risk/reward by entering bullish positions on test of support.`;
      invalidationLevel = supportWall - 40;
      targetRange = [Math.round(spot + 50), resistanceWall];
      recommendedStrategy = `Bull Put Credit Spread (Sell ${supportWall} PE / Buy ${supportWall - 100} PE) or ATM Bull Call Spread`;
      strategyRationale = `Credit spreads harvest elevated IV and theta while aligning with smart money put writing defense at ${supportWall}.`;

      decisionSteps.push(`1. Regime: Trend is Bullish (PCR ${pcr.oi.toFixed(2)} with positive OI buildup).`);
      decisionSteps.push(`2. Entry Zone: Accumulate on pullbacks between ${supportWall} and ${supportWall + 35}.`);
      decisionSteps.push(`3. Resistance Target: Initial target ${resistanceWall} (major Call Wall).`);
      decisionSteps.push(`4. Hard Invalidation: If Spot breaks below ${invalidationLevel} with Put unwinding, immediately exit.`);
      break;
    }

    case 'TRENDING_BEARISH': {
      action = 'SELL_RALLIES_AT_RESISTANCE';
      actionHeadline = `Sell Rallies near ${resistanceWall} Call Wall`;
      actionSummary = `Heavy institutional call writing at ${resistanceWall} creates a solid overhead ceiling with weak PCR (${pcr.oi.toFixed(2)}). Sell rallies toward resistance.`;
      invalidationLevel = resistanceWall + 40;
      targetRange = [supportWall, Math.round(spot - 50)];
      recommendedStrategy = `Bear Call Credit Spread (Sell ${resistanceWall} CE / Buy ${resistanceWall + 100} CE) or Bear Put Debit Spread`;
      strategyRationale = `Writers have fortified ${resistanceWall}; rallies into the resistance zone offer favorable asymmetry for call credit spreads.`;

      decisionSteps.push(`1. Regime: Trend is Bearish (PCR ${pcr.oi.toFixed(2)} with persistent call writing).`);
      decisionSteps.push(`2. Entry Zone: Short rallies near ${resistanceWall - 35} to ${resistanceWall}.`);
      decisionSteps.push(`3. Support Target: Downside target ${supportWall} (Put Floor).`);
      decisionSteps.push(`4. Hard Invalidation: If Spot sustains above ${invalidationLevel} with Call short-covering, immediately close shorts.`);
      break;
    }

    case 'OVERBOUGHT_EXHAUSTION': {
      action = 'SELL_RALLIES_AT_RESISTANCE';
      actionHeadline = `Overbought Warning: Tighten Trailing Stops / Avoid Chasing Calls`;
      actionSummary = `PCR at ${pcr.oi.toFixed(2)} is in the extreme complacency zone (> 1.60). Put writers are crowded and vulnerable to sharp long liquidation cascades.`;
      invalidationLevel = resistanceWall + 50;
      targetRange = [Math.round(spot - 40), supportWall];
      recommendedStrategy = `Bear Call Spread or Cash Out Call Longs`;
      strategyRationale = `Options pricing implies excessive optimism. Risk/reward no longer favors fresh long calls; prepare for mean reversion toward Max Pain (${maxPain}).`;

      decisionSteps.push(`1. Regime: Extreme Overbought / Complacency Alert (PCR ${pcr.oi.toFixed(2)} >= 1.60).`);
      decisionSteps.push(`2. Risk Management: Do NOT buy breakout calls at these extended levels.`);
      decisionSteps.push(`3. Gravitational Magnet: Watch for mean-reversion pull toward Max Pain strike (${maxPain}).`);
      decisionSteps.push(`4. Invalidation: Sustained breakout above ${resistanceWall} with fresh call buildup.`);
      break;
    }

    case 'OVERSOLD_SQUEEZE_SETUP': {
      action = 'BREAKOUT_BUY_CALLS';
      actionHeadline = `Oversold Squeeze Setup: Watch for Explosive Short Covering`;
      actionSummary = `PCR at ${pcr.oi.toFixed(2)} (< 0.60) signals extreme one-sided call crowding. Trapped call writers are highly vulnerable to violent short-squeeze spikes on any upward tick.`;
      invalidationLevel = supportWall - 50;
      targetRange = [Math.round(spot + 60), resistanceWall];
      recommendedStrategy = `Long Call Breakout or Bull Put Spread on confirmed green reversal candle`;
      strategyRationale = `When crowded bears panic, short covering drives sharp non-linear upside expansion.`;

      decisionSteps.push(`1. Regime: Extreme Oversold / Short Squeeze Setup (PCR ${pcr.oi.toFixed(2)} < 0.60).`);
      decisionSteps.push(`2. Trigger: Wait for spot to tick above ${Math.round(spot / 50) * 50} with Call OI reduction.`);
      decisionSteps.push(`3. Target: Quick squeeze target toward ${maxPain} / ${resistanceWall}.`);
      decisionSteps.push(`4. Invalidation: Fresh breakdown below ${invalidationLevel}.`);
      break;
    }

    case 'RANGEBOUND':
    default: {
      action = 'IRON_CONDOR_RANGE_PLAY';
      actionHeadline = `Rangebound Corridor: Play Support ${supportWall} – Resistance ${resistanceWall}`;
      actionSummary = `Both Call and Put writers are actively defending their respective boundaries. Spot is oscillating between ${supportWall} and ${resistanceWall} with balanced PCR (${pcr.oi.toFixed(2)}).`;
      invalidationLevel = supportWall - 60;
      targetRange = [supportWall + 20, resistanceWall - 20];
      recommendedStrategy = `Iron Condor (Sell ${resistanceWall} CE / Buy ${resistanceWall + 100} CE & Sell ${supportWall} PE / Buy ${supportWall - 100} PE)`;
      strategyRationale = `Rangebound market conditions allow harvesting dual theta decay from both sides of the option chain.`;

      decisionSteps.push(`1. Regime: Rangebound Consolidation between ${supportWall} and ${resistanceWall}.`);
      decisionSteps.push(`2. Strategy: Sell out-of-the-money credit spreads on both wings (Iron Condor / Short Strangle).`);
      decisionSteps.push(`3. Middle Anchor: Max Pain is pegged at ${maxPain}.`);
      decisionSteps.push(`4. Invalidation: A decisive hourly candle close beyond either wall (${supportWall} or ${resistanceWall}).`);
      break;
    }
  }

  // If a critical trapped writer alert exists, override headline note
  if (trappedAlerts.length > 0 && trappedAlerts[0].severity === 'CRITICAL') {
    actionSummary += ` ⚠️ Immediate Alert: ${trappedAlerts[0].description}`;
  }

  return {
    regime,
    bias: bias.direction,
    confidence: bias.confidence,
    action,
    actionHeadline,
    actionSummary,
    supportWall,
    resistanceWall,
    invalidationLevel,
    targetRange,
    recommendedStrategy,
    strategyRationale,
    decisionSteps,
    trappedAlerts,
  };
}
