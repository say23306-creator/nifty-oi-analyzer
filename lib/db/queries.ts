// =============================================================================
// lib/db/queries.ts — Typed query helpers (no raw SQL in API routes)
// =============================================================================

import { getDb } from './client';
import type { ChainRow } from '../broker/types';

// ─── Types returned from DB ──────────────────────────────────────────────────

export interface DbSnapshot {
  id: number;
  ts: Date;
  expiry: string;
  spot: number;
}

export interface DbChainRow {
  id: number;
  snapshot_id: number;
  strike: number;
  type: 'CE' | 'PE';
  ltp: number | null;
  oi: number | null;
  volume: number | null;
  iv: number | null;
}

export interface DbSignal {
  id: number;
  ts: Date;
  kind: string;
  strike: number | null;
  option_type: 'CE' | 'PE' | null;
  detail: Record<string, unknown> | null;
  sent_to_telegram: boolean;
}

export interface DbPaperTrade {
  id: number;
  signal_id: number | null;
  entry_ts: Date;
  exit_ts: Date | null;
  strike: number | null;
  option_type: 'CE' | 'PE' | null;
  direction: 'LONG' | 'SHORT';
  entry_price: number | null;
  exit_price: number | null;
  pnl: number | null;
  outcome: 'WIN' | 'LOSS' | 'OPEN' | null;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db<{ value: string }[]>`
    SELECT value FROM settings WHERE key = ${key}
  `;
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now()
  `;
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function insertSnapshot(expiry: string, spot: number): Promise<number> {
  const db = getDb();
  const rows = await db<{ id: number }[]>`
    INSERT INTO snapshots (ts, expiry, spot)
    VALUES (now(), ${expiry}, ${spot})
    RETURNING id
  `;
  return rows[0].id;
}

export async function getLatestSnapshot(expiry?: string): Promise<DbSnapshot | null> {
  const db = getDb();
  const rows = expiry
    ? await db<DbSnapshot[]>`
        SELECT id, ts, expiry::text, spot::float
        FROM snapshots
        WHERE expiry = ${expiry}
        ORDER BY ts DESC
        LIMIT 1
      `
    : await db<DbSnapshot[]>`
        SELECT id, ts, expiry::text, spot::float
        FROM snapshots
        ORDER BY ts DESC
        LIMIT 1
      `;
  return rows[0] ?? null;
}

/**
 * Get the snapshot closest to (now - windowMinutes), for a given expiry.
 */
export async function getSnapshotNMinutesAgo(
  expiry: string,
  windowMinutes: number
): Promise<DbSnapshot | null> {
  const db = getDb();
  const rows = await db<DbSnapshot[]>`
    SELECT id, ts, expiry::text, spot::float
    FROM snapshots
    WHERE expiry = ${expiry}
      AND ts <= now() - (${windowMinutes} || ' minutes')::interval
    ORDER BY ts DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Get the last N snapshots in chronological order for time-series charts.
 */
export async function getRecentSnapshots(
  limit = 30,
  expiry?: string
): Promise<DbSnapshot[]> {
  const db = getDb();
  const rows = expiry
    ? await db<DbSnapshot[]>`
        SELECT id, ts, expiry::text, spot::float
        FROM snapshots
        WHERE expiry = ${expiry}
        ORDER BY ts DESC
        LIMIT ${limit}
      `
    : await db<DbSnapshot[]>`
        SELECT id, ts, expiry::text, spot::float
        FROM snapshots
        ORDER BY ts DESC
        LIMIT ${limit}
      `;
  return rows.reverse();
}

/**
 * Efficiently compute PCR and total OI for multiple snapshot IDs in a single query.
 */
export async function getHistoricalPCR(
  snapshotIds: number[]
): Promise<Map<number, { pcr: number; totalCeOI: number; totalPeOI: number }>> {
  if (snapshotIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db<{
    snapshot_id: number;
    ce_oi: string;
    pe_oi: string;
  }[]>`
    SELECT 
      snapshot_id,
      COALESCE(SUM(CASE WHEN type = 'CE' THEN oi ELSE 0 END), 0)::text as ce_oi,
      COALESCE(SUM(CASE WHEN type = 'PE' THEN oi ELSE 0 END), 0)::text as pe_oi
    FROM chain_rows
    WHERE snapshot_id IN ${db(snapshotIds)}
    GROUP BY snapshot_id
  `;
  const result = new Map<number, { pcr: number; totalCeOI: number; totalPeOI: number }>();
  for (const r of rows) {
    const ce = parseFloat(r.ce_oi) || 0;
    const pe = parseFloat(r.pe_oi) || 0;
    const pcr = ce === 0 ? 0 : parseFloat((pe / ce).toFixed(3));
    result.set(Number(r.snapshot_id), { pcr, totalCeOI: ce, totalPeOI: pe });
  }
  return result;
}

// ─── Chain rows ───────────────────────────────────────────────────────────────

export async function insertChainRows(
  snapshotId: number,
  rows: ChainRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();

  // Build insert using postgres.js bulk syntax
  const values = rows.map((r) => ({
    snapshot_id: snapshotId,
    strike: r.strike,
    type: r.type,
    ltp: r.ltp ?? null,
    oi: r.oi ?? null,
    volume: r.volume ?? null,
    iv: r.iv ?? null,
  }));

  await db`
    INSERT INTO chain_rows ${db(values, 'snapshot_id', 'strike', 'type', 'ltp', 'oi', 'volume', 'iv')}
  `;
}

export async function getChainRows(snapshotId: number): Promise<DbChainRow[]> {
  const db = getDb();
  return db<DbChainRow[]>`
    SELECT id, snapshot_id, strike, type, ltp::float, oi, volume, iv::float
    FROM chain_rows
    WHERE snapshot_id = ${snapshotId}
    ORDER BY strike ASC, type ASC
  `;
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export async function insertSignal(
  kind: string,
  detail: Record<string, unknown>,
  strike?: number,
  optionType?: 'CE' | 'PE'
): Promise<number> {
  const db = getDb();
  const rows = await db<{ id: number }[]>`
    INSERT INTO signals (ts, kind, strike, option_type, detail, sent_to_telegram)
    VALUES (now(), ${kind}, ${strike ?? null}, ${optionType ?? null}, ${JSON.stringify(detail)}, false)
    RETURNING id
  `;
  return rows[0].id;
}

export async function markSignalSent(id: number): Promise<void> {
  const db = getDb();
  await db`
    UPDATE signals SET sent_to_telegram = true WHERE id = ${id}
  `;
}

/**
 * Find if the same signal kind+strike+type was sent within the cooldown window.
 */
export async function findRecentSignal(
  kind: string,
  cooldownMinutes: number,
  strike?: number,
  optionType?: 'CE' | 'PE'
): Promise<DbSignal | null> {
  const db = getDb();
  const rows = await db<DbSignal[]>`
    SELECT id, ts, kind, strike, option_type, detail, sent_to_telegram
    FROM signals
    WHERE kind = ${kind}
      AND (${strike ?? null}::int IS NULL OR strike = ${strike ?? null})
      AND (${optionType ?? null}::text IS NULL OR option_type = ${optionType ?? null})
      AND sent_to_telegram = true
      AND ts >= now() - (${cooldownMinutes} || ' minutes')::interval
    ORDER BY ts DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getRecentSignals(limit = 20): Promise<DbSignal[]> {
  const db = getDb();
  return db<DbSignal[]>`
    SELECT id, ts, kind, strike, option_type, detail, sent_to_telegram
    FROM signals
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
}

// ─── Paper trades ─────────────────────────────────────────────────────────────

export async function insertPaperTrade(trade: {
  signalId?: number;
  strike?: number;
  optionType?: 'CE' | 'PE';
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
}): Promise<number> {
  const db = getDb();
  const rows = await db<{ id: number }[]>`
    INSERT INTO paper_trades (signal_id, entry_ts, strike, option_type, direction, entry_price, outcome)
    VALUES (
      ${trade.signalId ?? null},
      now(),
      ${trade.strike ?? null},
      ${trade.optionType ?? null},
      ${trade.direction},
      ${trade.entryPrice},
      'OPEN'
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function closePaperTrade(id: number, exitPrice: number): Promise<void> {
  const db = getDb();
  const rows = await db<{ direction: string; entry_price: number }[]>`
    SELECT direction, entry_price::float FROM paper_trades WHERE id = ${id}
  `;
  if (!rows[0]) return;
  const { direction, entry_price } = rows[0];
  const pnl = direction === 'LONG' ? exitPrice - entry_price : entry_price - exitPrice;
  await db`
    UPDATE paper_trades
    SET exit_ts = now(),
        exit_price = ${exitPrice},
        pnl = ${pnl},
        outcome = ${pnl >= 0 ? 'WIN' : 'LOSS'}
    WHERE id = ${id}
  `;
}

export async function getOpenPaperTrades(): Promise<DbPaperTrade[]> {
  const db = getDb();
  return db<DbPaperTrade[]>`
    SELECT id, signal_id, entry_ts, exit_ts, strike, option_type, direction, entry_price::float, exit_price::float, pnl::float, outcome
    FROM paper_trades
    WHERE outcome = 'OPEN'
    ORDER BY entry_ts ASC
  `;
}

export async function getPaperTradeSummary(): Promise<{
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
}> {
  const db = getDb();
  const rows = await db<{ outcome: string; count: number }[]>`
    SELECT outcome, COUNT(*)::int as count
    FROM paper_trades
    GROUP BY outcome
  `;
  const byOutcome: Record<string, number> = {};
  for (const r of rows) byOutcome[r.outcome] = r.count;

  const wins = byOutcome['WIN'] ?? 0;
  const losses = byOutcome['LOSS'] ?? 0;
  const open = byOutcome['OPEN'] ?? 0;
  const total = wins + losses;

  return {
    total,
    wins,
    losses,
    open,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
  };
}
