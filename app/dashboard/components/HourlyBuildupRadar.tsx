'use client';

import React, { useState, useMemo } from 'react';
import type { DbChainRow } from '@/lib/db/queries';
import type { AnalysisResult, BuildupSignal } from '@/lib/analysis/types';

interface HourlyBuildupRadarProps {
  rows: DbChainRow[];
  spot: number;
  analysis?: AnalysisResult | null;
  history?: Array<{
    id: number;
    ts: string;
    spot: number;
    pcr: number;
    totalCeOI: number;
    totalPeOI: number;
  }>;
  windowMinutes: number;
  onWindowChange: (window: number) => void;
}

export default function HourlyBuildupRadar({
  rows,
  spot,
  analysis,
  history = [],
  windowMinutes,
  onWindowChange,
}: HourlyBuildupRadarProps) {
  const [filterKind, setFilterKind] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'CE' | 'PE'>('ALL');
  const [searchStrike, setSearchStrike] = useState<string>('');

  const buildups = analysis?.buildups || [];

  // Group buildups by classification
  const stats = useMemo(() => {
    let lbuCount = 0;
    let sbuCount = 0;
    let scCount = 0;
    let luCount = 0;

    let ceOIChangeTotal = 0;
    let peOIChangeTotal = 0;

    for (const b of buildups) {
      if (b.kind === 'LONG_BUILDUP') lbuCount++;
      else if (b.kind === 'SHORT_BUILDUP') sbuCount++;
      else if (b.kind === 'SHORT_COVERING') scCount++;
      else if (b.kind === 'LONG_UNWINDING') luCount++;

      if (b.optionType === 'CE') {
        ceOIChangeTotal += b.oiChangeAbs;
      } else {
        peOIChangeTotal += b.oiChangeAbs;
      }
    }

    return {
      lbuCount,
      sbuCount,
      scCount,
      luCount,
      totalCount: buildups.length,
      ceOIChangeTotal,
      peOIChangeTotal,
    };
  }, [buildups]);

  // Format numbers to Indian Lakhs (L) and Crores (Cr)
  const formatIndianOI = (val: number, showSign = false) => {
    const sign = val > 0 && showSign ? '+' : '';
    const abs = Math.abs(val);
    if (abs >= 10000000) return `${sign}${(val / 10000000).toFixed(2)} Cr`;
    if (abs >= 100000) return `${sign}${(val / 100000).toFixed(2)} L`;
    if (abs >= 1000) return `${sign}${(val / 1000).toFixed(1)} k`;
    return `${sign}${val.toLocaleString('en-IN')}`;
  };

  // Filtered Buildups List
  const filteredBuildups = useMemo(() => {
    return buildups.filter((b) => {
      if (filterKind !== 'ALL' && b.kind !== filterKind) return false;
      if (filterType !== 'ALL' && b.optionType !== filterType) return false;
      if (searchStrike && !b.strike.toString().includes(searchStrike)) return false;
      return true;
    });
  }, [buildups, filterKind, filterType, searchStrike]);

  // Top Call Writers (Resistance)
  const topCallWriters = useMemo(() => {
    return buildups
      .filter((b) => b.optionType === 'CE' && b.oiChangeAbs > 0)
      .sort((a, b) => b.oiChangeAbs - a.oiChangeAbs)
      .slice(0, 4);
  }, [buildups]);

  // Top Put Writers (Support)
  const topPutWriters = useMemo(() => {
    return buildups
      .filter((b) => b.optionType === 'PE' && b.oiChangeAbs > 0)
      .sort((a, b) => b.oiChangeAbs - a.oiChangeAbs)
      .slice(0, 4);
  }, [buildups]);

  // Top Short Covering (Short Squeeze candidates)
  const topShortCovering = useMemo(() => {
    return buildups
      .filter((b) => b.kind === 'SHORT_COVERING')
      .sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs))
      .slice(0, 4);
  }, [buildups]);

  // Top Long Unwinding (Profit Booking)
  const topLongUnwinding = useMemo(() => {
    return buildups
      .filter((b) => b.kind === 'LONG_UNWINDING')
      .sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs))
      .slice(0, 4);
  }, [buildups]);

  // Get Market Interpretation according to OI_INTERPRETATION_RULES.md
  const getInterpretation = (b: BuildupSignal) => {
    if (b.optionType === 'CE') {
      switch (b.kind) {
        case 'LONG_BUILDUP':
          return { label: 'Bullish (Call Buying)', color: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
        case 'SHORT_BUILDUP':
          return { label: 'Bearish (Call Writing Resistance)', color: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400' };
        case 'SHORT_COVERING':
          return { label: 'Bullish Squeeze (Call Writers Trapped)', color: 'text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' };
        case 'LONG_UNWINDING':
          return { label: 'Weakness (Call Buyers Exiting)', color: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
      }
    } else {
      switch (b.kind) {
        case 'LONG_BUILDUP':
          return { label: 'Bearish (Put Buying / Downside Protection)', color: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400' };
        case 'SHORT_BUILDUP':
          return { label: 'Bullish (Put Writing Support Floor)', color: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
        case 'SHORT_COVERING':
          return { label: 'Bearish Squeeze (Put Writers Trapped)', color: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400' };
        case 'LONG_UNWINDING':
          return { label: 'Support Relaxing (Put Buyers Exiting)', color: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
      }
    }
  };

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'LONG_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            🟢 LONG BUILDUP (LBU)
          </span>
        );
      case 'SHORT_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide bg-rose-500/20 text-rose-300 border border-rose-500/40">
            🔴 SHORT BUILDUP (SBU)
          </span>
        );
      case 'SHORT_COVERING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            🚀 SHORT COVERING (SC)
          </span>
        );
      case 'LONG_UNWINDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/40">
            ⚠️ LONG UNWINDING (LU)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ── TOP CONTROLS & TIMELINE BAR ────────────────────────────── */}
      <div className="p-3 rounded-xl border border-slate-800 bg-[#0c1424] shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Window Interval Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            ⏱️ Shift Interval:
          </span>
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            {[
              { label: '15m Scalp', val: 15 },
              { label: '30m Momentum', val: 30 },
              { label: '1 Hour (Standard)', val: 60 },
              { label: 'Day Open (9:15)', val: 360 },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => onWindowChange(item.val)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition cursor-pointer ${
                  windowMinutes === item.val
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Live Snapshot Timeline Tape (Hour by Hour) */}
        {history.length > 0 && (
          <div className="hidden xl:flex items-center gap-2 overflow-x-auto py-0.5 font-mono text-[11px]">
            <span className="text-slate-500 font-bold">Snapshots:</span>
            {history.slice(-5).map((h, i) => {
              const time = new Date(h.ts).toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const isLatest = i === history.slice(-5).length - 1;
              return (
                <div
                  key={h.id}
                  className={`px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                    isLatest
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{time}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-300">{h.spot.toFixed(0)}</span>
                  <span className="text-slate-600">|</span>
                  <span className={h.pcr >= 1 ? 'text-emerald-400' : 'text-rose-400'}>
                    {h.pcr.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Right: Summary pill */}
        <div className="font-mono text-[11px] text-slate-400 flex items-center gap-2">
          <span>Comparing with Snapshot taken {windowMinutes}m ago</span>
        </div>
      </div>

      {/* ── 4 CORE BUILDUP TILES (INDIAN TRADER DIAL) ───────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Card 1: Long Buildup */}
        <div
          onClick={() => setFilterKind(filterKind === 'LONG_BUILDUP' ? 'ALL' : 'LONG_BUILDUP')}
          className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            filterKind === 'LONG_BUILDUP'
              ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/10'
              : 'bg-[#0c1424] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-emerald-400 uppercase font-mono tracking-wide flex items-center gap-1.5">
              <span>🟢</span> Long Buildup (LBU)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              Price ▲ | OI ▲
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {stats.lbuCount}
            </span>
            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
              Bulls Charging In
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            Fresh long buyers aggressively creating upward pressure.
          </p>
        </div>

        {/* Card 2: Short Buildup */}
        <div
          onClick={() => setFilterKind(filterKind === 'SHORT_BUILDUP' ? 'ALL' : 'SHORT_BUILDUP')}
          className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            filterKind === 'SHORT_BUILDUP'
              ? 'bg-rose-500/15 border-rose-500 shadow-md shadow-rose-500/10'
              : 'bg-[#0c1424] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-rose-400 uppercase font-mono tracking-wide flex items-center gap-1.5">
              <span>🔴</span> Short Buildup (SBU)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">
              Price ▼ | OI ▲
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {stats.sbuCount}
            </span>
            <span className="text-[11px] font-mono text-rose-400 font-semibold">
              Bears Writing Heavy
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            Aggressive institutional sellers shorting to build resistance walls.
          </p>
        </div>

        {/* Card 3: Short Covering */}
        <div
          onClick={() => setFilterKind(filterKind === 'SHORT_COVERING' ? 'ALL' : 'SHORT_COVERING')}
          className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            filterKind === 'SHORT_COVERING'
              ? 'bg-cyan-500/15 border-cyan-500 shadow-md shadow-cyan-500/10'
              : 'bg-[#0c1424] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-cyan-400 uppercase font-mono tracking-wide flex items-center gap-1.5">
              <span>🚀</span> Short Covering (SC)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
              Price ▲ | OI ▼
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {stats.scCount}
            </span>
            <span className="text-[11px] font-mono text-cyan-400 font-semibold">
              Panic Squeeze Fuel
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            Trapped writers hitting stop-losses and covering at loss.
          </p>
        </div>

        {/* Card 4: Long Unwinding */}
        <div
          onClick={() => setFilterKind(filterKind === 'LONG_UNWINDING' ? 'ALL' : 'LONG_UNWINDING')}
          className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            filterKind === 'LONG_UNWINDING'
              ? 'bg-amber-500/15 border-amber-500 shadow-md shadow-amber-500/10'
              : 'bg-[#0c1424] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-amber-400 uppercase font-mono tracking-wide flex items-center gap-1.5">
              <span>⚠️</span> Long Unwinding (LU)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
              Price ▼ | OI ▼
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {stats.luCount}
            </span>
            <span className="text-[11px] font-mono text-amber-400 font-semibold">
              Profit Booking / Exit
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            Bulls closing profitable longs or dumping losing long bets.
          </p>
        </div>
      </div>

      {/* ── BATTLEGROUND: CE VS PE 1-HOUR NET OI ACCUMULATION ────────── */}
      <div className="p-3.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
              ⚔️ {windowMinutes}m Shift Battleground:
            </span>
            <span className="text-xs font-mono text-slate-400">
              Who added more positions in the last {windowMinutes} minutes?
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400">Call (CE) Shift: </span>
              <span
                className={`font-bold ${
                  stats.ceOIChangeTotal >= 0 ? 'text-rose-400' : 'text-cyan-400'
                }`}
              >
                {formatIndianOI(stats.ceOIChangeTotal, true)}
              </span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div>
              <span className="text-slate-400">Put (PE) Shift: </span>
              <span
                className={`font-bold ${
                  stats.peOIChangeTotal >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {formatIndianOI(stats.peOIChangeTotal, true)}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Dual-Direction Shift Gauge */}
        <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden flex border border-slate-800">
          <div
            className="bg-rose-500/80 transition-all duration-500"
            style={{
              width: `${
                Math.abs(stats.ceOIChangeTotal) + Math.abs(stats.peOIChangeTotal) > 0
                  ? (Math.abs(stats.ceOIChangeTotal) /
                      (Math.abs(stats.ceOIChangeTotal) + Math.abs(stats.peOIChangeTotal))) *
                    100
                  : 50
              }%`,
            }}
            title="Call Writing / Additions (Resistance)"
          />
          <div
            className="bg-emerald-500/80 transition-all duration-500"
            style={{
              width: `${
                Math.abs(stats.ceOIChangeTotal) + Math.abs(stats.peOIChangeTotal) > 0
                  ? (Math.abs(stats.peOIChangeTotal) /
                      (Math.abs(stats.ceOIChangeTotal) + Math.abs(stats.peOIChangeTotal))) *
                    100
                  : 50
              }%`,
            }}
            title="Put Writing / Additions (Support)"
          />
        </div>
      </div>

      {/* ── TOP 4 INSTITUTIONAL RADAR PANELS ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Panel 1: Top Call Writers (Resistance) */}
        <div className="p-3 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>🛑</span> Fresh Call Writers
            </span>
            <span className="text-[10px] font-mono text-rose-400 font-bold">Resistance</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topCallWriters.length > 0 ? (
              topCallWriters.map((item) => (
                <div
                  key={`ce_${item.strike}`}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                >
                  <span className="font-bold text-white">{item.strike} CE</span>
                  <div className="text-right">
                    <span className="text-rose-400 font-bold block">
                      +{formatIndianOI(item.oiChangeAbs)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Total: {formatIndianOI(item.currentOI)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-[11px] text-slate-500 font-mono py-2 text-center">
                No major call writing
              </span>
            )}
          </div>
        </div>

        {/* Panel 2: Top Put Writers (Support) */}
        <div className="p-3 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>🛡️</span> Fresh Put Writers
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">Support Floor</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topPutWriters.length > 0 ? (
              topPutWriters.map((item) => (
                <div
                  key={`pe_${item.strike}`}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                >
                  <span className="font-bold text-white">{item.strike} PE</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold block">
                      +{formatIndianOI(item.oiChangeAbs)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Total: {formatIndianOI(item.currentOI)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-[11px] text-slate-500 font-mono py-2 text-center">
                No major put writing
              </span>
            )}
          </div>
        </div>

        {/* Panel 3: Short Covering (Squeezes) */}
        <div className="p-3 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>🚀</span> Short Squeeze Alerts
            </span>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">Covering</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topShortCovering.length > 0 ? (
              topShortCovering.map((item) => (
                <div
                  key={`sc_${item.strike}_${item.optionType}`}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                >
                  <span className="font-bold text-cyan-300">
                    {item.strike} {item.optionType}
                  </span>
                  <div className="text-right">
                    <span className="text-cyan-400 font-bold block">
                      {formatIndianOI(item.oiChangeAbs)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      LTP: ₹{item.currentLTP.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-[11px] text-slate-500 font-mono py-2 text-center">
                No short covering active
              </span>
            )}
          </div>
        </div>

        {/* Panel 4: Long Unwinding (Bulls Exiting) */}
        <div className="p-3 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>⚠️</span> Long Unwinding
            </span>
            <span className="text-[10px] font-mono text-amber-400 font-bold">Profit Booking</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topLongUnwinding.length > 0 ? (
              topLongUnwinding.map((item) => (
                <div
                  key={`lu_${item.strike}_${item.optionType}`}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                >
                  <span className="font-bold text-amber-300">
                    {item.strike} {item.optionType}
                  </span>
                  <div className="text-right">
                    <span className="text-amber-400 font-bold block">
                      {formatIndianOI(item.oiChangeAbs)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      LTP: ₹{item.currentLTP.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-[11px] text-slate-500 font-mono py-2 text-center">
                No long unwinding
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── DETAILED FULL-WIDTH STRIKE BUILDUP MATRIX ───────────────── */}
      <div className="rounded-xl border border-slate-800 bg-[#0c1424] overflow-hidden shadow-lg">
        {/* Table Filter Strip */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white">Filter Matrix:</span>
            {/* Buildup filter pills */}
            {['ALL', 'LONG_BUILDUP', 'SHORT_BUILDUP', 'SHORT_COVERING', 'LONG_UNWINDING'].map(
              (k) => (
                <button
                  key={k}
                  onClick={() => setFilterKind(k)}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer text-[11px] font-bold ${
                    filterKind === k
                      ? 'bg-slate-200 text-slate-950 shadow-sm'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {k === 'ALL'
                    ? 'All Buildups'
                    : k === 'LONG_BUILDUP'
                    ? '🟢 Long Buildup'
                    : k === 'SHORT_BUILDUP'
                    ? '🔴 Short Buildup'
                    : k === 'SHORT_COVERING'
                    ? '🚀 Short Covering'
                    : '⚠️ Long Unwinding'}
                </button>
              )
            )}

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            {/* CE / PE selector */}
            {(['ALL', 'CE', 'PE'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer text-[11px] font-bold ${
                  filterType === t
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t === 'ALL' ? 'CE + PE' : t === 'CE' ? 'Calls (CE)' : 'Puts (PE)'}
              </button>
            ))}
          </div>

          {/* Search strike input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter Strike (e.g. 24400)..."
              value={searchStrike}
              onChange={(e) => setSearchStrike(e.target.value)}
              className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 text-[11px]"
            />
            <span className="text-slate-500 text-[11px]">
              {filteredBuildups.length} strikes
            </span>
          </div>
        </div>

        {/* Buildup Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse font-mono">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">Option Contract</th>
                <th className="py-2.5 px-3">Buildup Classification</th>
                <th className="py-2.5 px-3">Institutional Bias & Impact</th>
                <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                <th className="py-2.5 px-3 text-right">LTP Change %</th>
                <th className="py-2.5 px-3 text-right">{windowMinutes}m OI Shift</th>
                <th className="py-2.5 px-3 text-right">Total OI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredBuildups.length > 0 ? (
                filteredBuildups.map((b) => {
                  const interp = getInterpretation(b);
                  const isAtm = Math.abs(b.strike - spot) < 25;
                  const isCe = b.optionType === 'CE';

                  return (
                    <tr
                      key={`${b.strike}_${b.optionType}`}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isAtm ? 'bg-cyan-500/5' : ''
                      }`}
                    >
                      {/* Option Contract */}
                      <td className="py-2.5 px-3 font-bold">
                        <span className={isCe ? 'text-cyan-300' : 'text-emerald-300'}>
                          {b.strike} {b.optionType}
                        </span>
                        {isAtm && (
                          <span className="ml-2 px-1 py-0.2 rounded text-[9px] bg-cyan-400 text-slate-950 font-black">
                            ATM
                          </span>
                        )}
                      </td>

                      {/* Buildup Badge */}
                      <td className="py-2.5 px-3">{getKindBadge(b.kind)}</td>

                      {/* Institutional Bias */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${interp.badge}`}
                        >
                          {interp.label}
                        </span>
                      </td>

                      {/* LTP */}
                      <td className="py-2.5 px-3 text-right font-medium text-white">
                        ₹{b.currentLTP.toFixed(2)}
                      </td>

                      {/* LTP Change % */}
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          b.ltpChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {b.ltpChangePct >= 0 ? '+' : ''}
                        {b.ltpChangePct.toFixed(2)}%
                      </td>

                      {/* 1-Hr OI Shift */}
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          b.oiChangeAbs >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatIndianOI(b.oiChangeAbs, true)}
                        <span className="text-[10px] text-slate-500 ml-1.5">
                          ({b.oiChangePct >= 0 ? '+' : ''}
                          {b.oiChangePct.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Total OI */}
                      <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                        {formatIndianOI(b.currentOI)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No strikes match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
