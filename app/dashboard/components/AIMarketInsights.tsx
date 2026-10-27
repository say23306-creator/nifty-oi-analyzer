'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { AiMarketAnalysis } from '@/lib/ai/gemini';

interface AIMarketInsightsProps {
  onRefreshParent?: () => void;
}

export default function AIMarketInsights({ onRefreshParent }: AIMarketInsightsProps) {
  const [analysis, setAnalysis] = useState<AiMarketAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ai-analysis');
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          setAnalysis(data.analysis);
        }
      }
    } catch (err) {
      console.error('Failed to load AI analysis:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const handleGenerateFresh = async (broadcast = false) => {
    try {
      if (broadcast) setBroadcasting(true);
      else setRefreshing(true);
      setError(null);
      setBroadcastSuccess(false);

      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceFresh: true,
          broadcastTelegram: broadcast,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to generate AI analysis');
      }

      if (data.analysis) {
        setAnalysis(data.analysis);
        if (broadcast) {
          setBroadcastSuccess(true);
          setTimeout(() => setBroadcastSuccess(false), 4000);
        }
      }
      if (onRefreshParent) onRefreshParent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error generating AI analysis');
    } finally {
      setRefreshing(false);
      setBroadcasting(false);
    }
  };

  const getBiasConfig = (bias?: string) => {
    if (!bias) return { bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: '⚪' };
    if (bias.includes('STRONG_BULLISH')) {
      return { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/20', icon: '🚀' };
    }
    if (bias.includes('BULLISH')) {
      return { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: '🟢' };
    }
    if (bias.includes('STRONG_BEARISH')) {
      return { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-rose-500/20', icon: '🔻' };
    }
    if (bias.includes('BEARISH')) {
      return { bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: '🔴' };
    }
    return { bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: '⚪' };
  };

  const biasStyle = getBiasConfig(analysis?.bias);

  return (
    <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-indigo-950/30 p-5 shadow-2xl backdrop-blur-md relative overflow-hidden">
      {/* Background ambient decorative glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-cyan-500/20">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                AI Institutional Intelligence
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                {analysis?.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Rules Engine'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live Option Chain &amp; Price-OI Matrix Breakdown
              {analysis && (
                <span className="ml-2 text-slate-500 font-mono text-[11px]">
                  • {new Date(analysis.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {analysis && (
            <div
              className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm ${biasStyle.bg}`}
            >
              <span>{biasStyle.icon}</span>
              <span>{analysis.bias}</span>
              <span className="opacity-75">({analysis.confidence}%)</span>
            </div>
          )}

          <button
            onClick={() => handleGenerateFresh(false)}
            disabled={refreshing || broadcasting}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 font-mono shadow-md shadow-indigo-600/20"
            title="Generate fresh AI analysis with live chain data"
          >
            {refreshing ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <span>✨ Refresh AI</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleGenerateFresh(true)}
            disabled={refreshing || broadcasting}
            className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 disabled:opacity-50 font-medium text-xs transition cursor-pointer flex items-center gap-1.5 font-mono"
            title="Generate fresh AI analysis and broadcast instantly to Telegram channel"
          >
            {broadcasting ? (
              <>
                <span className="w-3 h-3 border-2 border-sky-300 border-t-transparent rounded-full animate-spin" />
                <span>Broadcasting...</span>
              </>
            ) : (
              <>
                <span>📢 Telegram</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {broadcastSuccess && (
        <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-mono">
          <span>✅</span>
          <span>Hourly AI Analysis successfully broadcast to Telegram!</span>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Body */}
      {loading && !analysis ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 font-mono text-xs">
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Synthesizing institutional option dynamics...</span>
        </div>
      ) : analysis ? (
        <div className="mt-4 space-y-4 relative z-10">
          {/* Headline Callout */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
            <span className="text-xl">📢</span>
            <div>
              <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-wider font-bold block mb-0.5">
                Market Pulse Headline
              </span>
              <p className="text-sm font-semibold text-white leading-relaxed">
                {analysis.headline}
              </p>
            </div>
          </div>

          {/* Grid Layout: Executive Narrative & Institutional Flows */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Executive Summary */}
            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="text-cyan-400">◈</span> Institutional Narrative &amp; Market Structure
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {analysis.summary}
                </p>
              </div>

              {/* Key Pivots Bar */}
              <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-emerald-400 uppercase block">Support 1</span>
                  <span className="text-xs font-bold text-white">{analysis.keyLevels.support1}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-cyan-400 uppercase block">Pivot</span>
                  <span className="text-xs font-bold text-white">{analysis.keyLevels.pivot}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-rose-400 uppercase block">Resistance 1</span>
                  <span className="text-xs font-bold text-white">{analysis.keyLevels.resistance1}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-indigo-400 uppercase block">Max Pain</span>
                  <span className="text-xs font-bold text-white">{analysis.keyLevels.maxPain}</span>
                </div>
              </div>
            </div>

            {/* Right Col: Institutional Flow Breakdown */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="text-indigo-400">◈</span> Smart Money Positioning
                </h3>
                <div className="space-y-2.5 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-rose-400 font-semibold block uppercase">Call Writing Activity</span>
                    <span className="text-slate-300 text-[11px] mt-0.5 block">
                      {analysis.institutionalFlows.callWriters}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-emerald-400 font-semibold block uppercase">Put Writing Activity</span>
                    <span className="text-slate-300 text-[11px] mt-0.5 block">
                      {analysis.institutionalFlows.putWriters}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-cyan-400 font-semibold block uppercase">Dominant Market Driver</span>
                    <span className="text-white font-bold text-[11px] mt-0.5 block">
                      {analysis.institutionalFlows.dominantAction}
                    </span>
                  </div>
                </div>
              </div>

              {/* Strategy Card */}
              <div className="p-3 rounded-lg bg-gradient-to-br from-indigo-950/60 to-slate-900/80 border border-indigo-500/30 font-mono text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-indigo-300 font-bold uppercase">Tactical Setup</span>
                  <span className="text-[10px] text-amber-400 font-semibold">{analysis.strategyRecommendation.riskReward}</span>
                </div>
                <div className="font-bold text-white text-xs mb-1">
                  {analysis.strategyRecommendation.name}
                </div>
                <p className="text-[11px] text-slate-300">
                  {analysis.strategyRecommendation.setup}
                </p>
                <div className="mt-2 text-[10px] text-slate-400 flex justify-between border-t border-slate-800 pt-1.5">
                  <span>Invalidation Level:</span>
                  <span className="text-rose-400 font-bold">{analysis.invalidationLevel} Spot</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Strike Observations (Matrix Rules Applied) */}
          {analysis.strikeObservations && analysis.strikeObservations.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-400">◈</span> Key Strike Observations (Reference Matrix Applied)
                </span>
                <span className="text-[10px] text-slate-500">Call &amp; Put Inversion Rules</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 font-mono text-xs">
                {analysis.strikeObservations.map((s, idx) => {
                  const isBull = s.stockView.includes('BULL');
                  const isBear = s.stockView.includes('BEAR');
                  const badgeColor = isBull
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : isBear
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700';

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-white">
                            {s.strike} {s.optionType}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                            {s.stockView}
                          </span>
                        </div>
                        <span className="text-[11px] text-cyan-400 block mb-1">
                          {s.observation}
                        </span>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {s.reasoning}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center flex flex-col items-center gap-3">
          <p className="text-xs text-slate-400 max-w-md">
            No AI analysis has been generated yet for this session. Click below to synthesize the live option chain.
          </p>
          <button
            onClick={() => handleGenerateFresh(false)}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition font-mono shadow-lg shadow-cyan-500/20"
          >
            ✨ Generate AI Market Analysis Now
          </button>
        </div>
      )}
    </div>
  );
}
