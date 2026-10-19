// =============================================================================
// lib/utils/retry.ts — Exponential backoff retry helper
// =============================================================================

import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true to abort retrying regardless of attempts left */
  shouldAbort?: (error: unknown) => boolean;
}

const DEFAULT: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  shouldAbort: () => false,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoff(attempt: number, base: number, max: number): number {
  const exp = Math.min(base * 2 ** attempt, max);
  return exp / 2 + Math.random() * (exp / 2); // 50%–100% of exp
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, shouldAbort } = {
    ...DEFAULT,
    ...opts,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (shouldAbort(err)) {
        logger.error(`[retry] ${label} — aborting (non-retryable error)`, err);
        throw err;
      }

      if (attempt === maxRetries) break;

      const waitMs = jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
      logger.warn(`[retry] ${label} — attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(waitMs)}ms`, {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      await delay(waitMs);
    }
  }

  logger.error(`[retry] ${label} — all ${maxRetries} retries exhausted`, lastError);
  throw lastError;
}
