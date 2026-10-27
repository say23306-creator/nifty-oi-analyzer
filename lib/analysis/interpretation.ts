// =============================================================================
// lib/analysis/interpretation.ts — OI Chain Signal Interpretation Engine
// =============================================================================
//
// Implements the exact two-dimensional matrix from the reference table:
//
//  INSTRUMENT    PRICE   OI   OBSERVATION       OPTION VIEW    EQUITY VIEW
//  ──────────────────────────────────────────────────────────────────────────
//  CALL OPTION    UP     UP   Long Build Up      BULLISH        BULLISH
//  CALL OPTION   DOWN   DOWN  Long Covering      STR. BEARISH   STR. BEARISH
//  CALL OPTION   DOWN    UP   Short Build Up     BEARISH        BEARISH
//  CALL OPTION    UP    DOWN  Short Covering     STR. BULLISH   STR. BULLISH
//  ──────────────────────────────────────────────────────────────────────────
//  PUT OPTION     UP     UP   Long Build Up      BULLISH        BEARISH    (INVERTED)
//  PUT OPTION   DOWN   DOWN   Long Covering      STR. BEARISH   STR. BULLISH (INVERTED)
//  PUT OPTION   DOWN    UP    Short Build Up     BEARISH        BULLISH    (INVERTED)
//  PUT OPTION    UP    DOWN   Short Covering     STR. BULLISH   STR. BEARISH  (INVERTED)
//  ──────────────────────────────────────────────────────────────────────────
//
// Key insight: For PUT OPTIONS the Stock/Equity view is ALWAYS the opposite
// of the Option view, because put buyers profit when the index falls.
//
// =============================================================================

import type { BuildupKind, BuildupSignal, OptionType } from './types';

// ─── View labels ─────────────────────────────────────────────────────────────

export type ViewLabel =
  | 'BULLISH'
  | 'STRONG_BULLISH'
  | 'BEARISH'
  | 'STRONG_BEARISH'
  | 'NEUTRAL';

export interface InterpretedSignal {
  /** Strike price */
  strike: number;
  /** CE or PE */
  optionType: OptionType;
  /** Price direction: true = up, false = down */
  priceUp: boolean;
  /** OI direction: true = up, false = down */
  oiUp: boolean;
  /** Raw buildup kind */
  kind: BuildupKind;
  /** Human-readable observation label */
  observation: string;
  /** View from the OPTION's own perspective */
  optionView: ViewLabel;
  /** View from the Nifty 50 (stock/equity) perspective */
  equityView: ViewLabel;
  /** OI % change */
  oiChangePct: number;
  /** LTP % change */
  ltpChangePct: number;
  /** Absolute OI change */
  oiChangeAbs: number;
  /** Current OI */
  currentOI: number;
  /** Current LTP */
  currentLTP: number;
}

// ─── Observation strings ──────────────────────────────────────────────────────

const OBSERVATION: Record<BuildupKind, string> = {
  LONG_BUILDUP:   'Long Build Up',
  LONG_UNWINDING: 'Long Covering',
  SHORT_BUILDUP:  'Short Build Up',
  SHORT_COVERING: 'Short Covering',
};

// ─── CE view maps ─────────────────────────────────────────────────────────────
// For Call Options: Option view === Stock/Equity view

const CE_OPTION_VIEW: Record<BuildupKind, ViewLabel> = {
  LONG_BUILDUP:   'BULLISH',
  LONG_UNWINDING: 'STRONG_BEARISH',
  SHORT_BUILDUP:  'BEARISH',
  SHORT_COVERING: 'STRONG_BULLISH',
};

const CE_EQUITY_VIEW: Record<BuildupKind, ViewLabel> = {
  LONG_BUILDUP:   'BULLISH',
  LONG_UNWINDING: 'STRONG_BEARISH',
  SHORT_BUILDUP:  'BEARISH',
  SHORT_COVERING: 'STRONG_BULLISH',
};

// ─── PE view maps ─────────────────────────────────────────────────────────────
// For Put Options: Stock/Equity view is INVERTED relative to Option view

const PE_OPTION_VIEW: Record<BuildupKind, ViewLabel> = {
  LONG_BUILDUP:   'BULLISH',
  LONG_UNWINDING: 'STRONG_BEARISH',
  SHORT_BUILDUP:  'BEARISH',
  SHORT_COVERING: 'STRONG_BULLISH',
};

const PE_EQUITY_VIEW: Record<BuildupKind, ViewLabel> = {
  // Put buyers are net bearish on Nifty -> equity view inverts
  LONG_BUILDUP:   'BEARISH',         // Put longs building up  = Nifty bearish
  LONG_UNWINDING: 'STRONG_BULLISH',  // Put longs exiting      = bearish pressure easing
  SHORT_BUILDUP:  'BULLISH',         // Put sellers (short PE) = Nifty bullish
  SHORT_COVERING: 'STRONG_BEARISH',  // Put shorts covering    = bullish thesis unwinding
};

// ─── Main interpreter ─────────────────────────────────────────────────────────

/**
 * Interpret a single BuildupSignal through the OI chain view matrix.
 */
export function interpretSignal(signal: BuildupSignal): InterpretedSignal {
  const isCE = signal.optionType === 'CE';

  const optionView = isCE
    ? CE_OPTION_VIEW[signal.kind]
    : PE_OPTION_VIEW[signal.kind];

  const equityView = isCE
    ? CE_EQUITY_VIEW[signal.kind]
    : PE_EQUITY_VIEW[signal.kind];

  return {
    strike:       signal.strike,
    optionType:   signal.optionType,
    priceUp:      signal.ltpChangePct > 0,
    oiUp:         signal.oiChangeAbs > 0,
    kind:         signal.kind,
    observation:  OBSERVATION[signal.kind],
    optionView,
    equityView,
    oiChangePct:  signal.oiChangePct,
    ltpChangePct: signal.ltpChangePct,
    oiChangeAbs:  signal.oiChangeAbs,
    currentOI:    signal.currentOI,
    currentLTP:   signal.currentLTP,
  };
}

/**
 * Interpret all buildups. Optionally filter to CE | PE | ALL.
 */
export function interpretAll(
  signals: BuildupSignal[],
  filter?: 'CE' | 'PE' | 'ALL'
): InterpretedSignal[] {
  const src = filter && filter !== 'ALL'
    ? signals.filter((s) => s.optionType === filter)
    : signals;
  return src.map(interpretSignal);
}

// ─── Aggregate equity bias ────────────────────────────────────────────────────

export interface AggregateEquityBias {
  netBullishScore: number;
  total: number;
  strongBullish: number;
  bullish: number;
  bearish: number;
  strongBearish: number;
  label: ViewLabel | 'NEUTRAL';
}

const EQUITY_WEIGHT: Record<ViewLabel, number> = {
  STRONG_BULLISH: +2,
  BULLISH:        +1,
  NEUTRAL:         0,
  BEARISH:        -1,
  STRONG_BEARISH: -2,
};

export function aggregateEquityBias(signals: InterpretedSignal[]): AggregateEquityBias {
  let net = 0;
  let strongBullish = 0, bullish = 0, bearish = 0, strongBearish = 0;

  for (const s of signals) {
    net += EQUITY_WEIGHT[s.equityView];
    if (s.equityView === 'STRONG_BULLISH') strongBullish++;
    else if (s.equityView === 'BULLISH')   bullish++;
    else if (s.equityView === 'BEARISH')   bearish++;
    else if (s.equityView === 'STRONG_BEARISH') strongBearish++;
  }

  let label: ViewLabel | 'NEUTRAL';
  if (net >= 4)       label = 'STRONG_BULLISH';
  else if (net >= 1)  label = 'BULLISH';
  else if (net <= -4) label = 'STRONG_BEARISH';
  else if (net <= -1) label = 'BEARISH';
  else                label = 'NEUTRAL';

  return { netBullishScore: net, total: signals.length, strongBullish, bullish, bearish, strongBearish, label };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function viewLabelColor(label: ViewLabel | 'NEUTRAL'): string {
  switch (label) {
    case 'STRONG_BULLISH': return 'text-emerald-300';
    case 'BULLISH':        return 'text-emerald-400';
    case 'STRONG_BEARISH': return 'text-rose-300';
    case 'BEARISH':        return 'text-rose-400';
    default:               return 'text-amber-400';
  }
}

export function viewLabelBg(label: ViewLabel | 'NEUTRAL'): string {
  switch (label) {
    case 'STRONG_BULLISH': return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
    case 'BULLISH':        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    case 'STRONG_BEARISH': return 'bg-rose-500/20 border-rose-500/40 text-rose-300';
    case 'BEARISH':        return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
    default:               return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
  }
}

export function viewLabelText(label: ViewLabel | 'NEUTRAL'): string {
  switch (label) {
    case 'STRONG_BULLISH': return 'STR. BULLISH';
    case 'BULLISH':        return 'BULLISH';
    case 'STRONG_BEARISH': return 'STR. BEARISH';
    case 'BEARISH':        return 'BEARISH';
    default:               return 'NEUTRAL';
  }
}
