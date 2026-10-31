import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionChainFromDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const expiry = searchParams.get('expiry') || undefined;

    const data = await fetchOptionChainFromDb(expiry);

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'No option chain snapshots found in database' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch chain data' },
      { status: 500 }
    );
  }
}

