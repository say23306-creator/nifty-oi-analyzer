import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMarketOpen, todayIST, toIST } from '../lib/market/hours';
import { isNseHoliday } from '../lib/market/holidays';

describe('Market Hours & Calendar Engine', () => {
  it('correctly reports market closed on weekends', () => {
    // Saturday 2026-10-24 11:00 AM IST
    const saturday = new Date('2026-10-24T05:30:00Z'); // 11:00 AM IST
    assert.equal(isMarketOpen(saturday), false);

    // Sunday 2026-10-25 12:00 PM IST
    const sunday = new Date('2026-10-25T06:30:00Z');
    assert.equal(isMarketOpen(sunday), false);
  });

  it('correctly reports market open during active weekday trading hours', () => {
    // Tuesday 2026-10-20 10:30 AM IST (not a holiday)
    // 10:30 AM IST = 05:00 AM UTC
    const tradingTime = new Date('2026-10-20T05:00:00Z');
    assert.equal(isMarketOpen(tradingTime), true);
  });

  it('correctly reports market closed outside trading hours on weekdays', () => {
    // Tuesday 2026-10-20 08:30 AM IST (Pre-market) = 03:00 UTC
    const preMarket = new Date('2026-10-20T03:00:00Z');
    assert.equal(isMarketOpen(preMarket), false);

    // Tuesday 2026-10-20 04:00 PM IST (Post-market) = 10:30 UTC
    const postMarket = new Date('2026-10-20T10:30:00Z');
    assert.equal(isMarketOpen(postMarket), false);
  });

  it('detects known NSE holidays', () => {
    // Republic Day (Jan 26)
    assert.equal(isNseHoliday('2026-01-26'), true);
    // Independence Day (Aug 15)
    assert.equal(isNseHoliday('2026-08-15'), true);
    // Regular trading day
    assert.equal(isNseHoliday('2026-10-20'), false);
  });
});
