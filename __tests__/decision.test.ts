import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTradeDecision } from '../lib/analysis/decision-engine';
import { interpretSignal, aggregateEquityBias } from '../lib/analysis/interpretation';

describe('Professional Trade Decision Engine', () => {
  it('correctly diagnoses TRENDING_BULLISH and recommends buying dips at support', () => {
    const decision = generateTradeDecision({
      spot: 24520,
      pcr: {
        oi: 1.35,
        volume: 1.2,
        oiChange: 0.08,
        totalCeOI: 1000000,
        totalPeOI: 1350000,
        totalCeVolume: 500000,
        totalPeVolume: 600000,
      },
      bias: {
        direction: 'BULLISH',
        confidence: 85,
        reasons: ['Put writing dominance'],
      },
      support: [{ strike: 24400, oi: 2500000, type: 'PE' }],
      resistance: [{ strike: 24800, oi: 2000000, type: 'CE' }],
      maxPain: 24500,
      buildups: [
        {
          strike: 24400,
          optionType: 'PE',
          kind: 'SHORT_BUILDUP',
          oiChangeAbs: 150000,
          oiChangePct: 18,
          ltpChangePct: -12,
          currentOI: 2500000,
          currentLTP: 45,
        },
      ],
    });

    assert.equal(decision.regime, 'TRENDING_BULLISH');
    assert.equal(decision.action, 'BUY_DIPS_AT_SUPPORT');
    assert.equal(decision.supportWall, 24400);
    assert.equal(decision.resistanceWall, 24800);
    assert.ok(decision.invalidationLevel < 24400);
    assert.ok(decision.recommendedStrategy.includes('Bull Put'));
  });

  it('identifies OVERBOUGHT_EXHAUSTION when PCR >= 1.60 and alerts against chasing calls', () => {
    const decision = generateTradeDecision({
      spot: 24850,
      pcr: {
        oi: 1.72,
        volume: 1.4,
        oiChange: 0.02,
        totalCeOI: 800000,
        totalPeOI: 1376000,
        totalCeVolume: 400000,
        totalPeVolume: 560000,
      },
      bias: {
        direction: 'NEUTRAL',
        confidence: 75,
        reasons: ['Extreme overbought'],
      },
      support: [{ strike: 24600, oi: 2000000, type: 'PE' }],
      resistance: [{ strike: 25000, oi: 1500000, type: 'CE' }],
      maxPain: 24600,
      buildups: [],
    });

    assert.equal(decision.regime, 'OVERBOUGHT_EXHAUSTION');
    assert.ok(decision.actionHeadline.includes('Overbought'));
    assert.ok(decision.decisionSteps.some((s) => s.includes('Max Pain')));
  });

  it('detects Trapped Call Writers when spot surpasses strike with heavy unwinding', () => {
    const decision = generateTradeDecision({
      spot: 24620,
      pcr: {
        oi: 1.25,
        volume: 1.1,
        oiChange: 0.04,
        totalCeOI: 1000000,
        totalPeOI: 1250000,
        totalCeVolume: 500000,
        totalPeVolume: 550000,
      },
      bias: {
        direction: 'BULLISH',
        confidence: 80,
        reasons: ['Short covering squeeze'],
      },
      support: [{ strike: 24500, oi: 2000000, type: 'PE' }],
      resistance: [{ strike: 24700, oi: 1800000, type: 'CE' }],
      maxPain: 24550,
      buildups: [
        {
          strike: 24600,
          optionType: 'CE',
          kind: 'SHORT_COVERING',
          oiChangeAbs: -35000,
          oiChangePct: -15,
          ltpChangePct: 35,
          currentOI: 150000,
          currentLTP: 42,
        },
      ],
    });

    assert.equal(decision.trappedAlerts.length, 1);
    assert.equal(decision.trappedAlerts[0].strike, 24600);
    assert.equal(decision.trappedAlerts[0].optionType, 'CE');
    assert.ok(decision.trappedAlerts[0].description.includes('Call writers trapped'));
  });

  it('correctly uses Long Unwinding terminology instead of Long Covering', () => {
    const sig = interpretSignal({
      strike: 24500,
      optionType: 'CE',
      kind: 'LONG_UNWINDING',
      oiChangeAbs: -50000,
      oiChangePct: -10,
      ltpChangePct: -8,
      currentOI: 200000,
      currentLTP: 80,
    });

    assert.equal(sig.observation, 'Long Unwinding');
    assert.equal(sig.equityView, 'BEARISH');
  });

  it('applies moneyness weighting to aggregateEquityBias so far OTM noise does not dominate', () => {
    // 1 ATM CE short buildup (heavy bear at 24500) vs 1 far-OTM CE long buildup (at 26500)
    const nearSignal = interpretSignal({
      strike: 24500,
      optionType: 'CE',
      kind: 'SHORT_BUILDUP',
      oiChangeAbs: 200000,
      oiChangePct: 25,
      ltpChangePct: -15,
      currentOI: 1000000,
      currentLTP: 90,
    });

    const farSignal = interpretSignal({
      strike: 26500, // > 8% OTM
      optionType: 'CE',
      kind: 'LONG_BUILDUP',
      oiChangeAbs: 50000,
      oiChangePct: 30,
      ltpChangePct: 10,
      currentOI: 100000,
      currentLTP: 2,
    });

    // When spot is 24500, near ATM short buildup dominates the aggregate score
    const aggregate = aggregateEquityBias([nearSignal, farSignal], 24500);
    assert.equal(aggregate.label, 'BEARISH');
  });
});
