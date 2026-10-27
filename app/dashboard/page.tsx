'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ChainTable from './components/ChainTable';
import OIBarChart from './components/OIBarChart';
import PCRChart from './components/PCRChart';
import BiasHistory from './components/BiasHistory';
import SignalsList from './components/SignalsList';
import OIInterpretationPanel from './components/OIInterpretationPanel';
import AIMarketInsights from './components/AIMarketInsights';
import BeginnerSummary from './components/BeginnerSummary';
import OptionsScreener from './components/OptionsScreener';
import type { DbChainRow, DbSignal } from '@/lib/db/queries';
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
  paperSummary?: {
    total: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number;
  };
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

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [chainRows, setChainRows] = useState<DbChainRow[]>([]);
  const [signals, setSignals] = useState<DbSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'simple' | 'screener' | 'pro'>('simple');

  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (triggerLiveScrape = false) => {
    try {
      if (triggerLiveScrape) {
        setRefreshing(true);
        // Trigger on-demand fresh scrape from NSE and sync to Supabase
        await fetch('/api/dashboard/trigger-refresh', { method: 'POST', cache: 'no-store' });
      }

      const cacheBust = `?t=${Date.now()}`;
      const [sumRes, chainRes, sigRes] = await Promise.all([
        fetch(`/api/dashboard/summary${cacheBust}`, { cache: 'no-store' }),
        fetch(`/api/dashboard/chain${cacheBust}`, { cache: 'no-store' }),
        fetch(`/api/dashboard/signals${cacheBust}`, { cache: 'no-store' }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      if (chainRes.ok) {
        const cData = await chainRes.json();
        setChainRows(cData.rows || []);
      }

      if (sigRes.ok) {
        const sData = await sigRes.json();
        setSignals(sData.signals || []);
      }

      setLastRefreshed(new Date());
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

  // Auto-refresh interval (every 30 seconds during active viewing)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  if (loading && !summary) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-3 font-mono text-sm">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading institutional option chain data...</span>
      </div>
    );
  }

  const snap = summary?.snapshot;
  const analysis = summary?.analysis;
  const market = summary?.market;
  const history = summary?.history || [];
  const paperSummary = summary?.paperSummary;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Ticker Card */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Market Status Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                market?.isOpen
                  ? 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              {market?.isOpen ? 'Market Live' : 'Market Closed'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Spot Price */}
          {snap ? (
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-xs text-slate-400">NIFTY 50:</span>
              <span className="text-xl font-bold text-white tracking-tight">
                {snap.spot.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">
                (Expiry: <span className="text-cyan-400 font-semibold">{snap.expiry}</span>)
              </span>
            </div>
          ) : (
            <span className="text-xs text-amber-400 font-mono">No snapshot recorded yet</span>
          )}
        </div>

        {/* Action Buttons & Mode Switcher */}
        <div className="flex items-center gap-3 text-xs">
          {/* Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'simple'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🌱 Simple View</span>
            </button>
            <button
              onClick={() => setViewMode('screener')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'screener'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔍 Options Screener</span>
            </button>
            <button
              onClick={() => setViewMode('pro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'pro'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔬 Pro Trader View</span>
            </button>
          </div>

          <div
            className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium flex items-center gap-1.5 font-mono hidden sm:flex"
            title="Real-Time Feed Active"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{summary?.feedSource || 'NSE Python Feed'}</span>
          </div>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg border transition cursor-pointer font-mono ${
              autoRefresh
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Auto: {autoRefresh ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 transition font-medium cursor-pointer flex items-center gap-1.5 font-mono"
          >
            {refreshing ? (
              <>
                <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Scraping NSE...</span>
              </>
            ) : (
              <span>↻ Refresh Live</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* When no snapshot is in DB yet */}
      {!summary?.available && (
        <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xl font-bold font-mono">
            ⚡
          </div>
          <div>
            <h3 className="text-base font-bold text-white mb-1">No Option Chain Data Recorded Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Your serverless database is clean and ready. Once the collector runs (via Vercel Cron or manual trigger), full chain snapshots, PCR trends, and institutional buildups will appear here automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs font-mono">
              1. Add Dhan Token in .env.local
            </span>
            <span className="text-slate-600 font-mono text-xs">•</span>
            <span className="text-xs text-slate-400 font-mono">
              2. POST /api/collect with CRON_SECRET
            </span>
          </div>
        </div>
      )}

      {/* Quick Action Navigation Cards (including Options Screener Card) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card: Options Screener (matching user requested feature) */}
        <div
          onClick={() => setViewMode('screener')}
          className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-3 group ${
            viewMode === 'screener'
              ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xl group-hover:scale-105 transition">
              📑
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold uppercase">
              Tool
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition">
              Options Screener
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Filter Option Chain to find relevant Options by Buildups, Traps, and Moneyness
            </p>
          </div>
        </div>

        {/* Card: Institutional AI Analysis */}
        <div
          onClick={() => setViewMode('simple')}
          className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-3 group ${
            viewMode === 'simple'
              ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xl group-hover:scale-105 transition">
              🤖
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold uppercase">
              AI
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
              AI Market Summary
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Plain English explanation of who is trapped and overall market bias
            </p>
          </div>
        </div>

        {/* Card: Pro Option Chain */}
        <div
          onClick={() => setViewMode('pro')}
          className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-3 group ${
            viewMode === 'pro'
              ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
              : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-xl group-hover:scale-105 transition">
              📊
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold uppercase">
              Pro
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition">
              Deep Option Chain
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Full strike-by-strike OI heatmap, PCR trends, and institutional support/resistance
            </p>
          </div>
        </div>
      </div>

      {/* Simple Beginner Summary for Normal Persons */}
      {viewMode === 'simple' && snap && analysis && (
        <BeginnerSummary
          spot={snap.spot}
          expiry={snap.expiry}
          analysis={analysis}
          onRefresh={() => fetchData(true)}
        />
      )}

      {/* Row 0: Live AI Institutional Market Intelligence */}
      {snap && analysis && (
        <AIMarketInsights onRefreshParent={fetchData} />
      )}

      {/* Dedicated Options Screener Mode */}
      {viewMode === 'screener' && snap && chainRows.length > 0 && (
        <OptionsScreener
          rows={chainRows}
          spot={snap.spot}
          buildups={analysis?.buildups}
        />
      )}

      {/* Advanced Technical Panels — Available in Pro Mode */}
      {viewMode === 'pro' && (
        <>
          {/* Options Screener also available directly inside Pro mode */}
          {snap && chainRows.length > 0 && (
            <OptionsScreener
              rows={chainRows}
              spot={snap.spot}
              buildups={analysis?.buildups}
            />
          )}

          {/* Key Metric Stat Cards */}
          {snap && analysis && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Card 1: Spot */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow backdrop-blur-sm font-mono">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Nifty Spot
                </span>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {snap.spot.toFixed(2)}
                </div>
                <span className="text-[10px] text-cyan-400 mt-1 block">
                  Snapshot #{snap.id}
                </span>
              </div>

              {/* Card 2: PCR */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow backdrop-blur-sm font-mono">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Put-Call Ratio (OI)
                </span>
                <div className="text-2xl font-bold text-cyan-400 tracking-tight">
                  {(analysis.pcr?.oi ?? 1.0).toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Vol PCR: {(analysis.pcr?.volume ?? 1.0).toFixed(2)}
                </span>
              </div>

              {/* Card 3: Max Pain */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow backdrop-blur-sm font-mono">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Max Pain Strike
                </span>
                <div className="text-2xl font-bold text-indigo-400 tracking-tight">
                  {analysis.maxPain}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Min. option writer pain
                </span>
              </div>

              {/* Card 4: Market Bias */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow backdrop-blur-sm font-mono">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Market Bias
                </span>
                <div
                  className={`text-2xl font-bold tracking-tight ${
                    analysis.bias.direction === 'BULLISH'
                      ? 'text-emerald-400'
                      : analysis.bias.direction === 'BEARISH'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {analysis.bias.direction}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {analysis.bias.confidence}% Confidence
                </span>
              </div>
            </div>
          )}

          {/* Row 1: Bias & Catalysts + PCR Intraday Chart */}
          {snap && analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BiasHistory
                bias={analysis.bias}
                support={analysis.support}
                resistance={analysis.resistance}
                maxPain={analysis.maxPain}
                spot={snap.spot}
              />
              <PCRChart history={history} />
            </div>
          )}

          {/* Row 2: Open Interest Bar Chart Distribution */}
          {snap && chainRows.length > 0 && (
            <OIBarChart rows={chainRows} spot={snap.spot} />
          )}

          {/* Row 3: OI Signal Interpretation Panel (Price x OI matrix) */}
          {snap && analysis && analysis.buildups.length > 0 && (
            <OIInterpretationPanel buildups={analysis.buildups} />
          )}

          {/* Row 4: Full Option Chain Heatmap Table */}
          {snap && chainRows.length > 0 && (
            <ChainTable
              rows={chainRows}
              spot={snap.spot}
              maxPain={analysis?.maxPain}
              support={analysis?.support}
              resistance={analysis?.resistance}
              buildups={analysis?.buildups}
            />
          )}
        </>
      )}

      {/* Row 5: Real-time Signals & Paper Trading Feed */}
      <SignalsList signals={signals} paperSummary={paperSummary} />
    </div>
  );
}
