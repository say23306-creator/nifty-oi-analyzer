'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ChainTable from './components/ChainTable';
import OIBarChart from './components/OIBarChart';
import PCRChart from './components/PCRChart';
import BiasHistory from './components/BiasHistory';
import AIMarketInsights from './components/AIMarketInsights';
import OptionsScreener from './components/OptionsScreener';
import type { DbChainRow } from '@/lib/db/queries';
import type { AnalysisResult } from '@/lib/analysis/types';

interface SummaryData {
  available: boolean;
  snapshot?: {
    id: number;
    ts: string;
    expiry: string;
    spot: number;
  };
  analysis?: AnalysisResult | null;
  history?: Array<{
    id: number;
    ts: string;
    spot: number;
    pcr: number;
    totalCeOI: number;
    totalPeOI: number;
  }>;
  market?: {
    isOpen: boolean;
    ist: string;
  };
  feedSource?: string;
}

type TabType = 'screener' | 'chain' | 'charts' | 'ai';

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [chainRows, setChainRows] = useState<DbChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('screener');
  const [refreshing, setRefreshing] = useState(false);

  // Load user's preferred tab from localStorage on mount
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem('nifty_dashboard_tab') as TabType;
      if (savedTab && ['screener', 'chain', 'charts', 'ai'].includes(savedTab)) {
        setActiveTab(savedTab);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('nifty_dashboard_tab', tab);
    } catch {
      // Ignore localStorage write errors
    }
  };

  const fetchData = useCallback(async (triggerLiveScrape = false) => {
    try {
      if (triggerLiveScrape) {
        setRefreshing(true);
        await fetch('/api/dashboard/trigger-refresh', { method: 'POST', cache: 'no-store' });
      }

      const cacheBust = `?t=${Date.now()}`;
      const [sumRes, chainRes] = await Promise.all([
        fetch(`/api/dashboard/summary${cacheBust}`, { cache: 'no-store' }),
        fetch(`/api/dashboard/chain${cacheBust}`, { cache: 'no-store' }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      if (chainRes.ok) {
        const cData = await chainRes.json();
        setChainRows(cData.rows || []);
      }

      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error fetching data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval (every 30 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  if (loading && !summary) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-400 gap-3 font-mono text-sm">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading institutional option chain data...</span>
      </div>
    );
  }

  const snap = summary?.snapshot;
  const analysis = summary?.analysis;
  const market = summary?.market;
  const history = summary?.history || [];

  const pcrValue = analysis?.pcr?.oi ?? 1.0;
  const biasDir = analysis?.bias?.direction ?? 'NEUTRAL';
  const biasConf = analysis?.bias?.confidence ?? 50;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Top High-Density Status & Metric Bar */}
      <div className="p-3 sm:p-3.5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-md backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Market Status & Spot */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Live Status Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${market?.isOpen
                  ? 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50'
                  : 'bg-slate-600'
                }`}
            />
            <span className="font-mono font-bold uppercase tracking-wider text-slate-300 text-[11px]">
              {market?.isOpen ? 'Live' : 'Closed'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Spot Price */}
          {snap ? (
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-slate-400 font-semibold text-[11px]">NIFTY 50:</span>
              <span className="text-lg font-bold text-white tracking-tight">
                {snap.spot.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-400 hidden md:inline">
                (Exp: <span className="text-cyan-400 font-semibold">{snap.expiry}</span>)
              </span>
            </div>
          ) : (
            <span className="text-amber-400 font-mono text-xs">No snapshot loaded</span>
          )}

          {/* Compact Inline Metric Badges */}
          {analysis && (
            <div className="hidden lg:flex items-center gap-2 font-mono text-[11px]">
              {/* PCR Badge */}
              <div className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                <span className="text-slate-500">PCR:</span>
                <span
                  className={`font-bold ${pcrValue >= 1.0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                >
                  {pcrValue.toFixed(2)}
                </span>
              </div>

              {/* Max Pain */}
              <div className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                <span className="text-slate-500">Max Pain:</span>
                <span className="font-bold text-indigo-400">{analysis.maxPain}</span>
              </div>

              {/* Market Bias */}
              <div
                className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-bold ${biasDir === 'BULLISH'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : biasDir === 'BEARISH'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}
              >
                <span>{biasDir === 'BULLISH' ? '▲' : biasDir === 'BEARISH' ? '▼' : '◆'}</span>
                <span>{biasDir}</span>
                <span className="text-[10px] opacity-75 font-normal">({biasConf}%)</span>
              </div>

              {/* Support / Resistance */}
              {analysis.support?.[0] && analysis.resistance?.[0] && (
                <div className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">
                    S: {analysis.support[0].strike}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-rose-400 font-bold">
                    R: {analysis.resistance[0].strike}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Feed Status & Refresh Controls */}
        <div className="flex items-center gap-2 font-mono">
          <div
            className="px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium text-[11px] items-center gap-1.5 hidden sm:flex"
            title="Real-Time Feed Active"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{summary?.feedSource || 'NSE Python Feed'}</span>
          </div>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1 rounded-md border transition cursor-pointer text-[11px] font-bold ${autoRefresh
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            title="Toggle 30-sec live auto-refresh"
          >
            Auto: {autoRefresh ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 transition font-bold cursor-pointer flex items-center gap-1.5 text-[11px]"
            title="Force fresh scrape from NSE India"
          >
            {refreshing ? (
              <>
                <span className="w-2.5 h-2.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Scraping...</span>
              </>
            ) : (
              <span>↻ Refresh</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Tab Navigation Bar — Ultra Compact & Intuitive */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Tab 1: Options Screener */}
          <button
            onClick={() => handleTabChange('screener')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${activeTab === 'screener'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
          >
            <span>🔍</span>
            <span>Options Screener</span>
          </button>

          {/* Tab 2: Deep Option Chain Table */}
          <button
            onClick={() => handleTabChange('chain')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${activeTab === 'chain'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
          >
            <span>📊</span>
            <span>Option Chain Heatmap</span>
          </button>

          {/* Tab 3: Charts & Trends */}
          <button
            onClick={() => handleTabChange('charts')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${activeTab === 'charts'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
          >
            <span>📈</span>
            <span>Charts & Distribution</span>
          </button>

          {/* Tab 4: AI Institutional Intelligence */}
          <button
            onClick={() => handleTabChange('ai')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${activeTab === 'ai'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
          >
            <span>🤖</span>
            <span>AI Intelligence</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>{chainRows.length} active strikes</span>
        </div>
      </div>

      {/* Main Tab Panels — Only Selected Tool Renders, Zero Extra Space Wasted */}
      <div className="w-full">
        {/* Panel 1: Options Screener */}
        {activeTab === 'screener' && (
          <div className="w-full">
            {snap && chainRows.length > 0 ? (
              <OptionsScreener
                rows={chainRows}
                spot={snap.spot}
                buildups={analysis?.buildups}
              />
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Awaiting strike data...
              </div>
            )}
          </div>
        )}

        {/* Panel 2: Deep Option Chain Heatmap */}
        {activeTab === 'chain' && (
          <div className="w-full">
            {snap && chainRows.length > 0 ? (
              <ChainTable
                rows={chainRows}
                spot={snap.spot}
                maxPain={analysis?.maxPain}
                support={analysis?.support}
                resistance={analysis?.resistance}
                buildups={analysis?.buildups}
              />
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Awaiting option chain records...
              </div>
            )}
          </div>
        )}

        {/* Panel 3: Charts & Trends (Side-by-side or stacked clean layout) */}
        {activeTab === 'charts' && (
          <div className="flex flex-col gap-4 w-full">
            {/* Top row: Bias score & PCR Intraday Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analysis && (
                <BiasHistory
                  bias={analysis.bias}
                  support={analysis.support}
                  resistance={analysis.resistance}
                  maxPain={analysis.maxPain}
                  spot={snap?.spot}
                />
              )}
              <PCRChart history={history} />
            </div>

            {/* Bottom row: Full Strike Open Interest Bar Chart */}
            {snap && chainRows.length > 0 && (
              <OIBarChart rows={chainRows} spot={snap.spot} />
            )}
          </div>
        )}

        {/* Panel 4: AI Institutional Intelligence & Telegram Broadcast */}
        {activeTab === 'ai' && (
          <div className="w-full">
            <AIMarketInsights onRefreshParent={fetchData} />
          </div>
        )}
      </div>
    </div>
  );
}
