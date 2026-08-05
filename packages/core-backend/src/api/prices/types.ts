/**
 * Prices API types for the API Platform Client.
 * API: price.api.cx.metamask.io
 */

// ============================================================================
// SPOT PRICES TYPES
// ============================================================================

/** V3 Spot prices response */
export type V3SpotPricesResponse = Record<
  string,
  {
    price: number;
    pricePercentChange1d?: number;
    marketCap?: number;
    totalVolume?: number;
  } | null
>;

/** CoinGecko spot price */
export type CoinGeckoSpotPrice = {
  id: string;
  price: number;
  marketCap?: number;
  allTimeHigh?: number;
  allTimeLow?: number;
  totalVolume?: number;
  high1d?: number;
  low1d?: number;
  circulatingSupply?: number;
  dilutedMarketCap?: number;
  marketCapPercentChange1d?: number;
  priceChange1d?: number;
  pricePercentChange1h?: number;
  pricePercentChange1d?: number;
  pricePercentChange7d?: number;
  pricePercentChange14d?: number;
  pricePercentChange30d?: number;
  pricePercentChange200d?: number;
  pricePercentChange1y?: number;
};

// ============================================================================
// EXCHANGE RATES TYPES
// ============================================================================

/** Exchange rate info */
export type ExchangeRateInfo = {
  name: string;
  ticker: string;
  value: number;
  currencyType: 'crypto' | 'fiat';
};

/** Exchange rates response */
export type V1ExchangeRatesResponse = {
  [currency: string]: ExchangeRateInfo;
};

// ============================================================================
// SUPPORTED NETWORKS TYPES
// ============================================================================

/** Price supported networks response */
export type PriceSupportedNetworksResponse = {
  fullSupport: string[];
  partialSupport: string[];
};

// ============================================================================
// HISTORICAL PRICES TYPES
// ============================================================================

/** V1 Historical prices response */
export type V1HistoricalPricesResponse = {
  /** Array of price data points as [timestamp, price] tuples */
  prices: [number, number][];
};

/** V3 Historical prices response */
export type V3HistoricalPricesResponse = {
  prices: [number, number][];
  marketCaps?: [number, number][];
  totalVolumes?: [number, number][];
};
