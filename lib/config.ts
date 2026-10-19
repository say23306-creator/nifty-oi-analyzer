// =============================================================================
// lib/config.ts — Central configuration for all thresholds, windows, cooldowns
// All values can be overridden via environment variables.
// =============================================================================

export const config = {
  // ── Market hours (IST) ────────────────────────────────────────────────────
  market: {
    openHour: 9,
    openMinute: 15,
    closeHour: 15,
    closeMinute: 30,
    timezone: 'Asia/Kolkata',
  },

  // ── Data collection ───────────────────────────────────────────────────────
  collection: {
    /** Max instruments per Kite quote() call */
    batchSize: parseInt(process.env.BATCH_SIZE ?? '500', 10),
    /** Delay between batches (ms) — respect Kite rate limits */
    batchDelayMs: parseInt(process.env.BATCH_DELAY_MS ?? '300', 10),
    /** How many retry attempts for transient errors */
    maxRetries: 3,
    /** Base delay for exponential backoff (ms) */
    retryBaseMs: 1000,
    /** Instrument cache TTL check — refresh once per calendar day */
    instrumentCacheTtlHours: 24,
  },

  // ── Analysis ──────────────────────────────────────────────────────────────
  analysis: {
    /** Compare latest snapshot against one taken N minutes ago */
    windowMinutes: parseInt(process.env.ANALYSIS_WINDOW_MINUTES ?? '5', 10),
    /** Minimum % OI change to classify a buildup */
    oiChangePct: parseFloat(process.env.OI_CHANGE_THRESHOLD_PCT ?? '5'),
    /** Minimum absolute OI change to classify a buildup */
    oiChangeAbs: parseInt(process.env.OI_CHANGE_THRESHOLD_ABS ?? '50000', 10),
    /** Number of strikes around ATM to treat as "near ATM" for bias */
    atmWindow: 5,
    /** Top N strikes shown as support/resistance */
    topNLevels: 3,
  },

  // ── Signals & deduplication ───────────────────────────────────────────────
  signals: {
    /** Don't resend the same kind+strike+type within this window (minutes) */
    cooldownMinutes: parseInt(process.env.SIGNAL_COOLDOWN_MINUTES ?? '15', 10),
  },

  // ── Features ──────────────────────────────────────────────────────────────
  features: {
    enabled: {
      paperTrading: process.env.PAPER_TRADING_MODE === 'true',
      mlInference: process.env.ML_INFERENCE_ENABLED === 'true',
    },
    mlModelPath: './models/model.onnx',
  },

  // ── Telegram ──────────────────────────────────────────────────────────────
  telegram: {
    /** Maximum message length before splitting (Telegram cap: 4096) */
    maxMessageLength: 4000,
    /** Allowed bot commands */
    commands: ['/status', '/chain', '/pcr', '/bias', '/mute', '/unmute', '/help'],
  },
} as const;

export type Config = typeof config;
