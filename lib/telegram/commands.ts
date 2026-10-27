// =============================================================================
// lib/telegram/commands.ts — Bot command handlers for /api/telegram/webhook
// =============================================================================

import { sendTelegramMessage } from './client';
import { getLatestSnapshot, getChainRows, getRecentSignals, getSetting, setSetting } from '../db/queries';
import { runAnalysis } from '../analysis';
import { formatSignalAlert, formatSystemAlert } from './formatter';
import { nowIST } from '../market/hours';
import { getPaperTradeSummary } from '../db/queries';

const ALLOWED_CHAT_ID = () => process.env.TELEGRAM_CHAT_ID ?? '';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number };
    text?: string;
    date: number;
  };
}

/**
 * Route a Telegram update to the correct command handler.
 * Only responds to messages from the configured TELEGRAM_CHAT_ID.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);
  if (chatId !== ALLOWED_CHAT_ID()) {
    // Silently ignore unknown chats
    return;
  }

  const text = msg.text.trim().toLowerCase().split('@')[0]; // strip @botname suffix

  if (text === '/start' || text === '/help') {
    await cmdHelp(chatId);
  } else if (text === '/status') {
    await cmdStatus(chatId);
  } else if (text === '/chain') {
    await cmdChain(chatId);
  } else if (text === '/pcr') {
    await cmdPcr(chatId);
  } else if (text === '/bias') {
    await cmdBias(chatId);
  } else if (text === '/mute') {
    await cmdMute(chatId);
  } else if (text === '/unmute') {
    await cmdUnmute(chatId);
  } else if (text === '/paper') {
    await cmdPaper(chatId);
  } else if (text === '/ai') {
    await cmdAi(chatId);
  }
}

// ─── Command implementations ──────────────────────────────────────────────────

async function cmdHelp(chatId: string) {
  await sendTelegramMessage(
    `<b>🤖 Nifty OI Analyzer Bot</b>

Available commands:
/status — System status &amp; last update time
/ai     — Live Gemini AI analysis &amp; strategy
/chain  — Current key OI levels
/pcr    — PCR values
/bias   — Current market bias
/paper  — Paper trading summary
/mute   — Pause alerts
/unmute — Resume alerts

⚠️ <i>Informational only. Not financial advice.</i>`,
    { chatId }
  );
}

async function cmdStatus(chatId: string) {
  const snap = await getLatestSnapshot();
  const muted = (await getSetting('telegram_muted')) === 'true';

  if (!snap) {
    await sendTelegramMessage(
      `⚠️ No snapshot data yet. Collector may not have run.`,
      { chatId }
    );
    return;
  }

  await sendTelegramMessage(
    `<b>📊 System Status</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
✅ Last snapshot: <b>${snap.ts.toISOString().replace('T', ' ').slice(0, 19)} UTC</b>
🎯 Spot: <b>${snap.spot}</b>  |  Expiry: <b>${snap.expiry}</b>
🔕 Alerts: <b>${muted ? 'MUTED' : 'ACTIVE'}</b>`,
    { chatId }
  );
}

async function cmdChain(chatId: string) {
  const snap = await getLatestSnapshot();
  if (!snap) {
    await sendTelegramMessage(`⚠️ No data available.`, { chatId });
    return;
  }

  const result = await runAnalysis(snap.expiry);
  if (!result) {
    await sendTelegramMessage(`⚠️ Analysis not available yet.`, { chatId });
    return;
  }

  const supLine = result.support.slice(0, 3).map((s) => `${s.strike}(${(s.oi / 1000).toFixed(0)}k)`).join(', ');
  const resLine = result.resistance.slice(0, 3).map((r) => `${r.strike}(${(r.oi / 1000).toFixed(0)}k)`).join(', ');

  await sendTelegramMessage(
    `<b>📊 Key OI Levels</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
🎯 Spot: <b>${snap.spot}</b>
🟢 Support  (PE): <b>${supLine}</b>
🔴 Resistance (CE): <b>${resLine}</b>
⚖️ Max Pain: <b>${result.maxPain}</b>`,
    { chatId }
  );
}

async function cmdPcr(chatId: string) {
  const snap = await getLatestSnapshot();
  if (!snap) {
    await sendTelegramMessage(`⚠️ No data available.`, { chatId });
    return;
  }
  const result = await runAnalysis(snap.expiry);
  if (!result) {
    await sendTelegramMessage(`⚠️ Analysis not available.`, { chatId });
    return;
  }
  const { pcr } = result;
  const sentiment = pcr.oi > 1.2 ? '🟢 Bullish' : pcr.oi < 0.8 ? '🔴 Bearish' : '⚪ Neutral';
  await sendTelegramMessage(
    `<b>📊 PCR Data</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
OI PCR: <b>${pcr.oi.toFixed(2)}</b> (${sentiment})
Vol PCR: <b>${pcr.volume.toFixed(2)}</b>
CE OI: <b>${(pcr.totalCeOI / 1e6).toFixed(2)}M</b>
PE OI: <b>${(pcr.totalPeOI / 1e6).toFixed(2)}M</b>`,
    { chatId }
  );
}

async function cmdBias(chatId: string) {
  const snap = await getLatestSnapshot();
  if (!snap) {
    await sendTelegramMessage(`⚠️ No data available.`, { chatId });
    return;
  }
  const result = await runAnalysis(snap.expiry);
  if (!result) {
    await sendTelegramMessage(`⚠️ Analysis not available.`, { chatId });
    return;
  }
  await sendTelegramMessage(formatSignalAlert(result, snap.spot), { chatId });
}

async function cmdMute(chatId: string) {
  await setSetting('telegram_muted', 'true');
  await sendTelegramMessage(`🔕 Alerts muted. Send /unmute to resume.`, { chatId });
}

async function cmdUnmute(chatId: string) {
  await setSetting('telegram_muted', 'false');
  await sendTelegramMessage(`🔔 Alerts resumed.`, { chatId });
}

async function cmdPaper(chatId: string) {
  const summary = await getPaperTradeSummary();
  await sendTelegramMessage(
    `<b>📋 Paper Trading Summary</b>  [${nowIST()}]
━━━━━━━━━━━━━━━━━━━━━━
Total closed trades: <b>${summary.total}</b>
✅ Wins: <b>${summary.wins}</b>  |  ❌ Losses: <b>${summary.losses}</b>
📊 Win Rate: <b>${summary.winRate}%</b>
🔓 Open: <b>${summary.open}</b>

⚠️ <i>Paper trading only. Not real trades.</i>`,
    { chatId }
  );
}

async function cmdAi(chatId: string) {
  try {
    const { getLatestAiAnalysis, generateAiAnalysis } = await import('../ai/gemini');
    const { formatAiMarketAnalysis } = await import('./formatter');

    let analysis = await getLatestAiAnalysis();
    if (!analysis) {
      const snap = await getLatestSnapshot();
      if (!snap) {
        await sendTelegramMessage('⚠️ No snapshot data available yet. Please run collection first.', { chatId });
        return;
      }
      const an = await runAnalysis(snap.expiry);
      if (!an) {
        await sendTelegramMessage('⚠️ Insufficient data to compute AI analysis.', { chatId });
        return;
      }
      analysis = await generateAiAnalysis(an);
    }

    await sendTelegramMessage(formatAiMarketAnalysis(analysis), { chatId });
  } catch (err) {
    await sendTelegramMessage('⚠️ Failed to generate AI analysis. Please check server logs.', { chatId });
  }
}

