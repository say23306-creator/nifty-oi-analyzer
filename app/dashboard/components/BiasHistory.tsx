'use client';

import React from 'react';
import type { BiasScore, OILevel } from '@/lib/analysis/types';

interface BiasHistoryProps {
  bias?: BiasScore | null;
  support?: OILevel[];
  resistance?: OILevel[];
  maxPain?: number;
  spot?: number;
}

export default function BiasHistory({
  bias,
  support = [],
  resistance = [],
  maxPain,
  spot,
}: BiasHistoryProps) {
  if (!bias) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-slate-500 text-sm">
        Awaiting analysis computation...
      </div>
    );
  }

  const { direction, confidence, reasons } = bias;

  const config = {
    BULLISH: {
      badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      barBg: 'bg-emerald-500',
      icon: '🟢',
      summary: 'Institutional flows indicate upward price momentum',
    },
    BEARISH: {
      badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
      barBg: 'bg-rose-500',
      icon: '🔴',
      summary: 'Call writing and put unwinding signaling downward pressure',
    },
    NEUTRAL: {
      badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      barBg: 'bg-amber-500',
      icon: '⚪',
      summary: 'Balanced call/put activity without decisive direction',
    },
  }[direction] || {
    badgeBg: 'bg-slate-700 text-slate-300 border-slate-600',
    barBg: 'bg-slate-500',
    icon: '⚪',
    summary: '',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white">Institutional Bias Engine</h2>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold border font-mono flex items-center gap-1.5 ${config.badgeBg}`}
          >
            <span>{config.icon}</span>
            <span>{direction}</span>
            <span className="opacity-80">({confidence}%)</span>
          </span>
        </div>

        {/* Confidence Meter */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
            <span>Confidence Index</span>
            <span>{confidence}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className={`h-full ${config.barBg} transition-all duration-500`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">{config.summary}</p>
        </div>

        {/* Breakdown Reasons */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">
            Scoring Catalysts
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
            {reasons.length > 0 ? (
              reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 bg-slate-950/40 p-1.5 rounded border border-slate-800/50">
                  <span className="text-cyan-400">•</span>
                  <span>{r}</span>
                </li>
              ))
            ) : (
              <li className="text-slate-500">No decisive buildup triggers in this interval</li>
            )}
          </ul>
        </div>
      </div>

      {/* Levels Summary Card */}
      <div className="pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs font-mono">
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <span className="text-[10px] text-emerald-400 font-semibold block uppercase">Key Support</span>
          <span className="text-sm font-bold text-white">
            {support[0]?.strike ?? '-'}
          </span>
        </div>
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <span className="text-[10px] text-indigo-400 font-semibold block uppercase">Max Pain</span>
          <span className="text-sm font-bold text-white">{maxPain ?? '-'}</span>
        </div>
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <span className="text-[10px] text-rose-400 font-semibold block uppercase">Key Resistance</span>
          <span className="text-sm font-bold text-white">
            {resistance[0]?.strike ?? '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
