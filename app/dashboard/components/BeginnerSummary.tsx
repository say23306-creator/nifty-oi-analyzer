'use client';

import React from 'react';
import type { AnalysisResult } from '@/lib/analysis/types';

interface BeginnerSummaryProps {
  spot: number;
  expiry: string;
  analysis?: AnalysisResult | null;
  onRefresh?: () => void;
}

export default function BeginnerSummary({
  spot,
  expiry,
  analysis,
  onRefresh,
}: BeginnerSummaryProps) {
  if (!analysis) return null;

  const bias = analysis.bias?.direction ?? 'NEUTRAL';
  const confidence = analysis.bias?.confidence ?? 50;
  const pcr = analysis.pcr?.oi ?? 1.0;
  const maxPain = analysis.maxPain ?? Math.round(spot / 100) * 100;
  const supportStrike = analysis.support?.[0]?.strike ?? (Math.floor(spot / 100) * 100);
  const resistanceStrike = analysis.resistance?.[0]?.strike ?? (Math.ceil(spot / 100) * 100);

  // Simplified Traffic Light / Sentiment
  const sentimentConfig = {
    BULLISH: {
      headline: 'Market Outlook: BULLISH (Market Expected to Move UP)',
      badge: 'BULLISH / BUYERS DOMINANT',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      heroBg: 'from-emerald-950/40 via-slate-900/80 to-slate-900/60 border-emerald-500/30',
      actionTitle: 'What should a trader do?',
      actionRecommendation: 'Look for Call Buying (CE) or Bullish dips near support. Avoid shorting.',
      icon: '🚀',
      verdictColor: 'text-emerald-400',
    },
    BEARISH: {
      headline: 'Market Outlook: BEARISH (Market Expected to Move DOWN)',
      badge: 'BEARISH / SELLERS DOMINANT',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
      heroBg: 'from-rose-950/40 via-slate-900/80 to-slate-900/60 border-rose-500/30',
      actionTitle: 'What should a trader do?',
      actionRecommendation: 'Look for Put Buying (PE) or Sell on rises near resistance. Avoid aggressive longs.',
      icon: '🔻',
      verdictColor: 'text-rose-400',
    },
    NEUTRAL: {
      headline: 'Market Outlook: SIDEWAYS / RANGE-BOUND',
      badge: 'SIDEWAYS / NO DECISIVE TREND',
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      heroBg: 'from-amber-950/40 via-slate-900/80 to-slate-900/60 border-amber-500/30',
      actionTitle: 'What should a trader do?',
      actionRecommendation: 'Option buyers should be cautious (premium decay). Trade within support & resistance range.',
      icon: '⚖️',
      verdictColor: 'text-amber-400',
    },
  }[bias] || {
    headline: 'Market Outlook: NEUTRAL',
    badge: 'BALANCED',
    badgeColor: 'bg-slate-700 text-slate-300 border-slate-600',
    heroBg: 'from-slate-900 via-slate-900 to-slate-900 border-slate-800',
    actionTitle: 'Recommendation',
    actionRecommendation: 'Wait for decisive breakout above resistance or below support.',
    icon: '📊',
    verdictColor: 'text-slate-300',
  };

  // Plain English PCR Explainer
  let pcrMeaning = 'Balanced sentiment (around 1.0)';
  if (pcr > 1.3) {
    pcrMeaning = 'Very Bullish / High Put protection in place';
  } else if (pcr > 1.05) {
    pcrMeaning = 'Mildly Bullish (More Puts than Calls written)';
  } else if (pcr < 0.75) {
    pcrMeaning = 'Very Bearish / Overwhelming Call resistance';
  } else if (pcr < 0.95) {
    pcrMeaning = 'Mildly Bearish (More Calls being sold)';
  }

  return (
    <div className={`rounded-2xl border p-6 bg-gradient-to-b ${sentimentConfig.heroBg} shadow-2xl backdrop-blur-md flex flex-col gap-6`}>
      {/* Header bar with plain language banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{sentimentConfig.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Simple Market Direction
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${sentimentConfig.badgeColor}`}>
                {sentimentConfig.badge}
              </span>
            </div>
            <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${sentimentConfig.verdictColor}`}>
              {sentimentConfig.headline}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block font-mono">Current Nifty 50</span>
            <span className="text-xl font-black text-white font-mono">{spot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-mono transition"
              title="Refresh Analysis"
            >
              ↻ Refresh
            </button>
          )}
        </div>
      </div>

      {/* 3 Simple Actionable Cards for Normal Traders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Safe Buying & Selling Levels */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                🛡️ Floor & Ceiling Levels
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Based on Big Traders' Positions</span>
            </div>
            <div className="flex flex-col gap-2.5 my-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs font-semibold text-emerald-300">Strong Floor (Support)</span>
                <span className="text-base font-black text-white font-mono">{supportStrike}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="text-xs font-semibold text-rose-300">Strong Roof (Resistance)</span>
                <span className="text-base font-black text-white font-mono">{resistanceStrike}</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            💡 <strong className="text-slate-300">Plain English:</strong> The market is heavily expected to trade between{' '}
            <strong className="text-emerald-400">{supportStrike}</strong> and{' '}
            <strong className="text-rose-400">{resistanceStrike}</strong> for this weekly expiry ({expiry}).
          </p>
        </div>

        {/* Card 2: Simple Action Plan */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-2">
              🎯 Simple Trading Action
            </span>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 mb-2">
              <span className="text-xs font-bold text-white block mb-1">
                {sentimentConfig.actionTitle}
              </span>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                {sentimentConfig.actionRecommendation}
              </p>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            📊 <strong className="text-slate-300">Confidence Score:</strong>{' '}
            <span className="font-bold text-cyan-400 font-mono">{confidence}%</span> based on large institutional option volume.
          </div>
        </div>

        {/* Card 3: Big Money Gravity (Max Pain & PCR) */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-2">
              🧲 Big Money Gravity Target
            </span>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-black text-indigo-400 font-mono">{maxPain}</span>
              <span className="text-xs text-slate-400">(Max Pain Strike)</span>
            </div>
            <p className="text-xs text-slate-300 mb-2">
              Option sellers lose the least amount of money if Nifty settles near{' '}
              <strong className="text-indigo-300">{maxPain}</strong> on expiry day.
            </p>
          </div>
          <div className="p-2 rounded bg-slate-800/40 border border-slate-800 text-[11px] text-slate-400">
            <span className="text-slate-300 font-semibold">PCR Sentiment ({pcr.toFixed(2)}):</span> {pcrMeaning}
          </div>
        </div>
      </div>
    </div>
  );
}
