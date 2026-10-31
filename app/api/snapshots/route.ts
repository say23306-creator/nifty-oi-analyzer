import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Fetch snapshots with timestamps, spot, LTP, checkpoint, PCR
    const rows = await sql`
      SELECT id, ts, expiry, spot, ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
      FROM snapshots
      ORDER BY ts DESC
      LIMIT ${limit};
    `;

    const snapshots = rows.map((r: any) => {
      const dt = new Date(r.ts);
      // Format into Indian Standard Time representation
      const istStr = dt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const dateOnly = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
      const timeOnly = dt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

      return {
        id: Number(r.id),
        timestamp: r.ts,
        formattedIST: istStr,
        date: dateOnly,
        time: timeOnly,
        checkpoint: r.checkpoint || timeOnly,
        expiry: r.expiry ? new Date(r.expiry).toISOString().split('T')[0] : '',
        spot: Number(r.spot),
        ltp: Number(r.ltp || r.spot),
        pcr: Number(r.pcr) || 1.0,
        totalCeOI: Number(r.total_ce_oi) || 0,
        totalPeOI: Number(r.total_pe_oi) || 0,
        maxPain: Number(r.max_pain) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      count: snapshots.length,
      snapshots,
    });
  } catch (error: any) {
    console.error('Error fetching snapshots list:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}

