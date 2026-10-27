import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePCR,
  computeMaxPain,
  computeSupportResistance,
  findATMStrike,
  getATMStrikes,
} from '../lib/analysis/aggregates';

describe('Aggregates Engine', () => {
  it('computes PCR accurately for OI and Volume', () => {
    const rows = [
      { strike: 24500, type: 'CE' as const, oi: 100000, volume: 50000, ltp: 100 },
      { strike: 24500, type: 'PE' as const, oi: 120000, volume: 60000, ltp: 90 },
      { strike: 24600, type: 'CE' as const, oi: 100000, volume: 50000, ltp: 60 },
      { strike: 24600, type: 'PE' as const, oi: 80000, volume: 40000, ltp: 120 },
    ];

    // Total CE OI = 200,000; Total PE OI = 200,000 -> PCR = 1.00
    // Total CE Vol = 100,000; Total PE Vol = 100,000 -> Vol PCR = 1.00
    const pcr = computePCR(rows, 0.95);

    assert.equal(pcr.oi, 1.0);
    assert.equal(pcr.volume, 1.0);
    assert.equal(pcr.oiChange, 0.05);
    assert.equal(pcr.totalCeOI, 200000);
    assert.equal(pcr.totalPeOI, 200000);
  });

  it('computes Max Pain correctly', () => {
    // If heavy CE OI at 25000 and heavy PE OI at 24000, pain is minimised near middle
    const rows = [
      { strike: 24000, type: 'CE' as const, oi: 1000, volume: 10, ltp: 500 },
      { strike: 24000, type: 'PE' as const, oi: 100000, volume: 10, ltp: 10 },
      { strike: 24500, type: 'CE' as const, oi: 20000, volume: 10, ltp: 150 },
      { strike: 24500, type: 'PE' as const, oi: 20000, volume: 10, ltp: 150 },
      { strike: 25000, type: 'CE' as const, oi: 100000, volume: 10, ltp: 10 },
      { strike: 25000, type: 'PE' as const, oi: 1000, volume: 10, ltp: 500 },
    ];

    const maxPain = computeMaxPain(rows);
    assert.equal(maxPain, 24500);
  });

  it('finds nearest ATM strike', () => {
    const strikes = [24400, 24450, 24500, 24550, 24600];
    assert.equal(findATMStrike(strikes, 24512), 24500);
    assert.equal(findATMStrike(strikes, 24538), 24550);
  });

  it('extracts Support & Resistance levels from top OI strikes', () => {
    const rows = [
      { strike: 24400, type: 'PE' as const, oi: 150000, volume: 10, ltp: 20 },
      { strike: 24300, type: 'PE' as const, oi: 200000, volume: 10, ltp: 10 },
      { strike: 24700, type: 'CE' as const, oi: 180000, volume: 10, ltp: 15 },
      { strike: 24800, type: 'CE' as const, oi: 250000, volume: 10, ltp: 8 },
    ];

    const { support, resistance } = computeSupportResistance(rows);
    assert.equal(support[0].strike, 24300); // highest PE OI
    assert.equal(resistance[0].strike, 24800); // highest CE OI
  });
});
