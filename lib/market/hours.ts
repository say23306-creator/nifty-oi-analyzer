// =============================================================================
// lib/market/hours.ts — IST market-hours gate
// =============================================================================

import { config } from '../config';
import { isNseHoliday } from './holidays';

/**
 * Convert a UTC Date to IST (Asia/Kolkata, UTC+5:30).
 */
export function toIST(date: Date = new Date()): Date {
  // Intl.DateTimeFormat gives us the parts in the target timezone
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: config.market.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
}

/**
 * Returns the current IST date string YYYY-MM-DD.
 */
export function todayIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.market.timezone,
  }).format(date);
}

/**
 * Day of week in IST (0 = Sunday … 6 = Saturday).
 */
export function dayOfWeekIST(date: Date = new Date()): number {
  const ist = toIST(date);
  return ist.getDay();
}

/**
 * Returns true if the market is currently open.
 * Conditions:
 *   1. Monday–Friday
 *   2. Not an NSE holiday
 *   3. Between 09:15 and 15:30 IST (inclusive)
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const ist = toIST(now);
  const day = ist.getDay(); // 0=Sun, 6=Sat

  if (day === 0 || day === 6) return false;

  const dateStr = todayIST(now);
  if (isNseHoliday(dateStr)) return false;

  const { openHour, openMinute, closeHour, closeMinute } = config.market;
  const totalMinutes = ist.getHours() * 60 + ist.getMinutes();
  const openTotal = openHour * 60 + openMinute;   // 555
  const closeTotal = closeHour * 60 + closeMinute; // 930

  return totalMinutes >= openTotal && totalMinutes <= closeTotal;
}

/**
 * Returns a human-readable IST time string for logging / Telegram messages.
 */
export function nowIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: config.market.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}
