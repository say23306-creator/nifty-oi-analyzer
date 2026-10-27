'use client';

// =============================================================================
// app/dashboard/components/OIInterpretationPanel.tsx
// =============================================================================
// Displays the per-strike OI interpretation matrix for CE and PE signals.
// Uses the exact Price x OI → Option View + Nifty 50 Equity View logic from
// lib/analysis/interpretation.ts.
// =============================================================================

import React, { useMemo, useState } from 'react';
import type { BuildupSignal } from '@/lib/analysis/types';
import {
  interpretAll,
  aggregateEquityBias,
  viewLabelBg,
  viewLabelText,
  type InterpretedSignal,
  type ViewLabel,
} from '@/lib/analysis/interpretation';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ArrowPair({ priceUp, oiUp }: { priceUp: boolean; oiUp: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-sm">
      <span
        title={`Price ${priceUp ? 'Up' : 'Down'}`}
        className={priceUp ? 'text-emerald-400' : 'text-rose-400'}
      >
        {priceUp ? '▲' : '▼'}
      </span>
      <span
        title={`OI ${oiUp ? 'Up' : 'Down'}`}
        className={oiUp ? 'text-emerald-400' : 'text-rose-400'}
      >
        {oiUp ? '▲' : '▼'}
      </span>
    </span>
  );
}

function ViewBadge({ label }: { label: ViewLabel | 'NEUTRAL' }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${viewLabelBg(label)}`}>
      {viewLabelText(label)}
    </span>
  );
}

function SignalCard({ sig }: { sig: InterpretedSignal }) {
  const isCE = sig.optionType === 'CE';

  // Border accent color per equity view
  const borderAccent =
    sig.equityView === 'STRONG_BULLISH' ? 'border-l-emerald-300' :
    sig.equityView === 'BULLISH'        ? 'border-l-emerald-500' :
    sig.equityView === 'STRONG_BEARISH' ? 'border-l-rose-300'   :
    sig.equityView === 'BEARISH'        ? 'border-l-rose-500'   :
    'border-l-amber-500';

  const formatOI = (n: number) => {
    if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000)   return `${(n / 100000).toFixed(2)} L`;
    if (n >= 1000)     return `${(n / 1000).toFixed(1)} k`;
    return n.toLocaleString('en-IN');
  };

  return (
    <div className={`bg-slate-950/70 border border-slate-800 border-l-2 ${borderAccent} rounded-lg p-3 hover:border-slate-700 transition-colors`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {/* Instrument badge */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
            isCE
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}>
            {isCE ? 'CALL (CE)' : 'PUT (PE)'}
          </span>
          <span className="font-mono font-bold text-white text-sm">{sig.strike}</span>
        </div>
        <ArrowPair priceUp={sig.priceUp} oiUp={sig.oiUp} />
      </div>

      {/* Observation */}
      <p className="text-[11px] font-semibold text-slate-300 mb-2 font-mono uppercase tracking-wider">
        {sig.observation}
      </p>

      {/* View matrix */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="text-center">
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Option View</p>
          <ViewBadge label={sig.optionView} />
        </div>
        <div className="text-center">
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Nifty 50</p>
          <ViewBadge label={sig.equityView} />
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800/60">
        <span>
          LTP: <span className={sig.ltpChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {sig.ltpChangePct >= 0 ? '+' : ''}{sig.ltpChangePct.toFixed(2)}%
          </span>
        </span>
        <span>
          OI Δ: <span className={sig.oiChangeAbs > 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {sig.oiChangeAbs > 0 ? '+' : ''}{formatOI(sig.oiChangeAbs)}
          </span>
        </span>
        <span className="text-slate-500">
          OI: {formatOI(sig.currentOI)}
        </span>
      </div>
    </div>
  );
}

function EquityBiasBar({ signals }: { signals: InterpretedSignal[] }) {
  const bias = aggregateEquityBias(signals);
  if (signals.length === 0) return null;

  const total = bias.strongBullish + bias.bullish + bias.bearish + bias.strongBearish;
  if (total === 0) return null;

  const sBullPct  = Math.round((bias.strongBullish / signals.length) * 100);
  const bullPct   = Math.round((bias.bullish        / signals.length) * 100);
  const bearPct   = Math.round((bias.bearish        / signals.length) * 100);
  const sBearPct  = Math.round((bias.strongBearish  / signals.length) * 100);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">Aggregate Nifty 50 Equity Bias</h3>
          <p className="text-[11px] text-slate-400">Combined signal from CE + PE interpretation matrix</p>
        </div>
        <div className="text-right">
          <ViewBadge label={bias.label} />
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            Net score: {bias.netBullishScore > 0 ? '+' : ''}{bias.netBullishScore} / {signals.length} signals
          </p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-3 w-full rounded-full overflow-hidden flex gap-px bg-slate-800">
        {sBullPct  > 0 && <div className="bg-emerald-300 h-full transition-all" style={{ width: `${sBullPct}%` }} title={`Str. Bullish: ${bias.strongBullish}`} />}
        {bullPct   > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${bullPct}%`  }} title={`Bullish: ${bias.bullish}`} />}
        {bearPct   > 0 && <div className="bg-rose-500   h-full transition-all" style={{ width: `${bearPct}%`  }} title={`Bearish: ${bias.bearish}`} />}
        {sBearPct  > 0 && <div className="bg-rose-300   h-full transition-all" style={{ width: `${sBearPct}%` }} title={`Str. Bearish: ${bias.strongBearish}`} />}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] font-mono">
        {bias.strongBullish > 0 && <span className="text-emerald-300">▲▲ Str.Bullish: {bias.strongBullish}</span>}
        {bias.bullish       > 0 && <span className="text-emerald-400">▲ Bullish: {bias.bullish}</span>}
        {bias.bearish       > 0 && <span className="text-rose-400">▼ Bearish: {bias.bearish}</span>}
        {bias.strongBearish > 0 && <span className="text-rose-300">▼▼ Str.Bearish: {bias.strongBearish}</span>}
      </div>
    </div>
  );
}

// ─── Reference matrix legend (always visible) ─────────────────────────────────

function ReferenceMatrix() {
  const rows = [
    // CE rows
    { type: 'CE', priceUp: true,  oiUp: true,  obs: 'Long Build Up',  opt: 'BULLISH',       eq: 'BULLISH'       },
    { type: 'CE', priceUp: false, oiUp: false, obs: 'Long Covering',  opt: 'STRONG_BEARISH', eq: 'STRONG_BEARISH' },
    { type: 'CE', priceUp: false, oiUp: true,  obs: 'Short Build Up', opt: 'BEARISH',        eq: 'BEARISH'       },
    { type: 'CE', priceUp: true,  oiUp: false, obs: 'Short Covering', opt: 'STRONG_BULLISH', eq: 'STRONG_BULLISH' },
    // PE rows
    { type: 'PE', priceUp: true,  oiUp: true,  obs: 'Long Build Up',  opt: 'BULLISH',        eq: 'BEARISH'       },
    { type: 'PE', priceUp: false, oiUp: false, obs: 'Long Covering',  opt: 'STRONG_BEARISH', eq: 'STRONG_BULLISH' },
    { type: 'PE', priceUp: false, oiUp: true,  obs: 'Short Build Up', opt: 'BEARISH',        eq: 'BULLISH'       },
    { type: 'PE', priceUp: true,  oiUp: false, obs: 'Short Covering', opt: 'STRONG_BULLISH', eq: 'STRONG_BEARISH' },
  ] as const;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm mb-4">
      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span>📋</span>
        <span>OI Interpretation Reference Matrix</span>
        <span className="text-[10px] font-normal text-slate-400 font-mono">Nifty 50 Option Chain</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono border-collapse">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="py-1.5 px-2 text-left">Instrument</th>
              <th className="py-1.5 px-2 text-center">Price</th>
              <th className="py-1.5 px-2 text-center">OI</th>
              <th className="py-1.5 px-2 text-left">Observation</th>
              <th className="py-1.5 px-2 text-center">Option View</th>
              <th className="py-1.5 px-2 text-center">Nifty 50 View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {rows.map((r, i) => (
              <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${i === 3 ? 'border-b-2 border-slate-700' : ''}`}>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    r.type === 'CE'
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {r.type === 'CE' ? 'CALL' : 'PUT'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={r.priceUp ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {r.priceUp ? '▲' : '▼'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={r.oiUp ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {r.oiUp ? '▲' : '▼'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-slate-300">{r.obs}</td>
                <td className="py-1.5 px-2 text-center">
                  <ViewBadge label={r.opt as ViewLabel} />
                </td>
                <td className="py-1.5 px-2 text-center">
                  <ViewBadge label={r.eq as ViewLabel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500 mt-2 italic">
        ⚠️ PUT option equity view is always inverted — put buyers profit when Nifty falls.
      </p>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface OIInterpretationPanelProps {
  buildups: BuildupSignal[];
}

type FilterMode = 'ALL' | 'CE' | 'PE';

export default function OIInterpretationPanel({ buildups }: OIInterpretationPanelProps) {
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [showMatrix, setShowMatrix] = useState(false);
  const [sortBy, setSortBy] = useState<'oi' | 'strike'>('oi');

  const interpreted = useMemo(() => {
    const all = interpretAll(buildups, filter);
    if (sortBy === 'oi') {
      return [...all].sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs));
    }
    return [...all].sort((a, b) => a.strike - b.strike);
  }, [buildups, filter, sortBy]);

  const allInterpreted = useMemo(() => interpretAll(buildups, 'ALL'), [buildups]);

  const counts = useMemo(() => {
    const ce = buildups.filter((b) => b.optionType === 'CE').length;
    const pe = buildups.filter((b) => b.optionType === 'PE').length;
    return { ce, pe, all: buildups.length };
  }, [buildups]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Panel header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>⚡</span>
            <span>OI Signal Interpretation</span>
            <span className="text-xs font-normal text-slate-400 font-mono">
              Nifty 50 — Price × OI Matrix
            </span>
          </h2>
          <p className="text-[11px] text-slate-400">
            Each strike classified by Price & OI direction → Option View & Nifty 50 Equity View
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'oi' | 'strike')}
            className="text-xs bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-2 py-1.5 cursor-pointer font-mono"
          >
            <option value="oi">Sort: OI Change</option>
            <option value="strike">Sort: Strike</option>
          </select>

          {/* Matrix toggle */}
          <button
            onClick={() => setShowMatrix(!showMatrix)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition font-mono cursor-pointer"
          >
            {showMatrix ? 'Hide' : 'Show'} Matrix
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Reference matrix (collapsible) */}
        {showMatrix && <ReferenceMatrix />}

        {/* Aggregate equity bias bar */}
        <EquityBiasBar signals={allInterpreted} />

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 bg-slate-950/80 p-1 rounded-lg border border-slate-800 w-fit">
          {(['ALL', 'CE', 'PE'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer font-mono ${
                filter === f
                  ? f === 'CE'
                    ? 'bg-cyan-500 text-slate-950'
                    : f === 'PE'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {f === 'ALL' ? `ALL (${counts.all})` : f === 'CE' ? `CALLS (${counts.ce})` : `PUTS (${counts.pe})`}
            </button>
          ))}
        </div>

        {/* Signal cards grid */}
        {interpreted.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm font-mono">
            <p>No significant OI signals detected for this filter.</p>
            <p className="text-xs mt-1">Signals appear once OI change exceeds threshold.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {interpreted.map((sig) => (
              <SignalCard
                key={`${sig.strike}-${sig.optionType}`}
                sig={sig}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
