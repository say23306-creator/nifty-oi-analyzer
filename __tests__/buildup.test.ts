import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBuildup } from '../lib/analysis/buildup';

describe('Buildup Classifier', () => {
  it('identifies LONG_BUILDUP when Price is UP and OI is UP', () => {
    // 50 -> 60 (+20% LTP), 100,000 -> 120,000 (+20% OI)
    const result = classifyBuildup({
      strike: 24500,
      type: 'CE',
      prevLTP: 50,
      currLTP: 60,
      prevOI: 100000,
      currOI: 120000,
    });

    assert.ok(result);
    assert.equal(result?.kind, 'LONG_BUILDUP');
    assert.equal(result?.strike, 24500);
    assert.equal(result?.optionType, 'CE');
    assert.equal(result?.oiChangeAbs, 20000);
    assert.equal(result?.oiChangePct, 20);
  });

  it('identifies SHORT_BUILDUP when Price is DOWN and OI is UP', () => {
    // 60 -> 48 (-20% LTP), 100,000 -> 115,000 (+15% OI)
    const result = classifyBuildup({
      strike: 24600,
      type: 'CE',
      prevLTP: 60,
      currLTP: 48,
      prevOI: 100000,
      currOI: 115000,
    });

    assert.ok(result);
    assert.equal(result?.kind, 'SHORT_BUILDUP');
    assert.equal(result?.strike, 24600);
  });

  it('identifies SHORT_COVERING when Price is UP and OI is DOWN', () => {
    // 40 -> 55 (+37.5% LTP), 100,000 -> 80,000 (-20% OI)
    const result = classifyBuildup({
      strike: 24400,
      type: 'PE',
      prevLTP: 40,
      currLTP: 55,
      prevOI: 100000,
      currOI: 80000,
    });

    assert.ok(result);
    assert.equal(result?.kind, 'SHORT_COVERING');
    assert.equal(result?.optionType, 'PE');
  });

  it('identifies LONG_UNWINDING when Price is DOWN and OI is DOWN', () => {
    // 80 -> 65 (-18.75% LTP), 200,000 -> 160,000 (-20% OI)
    const result = classifyBuildup({
      strike: 24500,
      type: 'CE',
      prevLTP: 80,
      currLTP: 65,
      prevOI: 200000,
      currOI: 160000,
    });

    assert.ok(result);
    assert.equal(result?.kind, 'LONG_UNWINDING');
  });

  it('returns null if OI change does not meet threshold', () => {
    // Small change: 100,000 -> 100,100 (0.1% OI change)
    const result = classifyBuildup({
      strike: 24500,
      type: 'CE',
      prevLTP: 50,
      currLTP: 55,
      prevOI: 100000,
      currOI: 100100,
    });

    assert.equal(result, null);
  });
});
