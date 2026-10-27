'use client';

import React, { useState } from 'react';
import type { DbSignal } from '@/lib/db/queries';

interface PaperSummary {
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
}

interface SignalsListProps {
  signals: DbSignal[];
  paperSummary?: PaperSummary | null;
}

export default function SignalsList({ signals, paperSummary }: SignalsListProps) {
  const [filter, setFilter] = useState<string>('ALL');

  const filteredSignals = signals.filter((s) => {
    if (filter === 'ALL') return true;
    if (filter === 'BUILDUPS') {
      return (
        s.kind === 'LONG_BUILDUP' ||
        s.kind === 'SHORT_BUILDUP' ||
        s.kind === 'SHORT_COVERING' ||
        s.kind === 'LONG_UNWINDING'
      );
    }
    if (filter === 'BIAS') return s.kind.includes('BIAS');
    return s.kind === filter;
  });

  const getSignalBadge = (kind: string) => {
    switch (kind) {
      case 'LONG_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            LONG BUILDUP
          </span>
        );
      case 'SHORT_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            SHORT BUILDUP
          </span>
        );
      case 'SHORT_COVERING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            SHORT COVERING
          </span>
        );
      case 'LONG_UNWINDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            LONG UNWINDING
          </span>
        );
      case 'BIAS_CHANGE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            BIAS CHANGE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {kind}
          </span>
        );
    }
  };

  const formatIST = (dateStr: Date | string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Signals & Telegram Alerts Feed</span>
            <span className="text-xs font-normal text-slate-400 font-mono">
              ({filteredSignals.length} events)
            </span>
          </h2>
          <p className="text-xs text-slate-400">Institutional signals dispatched to Telegram</p>
        </div>

        {/* Paper trading summary pill */}
        {paperSummary && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Paper Trading:</span>
            <span className="text-emerald-400 font-bold">{paperSummary.wins}W</span>
            <span className="text-slate-600">/</span>
            <span className="text-rose-400 font-bold">{paperSummary.losses}L</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold text-[10px]">
              {paperSummary.winRate}% Win Rate
            </span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 mb-3 text-xs border-b border-slate-800/80 pb-2">
        {['ALL', 'BUILDUPS', 'BIAS'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              filter === f
                ? 'bg-slate-800 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Signals List */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1 font-mono text-xs">
        {filteredSignals.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No signals generated yet in this session.
          </div>
        ) : (
          filteredSignals.map((sig) => (
            <div
              key={sig.id}
              className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                {getSignalBadge(sig.kind)}
                {sig.strike && (
                  <span className="font-bold text-white">
                    {sig.strike} {sig.option_type}
                  </span>
                )}
                {/* Plain English meaning */}
                <span className="text-[11px] text-slate-300 font-sans">
                  {sig.kind === 'LONG_BUILDUP' && sig.option_type === 'CE' && '📈 Buyers pushing market UP'}
                  {sig.kind === 'LONG_BUILDUP' && sig.option_type === 'PE' && '📉 Put Buyers hedging / expecting DOWN'}
                  {sig.kind === 'SHORT_BUILDUP' && sig.option_type === 'CE' && '🛑 Strong resistance / Call Sellers blocking'}
                  {sig.kind === 'SHORT_BUILDUP' && sig.option_type === 'PE' && '🛡️ Strong support / Put Sellers defending'}
                  {sig.kind === 'SHORT_COVERING' && '⚡ Sellers exiting (Breakout expected)'}
                  {sig.kind === 'LONG_UNWINDING' && '💨 Buyers taking profit / leaving'}
                </span>
                {sig.detail && typeof sig.detail === 'object' && (
                  <span className="text-slate-400 text-[10px]">
                    {'oiChangePct' in sig.detail
                      ? `OI Δ: ${Number(sig.detail.oiChangePct).toFixed(1)}%`
                      : 'direction' in sig.detail
                      ? `Bias: ${sig.detail.direction}`
                      : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-slate-400 text-[11px] shrink-0">
                <span>{formatIST(sig.ts)}</span>
                <span
                  title={sig.sent_to_telegram ? 'Sent to Telegram' : 'Logged'}
                  className={sig.sent_to_telegram ? 'text-cyan-400' : 'text-slate-600'}
                >
                  {sig.sent_to_telegram ? '✈️ Sent' : '📝 Logged'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
