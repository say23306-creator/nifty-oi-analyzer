// =============================================================================
// lib/paper-trading/tracker.ts — Paper trading entry/exit tracker
// =============================================================================

import { config } from '../config';
import { insertPaperTrade, closePaperTrade, getOpenPaperTrades } from '../db/queries';
import { logger } from '../utils/logger';
import type { BuildupSignal } from '../analysis/types';

/**
 * Open a paper trade from a buildup signal.
 * Only runs when PAPER_TRADING_MODE=true.
 */
export async function openPaperTrade(
  signal: BuildupSignal & { signalId: number },
  entryPrice: number
): Promise<void> {
  if (!config.features.enabled.paperTrading) return;

  const direction: 'LONG' | 'SHORT' =
    signal.kind === 'LONG_BUILDUP' || signal.kind === 'SHORT_COVERING'
      ? 'LONG'
      : 'SHORT';

  try {
    const id = await insertPaperTrade({
      signalId: signal.signalId,
      strike: signal.strike,
      optionType: signal.optionType,
      direction,
      entryPrice,
    });
    logger.info('[paper] Opened paper trade', { id, strike: signal.strike, direction });
  } catch (err) {
    logger.error('[paper] Failed to open paper trade', err);
  }
}

/**
 * Close all open paper trades at the given exit price.
 * In practice call this at end of day or when spot crosses a level.
 */
export async function closePaperTradeById(
  tradeId: number,
  exitPrice: number
): Promise<void> {
  if (!config.features.enabled.paperTrading) return;
  try {
    await closePaperTrade(tradeId, exitPrice);
    logger.info('[paper] Closed paper trade', { tradeId, exitPrice });
  } catch (err) {
    logger.error('[paper] Failed to close paper trade', err);
  }
}

/**
 * Evaluate all open paper trades against current market prices.
 * Auto-closes if:
 * 1. Target (+20% gain on premium) is reached
 * 2. Stop loss (-15% loss on premium) is reached
 * 3. Market is closing (after 15:20 IST)
 */
export async function evaluateOpenTrades(
  chainRows: Array<{ strike: number; type: 'CE' | 'PE'; ltp: number | null }>
): Promise<void> {
  if (!config.features.enabled.paperTrading) return;

  try {
    const openTrades = await getOpenPaperTrades();
    if (openTrades.length === 0) return;

    const priceMap = new Map<string, number>();
    for (const r of chainRows) {
      if (r.ltp != null) {
        priceMap.set(`${r.strike}_${r.type}`, r.ltp);
      }
    }

    const { minutesFromMidnightIST } = await import('../market/hours');
    const mins = minutesFromMidnightIST();
    const isEOD = mins >= 15 * 60 + 20; // after 15:20 IST

    for (const trade of openTrades) {
      if (!trade.strike || !trade.option_type || trade.entry_price == null) continue;
      const key = `${trade.strike}_${trade.option_type}`;
      const currentPrice = priceMap.get(key);
      if (currentPrice == null || currentPrice <= 0) continue;

      const pnlPct = trade.direction === 'LONG'
        ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
        : ((trade.entry_price - currentPrice) / trade.entry_price) * 100;

      // Rules: Target +20%, Stop Loss -15%, or EOD close
      if (pnlPct >= 20 || pnlPct <= -15 || isEOD) {
        await closePaperTrade(trade.id, currentPrice);
        logger.info('[paper] Auto-closed paper trade', {
          id: trade.id,
          strike: trade.strike,
          type: trade.option_type,
          pnlPct: pnlPct.toFixed(1) + '%',
          reason: pnlPct >= 20 ? 'TARGET' : pnlPct <= -15 ? 'STOP_LOSS' : 'EOD',
        });
      }
    }
  } catch (err) {
    logger.error('[paper] Error evaluating open trades', err);
  }
}
