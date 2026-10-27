// =============================================================================
// app/api/collect/route.ts — Main data collection endpoint (Phase 1 + 2)
// =============================================================================
// Protected by Authorization: Bearer CRON_SECRET header.
// Called by Vercel Cron or external scheduler every 1–3 minutes during market hours.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { isMarketOpen, todayIST } from '@/lib/market/hours';
import { getBrokerAdapter } from '@/lib/broker';
import { selectExpiries } from '@/lib/market/expiry';
import { insertSnapshot, insertChainRows } from '@/lib/db/queries';
import { runAnalysis } from '@/lib/analysis';
import { filterNewBuildups, markSignalsSent, dedupAndInsertSignal } from '@/lib/analysis/dedup';
import { sortByOIChange } from '@/lib/analysis/buildup';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { formatSignalAlert, formatTokenExpiredAlert } from '@/lib/telegram/formatter';
import { openPaperTrade } from '@/lib/paper-trading/tracker';
import { logger } from '@/lib/utils/logger';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

// ─── Auth guard ───────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[collect] CRON_SECRET not set');
    return false;
  }
  // Vercel cron sends x-vercel-signature; external callers send Bearer token
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Vercel's own cron doesn't need a Bearer; check the Vercel-specific header
  const vercelHeader = req.headers.get('x-vercel-cron-signature');
  if (vercelHeader) return true; // Vercel validates this internally

  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Authorization ──────────────────────────────────────────────────────────
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // ── Market hours gate ──────────────────────────────────────────────────────
  if (!isMarketOpen()) {
    logger.info('[collect] Market closed — skipping');
    return NextResponse.json({ skipped: true, reason: 'market_closed' });
  }

  const started = Date.now();
  logger.info('[collect] Starting data collection');

  try {
    const broker = getBrokerAdapter();

    // ── Spot price ───────────────────────────────────────────────────────────
    let spot: number;
    try {
      spot = await broker.getSpot();
    } catch (err) {
      // Token likely expired
      logger.error('[collect] Failed to get spot — token may be expired', err);
      await sendTelegramMessage(formatTokenExpiredAlert());
      return NextResponse.json({ error: 'Broker error — check token' }, { status: 500 });
    }

    // ── Expiries ─────────────────────────────────────────────────────────────
    const allExpiries = await broker.getExpiries();
    const today = todayIST();
    const { nearestWeekly, currentMonthly } = selectExpiries(allExpiries, today);

    const expiriesToFetch = [...new Set([nearestWeekly, currentMonthly])];
    logger.info('[collect] Fetching expiries', { expiriesToFetch, spot });

    const results = [];

    for (const expiry of expiriesToFetch) {
      // ── Fetch chain ────────────────────────────────────────────────────────
      const chainRows = await broker.getFullChain(expiry);
      if (chainRows.length === 0) {
        logger.warn(`[collect] Empty chain for expiry ${expiry}`);
        continue;
      }

      // ── Insert snapshot + rows ─────────────────────────────────────────────
      const snapshotId = await insertSnapshot(expiry, spot);
      await insertChainRows(snapshotId, chainRows);
      logger.info(`[collect] Inserted snapshot ${snapshotId} for expiry ${expiry} (${chainRows.length} rows)`);

      // ── Phase 2: Analysis ──────────────────────────────────────────────────
      const analysis = await runAnalysis(expiry);
      if (!analysis) {
        results.push({ expiry, snapshotId, skippedAnalysis: true });
        continue;
      }

      // ── Signal dedup + send ────────────────────────────────────────────────
      const topBuildups = sortByOIChange(analysis.buildups).slice(0, 10);
      const newBuildups = await filterNewBuildups(topBuildups);

      if (newBuildups.length > 0) {
        // Build a combined analysis result with only new buildups for Telegram
        const alertResult = { ...analysis, topBuildups: newBuildups };

        await sendTelegramMessage(formatSignalAlert(alertResult, spot));

        // Mark signals as sent
        await markSignalsSent(newBuildups.map((b) => b.signalId));

        // Paper trading
        for (const b of newBuildups) {
          await openPaperTrade(b, b.currentLTP);
        }
      }

      // ── Insert bias change signal if notable ───────────────────────────────
      if (analysis.bias.confidence > 70) {
        const biasSignalId = await dedupAndInsertSignal(
          `BIAS_${analysis.bias.direction}`,
          { direction: analysis.bias.direction, confidence: analysis.bias.confidence, reasons: analysis.bias.reasons },
        );
        if (biasSignalId !== null) {
          await markSignalsSent([biasSignalId]);
        }
      }

      results.push({
        expiry,
        snapshotId,
        chainRows: chainRows.length,
        buildups: analysis.buildups.length,
        newSignals: newBuildups.length,
        bias: analysis.bias.direction,
        confidence: analysis.bias.confidence,
        pcr: analysis.pcr.oi,
        maxPain: analysis.maxPain,
      });
    }

    const elapsed = Date.now() - started;
    logger.info(`[collect] Done in ${elapsed}ms`);
    return NextResponse.json({ success: true, elapsed, results });

  } catch (err) {
    logger.error('[collect] Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
