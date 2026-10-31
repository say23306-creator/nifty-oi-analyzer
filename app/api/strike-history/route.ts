import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { interpretPriceToOI, PriceToOIInterpretation } from '@/lib/price-to-oi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const strikeParam = searchParams.get('strike');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!strikeParam) {
      return NextResponse.json(
        { success: false, error: 'Strike parameter is required (e.g. ?strike=23000)' },
        { status: 400 }
      );
    }

    const strike = parseInt(strikeParam, 10);

    // Fetch snapshots and corresponding strike rows for this strike ordered chronologically
    const rows = await sql`
      SELECT 
        s.id AS snapshot_id,
        s.ts AS timestamp,
        s.checkpoint,
        s.spot,
        s.ltp AS index_ltp,
        s.pcr,
        c.type,
        c.ltp,
        c.oi,
        c.volume,
        c.iv,
        c.change_oi,
        c.price_change
      FROM snapshots s
      JOIN chain_rows c ON s.id = c.snapshot_id
      WHERE c.strike = ${strike}
      ORDER BY s.ts ASC
      LIMIT ${limit * 2};
    `;

    // Separate rows by snapshot and type
    const snapshotsMap = new Map<number, any>();

    for (const r of rows) {
      const snapId = Number(r.snapshot_id);
      if (!snapshotsMap.has(snapId)) {
        const dt = new Date(r.timestamp);
        snapshotsMap.set(snapId, {
          snapshotId: snapId,
          timestamp: r.timestamp,
          formattedIST: dt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }),
          checkpoint: r.checkpoint,
          spot: Number(r.spot),
          indexLtp: Number(r.index_ltp || r.spot),
          pcr: Number(r.pcr),
          ce: null,
          pe: null,
        });
      }

      const snap = snapshotsMap.get(snapId);
      const optData = {
        ltp: Number(r.ltp) || 0,
        oi: Number(r.oi) || 0,
        volume: Number(r.volume) || 0,
        iv: Number(r.iv) || 0,
      };

      if (r.type === 'CE') snap.ce = optData;
      else if (r.type === 'PE') snap.pe = optData;
    }

    const timeline = Array.from(snapshotsMap.values());

    // Calculate interval-by-interval step transitions
    const stepAnalysis: any[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const current = timeline[i];
      if (i === 0) {
        // Baseline first record
        stepAnalysis.push({
          ...current,
          ceAnalysis: null,
          peAnalysis: null,
        });
        continue;
      }

      const prev = timeline[i - 1];

      // Analyze CE transition
      let ceAnalysis: PriceToOIInterpretation | null = null;
      if (current.ce && prev.ce) {
        ceAnalysis = interpretPriceToOI('CE', current.ce.ltp, prev.ce.ltp, current.ce.oi, prev.ce.oi);
      }

      // Analyze PE transition
      let peAnalysis: PriceToOIInterpretation | null = null;
      if (current.pe && prev.pe) {
        peAnalysis = interpretPriceToOI('PE', current.pe.ltp, prev.pe.ltp, current.pe.oi, prev.pe.oi);
      }

      stepAnalysis.push({
        ...current,
        ceAnalysis,
        peAnalysis,
      });
    }

    return NextResponse.json({
      success: true,
      strike,
      totalSteps: stepAnalysis.length,
      history: stepAnalysis,
    });
  } catch (error: any) {
    console.error('Error fetching strike history:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch strike history' },
      { status: 500 }
    );
  }
}

