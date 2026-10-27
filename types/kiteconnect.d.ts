declare module 'kiteconnect' {
  export class KiteConnect {
    constructor(params: { api_key: string; access_token?: string });
    setAccessToken(token: string): void;
    getLoginURL(): string;
    generateSession(request_token: string, api_secret: string): Promise<{ access_token: string }>;
    getInstruments(exchange?: string | string[]): Promise<
      Array<{
        instrument_token: number;
        exchange_token: string;
        tradingsymbol: string;
        name: string;
        last_price: number;
        expiry: string;
        strike: number;
        tick_size: number;
        lot_size: number;
        instrument_type: string;
        segment: string;
        exchange: string;
      }>
    >;
    getQuote(instruments: string[]): Promise<
      Record<
        string,
        {
          instrument_token: number;
          timestamp: string;
          last_price: number;
          net_change: number;
          ohlc: { open: number; high: number; low: number; close: number };
          volume: number;
          oi: number;
          buy_quantity: number;
          sell_quantity: number;
          depth: unknown;
          oi_day_high?: number;
          oi_day_low?: number;
        }
      >
    >;
    getLTP(instruments: string[]): Promise<Record<string, { instrument_token: number; last_price: number }>>;
  }

  export class KiteTicker {
    constructor(params: { api_key: string; access_token: string });
  }

  const defaultExport: typeof KiteConnect;
  export default defaultExport;
}
