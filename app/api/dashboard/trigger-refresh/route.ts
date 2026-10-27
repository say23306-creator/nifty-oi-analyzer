// =============================================================================
// app/api/dashboard/trigger-refresh/route.ts — Live Market Refresh Trigger
// =============================================================================
// Triggers an on-demand scrape and syncs fresh live data into Supabase & cache,
// then immediately returns the latest snapshot.
// =============================================================================

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

function runPythonSync(): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scraper', 'sync_db.py');
    exec(`python "${scriptPath}"`, { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      resolve(stdout);
    });
  });
}

export async function POST(): Promise<NextResponse> {
  try {
    const output = await runPythonSync();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Fresh snapshot collected and synced to Supabase',
      output: output.split('\n').filter(Boolean).slice(-3),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Scraper execution error';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
