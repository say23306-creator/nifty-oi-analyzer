// =============================================================================
// app/api/ai-analysis/route.ts — Live Gemini AI Analysis API Endpoint
// =============================================================================
// GET: Fetch the latest cached AI analysis (or generate if none exists)
// POST: Force generate fresh AI analysis using live option chain and broadcast
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/db/queries';
import { runAnalysis } from '@/lib/analysis';
import { getLatestAiAnalysis, generateAiAnalysis } from '@/lib/ai/gemini';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { formatAiMarketAnalysis } from '@/lib/telegram/formatter';
import { getScrapedOptionChain, buildAnalysisFromScraped } from '@/lib/scraper-feed';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

async function getLiveOrDbAnalysis() {
  // 1. Try DB first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const snap = await getLatestSnapshot();
      if (snap) {
        const analysis = await runAnalysis(snap.expiry);
        if (analysis) return analysis;
      }
    } catch {
      // Fall through to Python scraper feed
    }
  }

  // 2. Python live scraper feed fallback
  const scraped = await getScrapedOptionChain();
  if (scraped) {
    return buildAnalysisFromScraped(scraped);
  }

  return null;
}

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await getLatestAiAnalysis();
    if (cached) {
      return NextResponse.json({ success: true, analysis: cached, cached: true });
    }

    // If no cached analysis exists yet, compute from live data
    const analysis = await getLiveOrDbAnalysis();
    if (!analysis) {
      return NextResponse.json({
        success: false,
        message: 'No option chain data available yet. Please ensure the Python scraper is active.',
      }, { status: 404 });
    }

    const ai = await generateAiAnalysis(analysis);
    return NextResponse.json({ success: true, analysis: ai, cached: false });

  } catch (err) {
    logger.error('[api/ai-analysis] GET failed', err);
    return NextResponse.json({ error: 'Failed to retrieve AI analysis' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { forceFresh?: boolean; broadcastTelegram?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const analysis = await getLiveOrDbAnalysis();
    if (!analysis) {
      return NextResponse.json({
        success: false,
        message: 'No option chain data found. Run the Python scraper first.',
      }, { status: 400 });
    }

    const ai = await generateAiAnalysis(analysis, { forceFresh: true });

    if (body.broadcastTelegram) {
      try {
        await sendTelegramMessage(formatAiMarketAnalysis(ai));
      } catch (tgErr) {
        logger.warn('[api/ai-analysis] Telegram broadcast skipped or failed', { error: String(tgErr) });
      }
    }

    return NextResponse.json({ success: true, analysis: ai });

  } catch (err) {
    logger.error('[api/ai-analysis] POST failed', { error: String(err) });
    return NextResponse.json({ error: 'Failed to generate AI analysis' }, { status: 500 });
  }
}
