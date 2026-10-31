import postgres from 'postgres';

// Initialize postgres client using DATABASE_URL
const connectionString = process.env.DATABASE_URL || '';

export const sql = postgres(connectionString, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export interface ChainRowItem {
  strike: number;
  type: 'CE' | 'PE';
  ltp: number;
  oi: number;
  change_oi: number;
  pchange_oi: number;
  volume: number;
  iv: number;
  price_change: number;
}

export interface PairedStrikeRow {
  strike: number;
  isATM: boolean;
  isITMCall: boolean;
  isITMPut: boolean;
  ce: {
    oi: number;
    change_oi: number;
    pchange_oi: number;
    volume: number;
    iv: number;
    ltp: number;
    price_change: number;
  };
  pe: {
    oi: number;
    change_oi: number;
    pchange_oi: number;
    volume: number;
    iv: number;
    ltp: number;
    price_change: number;
  };
}

export interface OptionChainPayload {
  snapshotId: number;
  spot: number;
  timestamp: string;
  checkpoint: string;
  expiry: string;
  allExpiries: string[];
  pcr: number;
  maxPain: number;
  totalCeOI: number;
  totalPeOI: number;
  supportWall: number;
  resistanceWall: number;
  rows: PairedStrikeRow[];
}

export async function fetchOptionChainFromDb(selectedExpiry?: string): Promise<OptionChainPayload | null> {
  try {
    // 1. Get latest snapshot (optionally filtered by expiry)
    let snapshotRows;
    if (selectedExpiry) {
      snapshotRows = await sql`
        SELECT id, ts, expiry, spot, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
        FROM snapshots
        WHERE expiry = ${selectedExpiry}
        ORDER BY ts DESC
        LIMIT 1;
      `;
    } else {
      snapshotRows = await sql`
        SELECT id, ts, expiry, spot, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
        FROM snapshots
        ORDER BY ts DESC
        LIMIT 1;
      `;
    }

    if (!snapshotRows || snapshotRows.length === 0) {
      return null;
    }

    const snap = snapshotRows[0];
    const snapshotId = Number(snap.id);
    const spot = Number(snap.spot);
    const expiryStr = snap.expiry ? new Date(snap.expiry).toISOString().split('T')[0] : '';

    // 2. Fetch all unique expiries
    const allExpiriesRows = await sql`
      SELECT DISTINCT expiry
      FROM snapshots
      WHERE expiry IS NOT NULL
      ORDER BY expiry ASC;
    `;
    const allExpiries = allExpiriesRows.map((r: any) =>
      new Date(r.expiry).toISOString().split('T')[0]
    );

    // 3. Fetch all chain rows for this snapshot
    const chainRows = await sql`
      SELECT strike, type, ltp, oi, volume, iv, change_oi, pchange_oi, price_change
      FROM chain_rows
      WHERE snapshot_id = ${snapshotId}
      ORDER BY strike ASC;
    `;

    // 4. Pair CE and PE by strike
    const strikeMap = new Map<number, PairedStrikeRow>();
    const strikes: number[] = [];

    // Find ATM strike (closest to spot)
    let closestStrike = 0;
    let minDistance = Infinity;

    for (const r of chainRows) {
      const s = Number(r.strike);
      if (!strikeMap.has(s)) {
        strikes.push(s);
        strikeMap.set(s, {
          strike: s,
          isATM: false,
          isITMCall: s < spot,
          isITMPut: s > spot,
          ce: { oi: 0, change_oi: 0, pchange_oi: 0, volume: 0, iv: 0, ltp: 0, price_change: 0 },
          pe: { oi: 0, change_oi: 0, pchange_oi: 0, volume: 0, iv: 0, ltp: 0, price_change: 0 },
        });

        const dist = Math.abs(s - spot);
        if (dist < minDistance) {
          minDistance = dist;
          closestStrike = s;
        }
      }

      const pair = strikeMap.get(s)!;
      const type = (r.type as string).trim().toUpperCase();
      const target = type === 'CE' ? pair.ce : pair.pe;

      target.oi = Number(r.oi) || 0;
      target.change_oi = Number(r.change_oi) || 0;
      target.pchange_oi = Number(r.pchange_oi) || 0;
      target.volume = Number(r.volume) || 0;
      target.iv = Number(r.iv) || 0;
      target.ltp = Number(r.ltp) || 0;
      target.price_change = Number(r.price_change) || 0;
    }

    if (strikeMap.has(closestStrike)) {
      strikeMap.get(closestStrike)!.isATM = true;
    }

    const rows = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

    // Calculate Active Support (Put Wall) and Resistance (Call Wall)
    let maxPutOI = 0;
    let supportWall = closestStrike - 100;
    let maxCallOI = 0;
    let resistanceWall = closestStrike + 100;

    for (const row of rows) {
      if (row.strike <= spot + 50 && row.pe.oi > maxPutOI) {
        maxPutOI = row.pe.oi;
        supportWall = row.strike;
      }
      if (row.strike >= spot - 50 && row.ce.oi > maxCallOI) {
        maxCallOI = row.ce.oi;
        resistanceWall = row.strike;
      }
    }

    return {
      snapshotId,
      spot,
      timestamp: snap.ts ? new Date(snap.ts).toISOString() : new Date().toISOString(),
      checkpoint: snap.checkpoint || 'LIVE',
      expiry: expiryStr,
      allExpiries,
      pcr: Number(snap.pcr) || 1.0,
      maxPain: Number(snap.max_pain) || closestStrike,
      totalCeOI: Number(snap.total_ce_oi) || 0,
      totalPeOI: Number(snap.total_pe_oi) || 0,
      supportWall,
      resistanceWall,
      rows,
    };
  } catch (error) {
    console.error('Error fetching option chain from database:', error);
    return null;
  }
}
