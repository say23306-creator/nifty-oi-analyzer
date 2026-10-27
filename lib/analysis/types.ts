// =============================================================================
// lib/analysis/types.ts — Shared types for the analysis engine
// =============================================================================

export type OptionType = 'CE' | 'PE';

export type BuildupKind =
  | 'LONG_BUILDUP'
  | 'SHORT_BUILDUP'
  | 'SHORT_COVERING'
  | 'LONG_UNWINDING';

export type BiasDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface BuildupSignal {
  strike: number;
  optionType: OptionType;
  kind: BuildupKind;
  /** % change in OI over the window */
  oiChangePct: number;
  /** Absolute OI change */
  oiChangeAbs: number;
  /** % change in LTP */
  ltpChangePct: number;
  currentOI: number;
  currentLTP: number;
}

export interface OILevel {
  strike: number;
  oi: number;
  type: OptionType;
}

export interface PCRData {
  /** OI-based PCR = total PE OI / total CE OI */
  oi: number;
  /** Volume-based PCR */
  volume: number;
  /** Change in OI-PCR vs previous snapshot */
  oiChange: number;
  totalCeOI: number;
  totalPeOI: number;
  totalCeVolume: number;
  totalPeVolume: number;
}

export interface BiasScore {
  direction: BiasDirection;
  /** 0–100 */
  confidence: number;
  /** Human-readable explanation */
  reasons: string[];
}

export interface AnalysisResult {
  snapshotId: number;
  prevSnapshotId: number | null;
  expiry: string;
  spot: number;
  ts: Date;

  // Per-strike buildups
  buildups: BuildupSignal[];
  /** Top buildups sorted by absolute OI change */
  topBuildups: BuildupSignal[];

  // Aggregates
  pcr: PCRData;
  maxPain: number;
  support: OILevel[];   // Top PE strikes by OI
  resistance: OILevel[]; // Top CE strikes by OI

  // Overall bias
  bias: BiasScore;
}

export interface StrikeComparison {
  strike: number;
  type: OptionType;
  prevLTP: number | null;
  currLTP: number | null;
  prevOI: number | null;
  currOI: number | null;
}
