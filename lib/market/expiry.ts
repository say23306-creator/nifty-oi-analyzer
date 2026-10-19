// =============================================================================
// lib/market/expiry.ts — Expiry date helpers for weekly and monthly contracts
// =============================================================================

/**
 * Given a list of unique expiry dates (as Date objects), return the nearest
 * Thursday that is >= today (next weekly Nifty expiry).
 *
 * Nifty weekly expiry = every Thursday.
 * Nifty monthly expiry = last Thursday of the month.
 */

/**
 * Parse a YYYY-MM-DD string into a Date (midnight IST treated as UTC for comparison).
 */
export function parseExpiry(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
export function formatExpiry(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * From a sorted array of expiry date strings, return:
 *   - nearestWeekly: soonest expiry >= today
 *   - currentMonthly: last expiry in the current calendar month
 *
 * "today" is provided as a YYYY-MM-DD string (IST date).
 */
export function selectExpiries(
  expiryStrings: string[],
  todayStr: string
): { nearestWeekly: string; currentMonthly: string } {
  const sorted = [...expiryStrings].sort();
  const todayDate = parseExpiry(todayStr);

  // Nearest weekly = first expiry that is today or in the future
  const nearestWeekly =
    sorted.find((s) => parseExpiry(s) >= todayDate) ?? sorted[sorted.length - 1];

  // Current monthly = last expiry within the same calendar month as today
  const thisYear = todayDate.getUTCFullYear();
  const thisMonth = todayDate.getUTCMonth();

  const thisMonthExpiries = sorted.filter((s) => {
    const d = parseExpiry(s);
    return d.getUTCFullYear() === thisYear && d.getUTCMonth() === thisMonth;
  });

  const currentMonthly =
    thisMonthExpiries.length > 0
      ? thisMonthExpiries[thisMonthExpiries.length - 1] // last = monthly
      : nearestWeekly;

  return { nearestWeekly, currentMonthly };
}

/**
 * Returns true if today is an expiry date (any expiry in the list).
 */
export function isExpiryDay(expiryStrings: string[], todayStr: string): boolean {
  return expiryStrings.includes(todayStr);
}
