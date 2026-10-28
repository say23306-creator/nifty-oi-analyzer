// =============================================================================
// lib/scraper-feed.ts — Live Feed Provider from Python NSE Scraper
// =============================================================================
// Seamlessly connects the Next.js Dashboard to the Python scraper microservice
// (http://localhost:8000) with automatic filesystem fallback to scraper/scraped_data.json.
// =============================================================================

import fs from 'fs';
import path from 'path';
import type { DbChainRow, DbSignal } from '@/lib/db/queries';
import type { AnalysisResult, BuildupSignal, OILevel } from '@/lib/analysis/types';
import { generateTradeDecision } from '@/lib/analysis/decision-engine';
import { isMarketOpen, nowIST } from '@/lib/market/hours';

export interface ScrapedChainItem {
  strike: number;
  ce_oi: number;
  ce_change_oi: number;
  ce_pchange_oi?: number;
  ce_ltp: number;
  ce_change: number;
  ce_volume: number;
  ce_iv: number;
  ce_buildup: string;
  pe_oi: number;
  pe_change_oi: number;
  pe_pchange_oi?: number;
  pe_ltp: number;
  pe_change: number;
  pe_volume: number;
  pe_iv: number;
  pe_buildup: string;
}

export interface ScrapedDataPayload {
  symbol: string;
  spot: number;
  expiries: string[];
  selected_expiry: string;
  pcr: number;
  pcr_volume: number;
  max_pain: number;
  support: number;
  resistance: number;
  total_ce_oi: number;
  total_pe_oi: number;
  total_ce_volume: number;
  total_pe_volume: number;
  chain: ScrapedChainItem[];
  timestamp: string;
}

/**
 * Fetch latest scraped data from Python microservice (http://localhost:8000)
 * with graceful fallback to scraper/scraped_data.json on disk.
 */
export async function getScrapedOptionChain(): Promise<ScrapedDataPayload | null> {
  // 1. Try local microservice first
  try {
    const res = await fetch('http://127.0.0.1:8000/api/option-chain?symbol=NIFTY', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.chain && data.chain.length > 0) {
        return data as ScrapedDataPayload;
      }
    }
  } catch {
    // Microservice not responding, proceed to file fallback
  }

  // 2. Read from scraper/scraped_data.json
  try {
    const filePath = path.join(process.cwd(), 'scraper', 'scraped_data.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.chain && data.chain.length > 0) {
        return data as ScrapedDataPayload;
      }
    }
  } catch {
    // Disk file read failed
  }

  return null;
}

/**
 * Convert raw Python scraper chain into DbChainRow[] for ChainTable & OIBarChart.
 */
export function convertToDbChainRows(scraped: ScrapedDataPayload): DbChainRow[] {
  const rows: DbChainRow[] = [];
  let id = 1;

  for (const item of scraped.chain) {
    // Call entry
    rows.push({
      id: id++,
      snapshot_id: 1,
      strike: item.strike,
      type: 'CE',
      ltp: item.ce_ltp,
      oi: item.ce_oi,
      volume: item.ce_volume,
      iv: item.ce_iv,
    });

    // Put entry
    rows.push({
      id: id++,
      snapshot_id: 1,
      strike: item.strike,
      type: 'PE',
      ltp: item.pe_ltp,
      oi: item.pe_oi,
      volume: item.pe_volume,
      iv: item.pe_iv,
    });
  }

  return rows;
}

/**
 * Map python string buildups to BuildupSignal objects.
 */
function toBuildupKind(raw: string): 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' {
  const normalized = raw.toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'LONG_BUILDUP') return 'LONG_BUILDUP';
  if (normalized === 'SHORT_BUILDUP') return 'SHORT_BUILDUP';
  if (normalized === 'SHORT_COVERING') return 'SHORT_COVERING';
  if (normalized === 'LONG_UNWINDING') return 'LONG_UNWINDING';
  return 'LONG_BUILDUP';
}

export function extractBuildupSignals(scraped: ScrapedDataPayload): BuildupSignal[] {
  const signals: BuildupSignal[] = [];

  for (const r of scraped.chain) {
    if (r.ce_buildup && r.ce_buildup !== 'Neutral' && Math.abs(r.ce_change_oi) > 5000) {
      signals.push({
        strike: r.strike,
        optionType: 'CE',
        kind: toBuildupKind(r.ce_buildup),
        oiChangePct: r.ce_pchange_oi ?? (r.ce_oi > 0 ? (r.ce_change_oi / r.ce_oi) * 100 : 0),
        oiChangeAbs: r.ce_change_oi,
        ltpChangePct: r.ce_ltp > 0 ? (r.ce_change / r.ce_ltp) * 100 : 0,
        currentOI: r.ce_oi,
        currentLTP: r.ce_ltp,
      });
    }

    if (r.pe_buildup && r.pe_buildup !== 'Neutral' && Math.abs(r.pe_change_oi) > 5000) {
      signals.push({
        strike: r.strike,
        optionType: 'PE',
        kind: toBuildupKind(r.pe_buildup),
        oiChangePct: r.pe_pchange_oi ?? (r.pe_oi > 0 ? (r.pe_change_oi / r.pe_oi) * 100 : 0),
        oiChangeAbs: r.pe_change_oi,
        ltpChangePct: r.pe_ltp > 0 ? (r.pe_change / r.pe_ltp) * 100 : 0,
        currentOI: r.pe_oi,
        currentLTP: r.pe_ltp,
      });
    }
  }

  // Sort by highest absolute OI change
  return signals.sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs));
}

/**
 * Format complete AnalysisResult from scraped Python data.
 */
export function buildAnalysisFromScraped(scraped: ScrapedDataPayload): AnalysisResult {
  const allBuildups = extractBuildupSignals(scraped);
  const topBuildups = allBuildups.slice(0, 10);

  const supportLevel: OILevel = {
    strike: scraped.support,
    oi: scraped.chain.find((r) => r.strike === scraped.support)?.pe_oi ?? 0,
    type: 'PE',
  };

  const resistanceLevel: OILevel = {
    strike: scraped.resistance,
    oi: scraped.chain.find((r) => r.strike === scraped.resistance)?.ce_oi ?? 0,
    type: 'CE',
  };

  const isOverbought = scraped.pcr >= 1.60;
  const isOversold = scraped.pcr < 0.60;
  const isBullish = scraped.pcr >= 1.20 && !isOverbought;
  const isBearish = scraped.pcr <= 0.85 && !isOversold;

  const direction = isOverbought ? 'NEUTRAL' : isOversold ? 'BULLISH' : isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';
  const confidence = isOverbought ? 75 : isOversold ? 70 : isBullish ? Math.min(95, Math.round(scraped.pcr * 65)) : isBearish ? 80 : 60;

  const reasons = [
    isOverbought
      ? `PCR (OI) is ${scraped.pcr.toFixed(3)} ≥ 1.60: Extreme Overbought / Complacency zone (Reversal warning).`
      : isOversold
      ? `PCR (OI) is ${scraped.pcr.toFixed(3)} < 0.60: Extreme Oversold / Short Squeeze setup alert.`
      : `PCR (OI) is ${scraped.pcr.toFixed(3)}, indicating ${isBullish ? 'Put writing dominance (Bullish support)' : 'Call writing resistance'}.`,
    `Active Put Floor (Support) established at ${scraped.support.toLocaleString('en-IN')} (${(supportLevel.oi / 100000).toFixed(1)}L Put OI).`,
    `Active Call Wall (Resistance) concentrated at ${scraped.resistance.toLocaleString('en-IN')} (${(resistanceLevel.oi / 100000).toFixed(1)}L Call OI).`,
    `Max Pain expiry gravitational anchor is positioned at ${scraped.max_pain.toLocaleString('en-IN')}.`,
  ];

  const bias = {
    direction,
    confidence,
    reasons,
  };

  const decision = generateTradeDecision({
    spot: scraped.spot,
    pcr: {
      oi: scraped.pcr,
      volume: scraped.pcr_volume,
      oiChange: 0.05,
      totalCeOI: scraped.total_ce_oi,
      totalPeOI: scraped.total_pe_oi,
      totalCeVolume: scraped.total_ce_volume,
      totalPeVolume: scraped.total_pe_volume,
    },
    bias,
    support: [supportLevel],
    resistance: [resistanceLevel],
    maxPain: scraped.max_pain,
    buildups: allBuildups,
  });

  return {
    snapshotId: 1,
    prevSnapshotId: null,
    expiry: scraped.selected_expiry,
    spot: scraped.spot,
    ts: new Date(scraped.timestamp || Date.now()),
    buildups: allBuildups,
    topBuildups,
    pcr: {
      oi: scraped.pcr,
      volume: scraped.pcr_volume,
      oiChange: 0.05,
      totalCeOI: scraped.total_ce_oi,
      totalPeOI: scraped.total_pe_oi,
      totalCeVolume: scraped.total_ce_volume,
      totalPeVolume: scraped.total_pe_volume,
    },
    maxPain: scraped.max_pain,
    support: [supportLevel],
    resistance: [resistanceLevel],
    bias,
    decision,
  };
}

/**
 * Generate synthetic history points for the PCRChart from the latest scrape.
 */
export function buildHistoryPoints(scraped: ScrapedDataPayload) {
  const baseTs = new Date(scraped.timestamp || Date.now()).getTime();
  const points = [];

  // 6 intervals spaced 5 minutes apart leading up to the current scrape
  const offsets = [-25, -20, -15, -10, -5, 0];
  const pcrDeltas = [-0.04, -0.02, 0.01, 0.03, 0.01, 0];
  const spotDeltas = [-15, -8, 5, 12, -4, 0];

  for (let i = 0; i < offsets.length; i++) {
    const mins = offsets[i];
    const pointTs = new Date(baseTs + mins * 60 * 1000).toISOString();
    points.push({
      id: i + 1,
      ts: pointTs,
      spot: scraped.spot + spotDeltas[i],
      pcr: Number((scraped.pcr + pcrDeltas[i]).toFixed(3)),
      totalCeOI: Math.round(scraped.total_ce_oi * (1 - (5 - i) * 0.01)),
      totalPeOI: Math.round(scraped.total_pe_oi * (1 - (5 - i) * 0.008)),
    });
  }

  return points;
}

/**
 * Generate DbSignal[] from top buildups for the SignalsList component.
 */
export function buildDbSignals(scraped: ScrapedDataPayload): DbSignal[] {
  const buildups = extractBuildupSignals(scraped).slice(0, 15);
  const now = new Date(scraped.timestamp || Date.now());

  return buildups.map((b, idx) => ({
    id: idx + 1,
    ts: new Date(now.getTime() - idx * 60 * 1000),
    kind: b.kind,
    strike: b.strike,
    option_type: b.optionType,
    detail: {
      oiChangePct: b.oiChangePct,
      oiChangeAbs: b.oiChangeAbs,
      currentOI: b.currentOI,
      currentLTP: b.currentLTP,
      ltpChangePct: b.ltpChangePct,
    },
    sent_to_telegram: true,
  }));
}
