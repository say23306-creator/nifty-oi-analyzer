// =============================================================================
// app/api/dashboard/signals/route.ts — Serve recent signals to dashboard
// =============================================================================

import { NextResponse } from 'next/server';
import { getRecentSignals } from '@/lib/db/queries';
import { getScrapedOptionChain, buildDbSignals } from '@/lib/scraper-feed';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  // 1. Try DB first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const signals = await getRecentSignals(50);
      if (signals && signals.length > 0) {
        return NextResponse.json({ signals });
      }
    } catch {
      // Fall through to Python scraper feed
    }
  }

  // 2. Python scraper feed fallback
  const scraped = await getScrapedOptionChain();
  if (scraped) {
    const signals = buildDbSignals(scraped);
    return NextResponse.json({ signals });
  }

  return NextResponse.json({ signals: [] });
}
