// =============================================================================
// app/api/cron/hourly-analysis/route.ts — Hourly OI Analysis & Telegram Broadcast
// =============================================================================
// Runs every hour during market hours (09:15 - 15:30 IST).
// Analyzes Nifty 50 1-hour Price x OI shifts, trapped writers, and sends structured
// institutional alerts to Telegram group Pro_9.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { isMarketOpen } from '@/lib/market/hours';
import { getLatestSnapshot } from '@/lib/db/queries';
import { runAnalysis } from '@/lib/analysis';
import { generateAiAnalysis } from '@/lib/ai/gemini';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { formatAiMarketAnalysis } from '@/lib/telegram/formatter';
import { getScrapedOptionChain, buildAnalysisFromScraped } from '@/lib/scraper-feed';
import type { AnalysisResult } from '@/lib/analysis/types';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

function isAuthorised(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
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

async function getLiveOrDbAnalysis(): Promise<AnalysisResult | null> {
  // 1. Try DB first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const snap = await getLatestSnapshot();
      if (snap) {
        const result = await runAnalysis(snap.expiry, 60); // 1-hour shift window
        if (result) return result;
      }
    } catch (err) {
      logger.warn('[cron/hourly-analysis] DB analysis failed, attempting live scraper fallback', { error: String(err) });
    }
  }

  // 2. Seamless live Python scraper fallback
  try {
    const scraped = await getScrapedOptionChain();
    if (scraped) {
      return buildAnalysisFromScraped(scraped);
    }
  } catch (err) {
    logger.warn('[cron/hourly-analysis] Live scraper fallback failed', { error: String(err) });
  }

  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (!isMarketOpen() && !force) {
    logger.info('[cron/hourly-analysis] Market closed — skipping hourly AI broadcast');
    return NextResponse.json({ skipped: true, reason: 'market_closed' });
  }

  const started = Date.now();
  logger.info('[cron/hourly-analysis] Starting hourly OI analysis broadcast job');

  try {
    const analysis = await getLiveOrDbAnalysis();
    if (!analysis) {
      logger.warn('[cron/hourly-analysis] No option chain data available');
      return NextResponse.json({ skipped: true, reason: 'no_data_available' });
    }

    // Generate fresh AI analysis with institutional trapped seller insights
    const ai = await generateAiAnalysis(analysis, { forceFresh: true });

    // Format and broadcast to Telegram supergroup
    const message = formatAiMarketAnalysis(ai);
    await sendTelegramMessage(message);

    const elapsed = Date.now() - started;
    logger.info(`[cron/hourly-analysis] Broadcast completed in ${elapsed}ms`, {
      bias: ai.bias,
      confidence: ai.confidence,
      spot: ai.spot,
    });

    return NextResponse.json({
      success: true,
      elapsed,
      bias: ai.bias,
      confidence: ai.confidence,
      spot: ai.spot,
      source: ai.source,
      broadcastTelegram: true,
    });

  } catch (err) {
    logger.error('[cron/hourly-analysis] Job failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal cron error', details: String(err) }, { status: 500 });
  }
}
