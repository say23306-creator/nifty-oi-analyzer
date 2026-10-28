'use client';

import React, { useState, useMemo } from 'react';
import type { DbChainRow } from '@/lib/db/queries';
import type { BuildupSignal, OILevel } from '@/lib/analysis/types';

interface ChainTableProps {
  rows: DbChainRow[];
  spot: number;
  maxPain?: number;
  support?: OILevel[];
  resistance?: OILevel[];
  buildups?: BuildupSignal[];
}

interface StrikeRow {
  strike: number;
  ce?: DbChainRow;
  pe?: DbChainRow;
  ceBuildup?: BuildupSignal;
  peBuildup?: BuildupSignal;
}

export default function ChainTable({
  rows,
  spot,
  maxPain,
  support = [],
  resistance = [],
  buildups = [],
}: ChainTableProps) {
  const [strikeRange, setStrikeRange] = useState<number>(10); // ±10 strikes from ATM

  // Group by strike
  const { strikeList, strikeRows, maxOI, atmStrike } = useMemo(() => {
    const map = new Map<number, StrikeRow>();
    const buildupMap = new Map<string, BuildupSignal>();

    for (const b of buildups) {
      buildupMap.set(`${b.strike}_${b.optionType}`, b);
    }

    let highestOI = 0;

    for (const r of rows) {
      if (!map.has(r.strike)) {
        map.set(r.strike, { strike: r.strike });
      }
      const entry = map.get(r.strike)!;
      if (r.type === 'CE') {
        entry.ce = r;
        entry.ceBuildup = buildupMap.get(`${r.strike}_CE`);
      } else {
        entry.pe = r;
        entry.peBuildup = buildupMap.get(`${r.strike}_PE`);
      }
      if ((r.oi ?? 0) > highestOI) highestOI = r.oi ?? 0;
    }

    const allStrikes = Array.from(map.keys()).sort((a, b) => a - b);
    let nearestAtm = allStrikes[0] || 0;
    let minDiff = Infinity;
    for (const s of allStrikes) {
      const diff = Math.abs(s - spot);
      if (diff < minDiff) {
        minDiff = diff;
        nearestAtm = s;
      }
    }

    return {
      strikeList: allStrikes,
      strikeRows: map,
      maxOI: highestOI || 1,
      atmStrike: nearestAtm,
    };
  }, [rows, spot, buildups]);

  // Filter strikes according to selected range
  const visibleStrikes = useMemo(() => {
    if (strikeRange === 0) return strikeList; // all
    const atmIndex = strikeList.indexOf(atmStrike);
    if (atmIndex === -1) return strikeList;
    const start = Math.max(0, atmIndex - strikeRange);
    const end = Math.min(strikeList.length, atmIndex + strikeRange + 1);
    return strikeList.slice(start, end);
  }, [strikeList, atmStrike, strikeRange]);

  const supportStrikes = useMemo(() => new Set(support.map((s) => s.strike)), [support]);
  const resistanceStrikes = useMemo(() => new Set(resistance.map((r) => r.strike)), [resistance]);

  const formatOI = (oi?: number | null) => {
    if (oi == null || oi === 0) return '-';
    if (oi >= 10000000) return `${(oi / 10000000).toFixed(2)} Cr`;
    if (oi >= 100000) return `${(oi / 100000).toFixed(2)} L`;
    if (oi >= 1000) return `${(oi / 1000).toFixed(1)} k`;
    return oi.toLocaleString('en-IN');
  };

  const getBuildupBadge = (buildup?: BuildupSignal) => {
    if (!buildup) return null;
    const label = buildup.kind.replace('_', ' ');
    switch (buildup.kind) {
      case 'LONG_BUILDUP':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
            {label}
          </span>
        );
      case 'SHORT_BUILDUP':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
            {label}
          </span>
        );
      case 'SHORT_COVERING':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 whitespace-nowrap">
            {label}
          </span>
        );
      case 'LONG_UNWINDING':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
            {label}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Option Chain Heatmap</span>
            <span className="text-xs font-normal text-slate-400 font-mono">
              (Spot: <span className="text-cyan-400 font-bold">{spot.toFixed(2)}</span>)
            </span>
          </h2>
          {maxPain && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
              Max Pain: {maxPain}
            </span>
          )}
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-1.5 text-xs bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <span className="px-2 text-slate-400 font-medium">Strikes:</span>
          {[5, 10, 15, 0].map((r) => (
            <button
              key={r}
              onClick={() => setStrikeRange(r)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${strikeRange === r
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
            >
              {r === 0 ? 'All' : `±${r}`}
            </button>
          ))}
        </div>
      </div>

      {/* Chain Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/90 text-slate-400 font-mono border-b border-slate-800">
              {/* CE Headers */}
              <th className="py-2.5 px-3 text-left">Buildup</th>
              <th className="py-2.5 px-2 text-right">IV</th>
              <th className="py-2.5 px-2 text-right">Vol</th>
              <th className="py-2.5 px-2 text-right">LTP</th>
              <th className="py-2.5 px-3 text-right">Calls (CE) OI</th>

              {/* Strike Header */}
              <th className="py-2.5 px-4 text-center font-bold text-white bg-slate-900 border-x border-slate-800">
                Strike
              </th>

              {/* PE Headers */}
              <th className="py-2.5 px-3 text-left">Puts (PE) OI</th>
              <th className="py-2.5 px-2 text-left">LTP</th>
              <th className="py-2.5 px-2 text-left">Vol</th>
              <th className="py-2.5 px-2 text-left">IV</th>
              <th className="py-2.5 px-3 text-right">Buildup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {visibleStrikes.map((strike) => {
              const row = strikeRows.get(strike);
              const isATM = strike === atmStrike;
              const isMaxPain = strike === maxPain;
              const isSupport = supportStrikes.has(strike);
              const isResistance = resistanceStrikes.has(strike);

              const ceOI = row?.ce?.oi ?? 0;
              const peOI = row?.pe?.oi ?? 0;
              const ceOIPct = Math.min(100, Math.round((ceOI / maxOI) * 100));
              const peOIPct = Math.min(100, Math.round((peOI / maxOI) * 100));

              // Row background styling
              let rowBg = 'hover:bg-slate-800/40 transition-colors';
              if (isATM) rowBg = 'bg-cyan-500/10 hover:bg-cyan-500/15';

              return (
                <tr key={strike} className={rowBg}>
                  {/* CE Buildup */}
                  <td className="py-2 px-3 text-left">
                    {getBuildupBadge(row?.ceBuildup)}
                  </td>

                  {/* CE IV */}
                  <td className="py-2 px-2 text-right text-slate-400">
                    {row?.ce?.iv ? `${row.ce.iv.toFixed(1)}%` : '-'}
                  </td>

                  {/* CE Volume */}
                  <td className="py-2 px-2 text-right text-slate-400">
                    {row?.ce?.volume ? formatOI(row.ce.volume) : '-'}
                  </td>

                  {/* CE LTP */}
                  <td className="py-2 px-2 text-right font-medium text-slate-200">
                    {row?.ce?.ltp != null ? row.ce.ltp.toFixed(2) : '-'}
                  </td>

                  {/* CE OI with Heatmap Bar */}
                  <td className="py-2 px-3 text-right relative">
                    <div
                      className="absolute inset-y-0 right-0 bg-cyan-500/20 rounded-l"
                      style={{ width: `${ceOIPct}%` }}
                    />
                    <span className="relative z-10 font-bold text-cyan-300">
                      {formatOI(ceOI)}
                    </span>
                  </td>

                  {/* Strike Column */}
                  <td
                    className={`py-2 px-4 text-center font-bold border-x border-slate-800/90 ${isATM
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                        : isMaxPain
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'bg-slate-950/70 text-white'
                      }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{strike}</span>
                      {isATM && (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-cyan-400 text-slate-950 font-black">
                          ATM
                        </span>
                      )}
                      {isMaxPain && (
                        <span className="text-[10px]" title="Max Pain Strike">
                          ⚖️
                        </span>
                      )}
                      {isResistance && (
                        <span className="text-[10px] text-rose-400" title="Resistance Level">
                          🔴
                        </span>
                      )}
                      {isSupport && (
                        <span className="text-[10px] text-emerald-400" title="Support Level">
                          🟢
                        </span>
                      )}
                    </div>
                  </td>

                  {/* PE OI with Heatmap Bar */}
                  <td className="py-2 px-3 text-left relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-500/20 rounded-r"
                      style={{ width: `${peOIPct}%` }}
                    />
                    <span className="relative z-10 font-bold text-amber-300">
                      {formatOI(peOI)}
                    </span>
                  </td>

                  {/* PE LTP */}
                  <td className="py-2 px-2 text-left font-medium text-slate-200">
                    {row?.pe?.ltp != null ? row.pe.ltp.toFixed(2) : '-'}
                  </td>

                  {/* PE Volume */}
                  <td className="py-2 px-2 text-left text-slate-400">
                    {row?.pe?.volume ? formatOI(row.pe.volume) : '-'}
                  </td>

                  {/* PE IV */}
                  <td className="py-2 px-2 text-left text-slate-400">
                    {row?.pe?.iv ? `${row.pe.iv.toFixed(1)}%` : '-'}
                  </td>

                  {/* PE Buildup */}
                  <td className="py-2 px-3 text-right">
                    {getBuildupBadge(row?.peBuildup)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
