'use client';

import React, { useState, useMemo } from 'react';
import type { DbChainRow } from '@/lib/db/queries';
import type { BuildupSignal, BuildupKind, OptionType } from '@/lib/analysis/types';

interface OptionsScreenerProps {
  rows: DbChainRow[];
  spot: number;
  buildups?: BuildupSignal[];
}

export type Moneyness = 'ITM' | 'ATM' | 'OTM';
export type IndexBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type PresetScan =
  | 'ALL'
  | 'BULLISH'
  | 'BEARISH'
  | 'SHORT_SQUEEZE'
  | 'INSTITUTIONAL_WALLS'
  | 'HERO_ZERO'
  | 'HIGH_VOLUME';

interface ScreenerItem {
  id: string;
  strike: number;
  type: OptionType;
  ltp: number;
  ltpChangePct: number;
  oi: number;
  oiChangePct: number;
  oiChangeAbs: number;
  volume: number;
  iv: number;
  moneyness: Moneyness;
  distanceFromSpot: number;
  buildupKind: BuildupKind | 'CONSOLIDATION';
  indexBias: IndexBias;
  institutionalAction: string;
}

export default function OptionsScreener({
  rows,
  spot,
  buildups = [],
}: OptionsScreenerProps) {
  // Preset selector
  const [activePreset, setActivePreset] = useState<PresetScan>('ALL');

  // Custom filter state
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CE' | 'PE'>('ALL');
  const [moneynessFilter, setMoneynessFilter] = useState<'ALL' | 'ITM' | 'ATM' | 'OTM'>('ALL');
  const [buildupFilter, setBuildupFilter] = useState<string>('ALL');
  const [indexBiasFilter, setIndexBiasFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting
  const [sortBy, setSortBy] = useState<'oi' | 'oiChange' | 'ltp' | 'volume' | 'strike'>('oi');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ATM Strike Calculation (nearest 50 for Nifty)
  const atmStrike = useMemo(() => {
    return Math.round(spot / 50) * 50;
  }, [spot]);

  // Index buildups by strike_type
  const buildupMap = useMemo(() => {
    const map = new Map<string, BuildupSignal>();
    for (const b of buildups) {
      map.set(`${b.strike}_${b.optionType}`, b);
    }
    return map;
  }, [buildups]);

  // Transform rows into normalized screener items with strict adherence to OI_INTERPRETATION_RULES.md
  const allItems: ScreenerItem[] = useMemo(() => {
    return rows.map((r) => {
      const b = buildupMap.get(`${r.strike}_${r.type}`);
      const ltp = r.ltp ?? b?.currentLTP ?? 0;
      const oi = r.oi ?? b?.currentOI ?? 0;
      const volume = r.volume ?? 0;
      const iv = r.iv ?? 0;

      // 1. Determine moneyness
      let moneyness: Moneyness = 'OTM';
      if (Math.abs(r.strike - spot) <= 25) {
        moneyness = 'ATM';
      } else if (r.type === 'CE') {
        moneyness = r.strike < spot ? 'ITM' : 'OTM';
      } else {
        moneyness = r.strike > spot ? 'ITM' : 'OTM';
      }

      // 2. Determine Buildup Kind
      const kind: BuildupKind | 'CONSOLIDATION' = b ? b.kind : 'CONSOLIDATION';

      // 3. Determine Nifty 50 Index Bias based on OI_INTERPRETATION_RULES.md
      let indexBias: IndexBias = 'NEUTRAL';
      let institutionalAction = 'Neutral / Rangebound Positioning';

      if (r.type === 'CE') {
        // CALL OPTIONS: Option View = Equity View
        if (kind === 'LONG_BUILDUP') {
          indexBias = 'BULLISH';
          institutionalAction = 'Fresh Call Buyers Entering (Bullish)';
        } else if (kind === 'SHORT_COVERING') {
          indexBias = 'BULLISH';
          institutionalAction = 'Call Sellers Trapped & Covering (Strongly Bullish)';
        } else if (kind === 'SHORT_BUILDUP') {
          indexBias = 'BEARISH';
          institutionalAction = 'Heavy Call Writing (Resistance Wall Built)';
        } else if (kind === 'LONG_UNWINDING') {
          indexBias = 'BEARISH';
          institutionalAction = 'Call Buyers Booking Profits / Exiting (Bearish)';
        }
      } else {
        // PUT OPTIONS: Option View & Equity View are INVERTED
        if (kind === 'LONG_BUILDUP') {
          indexBias = 'BEARISH';
          institutionalAction = 'Fresh Put Buyers Hedging / Speculating Downside';
        } else if (kind === 'SHORT_COVERING') {
          indexBias = 'BEARISH';
          institutionalAction = 'Put Writers Panicking & Unwinding (Bearish)';
        } else if (kind === 'SHORT_BUILDUP') {
          indexBias = 'BULLISH';
          institutionalAction = 'Put Writers Creating Support Floor (Bullish)';
        } else if (kind === 'LONG_UNWINDING') {
          indexBias = 'BULLISH';
          institutionalAction = 'Put Buyers Abandoning Puts (Bear Pressure Easing)';
        }
      }

      return {
        id: `${r.strike}_${r.type}`,
        strike: r.strike,
        type: r.type,
        ltp,
        ltpChangePct: b?.ltpChangePct ?? 0,
        oi,
        oiChangePct: b?.oiChangePct ?? 0,
        oiChangeAbs: b?.oiChangeAbs ?? 0,
        volume,
        iv,
        moneyness,
        distanceFromSpot: Math.abs(r.strike - spot),
        buildupKind: kind,
        indexBias,
        institutionalAction,
      };
    });
  }, [rows, buildupMap, spot]);

  // Handle Preset Clicks (Synchronizes filters seamlessly without conflicting manual settings)
  const applyPreset = (preset: PresetScan) => {
    setActivePreset(preset);

    // Reset conflicting price & text filters on preset change
    setMinPrice('');
    setMaxPrice('');
    setSearchQuery('');

    if (preset === 'ALL') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('ALL');
      setIndexBiasFilter('ALL');
      setSortBy('oi');
      setSortOrder('desc');
    } else if (preset === 'BULLISH') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('ALL');
      setIndexBiasFilter('BULLISH');
      setSortBy('oiChange');
      setSortOrder('desc');
    } else if (preset === 'BEARISH') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('ALL');
      setIndexBiasFilter('BEARISH');
      setSortBy('oiChange');
      setSortOrder('desc');
    } else if (preset === 'SHORT_SQUEEZE') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('SHORT_COVERING');
      setIndexBiasFilter('ALL');
      setSortBy('oiChange');
      setSortOrder('desc');
    } else if (preset === 'INSTITUTIONAL_WALLS') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('ALL');
      setIndexBiasFilter('ALL');
      setSortBy('oi');
      setSortOrder('desc');
    } else if (preset === 'HERO_ZERO') {
      setTypeFilter('ALL');
      setMoneynessFilter('OTM');
      setBuildupFilter('ALL');
      setIndexBiasFilter('ALL');
      setMaxPrice('50');
      setSortBy('volume');
      setSortOrder('desc');
    } else if (preset === 'HIGH_VOLUME') {
      setTypeFilter('ALL');
      setMoneynessFilter('ALL');
      setBuildupFilter('ALL');
      setIndexBiasFilter('ALL');
      setSortBy('volume');
      setSortOrder('desc');
    }
  };

  // Reset all filters completely
  const handleResetFilters = () => {
    applyPreset('ALL');
  };

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let items = [...allItems];

    // 1. Index Bias Filter (Nifty Bullish vs Bearish)
    if (indexBiasFilter !== 'ALL') {
      items = items.filter((i) => i.indexBias === indexBiasFilter);
    }

    // 2. Custom Option Type Filter
    if (typeFilter !== 'ALL') {
      items = items.filter((i) => i.type === typeFilter);
    }

    // 3. Moneyness Filter
    if (moneynessFilter !== 'ALL') {
      items = items.filter((i) => i.moneyness === moneynessFilter);
    }

    // 4. Buildup Filter
    if (buildupFilter !== 'ALL') {
      items = items.filter((i) => i.buildupKind === buildupFilter);
    }

    // 5. Price Min/Max Filters
    if (minPrice !== '' && !isNaN(Number(minPrice))) {
      items = items.filter((i) => i.ltp >= Number(minPrice));
    }
    if (maxPrice !== '' && !isNaN(Number(maxPrice))) {
      items = items.filter((i) => i.ltp <= Number(maxPrice));
    }

    // 6. Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.strike.toString().includes(q) ||
          i.type.toLowerCase().includes(q) ||
          i.buildupKind.toLowerCase().includes(q) ||
          i.indexBias.toLowerCase().includes(q)
      );
    }

    // 7. Sorting
    items.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'oi') diff = a.oi - b.oi;
      else if (sortBy === 'oiChange') diff = Math.abs(a.oiChangePct) - Math.abs(b.oiChangePct);
      else if (sortBy === 'ltp') diff = a.ltp - b.ltp;
      else if (sortBy === 'volume') diff = a.volume - b.volume;
      else if (sortBy === 'strike') diff = a.strike - b.strike;

      return sortOrder === 'desc' ? -diff : diff;
    });

    return items;
  }, [
    allItems,
    indexBiasFilter,
    typeFilter,
    moneynessFilter,
    buildupFilter,
    minPrice,
    maxPrice,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  const maxItemOI = useMemo(() => {
    return Math.max(...allItems.map((i) => i.oi), 1);
  }, [allItems]);

  const formatOI = (num: number) => {
    if (!num) return '-';
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)} k`;
    return num.toLocaleString('en-IN');
  };

  const getBuildupBadge = (kind: BuildupKind | 'CONSOLIDATION') => {
    switch (kind) {
      case 'LONG_BUILDUP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            🟢 Long Buildup
          </span>
        );
      case 'SHORT_BUILDUP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            🔴 Short Buildup
          </span>
        );
      case 'SHORT_COVERING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            ⚡ Short Covering
          </span>
        );
      case 'LONG_UNWINDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            ⚠️ Long Unwinding
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-800/40 border border-slate-700/40">
            Consolidation
          </span>
        );
    }
  };

  const getIndexBiasBadge = (bias: IndexBias) => {
    if (bias === 'BULLISH') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
          ▲ Bullish Nifty
        </span>
      );
    }
    if (bias === 'BEARISH') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-500/15 text-rose-300 border border-rose-500/40">
          ▼ Bearish Nifty
        </span>
      );
    }
    return (
      <span className="text-[10px] text-slate-500 font-mono">
        Neutral
      </span>
    );
  };

  // Check if any non-default filters are active
  const hasActiveFilters =
    typeFilter !== 'ALL' ||
    moneynessFilter !== 'ALL' ||
    buildupFilter !== 'ALL' ||
    indexBiasFilter !== 'ALL' ||
    minPrice !== '' ||
    maxPrice !== '' ||
    searchQuery !== '' ||
    activePreset !== 'ALL';

  return (
    <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl backdrop-blur-md flex flex-col gap-5">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xl shadow-lg shadow-amber-500/10">
            🔍
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Options Screener</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono">
                Real-Time
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Screen Nifty 50 Options by Institutional Buildup, Nifty Bias & OI Traps
            </p>
          </div>
        </div>

        {/* Spot & ATM Reference Pill */}
        <div className="flex items-center gap-3 text-xs font-mono bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800">
          <div>
            <span className="text-slate-500">Spot: </span>
            <span className="font-bold text-white">{spot.toFixed(2)}</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div>
            <span className="text-slate-500">ATM: </span>
            <span className="font-bold text-cyan-400">{atmStrike}</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div>
            <span className="text-slate-500">Matched: </span>
            <span
              className={`font-bold ${
                filteredItems.length > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {filteredItems.length}
            </span>
            <span className="text-slate-500">/{allItems.length}</span>
          </div>
        </div>
      </div>

      {/* ─── 1-Click Pro Scans (Synchronized Presets) ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            ⚡ 1-Click Pro Scans
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 transition font-mono underline cursor-pointer"
            >
              Reset to All Options
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'All Options', icon: '📋' },
            { id: 'BULLISH', label: 'Bullish Nifty (CE Buy / PE Sell)', icon: '🟢' },
            { id: 'BEARISH', label: 'Bearish Nifty (PE Buy / CE Sell)', icon: '🔴' },
            { id: 'SHORT_SQUEEZE', label: 'Short Squeeze Traps', icon: '⚡' },
            { id: 'INSTITUTIONAL_WALLS', label: 'Top Institutional Walls (OI)', icon: '🛡️' },
            { id: 'HERO_ZERO', label: 'Hero or Zero (OTM ≤ ₹50)', icon: '🎯' },
            { id: 'HIGH_VOLUME', label: 'Unusual Volume Activity', icon: '🔥' },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id as PresetScan)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border font-mono ${
                activePreset === preset.id
                  ? 'bg-amber-500/25 border-amber-500/60 text-amber-200 shadow-md shadow-amber-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span>{preset.icon}</span>
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Custom Filter Bar ─── */}
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center gap-3 text-xs font-mono">
        {/* Search */}
        <div className="flex-1 min-w-[140px]">
          <input
            type="text"
            placeholder="Search strike e.g. 22800, CE, PE..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActivePreset('ALL');
            }}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Index Bias Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setIndexBiasFilter('ALL');
              setActivePreset('ALL');
            }}
            className={`px-2 py-1 rounded text-[11px] font-bold ${
              indexBiasFilter === 'ALL'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Bias
          </button>
          <button
            onClick={() => {
              setIndexBiasFilter('BULLISH');
              setActivePreset('BULLISH');
            }}
            className={`px-2 py-1 rounded text-[11px] font-bold ${
              indexBiasFilter === 'BULLISH'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ▲ Bullish
          </button>
          <button
            onClick={() => {
              setIndexBiasFilter('BEARISH');
              setActivePreset('BEARISH');
            }}
            className={`px-2 py-1 rounded text-[11px] font-bold ${
              indexBiasFilter === 'BEARISH'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ▼ Bearish
          </button>
        </div>

        {/* Option Type Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setTypeFilter('ALL');
              setActivePreset('ALL');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold ${
              typeFilter === 'ALL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setTypeFilter('CE');
              setActivePreset('ALL');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold ${
              typeFilter === 'CE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CE
          </button>
          <button
            onClick={() => {
              setTypeFilter('PE');
              setActivePreset('ALL');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold ${
              typeFilter === 'PE' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            PE
          </button>
        </div>

        {/* Moneyness Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(['ALL', 'ITM', 'ATM', 'OTM'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMoneynessFilter(m);
                setActivePreset('ALL');
              }}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                moneynessFilter === m
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Buildup Classification Filter */}
        <select
          value={buildupFilter}
          onChange={(e) => {
            setBuildupFilter(e.target.value);
            setActivePreset('ALL');
          }}
          className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
        >
          <option value="ALL">All Buildups</option>
          <option value="LONG_BUILDUP">🟢 Long Buildup</option>
          <option value="SHORT_BUILDUP">🔴 Short Buildup</option>
          <option value="SHORT_COVERING">⚡ Short Covering</option>
          <option value="LONG_UNWINDING">⚠️ Long Unwinding</option>
          <option value="CONSOLIDATION">⚪ Consolidation</option>
        </select>

        {/* Price Range */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px]">₹</span>
          <input
            type="number"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value);
              setActivePreset('ALL');
            }}
            className="w-16 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
          <span className="text-slate-500">-</span>
          <input
            type="number"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value);
              setActivePreset('ALL');
            }}
            className="w-16 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Reset Button */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition cursor-pointer text-[11px] font-bold"
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* ─── Results Table ─── */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th
                onClick={() => {
                  setSortBy('strike');
                  setSortOrder(sortBy === 'strike' && sortOrder === 'asc' ? 'desc' : 'asc');
                }}
                className="py-3 px-4 cursor-pointer hover:text-white"
              >
                Option Contract {sortBy === 'strike' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="py-3 px-3">Moneyness</th>
              <th
                onClick={() => {
                  setSortBy('ltp');
                  setSortOrder(sortBy === 'ltp' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
                className="py-3 px-4 text-right cursor-pointer hover:text-white"
              >
                LTP (₹) {sortBy === 'ltp' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                onClick={() => {
                  setSortBy('oi');
                  setSortOrder(sortBy === 'oi' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
                className="py-3 px-4 text-right cursor-pointer hover:text-white"
              >
                Total OI {sortBy === 'oi' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                onClick={() => {
                  setSortBy('oiChange');
                  setSortOrder(sortBy === 'oiChange' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
                className="py-3 px-4 text-right cursor-pointer hover:text-white"
              >
                OI Change % {sortBy === 'oiChange' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                onClick={() => {
                  setSortBy('volume');
                  setSortOrder(sortBy === 'volume' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
                className="py-3 px-4 text-right cursor-pointer hover:text-white"
              >
                Volume {sortBy === 'volume' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="py-3 px-4">Buildup Classification</th>
              <th className="py-3 px-4">Nifty 50 Impact</th>
              <th className="py-3 px-4">Institutional Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-14 text-center font-sans">
                  <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                    <span className="text-2xl">🔍</span>
                    <div className="text-sm font-semibold text-slate-300">
                      No options match your current filter criteria
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Active Filters:{' '}
                      <span className="text-slate-400 font-mono">
                        {typeFilter !== 'ALL' && `Type: ${typeFilter} | `}
                        {moneynessFilter !== 'ALL' && `Moneyness: ${moneynessFilter} | `}
                        {buildupFilter !== 'ALL' && `Buildup: ${buildupFilter} | `}
                        {indexBiasFilter !== 'ALL' && `Bias: ${indexBiasFilter} | `}
                        {maxPrice !== '' && `Max Price: ₹${maxPrice}`}
                      </span>
                    </p>
                    <button
                      onClick={handleResetFilters}
                      className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition cursor-pointer shadow-md"
                    >
                      Reset All Filters & View All Options
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.slice(0, 50).map((item) => {
                const oiBarPct = Math.min(100, Math.round((item.oi / maxItemOI) * 100));

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-900/60 transition group text-slate-300"
                  >
                    {/* Strike & Type */}
                    <td className="py-3 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm">{item.strike}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-black ${
                            item.type === 'CE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {item.type}
                        </span>
                      </div>
                    </td>

                    {/* Moneyness */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.moneyness === 'ATM'
                            ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                            : item.moneyness === 'ITM'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.moneyness}
                      </span>
                    </td>

                    {/* LTP & % change */}
                    <td className="py-3 px-4 text-right">
                      <div className="text-white font-bold">{item.ltp.toFixed(2)}</div>
                      {item.ltpChangePct !== 0 && (
                        <div
                          className={`text-[10px] ${
                            item.ltpChangePct > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.ltpChangePct > 0 ? '+' : ''}
                          {item.ltpChangePct.toFixed(1)}%
                        </div>
                      )}
                    </td>

                    {/* Total OI with background depth bar */}
                    <td className="py-3 px-4 text-right relative">
                      <div
                        className={`absolute right-2 top-2 bottom-2 rounded opacity-15 ${
                          item.type === 'CE' ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                        style={{ width: `${oiBarPct}%` }}
                      />
                      <span className="relative z-10 font-bold text-slate-100">
                        {formatOI(item.oi)}
                      </span>
                    </td>

                    {/* OI Change % */}
                    <td className="py-3 px-4 text-right font-bold">
                      {item.oiChangePct !== 0 ? (
                        <span
                          className={
                            item.oiChangePct > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }
                        >
                          {item.oiChangePct > 0 ? '+' : ''}
                          {item.oiChangePct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>

                    {/* Volume */}
                    <td className="py-3 px-4 text-right text-slate-400">
                      {formatOI(item.volume)}
                    </td>

                    {/* Buildup Classification */}
                    <td className="py-3 px-4">{getBuildupBadge(item.buildupKind)}</td>

                    {/* Nifty 50 Impact */}
                    <td className="py-3 px-4">{getIndexBiasBadge(item.indexBias)}</td>

                    {/* Institutional Interpretation */}
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-slate-300 group-hover:text-white transition">
                        {item.institutionalAction}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filteredItems.length > 50 && (
        <div className="text-center text-[11px] text-slate-500 font-mono">
          Showing top 50 matches out of {filteredItems.length}. Use filters above to narrow your scan.
        </div>
      )}
    </div>
  );
}
