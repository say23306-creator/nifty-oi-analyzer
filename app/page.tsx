'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { OptionChainPayload, PairedStrikeRow } from '@/lib/db';

export default function OptionChainPage() {
  const [data, setData] = useState<OptionChainPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & display preferences
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [strikeFilter, setStrikeFilter] = useState<'all' | '10' | '20' | '30'>('20');
  const [numberFormat, setNumberFormat] = useState<'indian' | 'exact'>('indian');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async (expiry?: string) => {
    try {
      setRefreshing(true);
      const url = expiry ? `/api/chain?expiry=${encodeURIComponent(expiry)}` : '/api/chain';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();

      if (json.success && json.data) {
        setData(json.data);
        if (!selectedExpiry && json.data.expiry) {
          setSelectedExpiry(json.data.expiry);
        }
        setError(null);
      } else {
        setError(json.error || 'Failed to load option chain');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching option chain');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedExpiry]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData(selectedExpiry);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedExpiry, fetchData]);

  const handleExpiryChange = (newExpiry: string) => {
    setSelectedExpiry(newExpiry);
    fetchData(newExpiry);
  };

  // Format numbers into Indian system or exact
  const formatNumber = useCallback((val: number, isPercent = false, showSign = false) => {
    if (val === 0 || val == null) return '-';

    const sign = val > 0 && showSign ? '+' : '';

    if (isPercent) {
      return `${sign}${val.toFixed(2)}%`;
    }

    if (numberFormat === 'exact') {
      return `${sign}${val.toLocaleString('en-IN')}`;
    }

    // Indian format (Lakhs / Cr / k)
    const absVal = Math.abs(val);
    if (absVal >= 10000000) {
      return `${sign}${(val / 10000000).toFixed(2)} Cr`;
    }
    if (absVal >= 100000) {
      return `${sign}${(val / 100000).toFixed(2)} L`;
    }
    if (absVal >= 1000) {
      return `${sign}${(val / 1000).toFixed(1)} k`;
    }
    return `${sign}${val.toLocaleString('en-IN')}`;
  }, [numberFormat]);

  // Filter strikes based on strikeFilter around ATM
  const filteredRows = useMemo(() => {
    if (!data || !data.rows) return [];
    if (strikeFilter === 'all') return data.rows;

    const count = parseInt(strikeFilter, 10);
    const atmIndex = data.rows.findIndex((r) => r.isATM);
    if (atmIndex === -1) return data.rows;

    const start = Math.max(0, atmIndex - count);
    const end = Math.min(data.rows.length, atmIndex + count + 1);
    return data.rows.slice(start, end);
  }, [data, strikeFilter]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 font-mono text-sm text-slate-400">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading NSE Option Chain from Database...</span>
      </div>
    );
  }

  const pcrValue = data?.pcr || 1.0;
  const pcrStatus =
    pcrValue >= 1.2
      ? { label: 'Bullish (Put Writing)', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' }
      : pcrValue <= 0.8
      ? { label: 'Bearish (Call Writing)', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' }
      : { label: 'Balanced Range', color: 'text-slate-300', bg: 'bg-slate-800/40 border-slate-700/50' };

  return (
    <main className="min-h-screen bg-[#070c14] text-slate-100 flex flex-col p-2 sm:p-4 font-sans selection:bg-amber-500/20">
      {/* ── Top Official NSE Style Header Bar ──────────────────────────────── */}
      <header className="rounded-xl border border-slate-800 bg-[#0c1424] p-3 sm:p-4 mb-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          {/* Logo & Index Title */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-black text-slate-950 text-sm font-mono shadow-md">
              NSE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  NIFTY 50 • Option Chain
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  EQUITY DERIVATIVES
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Underlying Index: <span className="font-bold text-white">NIFTY</span> • As on{' '}
                <span className="text-cyan-300 font-semibold">{data?.timestamp ? new Date(data.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} IST</span>
              </p>
            </div>
          </div>

          {/* Underlying Spot Price Box */}
          <div className="flex items-center gap-3 bg-[#060a12] px-4 py-2 rounded-xl border border-slate-800/90 font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-semibold">Underlying Spot</span>
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {data?.spot ? data.spot.toFixed(2) : '—'}
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              LIVE
            </span>
          </div>
        </div>

        {/* ── Controls: Expiry, Strike Filters, Number Formatting, Auto-Refresh ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Expiry Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Select Expiry:</span>
              <select
                value={selectedExpiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                className="bg-[#060a12] border border-slate-700 text-amber-300 font-bold rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-amber-500"
              >
                {data?.allExpiries && data.allExpiries.length > 0 ? (
                  data.allExpiries.map((exp) => (
                    <option key={exp} value={exp}>
                      {exp}
                    </option>
                  ))
                ) : (
                  <option value={data?.expiry}>{data?.expiry || 'Current Expiry'}</option>
                )}
              </select>
            </div>

            {/* Strike Range Filter */}
            <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-lg border border-slate-800">
              <span className="text-slate-500 px-1 text-[11px]">Strikes:</span>
              {(['10', '20', '30', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setStrikeFilter(mode)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                    strikeFilter === mode
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'all' ? 'All' : `±${mode}`}
                </button>
              ))}
            </div>

            {/* Number Format Toggle */}
            <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-lg border border-slate-800">
              <span className="text-slate-500 px-1 text-[11px]">Format:</span>
              <button
                onClick={() => setNumberFormat('indian')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  numberFormat === 'indian' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Display in Indian format (Lakhs / Crores)"
              >
                Lakhs
              </button>
              <button
                onClick={() => setNumberFormat('exact')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  numberFormat === 'exact' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Display full exact numeric counts"
              >
                Exact
              </button>
            </div>
          </div>

          {/* Refresh Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              Auto: {autoRefresh ? 'ON (30s)' : 'OFF'}
            </button>

            <button
              onClick={() => fetchData(selectedExpiry)}
              disabled={refreshing}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold transition cursor-pointer flex items-center gap-1 text-[11px]"
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Key Market Analytics Bar ────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3 font-mono text-xs">
        {/* Put-Call Ratio */}
        <div className={`p-2.5 rounded-xl border ${pcrStatus.bg} flex flex-col justify-between`}>
          <span className="text-slate-400 text-[10px] uppercase font-semibold">PCR (Put-Call Ratio)</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-lg font-black ${pcrStatus.color}`}>{pcrValue.toFixed(3)}</span>
            <span className="text-[10px] text-slate-400">{pcrStatus.label}</span>
          </div>
        </div>

        {/* Max Pain */}
        <div className="p-2.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col justify-between">
          <span className="text-slate-400 text-[10px] uppercase font-semibold">Max Pain Strike</span>
          <span className="text-lg font-black text-indigo-400 mt-1">{data?.maxPain ?? '—'}</span>
        </div>

        {/* Put Wall (Support) */}
        <div className="p-2.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col justify-between">
          <span className="text-emerald-400 text-[10px] uppercase font-semibold">Put Floor (Support)</span>
          <span className="text-lg font-black text-emerald-400 mt-1">{data?.supportWall ?? '—'}</span>
        </div>

        {/* Call Wall (Resistance) */}
        <div className="p-2.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col justify-between">
          <span className="text-rose-400 text-[10px] uppercase font-semibold">Call Wall (Resistance)</span>
          <span className="text-lg font-black text-rose-400 mt-1">{data?.resistanceWall ?? '—'}</span>
        </div>

        {/* Total Call OI */}
        <div className="p-2.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col justify-between">
          <span className="text-slate-400 text-[10px] uppercase font-semibold">Total Call (CE) OI</span>
          <span className="text-base font-bold text-rose-300 mt-1">
            {formatNumber(data?.totalCeOI || 0)}
          </span>
        </div>

        {/* Total Put OI */}
        <div className="p-2.5 rounded-xl border border-slate-800 bg-[#0c1424] flex flex-col justify-between">
          <span className="text-slate-400 text-[10px] uppercase font-semibold">Total Put (PE) OI</span>
          <span className="text-base font-bold text-emerald-300 mt-1">
            {formatNumber(data?.totalPeOI || 0)}
          </span>
        </div>
      </section>

      {/* ── Official Dual-Sided NSE Option Chain Table ─────────────────────── */}
      <div className="w-full rounded-xl border border-slate-800 bg-[#0a1120] shadow-2xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[11px] leading-tight select-text">
            {/* Super Headers: CALLS | STRIKE | PUTS */}
            <thead>
              <tr className="bg-[#111e35] text-white border-b border-slate-800">
                <th colSpan={7} className="py-2 px-3 text-center border-r border-slate-700/80 bg-rose-950/25">
                  <span className="font-black text-rose-300 tracking-wider text-xs">CALLS (CE)</span>
                </th>
                <th className="py-2 px-4 text-center bg-[#172644] font-black text-amber-400 text-xs border-r border-slate-700/80">
                  STRIKE
                </th>
                <th colSpan={7} className="py-2 px-3 text-center bg-emerald-950/25">
                  <span className="font-black text-emerald-300 tracking-wider text-xs">PUTS (PE)</span>
                </th>
              </tr>

              {/* Exact NSE Column Subheaders */}
              <tr className="bg-[#0d1728] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-700">
                {/* Calls */}
                <th className="py-2 px-2 text-right">OI</th>
                <th className="py-2 px-2 text-right">Chng in OI</th>
                <th className="py-2 px-1 text-right">% Chng</th>
                <th className="py-2 px-2 text-right">Volume</th>
                <th className="py-2 px-1 text-right">IV</th>
                <th className="py-2 px-2 text-right">LTP</th>
                <th className="py-2 px-2 text-right border-r border-slate-700">Net Chng</th>

                {/* Strike Center */}
                <th className="py-2 px-4 text-center bg-[#131f38] text-white border-r border-slate-700">
                  Strike
                </th>

                {/* Puts */}
                <th className="py-2 px-2 text-left">Net Chng</th>
                <th className="py-2 px-2 text-left">LTP</th>
                <th className="py-2 px-1 text-left">IV</th>
                <th className="py-2 px-2 text-left">Volume</th>
                <th className="py-2 px-1 text-left">% Chng</th>
                <th className="py-2 px-2 text-left">Chng in OI</th>
                <th className="py-2 px-2 text-left">OI</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.map((row) => {
                const isATM = row.isATM;
                const isCallWall = row.strike === data?.resistanceWall;
                const isPutWall = row.strike === data?.supportWall;

                // Authentic NSE In-The-Money (ITM) yellow shading:
                // Calls are ITM when strike < spot
                // Puts are ITM when strike > spot
                const ceBg = row.isITMCall ? 'bg-[#292209]/45' : 'bg-transparent';
                const peBg = row.isITMPut ? 'bg-[#292209]/45' : 'bg-transparent';

                return (
                  <tr
                    key={row.strike}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isATM ? 'bg-cyan-950/30 border-y-2 border-cyan-500/70 font-semibold' : ''
                    }`}
                  >
                    {/* ── CALLS (LEFT SIDE) ── */}
                    {/* Call OI */}
                    <td
                      className={`py-1.5 px-2 text-right ${ceBg} ${
                        isCallWall ? 'text-amber-300 font-bold bg-rose-950/40' : 'text-slate-300'
                      }`}
                      title={isCallWall ? 'Major Call Wall Resistance' : undefined}
                    >
                      {formatNumber(row.ce.oi)}
                    </td>

                    {/* Call Chng in OI */}
                    <td
                      className={`py-1.5 px-2 text-right font-medium ${ceBg} ${
                        row.ce.change_oi > 0
                          ? 'text-emerald-400'
                          : row.ce.change_oi < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.ce.change_oi, false, true)}
                    </td>

                    {/* Call % Chng in OI */}
                    <td
                      className={`py-1.5 px-1 text-right text-[10px] ${ceBg} ${
                        row.ce.pchange_oi > 0
                          ? 'text-emerald-400'
                          : row.ce.pchange_oi < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.ce.pchange_oi, true, true)}
                    </td>

                    {/* Call Volume */}
                    <td className={`py-1.5 px-2 text-right text-slate-400 ${ceBg}`}>
                      {formatNumber(row.ce.volume)}
                    </td>

                    {/* Call IV */}
                    <td className={`py-1.5 px-1 text-right text-slate-400 ${ceBg}`}>
                      {row.ce.iv > 0 ? row.ce.iv.toFixed(2) : '-'}
                    </td>

                    {/* Call LTP */}
                    <td className={`py-1.5 px-2 text-right font-bold text-slate-100 ${ceBg}`}>
                      {row.ce.ltp > 0 ? row.ce.ltp.toFixed(2) : '-'}
                    </td>

                    {/* Call Price Change */}
                    <td
                      className={`py-1.5 px-2 text-right border-r border-slate-700/80 ${ceBg} ${
                        row.ce.price_change > 0
                          ? 'text-emerald-400'
                          : row.ce.price_change < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.ce.price_change, false, true)}
                    </td>

                    {/* ── STRIKE PRICE (CENTER) ── */}
                    <td
                      className={`py-1.5 px-4 text-center border-r border-slate-700/80 font-black ${
                        isATM
                          ? 'bg-cyan-500 text-slate-950 font-black text-xs shadow-lg'
                          : 'bg-[#101b30] text-amber-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{row.strike}</span>
                        {isATM && (
                          <span className="text-[9px] px-1 py-0.2 bg-slate-950 text-cyan-300 rounded font-black">
                            ATM
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ── PUTS (RIGHT SIDE) ── */}
                    {/* Put Price Change */}
                    <td
                      className={`py-1.5 px-2 text-left ${peBg} ${
                        row.pe.price_change > 0
                          ? 'text-emerald-400'
                          : row.pe.price_change < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.pe.price_change, false, true)}
                    </td>

                    {/* Put LTP */}
                    <td className={`py-1.5 px-2 text-left font-bold text-slate-100 ${peBg}`}>
                      {row.pe.ltp > 0 ? row.pe.ltp.toFixed(2) : '-'}
                    </td>

                    {/* Put IV */}
                    <td className={`py-1.5 px-1 text-left text-slate-400 ${peBg}`}>
                      {row.pe.iv > 0 ? row.pe.iv.toFixed(2) : '-'}
                    </td>

                    {/* Put Volume */}
                    <td className={`py-1.5 px-2 text-left text-slate-400 ${peBg}`}>
                      {formatNumber(row.pe.volume)}
                    </td>

                    {/* Put % Chng in OI */}
                    <td
                      className={`py-1.5 px-1 text-left text-[10px] ${peBg} ${
                        row.pe.pchange_oi > 0
                          ? 'text-emerald-400'
                          : row.pe.pchange_oi < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.pe.pchange_oi, true, true)}
                    </td>

                    {/* Put Chng in OI */}
                    <td
                      className={`py-1.5 px-2 text-left font-medium ${peBg} ${
                        row.pe.change_oi > 0
                          ? 'text-emerald-400'
                          : row.pe.change_oi < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatNumber(row.pe.change_oi, false, true)}
                    </td>

                    {/* Put OI */}
                    <td
                      className={`py-1.5 px-2 text-left ${peBg} ${
                        isPutWall ? 'text-amber-300 font-bold bg-emerald-950/40' : 'text-slate-300'
                      }`}
                      title={isPutWall ? 'Major Put Wall Support' : undefined}
                    >
                      {formatNumber(row.pe.oi)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Legends */}
        <div className="bg-[#0b1320] p-2.5 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-[#292209] border border-amber-800/40 block" />
              <span>Yellow Shading = In-the-Money (ITM) Contracts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-cyan-500 block" />
              <span className="font-bold text-cyan-300">ATM Strike</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">▲ Green</span>
              <span>= Positive OI / Price Change</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-rose-400 font-bold">▼ Red</span>
              <span>= Negative OI / Price Change</span>
            </div>
          </div>

          <div>
            Showing <span className="font-bold text-white">{filteredRows.length}</span> of{' '}
            <span className="font-bold text-white">{data?.rows.length || 0}</span> strikes
          </div>
        </div>
      </div>
    </main>
  );
}
