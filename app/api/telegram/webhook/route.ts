// =============================================================================
// app/api/telegram/webhook/route.ts — Telegram Bot webhook handler
// =============================================================================
// Register this URL with Telegram:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate, type TelegramUpdate } from '@/lib/telegram/commands';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as TelegramUpdate;
    await handleTelegramUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[telegram webhook] Error processing update', err);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true });
  }
}
