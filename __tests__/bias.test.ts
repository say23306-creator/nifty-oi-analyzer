import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBias } from '../lib/analysis/bias';

describe('Market Bias Engine', () => {
  it('classifies as BULLISH when PCR is high and rising with spot momentum', () => {
    const bias = computeBias({
      spot: 24650,
      prevSpot: 24600, // Spot up
      pcr: {
        oi: 1.35, // > 1.2 Bullish
        volume: 1.25,
        oiChange: 0.08, // Rising > 0.05
        totalCeOI: 1000000,
        totalPeOI: 1350000,
        totalCeVolume: 500000,
        totalPeVolume: 625000,
      },
      buildups: [
        {
          kind: 'LONG_BUILDUP',
          strike: 24650,
          optionType: 'CE',
          oiChangeAbs: 50000,
          oiChangePct: 15,
          ltpChangePct: 12,
          currentOI: 100000,
          currentLTP: 100,
        },
      ],
      support: [{ strike: 24500, oi: 2000000, type: 'PE' }],
      resistance: [{ strike: 25000, oi: 1800000, type: 'CE' }],
      strikes: [24500, 24550, 24600, 24650, 24700, 24750, 24800],
    });

    assert.equal(bias.direction, 'BULLISH');
    assert.ok(bias.confidence >= 50);
    assert.ok(bias.reasons.length > 0);
  });

  it('classifies as BEARISH when PCR is low, falling, and spot dropping', () => {
    const bias = computeBias({
      spot: 24450,
      prevSpot: 24550, // Spot down -0.4%
      pcr: {
        oi: 0.65, // < 0.8 Bearish
        volume: 0.7,
        oiChange: -0.09, // Falling
        totalCeOI: 2000000,
        totalPeOI: 1300000,
        totalCeVolume: 800000,
        totalPeVolume: 560000,
      },
      buildups: [
        {
          kind: 'SHORT_BUILDUP',
          strike: 24450,
          optionType: 'CE',
          oiChangeAbs: 80000,
          oiChangePct: 20,
          ltpChangePct: -15,
          currentOI: 150000,
          currentLTP: 50,
        },
      ],
      support: [{ strike: 24000, oi: 1500000, type: 'PE' }],
      resistance: [{ strike: 24500, oi: 2500000, type: 'CE' }],
      strikes: [24300, 24350, 24400, 24450, 24500, 24550, 24600],
    });

    assert.equal(bias.direction, 'BEARISH');
    assert.ok(bias.confidence >= 50);
  });

  it('classifies as NEUTRAL in balanced range without momentum', () => {
    const bias = computeBias({
      spot: 24500,
      prevSpot: 24501,
      pcr: {
        oi: 0.98, // Neutral 0.8 - 1.2
        volume: 0.99,
        oiChange: 0.01,
        totalCeOI: 1000000,
        totalPeOI: 980000,
        totalCeVolume: 400000,
        totalPeVolume: 396000,
      },
      buildups: [],
      support: [{ strike: 24300, oi: 1000000, type: 'PE' }],
      resistance: [{ strike: 24700, oi: 1000000, type: 'CE' }],
      strikes: [24300, 24400, 24500, 24600, 24700],
    });

    assert.equal(bias.direction, 'NEUTRAL');
  });
});
