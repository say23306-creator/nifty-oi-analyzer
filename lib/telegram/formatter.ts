// =============================================================================
// lib/telegram/formatter.ts — HTML message templates for Telegram
// =============================================================================

import type { AnalysisResult, BuildupSignal } from '../analysis/types';
import { interpretSignal } from '../analysis/interpretation';
import type { AiMarketAnalysis } from '../ai/gemini';
import { nowIST } from '../market/hours';

function pct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}
function abs(n: number): string {
  return Math.abs(n).toLocaleString('en-IN');
}
function biasEmoji(bias: string): string {
  if (bias.includes('BULL')) return '🟢';
  if (bias.includes('BEAR')) return '🔴';
  return '⚪';
}

// ─── Signal alert ─────────────────────────────────────────────────────────────

export function formatSignalAlert(
  result: AnalysisResult,
  spot: number
): string {
  const { bias, pcr, topBuildups, support, resistance, maxPain } = result;
  const be = biasEmoji(bias.direction);

  const buildupLines = topBuildups
    .slice(0, 5)
    .map((b: BuildupSignal) => {
      const interpreted = interpretSignal(b);
      const eqEmoji = interpreted.equityView.includes('BULL') ? '🟢' : interpreted.equityView.includes('BEAR') ? '🔴' : '⚪';
      return `  • <b>${b.strike} ${b.optionType}</b> [${interpreted.observation}] OI ${pct(b.oiChangePct)} | Equity: ${eqEmoji} <b>${interpreted.equityView}</b>`;
    })
    .join('\n');

  const supLine = support
    .slice(0, 3)
    .map((s) => `${s.strike}(${abs(s.oi)})`)
    .join(', ');
  const resLine = resistance
    .slice(0, 3)
    .map((r) => `${r.strike}(${abs(r.oi)})`)
    .join(', ');

  let msg = `<b>📊 OI Signal Alert</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
🎯 Spot: <b>${spot.toFixed(0)}</b>
${be} Bias: <b>${bias.direction}</b> (${bias.confidence}% conf.)

<b>Top Buildups (with Nifty 50 Equity View):</b>
${buildupLines || '  —'}

<b>PCR:</b> ${pcr.oi.toFixed(2)} (Δ ${pcr.oiChange >= 0 ? '+' : ''}${pcr.oiChange.toFixed(2)})
<b>Support  (PE):</b> ${supLine || '—'}
<b>Resistance (CE):</b> ${resLine || '—'}
<b>Max Pain:</b> ${maxPain}${
  result.decision
    ? `\n\n<b>🎯 PRO TRADER DECISION PLAN:</b>\n• <b>${result.decision.actionHeadline}</b>\n• Strategy: <code>${result.decision.recommendedStrategy}</code>\n• Invalidation Stop-Loss: <code>${result.decision.invalidationLevel}</code>`
    : ''
}

⚠️ <i>Informational only. Not financial advice.</i>`;
  return msg;
}

// ─── Live AI Market Intelligence Broadcast ──────────────────────────────────

export function formatAiMarketAnalysis(ai: AiMarketAnalysis): string {
  const be = biasEmoji(ai.bias);

  const strikeRows = ai.strikeObservations
    .slice(0, 4)
    .map((s) => {
      const viewEmoji = s.stockView.includes('BULL') ? '🟢' : s.stockView.includes('BEAR') ? '🔴' : '⚪';
      return `• <b>${s.strike} ${s.optionType}</b>: ${s.observation}\n  ↳ Equity View: ${viewEmoji} <b>${s.stockView}</b> (${s.reasoning})`;
    })
    .join('\n');

  return `🧠 <b>NIFTY 50 • LIVE AI MARKET INTELLIGENCE</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
🎯 Spot: <b>${ai.spot.toFixed(2)}</b> | Expiry: <b>${ai.expiry}</b>
${be} Bias: <b>${ai.bias}</b> (<b>${ai.confidence}%</b> Confidence)
${ai.source === 'gemini' ? '✨ <i>Powered by Gemini 3.8 Flash (Free)</i>' : '⚙️ <i>Rules Engine Analysis</i>'}

📢 <b>Executive Headline:</b>
${ai.headline}

📝 <b>Market Structure:</b>
${ai.summary}

🔍 <b>Institutional Activity:</b>
• <b>Call Writers:</b> ${ai.institutionalFlows.callWriters}
• <b>Put Writers:</b> ${ai.institutionalFlows.putWriters}
• <b>Dominant Flow:</b> <b>${ai.institutionalFlows.dominantAction}</b>

📊 <b>Key Battleground Strikes:</b>
${strikeRows || '• Awaiting further strike buildup thresholds'}

🎯 <b>Key Levels:</b>
• Support: <b>${ai.keyLevels.support1}</b> / <b>${ai.keyLevels.support2}</b>
• Resistance: <b>${ai.keyLevels.resistance1}</b> / <b>${ai.keyLevels.resistance2}</b>
• Pivot: <b>${ai.keyLevels.pivot}</b> | Max Pain: <b>${ai.keyLevels.maxPain}</b>

💡 <b>Tactical Setup:</b>
• Strategy: <b>${ai.strategyRecommendation.name}</b>
• Plan: ${ai.strategyRecommendation.setup}
• Invalidation: Around <b>${ai.invalidationLevel}</b>

⚠️ <i>${ai.riskNotice} Educational derivatives analysis only.</i>`;
}

// ─── Pre-market summary ───────────────────────────────────────────────────────

export function formatPremarketSummary(expiry: string, holidays: string[]): string {
  const todayHoliday = holidays[0] ?? null;
  return `<b>🌅 Pre-Market Summary</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
📅 Tracking expiry: <b>${expiry}</b>
${todayHoliday ? `🚫 Today is an NSE holiday: <b>${todayHoliday}</b>` : '✅ Market opens at 09:15 IST'}

⚠️ <i>Dhan automated market feed will begin recording at 09:15 IST.</i>`;
}

// ─── End-of-day summary ───────────────────────────────────────────────────────

export function formatEodSummary(
  result: AnalysisResult,
  spot: number,
  paperSummary?: { wins: number; losses: number; winRate: number }
): string {
  const { bias, pcr, maxPain } = result;
  const be = biasEmoji(bias.direction);
  let msg = `<b>🌆 End-of-Day Summary</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
🎯 Close: <b>${spot.toFixed(0)}</b>
${be} Final Bias: <b>${bias.direction}</b> (${bias.confidence}% conf.)
<b>PCR (OI):</b> ${pcr.oi.toFixed(2)}
<b>Max Pain:</b> ${maxPain}`;

  if (paperSummary) {
    msg += `\n\n<b>📋 Paper Trading (today)</b>
  Wins: ${paperSummary.wins} | Losses: ${paperSummary.losses}
  Win Rate: ${paperSummary.winRate}%`;
  }

  msg += '\n\n⚠️ <i>Informational only. Not financial advice.</i>';
  return msg;
}

// ─── System alert ─────────────────────────────────────────────────────────────

export function formatSystemAlert(title: string, body: string): string {
  return `<b>⚠️ System Alert: ${title}</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
${body}`;
}

export function formatTokenExpiredAlert(): string {
  return formatSystemAlert(
    'Dhan Access Token Expired or Missing',
    `Your Dhan access token is invalid or missing.\nPlease update <code>DHAN_ACCESS_TOKEN</code> in your environment variables.`
  );
}
