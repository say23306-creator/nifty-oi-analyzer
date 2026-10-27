// =============================================================================
// app/api/dashboard/chain/route.ts — Serve latest chain data to dashboard UI
// =============================================================================

import { NextResponse } from 'next/server';
import { getLatestSnapshot, getChainRows } from '@/lib/db/queries';
import { getScrapedOptionChain, convertToDbChainRows } from '@/lib/scraper-feed';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  // 1. Try DB first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const snap = await getLatestSnapshot();
      if (snap) {
        const rows = await getChainRows(snap.id);
        return NextResponse.json({
          snapshot: {
            id: snap.id,
            ts: snap.ts,
            expiry: snap.expiry,
            spot: snap.spot,
          },
          rows,
        });
      }
    } catch {
      // Fall through to Python scraper feed
    }
  }

  // 2. Seamless Python scraper feed fallback
  const scraped = await getScrapedOptionChain();
  if (scraped) {
    const rows = convertToDbChainRows(scraped);
    return NextResponse.json({
      snapshot: {
        id: 1,
        ts: scraped.timestamp || new Date().toISOString(),
        expiry: scraped.selected_expiry,
        spot: scraped.spot,
      },
      rows,
    });
  }

  return NextResponse.json({ snapshot: null, rows: [] });
}
