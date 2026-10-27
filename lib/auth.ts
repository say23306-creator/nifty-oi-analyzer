// =============================================================================
// lib/auth.ts — Simple, stateless dashboard authentication helpers
// =============================================================================

export const AUTH_COOKIE_NAME = 'nifty_oi_auth';

/**
 * Derives a deterministic auth token from the DASHBOARD_PASSWORD.
 * If DASHBOARD_PASSWORD is not set, authentication is bypassed in development.
 */
export async function getExpectedAuthToken(): Promise<string> {
  const secret = process.env.DASHBOARD_PASSWORD || 'dev_secret_nifty_oi';
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + '_oi_analyzer_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyAuthToken(token?: string | null): Promise<boolean> {
  // If DASHBOARD_PASSWORD is not configured, permit access
  if (!process.env.DASHBOARD_PASSWORD) {
    return true;
  }
  if (!token) return false;
  const expected = await getExpectedAuthToken();
  return token === expected;
}

export function isPasswordConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}
