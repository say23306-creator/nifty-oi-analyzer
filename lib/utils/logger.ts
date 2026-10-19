// =============================================================================
// lib/utils/logger.ts — Structured logger that redacts secrets from output
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Patterns that should never appear in log output */
const REDACT_PATTERNS: RegExp[] = [
  /KITE_API_SECRET=[^\s]*/gi,
  /KITE_ACCESS_TOKEN=[^\s]*/gi,
  /DATABASE_URL=[^\s]*/gi,
  /TELEGRAM_BOT_TOKEN=[^\s]*/gi,
  /CRON_SECRET=[^\s]*/gi,
  /DASHBOARD_PASSWORD=[^\s]*/gi,
  // Bearer token headers
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Postgres connection strings
  /postgresql:\/\/[^\s]*/gi,
];

function redact(message: string): string {
  let safe = message;
  for (const pattern of REDACT_PATTERNS) {
    safe = safe.replace(pattern, '[REDACTED]');
  }
  return safe;
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${redact(message)}`;
  if (!meta) return base;
  try {
    return `${base} ${redact(JSON.stringify(meta))}`;
  } catch {
    return base;
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', message, meta));
    }
  },
  info(message: string, meta?: Record<string, unknown>) {
    console.info(formatMessage('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatMessage('warn', message, meta));
  },
  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errMeta.errorMessage = error.message;
      errMeta.stack = error.stack?.split('\n').slice(0, 5).join(' | ');
    } else if (error !== undefined) {
      errMeta.error = String(error);
    }
    console.error(formatMessage('error', message, errMeta));
  },
};
