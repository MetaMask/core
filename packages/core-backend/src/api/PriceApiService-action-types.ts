/**
 * Messenger action types for PriceApiService
 *
 * Actions are namespaced as: BackendApiClient:Prices:*
 */

import type {
  GetV3SpotPricesResponse,
  GetExchangeRatesWithInfoResponse,
  GetPriceSupportedNetworksV1Response,
  GetPriceSupportedNetworksV2Response,
  CoinGeckoSpotPrice,
  GetV3HistoricalPricesResponse,
} from './PriceApiService';
import type {
  GetTokenPricesOptions,
  GetTokenPricesResponse,
  GetHistoricalPricesOptions,
  GetHistoricalPricesResponse,
  MarketDataDetails,
  SupportedCurrency,
} from './types';

// Using string literals directly in template types to avoid unused variable lint errors
type ServiceName = 'BackendApiClient';
type Namespace = 'Prices';

// =============================================================================
// Supported Networks Actions
// =============================================================================

export type PricesGetV1SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV1SupportedNetworks`;
  handler: () => Promise<GetPriceSupportedNetworksV1Response>;
};

export type PricesGetV2SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV2SupportedNetworks`;
  handler: () => Promise<GetPriceSupportedNetworksV2Response>;
};

// =============================================================================
// Exchange Rates Actions
// =============================================================================

export type PricesGetV1ExchangeRatesAction = {
  type: `${ServiceName}:${Namespace}:getV1ExchangeRates`;
  handler: (baseCurrency: string) => Promise<GetExchangeRatesWithInfoResponse>;
};

export type PricesGetV1FiatExchangeRatesAction = {
  type: `${ServiceName}:${Namespace}:getV1FiatExchangeRates`;
  handler: () => Promise<GetExchangeRatesWithInfoResponse>;
};

export type PricesGetV1CryptoExchangeRatesAction = {
  type: `${ServiceName}:${Namespace}:getV1CryptoExchangeRates`;
  handler: () => Promise<GetExchangeRatesWithInfoResponse>;
};

// =============================================================================
// V1 Spot Prices - CoinGecko ID based
// =============================================================================

export type PricesGetV1SpotPricesByCoinIdsAction = {
  type: `${ServiceName}:${Namespace}:getV1SpotPricesByCoinIds`;
  handler: (coinIds: string[]) => Promise<Record<string, CoinGeckoSpotPrice>>;
};

export type PricesGetV1SpotPriceByCoinIdAction = {
  type: `${ServiceName}:${Namespace}:getV1SpotPriceByCoinId`;
  handler: (
    coinId: string,
    currency?: SupportedCurrency,
  ) => Promise<CoinGeckoSpotPrice>;
};

// =============================================================================
// V1 Spot Prices - Token Address based
// =============================================================================

export type PricesGetV1TokenPricesAction = {
  type: `${ServiceName}:${Namespace}:getV1TokenPrices`;
  handler: (options: GetTokenPricesOptions) => Promise<GetTokenPricesResponse>;
};

export type PricesGetV1TokenPriceAction = {
  type: `${ServiceName}:${Namespace}:getV1TokenPrice`;
  handler: (
    chainId: string,
    tokenAddress: string,
    currency?: SupportedCurrency,
  ) => Promise<MarketDataDetails | undefined>;
};

// =============================================================================
// V2 Spot Prices Actions
// =============================================================================

export type PricesGetV2SpotPricesAction = {
  type: `${ServiceName}:${Namespace}:getV2SpotPrices`;
  handler: (
    chainId: string,
    tokenAddresses: string[],
    currency?: SupportedCurrency,
    includeMarketData?: boolean,
  ) => Promise<Record<string, MarketDataDetails>>;
};

// =============================================================================
// V3 Spot Prices Actions
// =============================================================================

export type PricesGetV3SpotPricesAction = {
  type: `${ServiceName}:${Namespace}:getV3SpotPrices`;
  handler: (
    assetIds: string[],
    currency?: SupportedCurrency,
    includeMarketData?: boolean,
    cacheOnly?: boolean,
  ) => Promise<GetV3SpotPricesResponse>;
};

// =============================================================================
// V1 Historical Prices Actions
// =============================================================================

export type PricesGetV1HistoricalPricesByCoinIdAction = {
  type: `${ServiceName}:${Namespace}:getV1HistoricalPricesByCoinId`;
  handler: (
    coinId: string,
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
  ) => Promise<GetHistoricalPricesResponse>;
};

export type PricesGetV1HistoricalPricesByTokenAddressesAction = {
  type: `${ServiceName}:${Namespace}:getV1HistoricalPricesByTokenAddresses`;
  handler: (
    chainId: string,
    tokenAddresses: string[],
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
  ) => Promise<GetHistoricalPricesResponse>;
};

export type PricesGetV1HistoricalPricesAction = {
  type: `${ServiceName}:${Namespace}:getV1HistoricalPrices`;
  handler: (
    options: GetHistoricalPricesOptions,
  ) => Promise<GetHistoricalPricesResponse>;
};

// =============================================================================
// V3 Historical Prices Actions
// =============================================================================

export type PricesGetV3HistoricalPricesAction = {
  type: `${ServiceName}:${Namespace}:getV3HistoricalPrices`;
  handler: (
    chainId: string,
    assetType: string,
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
      interval?: '5m' | 'hourly' | 'daily';
    },
  ) => Promise<GetV3HistoricalPricesResponse>;
};

// =============================================================================
// V1 Historical Price Graph Actions
// =============================================================================

export type PricesGetV1HistoricalPriceGraphByCoinIdAction = {
  type: `${ServiceName}:${Namespace}:getV1HistoricalPriceGraphByCoinId`;
  handler: (
    coinId: string,
    currency?: SupportedCurrency,
    includeOHLC?: boolean,
  ) => Promise<GetV3HistoricalPricesResponse>;
};

export type PricesGetV1HistoricalPriceGraphByTokenAddressAction = {
  type: `${ServiceName}:${Namespace}:getV1HistoricalPriceGraphByTokenAddress`;
  handler: (
    chainId: string,
    tokenAddress: string,
    currency?: SupportedCurrency,
    includeOHLC?: boolean,
  ) => Promise<GetV3HistoricalPricesResponse>;
};

// =============================================================================
// All Price API Actions
// =============================================================================

export type PricesApiActions =
  // Supported Networks
  | PricesGetV1SupportedNetworksAction
  | PricesGetV2SupportedNetworksAction
  // Exchange Rates
  | PricesGetV1ExchangeRatesAction
  | PricesGetV1FiatExchangeRatesAction
  | PricesGetV1CryptoExchangeRatesAction
  // V1 Spot Prices
  | PricesGetV1SpotPricesByCoinIdsAction
  | PricesGetV1SpotPriceByCoinIdAction
  | PricesGetV1TokenPricesAction
  | PricesGetV1TokenPriceAction
  // V2 Spot Prices
  | PricesGetV2SpotPricesAction
  // V3 Spot Prices
  | PricesGetV3SpotPricesAction
  // Historical Prices
  | PricesGetV1HistoricalPricesByCoinIdAction
  | PricesGetV1HistoricalPricesByTokenAddressesAction
  | PricesGetV1HistoricalPricesAction
  | PricesGetV3HistoricalPricesAction
  // Historical Price Graph
  | PricesGetV1HistoricalPriceGraphByCoinIdAction
  | PricesGetV1HistoricalPriceGraphByTokenAddressAction;
