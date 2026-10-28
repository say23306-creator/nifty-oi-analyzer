'use client';

// =============================================================================
// app/dashboard/components/DecisionEngineCard.tsx
// =============================================================================
// Displays the Institutional 5-Step Derivative Decision Making Framework:
// Regime, S/R Battleground, Trapped Sellers, Option Strategy, and Invalidation.
// =============================================================================

import React, { useState } from 'react';
import type { TradeDecision } from '@/lib/analysis/types';

interface DecisionEngineCardProps {
  decision?: TradeDecision;
  spot?: number;
}

export default function DecisionEngineCard({ decision, spot }: DecisionEngineCardProps) {
  const [expanded, setExpanded] = useState(true);

  if (!decision) return null;

  const {
    regime,
    bias,
    confidence,
    actionHeadline,
    actionSummary,
    supportWall,
    resistanceWall,
    invalidationLevel,
    targetRange,
    recommendedStrategy,
    strategyRationale,
    decisionSteps,
    trappedAlerts,
  } = decision;

  // Regime styling
  const regimeStyles: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    TRENDING_BULLISH: {
      bg: 'bg-emerald-950/20',
      border: 'border-emerald-500/30',
      text: 'text-emerald-300',
      badge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    },
    TRENDING_BEARISH: {
      bg: 'bg-rose-950/20',
      border: 'border-rose-500/30',
      text: 'text-rose-300',
      badge: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
    },
    OVERBOUGHT_EXHAUSTION: {
      bg: 'bg-amber-950/20',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      badge: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    },
    OVERSOLD_SQUEEZE_SETUP: {
      bg: 'bg-cyan-950/20',
      border: 'border-cyan-500/30',
      text: 'text-cyan-300',
      badge: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    },
    RANGEBOUND: {
      bg: 'bg-indigo-950/20',
      border: 'border-indigo-500/30',
      text: 'text-indigo-300',
      badge: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
    },
  };

  const currentStyle = regimeStyles[regime] || regimeStyles.RANGEBOUND;

  return (
    <div className={`rounded-xl border ${currentStyle.border} ${currentStyle.bg} p-3.5 sm:p-4 backdrop-blur-md shadow-lg transition-all`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white font-mono flex items-center gap-2">
            <span>PRO TRADER DECISION ENGINE</span>
            <span className="text-slate-500 text-[10px] font-normal">| 5-Stage Framework</span>
          </h2>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${currentStyle.badge}`}>
            {regime.replace(/_/g, ' ')}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Conviction: <span className="font-bold text-white">{confidence}%</span> ({bias})
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-900/80 border border-slate-800 transition cursor-pointer"
        >
          {expanded ? '▲ Hide Details' : '▼ View Plan'}
        </button>
      </div>

      {/* Main Action Banner */}
      <div className="mt-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 border-t border-slate-800/60 pt-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-xs">🎯 ACTION:</span>
            <span className="text-sm font-bold text-white tracking-tight">{actionHeadline}</span>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-3xl">
            {actionSummary}
          </p>
        </div>

        {/* Quick Corridor Snapshot */}
        <div className="flex items-center gap-3 font-mono text-xs bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800 shrink-0">
          <div>
            <span className="text-slate-500 text-[10px] block">PUT FLOOR</span>
            <span className="font-bold text-emerald-400">{supportWall}</span>
          </div>
          <span className="text-slate-600">→</span>
          <div>
            <span className="text-slate-500 text-[10px] block">SPOT</span>
            <span className="font-bold text-white">{spot?.toFixed(1) ?? '—'}</span>
          </div>
          <span className="text-slate-600">→</span>
          <div>
            <span className="text-slate-500 text-[10px] block">CALL WALL</span>
            <span className="font-bold text-rose-400">{resistanceWall}</span>
          </div>
        </div>
      </div>

      {/* Trapped Writers Alert Banner (if any) */}
      {trappedAlerts.length > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2">
          <span className="text-sm">⚠️</span>
          <div>
            <span className="font-bold text-rose-200">INSTITUTIONAL SQUEEZE RADAR: </span>
            <span>{trappedAlerts[0].description}</span>
          </div>
        </div>
      )}

      {/* Expanded 5-Step Process Breakdown */}
      {expanded && (
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          {/* Left: Recommended Strategy & Rationale */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-cyan-400">⚡</span>
                <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                  Recommended Strategy Structure
                </span>
              </div>
              <p className="text-emerald-300 font-bold text-xs mb-1">
                {recommendedStrategy}
              </p>
              <p className="text-[11px] text-slate-400 font-sans leading-normal">
                {strategyRationale}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-500">Target Range: </span>
                <span className="text-white font-bold">{targetRange[0]} – {targetRange[1]}</span>
              </div>
              <div>
                <span className="text-slate-500">Stop-Loss / Invalidation: </span>
                <span className="text-rose-400 font-bold">{invalidationLevel}</span>
              </div>
            </div>
          </div>

          {/* Right: Step-by-Step Execution Checklist */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-indigo-400">📋</span>
              <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                Execution Decision Checklist
              </span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
              {decisionSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-cyan-400 font-mono font-bold shrink-0">✓</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
