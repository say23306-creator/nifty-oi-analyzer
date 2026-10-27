// =============================================================================
// app/api/cron/hourly-analysis/route.ts — Hourly AI Analysis & Telegram Broadcast Cron
// =============================================================================
// Runs every hour during market hours (09:15 - 15:30 IST).
// Generates Gemini AI analysis on the latest Nifty option chain data and broadcasts
// a structured institutional intelligence report to the Telegram group.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { isMarketOpen } from '@/lib/market/hours';
import { getLatestSnapshot } from '@/lib/db/queries';
import { runAnalysis } from '@/lib/analysis';
import { generateAiAnalysis } from '@/lib/ai/gemini';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { formatAiMarketAnalysis } from '@/lib/telegram/formatter';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

function isAuthorised(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If not set in development, allow for testing
    if (process.env.NODE_ENV === 'development') return true;
    logger.error('[cron/hourly-analysis] CRON_SECRET not set');
    return false;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const vercelHeader = req.headers.get('x-vercel-cron-signature');
  if (vercelHeader) return true;

  return false;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // During weekdays, only run if market is open (or bypass if ?force=true in query)
  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (!isMarketOpen() && !force) {
    logger.info('[cron/hourly-analysis] Market closed — skipping hourly AI broadcast');
    return NextResponse.json({ skipped: true, reason: 'market_closed' });
  }

  const started = Date.now();
  logger.info('[cron/hourly-analysis] Starting hourly AI intelligence job');

  try {
    const snap = await getLatestSnapshot();
    if (!snap) {
      logger.warn('[cron/hourly-analysis] No snapshot available in database');
      return NextResponse.json({ skipped: true, reason: 'no_snapshot' });
    }

    const analysis = await runAnalysis(snap.expiry);
    if (!analysis) {
      logger.warn(`[cron/hourly-analysis] Could not run analysis for expiry ${snap.expiry}`);
      return NextResponse.json({ skipped: true, reason: 'insufficient_analysis_data' });
    }

    // Force fresh AI generation
    const ai = await generateAiAnalysis(analysis, { forceFresh: true });

    // Send formatted message to Telegram group
    const message = formatAiMarketAnalysis(ai);
    await sendTelegramMessage(message);

    const elapsed = Date.now() - started;
    logger.info(`[cron/hourly-analysis] Completed and broadcast in ${elapsed}ms`, {
      bias: ai.bias,
      confidence: ai.confidence,
    });

    return NextResponse.json({
      success: true,
      elapsed,
      bias: ai.bias,
      confidence: ai.confidence,
      source: ai.source,
      broadcastTelegram: true,
    });

  } catch (err) {
    logger.error('[cron/hourly-analysis] Job failed', err);
    return NextResponse.json({ error: 'Internal cron error' }, { status: 500 });
  }
}
