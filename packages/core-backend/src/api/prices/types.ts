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

/**
 * Price v1 supported networks response (`/v1/supportedNetworks`).
 * Chain IDs are decimal numbers.
 */
export type PriceV1SupportedNetworksResponse = {
  /** Chains supported by every spot price endpoint. */
  fullSupport: number[];
  /** Chains supported only by specific spot price endpoints. */
  partialSupport: {
    spotPricesV2: number[];
  };
};

/**
 * Price v2 supported networks response (`/v2/supportedNetworks`).
 * Chain IDs are CAIP-2 strings (e.g. `eip155:1`).
 *
 * Note: `partialSupport` is an object keyed by endpoint, not an array.
 */
export type PriceV2SupportedNetworksResponse = {
  /** Chains supported by every spot price endpoint. */
  fullSupport: string[];
  /** Chains supported only by specific spot price endpoints. */
  partialSupport: {
    spotPricesV2: string[];
    spotPricesV3: string[];
  };
};

/**
 * Price supported networks response.
 *
 * @deprecated Use `PriceV2SupportedNetworksResponse` (or
 * `PriceV1SupportedNetworksResponse` for the v1 endpoint) instead.
 */
export type PriceSupportedNetworksResponse = PriceV2SupportedNetworksResponse;

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
