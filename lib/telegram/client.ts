// =============================================================================
// lib/telegram/client.ts — Telegram Bot API sendMessage wrapper
// =============================================================================

import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { config } from '../config';

const BASE_URL = () =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export interface SendMessageOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

/**
 * Send a plain text or HTML message to the configured Telegram chat.
 * Automatically splits messages that exceed Telegram's 4096-char limit.
 */
export async function sendTelegramMessage(
  text: string,
  opts: SendMessageOptions = {}
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId ?? process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping send');
    return;
  }

  // Check if muted
  if (process.env.DATABASE_URL) {
    try {
      const { getSetting } = await import('../db/queries');
      const muted = await getSetting('telegram_muted');
      if (muted === 'true') {
        logger.info('[telegram] Muted — skipping message send');
        return;
      }
    } catch (err) {
      logger.warn('[telegram] Could not check muted setting', { error: String(err) });
    }
  }

  const chunks = splitMessage(text, config.telegram.maxMessageLength);

  for (const chunk of chunks) {
    await withRetry(
      async () => {
        const res = await fetch(`${BASE_URL()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: opts.parseMode ?? 'HTML',
            disable_web_page_preview: opts.disableWebPagePreview ?? true,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Telegram API error ${res.status}: ${err}`);
        }
      },
      'telegram.sendMessage',
      { maxRetries: 3, baseDelayMs: 1000 }
    );
  }
}

/**
 * Split a long message into chunks at newline boundaries.
 */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx === -1) idx = maxLen;
    parts.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx + 1);
  }
  if (remaining) parts.push(remaining);
  return parts;
}
