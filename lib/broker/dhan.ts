// =============================================================================
// lib/broker/dhan.ts — DhanHQ API v2 + Direct NSE Cloud Fallback
// =============================================================================
// Primary: DhanHQ API v2
// Fallback: Direct NSE India JSON API (works seamlessly in Vercel Mumbai bom1)
// =============================================================================

import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { getSetting } from '../db/queries';
import type { BrokerAdapter, ChainRow } from './types';

const DHAN_BASE_URL = 'https://api.dhan.co/v2';
const NIFTY_SCRIP_ID = 13; // NSE Index code for Nifty 50
const NIFTY_SEGMENT = 'IDX_I'; // Index Segment

interface DhanOptionData {
  last_price?: number;
  oi?: number;
  previous_oi?: number;
  volume?: number;
  implied_volatility?: number;
}

interface DhanOptionChainResponse {
  status?: string;
  data?: {
    last_price?: number;
    oc?: Record<
      string,
      {
        ce?: DhanOptionData;
        pe?: DhanOptionData;
      }
    >;
  };
}

interface DhanExpiryListResponse {
  status?: string;
  data?: string[];
}

export class DhanAdapter implements BrokerAdapter {
  private cachedSpot: { price: number; ts: number } | null = null;
  private cachedNSEChain: { data: any; ts: number } | null = null;

  private async getCredentials(): Promise<{ clientId?: string; accessToken?: string }> {
    let clientId = process.env.DHAN_CLIENT_ID;
    let accessToken = process.env.DHAN_ACCESS_TOKEN;

    if (process.env.DATABASE_URL) {
      try {
        if (!clientId) clientId = (await getSetting('dhan_client_id')) ?? undefined;
        if (!accessToken) accessToken = (await getSetting('dhan_access_token')) ?? undefined;
      } catch {
        // Fallback
      }
    }

    return { clientId, accessToken };
  }

  /**
   * Direct NSE India API Fallback (executes from Vercel Mumbai bom1 region)
   */
  private async fetchNSEDirect(): Promise<any> {
    if (this.cachedNSEChain && Date.now() - this.cachedNSEChain.ts < 15000) {
      return this.cachedNSEChain.data;
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.nseindia.com/option-chain',
    };

    try {
      // Step 1: Hit NSE homepage to gather cookies
      const initRes = await fetch('https://www.nseindia.com', { headers, cache: 'no-store' });
      const rawCookies = initRes.headers.get('set-cookie');
      const cookieHeader = rawCookies
        ? rawCookies
            .split(',')
            .map((c) => c.split(';')[0].trim())
            .join('; ')
        : '';

      // Step 2: Fetch live option chain
      const res = await fetch('https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY', {
        headers: {
          ...headers,
          Cookie: cookieHeader,
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`NSE returned HTTP ${res.status}`);
      }

      const json = await res.json();
      this.cachedNSEChain = { data: json, ts: Date.now() };

      const spot = json?.records?.underlyingValue;
      if (typeof spot === 'number' && spot > 0) {
        this.cachedSpot = { price: spot, ts: Date.now() };
      }

      return json;
    } catch (err) {
      logger.error('[broker/dhan] NSE direct fallback failed', { error: String(err) });
      throw err;
    }
  }

  /**
   * Fetch current Nifty 50 Spot price
   */
  async getSpot(): Promise<number> {
    if (this.cachedSpot && Date.now() - this.cachedSpot.ts < 10000) {
      return this.cachedSpot.price;
    }

    const { clientId, accessToken } = await this.getCredentials();

    // 1. Try Dhan if credentials are provided
    if (clientId && accessToken) {
      try {
        const res = await fetch(`${DHAN_BASE_URL}/marketfeed/ltp`, {
          method: 'POST',
          headers: {
            'access-token': accessToken,
            'client-id': clientId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            NSE_INDEX: [NIFTY_SCRIP_ID],
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const spot = json?.data?.NSE_INDEX?.[NIFTY_SCRIP_ID]?.last_price;
          if (typeof spot === 'number' && spot > 0) {
            this.cachedSpot = { price: spot, ts: Date.now() };
            return spot;
          }
        }
      } catch (e) {
        logger.warn('[broker/dhan] Dhan spot failed, attempting NSE direct fallback', {
          error: String(e),
        });
      }
    }

    // 2. Fallback to Direct NSE
    const nseData = await this.fetchNSEDirect();
    const spot = nseData?.records?.underlyingValue;
    if (typeof spot === 'number' && spot > 0) {
      this.cachedSpot = { price: spot, ts: Date.now() };
      return spot;
    }

    throw new Error('Unable to retrieve Nifty spot price from Dhan or NSE direct');
  }

  /**
   * Fetch list of available Nifty option expiry dates
   */
  async getExpiries(): Promise<string[]> {
    const { clientId, accessToken } = await this.getCredentials();

    if (clientId && accessToken) {
      try {
        const res = await fetch(`${DHAN_BASE_URL}/optionchain/expirylist`, {
          method: 'POST',
          headers: {
            'access-token': accessToken,
            'client-id': clientId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            UnderlyingScrip: NIFTY_SCRIP_ID,
            UnderlyingSeg: NIFTY_SEGMENT,
          }),
        });

        if (res.ok) {
          const json: DhanExpiryListResponse = await res.json();
          const expiries = json?.data;
          if (Array.isArray(expiries) && expiries.length > 0) {
            return expiries;
          }
        }
      } catch (e) {
        logger.warn('[broker/dhan] Dhan expiries failed, falling back to NSE direct', {
          error: String(e),
        });
      }
    }

    // Fallback to NSE direct
    const nseData = await this.fetchNSEDirect();
    const expiries = nseData?.records?.expiryDates;
    if (Array.isArray(expiries) && expiries.length > 0) {
      return expiries;
    }

    throw new Error('Unable to retrieve Nifty expiries from Dhan or NSE direct');
  }

  /**
   * Fetch full option chain for a specific expiry
   */
  async getFullChain(expiry: string): Promise<ChainRow[]> {
    const { clientId, accessToken } = await this.getCredentials();

    if (clientId && accessToken) {
      try {
        const res = await fetch(`${DHAN_BASE_URL}/optionchain`, {
          method: 'POST',
          headers: {
            'access-token': accessToken,
            'client-id': clientId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            UnderlyingScrip: NIFTY_SCRIP_ID,
            UnderlyingSeg: NIFTY_SEGMENT,
            Expiry: expiry,
          }),
        });

        if (res.ok) {
          const json: DhanOptionChainResponse = await res.json();
          const oc = json?.data?.oc;
          if (oc && typeof oc === 'object') {
            const rows: ChainRow[] = [];
            for (const [strikeStr, data] of Object.entries(oc)) {
              const strike = parseFloat(strikeStr);
              if (isNaN(strike)) continue;
              if (data.ce) {
                rows.push({
                  strike,
                  type: 'CE',
                  ltp: data.ce.last_price ?? null,
                  oi: data.ce.oi ?? null,
                  volume: data.ce.volume ?? null,
                  iv: data.ce.implied_volatility ?? null,
                });
              }
              if (data.pe) {
                rows.push({
                  strike,
                  type: 'PE',
                  ltp: data.pe.last_price ?? null,
                  oi: data.pe.oi ?? null,
                  volume: data.pe.volume ?? null,
                  iv: data.pe.implied_volatility ?? null,
                });
              }
            }
            if (rows.length > 0) {
              return rows.sort((a, b) => a.strike - b.strike);
            }
          }
        }
      } catch (e) {
        logger.warn('[broker/dhan] Dhan full chain failed, falling back to NSE direct', {
          error: String(e),
        });
      }
    }

    // Direct NSE parsing fallback
    const nseData = await this.fetchNSEDirect();
    const records = nseData?.records?.data || [];
    const rows: ChainRow[] = [];

    for (const item of records) {
      if (item.expiryDate !== expiry) continue;
      const strike = item.strikePrice;
      if (typeof strike !== 'number') continue;

      if (item.CE) {
        rows.push({
          strike,
          type: 'CE',
          ltp: item.CE.lastPrice ?? null,
          oi: item.CE.openInterest ?? null,
          volume: item.CE.totalTradedVolume ?? null,
          iv: item.CE.impliedVolatility ?? null,
        });
      }
      if (item.PE) {
        rows.push({
          strike,
          type: 'PE',
          ltp: item.PE.lastPrice ?? null,
          oi: item.PE.openInterest ?? null,
          volume: item.PE.totalTradedVolume ?? null,
          iv: item.PE.impliedVolatility ?? null,
        });
      }
    }

    return rows.sort((a, b) => a.strike - b.strike);
  }
}
