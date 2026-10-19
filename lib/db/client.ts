// =============================================================================
// lib/db/client.ts — Postgres client singleton (postgres.js)
// =============================================================================

import postgres from 'postgres';
import { logger } from '../utils/logger';

let _sql: ReturnType<typeof postgres> | null = null;

/**
 * Returns a singleton postgres.js client.
 * Reads DATABASE_URL from environment — never hardcoded.
 */
export function getDb(): ReturnType<typeof postgres> {
  if (_sql) return _sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  _sql = postgres(url, {
    max: 5,           // small pool — serverless functions share nothing
    idle_timeout: 20, // close idle connections fast
    connect_timeout: 10,
    ssl: url.includes('sslmode=require') ? 'require' : false,
    onnotice: (notice) => logger.debug('[db notice]', { message: notice.message }),
  });

  logger.info('[db] Postgres client initialised');
  return _sql;
}

/** Convenience alias */
export const sql = () => getDb();
