// =============================================================================
// lib/broker/types.ts — BrokerAdapter interface + shared types
// =============================================================================

/**
 * One row in the option chain (a single strike + CE or PE).
 */
export interface ChainRow {
  strike: number;
  type: 'CE' | 'PE';
  ltp: number | null;
  oi: number | null;
  volume: number | null;
  iv?: number | null;
}

/**
 * All adapters must implement this interface.
 * Swap the active adapter in lib/broker/index.ts.
 */
export interface BrokerAdapter {
  /**
   * Current Nifty 50 spot price.
   */
  getSpot(): Promise<number>;

  /**
   * List of unique expiry date strings (YYYY-MM-DD) available for Nifty options.
   */
  getExpiries(): Promise<string[]>;

  /**
   * Full option chain for the given expiry.
   * Returns ALL strikes — no filtering by proximity to spot.
   */
  getFullChain(expiry: string): Promise<ChainRow[]>;
}
