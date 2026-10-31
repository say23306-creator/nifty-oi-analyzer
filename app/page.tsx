'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { OptionChainPayload, PairedStrikeRow } from '@/lib/db';

export default function OptionChainPage() {
  const [data, setData] = useState<OptionChainPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters matching NSE
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [selectedStrike, setSelectedStrike] = useState<string>('all');
  const [streamingOn, setStreamingOn] = useState<boolean>(true);

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

  // Streaming auto-refresh every 30 seconds
  useEffect(() => {
    if (!streamingOn) return;
    const interval = setInterval(() => {
      fetchData(selectedExpiry);
    }, 30000);
    return () => clearInterval(interval);
  }, [streamingOn, selectedExpiry, fetchData]);

  const handleExpiryChange = (newExpiry: string) => {
    setSelectedExpiry(newExpiry);
    fetchData(newExpiry);
  };

  // Indian number comma formatting: 1,21,881
  const formatIndianNumber = (num: number | null | undefined, decimals = 0): string => {
    if (num === null || num === undefined || num === 0) return '-';
    if (decimals > 0) {
      const parts = num.toFixed(decimals).split('.');
      const intPart = parseInt(parts[0], 10).toLocaleString('en-IN');
      return `${intPart}.${parts[1]}`;
    }
    return Math.round(num).toLocaleString('en-IN');
  };

  // Formatter for price change with color
  const renderChange = (chg: number) => {
    if (!chg || chg === 0) return <span>-</span>;
    const isPos = chg > 0;
    const color = isPos ? 'text-[#008000]' : 'text-[#d32f2f]';
    return (
      <span className={`${color} font-semibold`}>
        {chg > 0 ? `+${chg.toFixed(2)}` : chg.toFixed(2)}
      </span>
    );
  };

  // Filter strikes
  const filteredRows = useMemo(() => {
    if (!data || !data.rows) return [];
    if (selectedStrike === 'all') return data.rows;
    if (selectedStrike.startsWith('±')) {
      const count = parseInt(selectedStrike.replace('±', ''), 10);
      const atmIndex = data.rows.findIndex((r) => r.isATM);
      if (atmIndex === -1) return data.rows;
      const start = Math.max(0, atmIndex - count);
      const end = Math.min(data.rows.length, atmIndex + count + 1);
      return data.rows.slice(start, end);
    }
    const targetStrike = parseInt(selectedStrike, 10);
    return data.rows.filter((r) => r.strike === targetStrike);
  }, [data, selectedStrike]);

  // Format date display like NSE: "30-Oct-2026 15:40:00 IST"
  const formattedTimestamp = useMemo(() => {
    if (!data?.timestamp) return '30-Oct-2026 15:30:00 IST';
    const d = new Date(data.timestamp);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' IST';
  }, [data?.timestamp]);

  // CSV download function
  const downloadCSV = () => {
    if (!data || !data.rows) return;
    const headers = [
      'CALLS_OI',
      'CALLS_CHNG_IN_OI',
      'CALLS_LTP',
      'CALLS_CHNG',
      'STRIKE',
      'PUTS_CHNG',
      'PUTS_LTP',
      'PUTS_CHNG_IN_OI',
      'PUTS_OI',
    ];

    const csvRows = [headers.join(',')];

    for (const r of data.rows) {
      csvRows.push(
        [
          r.ce.oi,
          r.ce.change_oi,
          r.ce.ltp,
          r.ce.price_change,
          r.strike,
          r.pe.price_change,
          r.pe.ltp,
          r.pe.change_oi,
          r.pe.oi,
        ].join(',')
      );
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `option-chain-${data.expiry || 'NIFTY'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 font-sans text-sm text-[#444]">
        <div className="w-8 h-8 border-3 border-[#2b2259] border-t-transparent rounded-full animate-spin" />
        <span className="font-medium text-[#2b2259]">Loading NSE Option Chain...</span>
      </div>
    );
  }

  const spot = data?.spot || 23053.10;

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-[#222222] font-sans antialiased text-[12px] p-4 sm:p-6 md:p-8 lg:p-10 select-text flex flex-col items-center">
      {/* ── Framed Dashboard Card with Border Space Around ── */}
      <div className="w-full max-w-[1080px] bg-white rounded-xl border border-[#d0d7de] shadow-sm p-4 sm:p-5 flex flex-col">
        {/* ── Top Bar matching NSE ────────────────────────────────────────────── */}
        <div className="w-full mb-3">
          {/* Underlying Index & Timestamp */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#333333] font-normal">Underlying Index :</span>
              <span className="font-bold text-[#111111] text-[13px]">
                {selectedSymbol} {formatIndianNumber(spot, 2)}
              </span>
              <span className="text-[#666666] text-[11px]">As on {formattedTimestamp}</span>
              <button
                onClick={() => fetchData(selectedExpiry)}
                title="Refresh Data"
                className="text-[#ea6212] hover:text-[#c44e07] transition cursor-pointer p-0.5"
              >
                <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Right Links */}
            <div className="flex items-center gap-4 text-[11px]">
              <a href="https://www.nseindia.com" target="_blank" rel="noreferrer" className="text-[#0055b8] hover:underline cursor-pointer">
                Terms of Use
              </a>
              <button
                onClick={downloadCSV}
                className="flex items-center gap-1 text-[#333333] hover:text-black transition cursor-pointer font-medium"
              >
                {/* CSV icon */}
                <svg className="w-3.5 h-3.5 text-[#d93025]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                </svg>
                <span>Download (.csv)</span>
              </button>
            </div>
          </div>

          {/* Streaming & Filter Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-1">
            {/* Left Selectors */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Streaming Toggle */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-[#444]">Streaming</span>
                <button
                  onClick={() => setStreamingOn(!streamingOn)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 transition cursor-pointer ${
                    streamingOn ? 'bg-[#54a638] justify-end' : 'bg-[#ccc] justify-start'
                  }`}
                >
                  <div className="w-3 h-3 bg-white rounded-full shadow-md" />
                </button>
                <span className={`font-semibold text-[10px] ${streamingOn ? 'text-[#54a638]' : 'text-[#777]'}`}>
                  {streamingOn ? 'On' : 'Off'}
                </span>
              </div>

              {/* Select Symbol */}
              <div className="flex items-center">
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="h-6.5 px-2 rounded border border-[#ea6212] bg-white text-[#ea6212] font-semibold text-[11px] focus:outline-none cursor-pointer"
                >
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="FINNIFTY">FINNIFTY</option>
                </select>
              </div>

              {/* Expiry Date */}
              <div className="flex items-center">
                <select
                  value={selectedExpiry}
                  onChange={(e) => handleExpiryChange(e.target.value)}
                  className="h-6.5 px-2 rounded border border-[#ea6212] bg-white text-[#ea6212] font-semibold text-[11px] focus:outline-none cursor-pointer"
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

              {/* Strike Price Filter */}
              <div className="flex items-center">
                <select
                  value={selectedStrike}
                  onChange={(e) => setSelectedStrike(e.target.value)}
                  className="h-6.5 px-2 rounded border border-[#ea6212] bg-white text-[#ea6212] font-semibold text-[11px] focus:outline-none cursor-pointer"
                >
                  <option value="all">Strike Price: Select All</option>
                  <option value="±10">Strike Range: ±10 Strikes</option>
                  <option value="±20">Strike Range: ±20 Strikes</option>
                  <option value="±30">Strike Range: ±30 Strikes</option>
                  {data?.rows?.map((r) => (
                    <option key={r.strike} value={r.strike.toString()}>
                      Strike: {r.strike}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Metrics (PCR & Max Pain) */}
            <div className="flex items-center gap-3 text-[11px] font-sans text-[#555]">
              <div>
                PCR: <span className="font-bold text-[#111]">{data?.pcr?.toFixed(2) || '1.62'}</span>
              </div>
              <div>
                Max Pain: <span className="font-bold text-[#111]">{data?.maxPain || 23000}</span>
              </div>
              <div>
                Call OI: <span className="font-bold text-[#111]">{formatIndianNumber(data?.totalCeOI)}</span>
              </div>
              <div>
                Put OI: <span className="font-bold text-[#111]">{formatIndianNumber(data?.totalPeOI)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Focused NSE Option Chain Table ─────────────────────────────────── */}
        <div className="w-full overflow-x-auto border border-[#c8c8c8] rounded-md shadow-xs">
          <table className="w-full border-collapse text-[11.5px] font-sans leading-tight">
            {/* Main Table Headers */}
            <thead>
              {/* Top Super Category Header: CALLS | STRIKE | PUTS */}
              <tr className="bg-[#2b2259] text-white text-center font-bold text-[12px] uppercase tracking-wider border-b border-[#3b3269]">
                <th colSpan={4} className="py-2 px-2 border-r border-[#433775]">
                  CALLS
                </th>
                <th className="py-2 px-3 border-r border-[#433775] bg-[#221a47] w-[120px]">
                  STRIKE
                </th>
                <th colSpan={4} className="py-2 px-2">
                  PUTS
                </th>
              </tr>

              {/* Subheaders with comfortable proportion */}
              <tr className="bg-[#2b2259] text-white font-bold text-[10px] uppercase tracking-tight border-b border-[#433775]">
                {/* Calls Side */}
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">OI</th>
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">CHNG IN OI</th>
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">LTP</th>
                <th className="py-1.5 px-2.5 text-right border-r-2 border-[#1c143d]">CHNG</th>

                {/* Strike Price (Center) */}
                <th className="py-1.5 px-3 text-center bg-[#221a47] text-white border-r-2 border-[#1c143d] font-bold w-[120px]">
                  STRIKE
                </th>

                {/* Puts Side */}
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">CHNG</th>
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">LTP</th>
                <th className="py-1.5 px-2.5 text-right border-r border-[#3b3269]">CHNG IN OI</th>
                <th className="py-1.5 px-2.5 text-right">OI</th>
              </tr>
            </thead>

            {/* Table Body with authentic NSE ITM yellow coloring (#fff7d6) */}
            <tbody className="divide-y divide-[#e2e2e2]">
              {filteredRows.map((row) => {
                const isATM = row.isATM;

                // Authentic NSE Shading:
                // Calls are In-The-Money (ITM) when strike <= spot -> #fff7d6
                // Puts are In-The-Money (ITM) when strike >= spot -> #fff7d6
                // Out-of-the-Money (OTM) cells are pure white (#ffffff)
                const ceBg = row.isITMCall ? 'bg-[#fff7d6]' : 'bg-white';
                const peBg = row.isITMPut ? 'bg-[#fff7d6]' : 'bg-white';

                return (
                  <tr
                    key={row.strike}
                    className={`hover:bg-[#f1f3f7] transition-colors ${
                      isATM ? 'ring-1 ring-[#0055b8]' : ''
                    }`}
                  >
                    {/* ── CALLS (LEFT SIDE) ── */}

                    {/* Call OI */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] font-medium text-[#111] ${ceBg}`}>
                      {formatIndianNumber(row.ce.oi)}
                    </td>

                    {/* Call Chng in OI */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] font-medium text-[#111] ${ceBg}`}>
                      {formatIndianNumber(row.ce.change_oi)}
                    </td>

                    {/* Call LTP (Blue Link) */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] ${ceBg}`}>
                      {row.ce.ltp > 0 ? (
                        <span className="text-[#0055b8] font-bold hover:underline cursor-pointer">
                          {formatIndianNumber(row.ce.ltp, 2)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* Call CHNG */}
                    <td className={`py-1.5 px-2.5 text-right border-r-2 border-[#b0b0b0] ${ceBg}`}>
                      {renderChange(row.ce.price_change)}
                    </td>

                    {/* ── STRIKE PRICE (CENTER) ── */}
                    <td
                      className={`py-1.5 px-3 text-center font-bold border-r-2 border-[#b0b0b0] ${
                        isATM
                          ? 'bg-[#e7f1ff] text-[#0055b8]'
                          : 'bg-[#fafafa] text-[#0055b8]'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className="underline hover:text-[#003380] cursor-pointer">
                          {formatIndianNumber(row.strike, 2)}
                        </span>
                        {isATM && (
                          <span className="text-[8px] px-1 py-0.2 bg-[#0055b8] text-white rounded font-bold uppercase tracking-wider">
                            ATM
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ── PUTS (RIGHT SIDE) ── */}

                    {/* Put CHNG */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] ${peBg}`}>
                      {renderChange(row.pe.price_change)}
                    </td>

                    {/* Put LTP (Blue Link) */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] ${peBg}`}>
                      {row.pe.ltp > 0 ? (
                        <span className="text-[#0055b8] font-bold hover:underline cursor-pointer">
                          {formatIndianNumber(row.pe.ltp, 2)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* Put Chng in OI */}
                    <td className={`py-1.5 px-2.5 text-right border-r border-[#e6e6e6] font-medium text-[#111] ${peBg}`}>
                      {formatIndianNumber(row.pe.change_oi)}
                    </td>

                    {/* Put OI */}
                    <td className={`py-1.5 px-2.5 text-right text-[#111] font-medium ${peBg}`}>
                      {formatIndianNumber(row.pe.oi)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Info inside the framed card */}
        <div className="w-full mt-2.5 text-[11px] text-[#666] flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            * Data source: NSE India • Snapshot Checkpoint: <span className="font-semibold text-[#111]">{data?.checkpoint || 'LIVE'}</span>
          </div>
          <div>
            Showing {filteredRows.length} of {data?.rows?.length || 0} strike records
          </div>
        </div>
      </div>
    </div>
  );
}
