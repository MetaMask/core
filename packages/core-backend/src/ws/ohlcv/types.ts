/**
 * OHLCV WebSocket streaming types for real-time candlestick data.
 */

/**
 * A single OHLCV candlestick bar received from the market-data WebSocket stream.
 */
export type OHLCVBar = {
  /** Unix timestamp (seconds) of the candle open */
  timestamp: number;
  /** Opening price */
  open: number;
  /** Highest price during the candle period */
  high: number;
  /** Lowest price during the candle period */
  low: number;
  /** Closing price (latest) */
  close: number;
  /** Trading volume during the candle period */
  volume: number;
};

/**
 * Options for subscribing to an OHLCV channel.
 */
export type OHLCVSubscriptionOptions = {
  /** CAIP-19 asset identifier, e.g. "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" */
  assetId: string;
  /** Candle interval, e.g. "1m", "5m", "15m", "1h", "4h", "1d" */
  interval: string;
  /** Fiat currency code, e.g. "usd", "eur" */
  currency: string;
};
