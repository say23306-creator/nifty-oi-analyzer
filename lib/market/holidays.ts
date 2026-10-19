// =============================================================================
// lib/market/holidays.ts — NSE trading holiday list for 2025–2026
// Source: NSE India official holiday calendar
// Update this list each year or fetch dynamically from NSE website.
// =============================================================================

/**
 * NSE equity market holidays (YYYY-MM-DD, IST).
 * Add future years at the bottom.
 */
const NSE_HOLIDAYS: Set<string> = new Set([
  // ── 2025 ──────────────────────────────────────────────────────────────────
  '2025-01-26', // Republic Day
  '2025-02-26', // Mahashivratri
  '2025-03-14', // Holi
  '2025-03-31', // Id-Ul-Fitr (Ramzan Id)
  '2025-04-10', // Shri Ram Navami
  '2025-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2025-04-18', // Good Friday
  '2025-05-01', // Maharashtra Day
  '2025-08-15', // Independence Day
  '2025-08-27', // Ganesh Chaturthi
  '2025-10-02', // Mahatma Gandhi Jayanti
  '2025-10-02', // Dussehra
  '2025-10-20', // Diwali Laxmi Pujan (Muhurat Trading only)
  '2025-10-21', // Diwali Balipratipada
  '2025-11-05', // Prakash Gurpurb Sri Guru Nanak Dev ji
  '2025-12-25', // Christmas

  // ── 2026 ──────────────────────────────────────────────────────────────────
  '2026-01-26', // Republic Day
  '2026-03-20', // Holi (tentative)
  '2026-04-03', // Good Friday (tentative)
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-08-15', // Independence Day
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-19', // Dussehra (tentative) ← today may or may not be listed
  '2026-11-14', // Diwali (tentative)
  '2026-12-25', // Christmas
]);

/**
 * Returns true if the given YYYY-MM-DD date is an NSE trading holiday.
 */
export function isNseHoliday(dateStr: string): boolean {
  return NSE_HOLIDAYS.has(dateStr);
}

/**
 * Returns all holidays as a sorted array.
 */
export function getAllHolidays(): string[] {
  return [...NSE_HOLIDAYS].sort();
}
