/**
 * MetaMask Internal API SDK
 *
 * This module exports SDK classes for interacting with MetaMask's internal APIs:
 * - Token API (token.api.cx.metamask.io)
 * - Tokens API (tokens.api.cx.metamask.io)
 * - Accounts API (accounts.api.cx.metamask.io)
 * - Price API (price.api.cx.metamask.io)
 *
 * @example
 * ```typescript
 * import { BackendApiClient } from '@metamask/core-backend';
 *
 * // Create unified client with shared authentication
 * const apiClient = new BackendApiClient({
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => authController.getBearerToken(),
 * });
 *
 * // Access all APIs through the unified client
 * const trending = await apiClient.token.getV3TrendingTokens({...});
 * const assets = await apiClient.tokens.getV3Assets([...]);
 * const balances = await apiClient.accounts.getV2Balances({...});
 * const prices = await apiClient.prices.getV1TokenPrices({...});
 * ```
 */

// Backend API Client (unified wrapper)
export { BackendApiClient, createBackendApiClient } from './BackendApiClient';
export type {
  BackendApiClientOptions,
  BackendApiClientMessenger,
} from './BackendApiClient';

// Combined BackendApiClient action types
export type { BackendApiClientActions } from './BackendApiClient-action-types';

// Accounts API action types
export type {
  AccountsApiActions,
  // Health & Utility
  AccountsGetServiceMetadataAction,
  AccountsGetHealthAction,
  // Supported Networks
  AccountsGetV1SupportedNetworksAction,
  AccountsGetV2SupportedNetworksAction,
  // Active Networks
  AccountsGetV2ActiveNetworksAction,
  // Balances
  AccountsGetV2BalancesAction,
  AccountsGetV2BalancesWithOptionsAction,
  AccountsGetV4MultiAccountBalancesAction,
  AccountsGetV5MultiAccountBalancesAction,
  // Transactions
  AccountsGetV1TransactionByHashAction,
  AccountsGetV1AccountTransactionsAction,
  AccountsGetV4MultiAccountTransactionsAction,
  // Relationships
  AccountsGetV1AccountRelationshipAction,
  // NFTs
  AccountsGetV2AccountNftsAction,
  // Tokens
  AccountsGetV2AccountTokensAction,
} from './AccountsApiService-action-types';

// Token API action types (token.api.cx.metamask.io)
export type {
  TokenApiActions,
  TokenGetV1SupportedNetworksAction,
  TokenGetNetworksAction,
  TokenGetNetworkByChainIdAction,
  TokenGetTokenListAction,
  TokenGetTokenMetadataAction,
  TokenGetTokenDescriptionAction,
  TokenGetV3TrendingTokensAction,
  TokenGetV3TopGainersAction,
  TokenGetV3PopularTokensAction,
  TokenGetTopAssetsAction,
  TokenGetV1SuggestedOccurrenceFloorsAction,
} from './TokenApiService-action-types';

// Tokens API action types (tokens.api.cx.metamask.io)
export type {
  TokensApiActions,
  TokensGetV1SupportedNetworksAction,
  TokensGetV2SupportedNetworksAction,
  TokensGetV1TokenListAction,
  TokensGetV1TokenMetadataAction,
  TokensGetV1TokenDetailsAction,
  TokensGetV1TokensByAddressesAction,
  TokensGetV1SearchTokensAction,
  TokensGetV1SearchTokensOnChainAction,
  TokensGetV3AssetsAction,
  TokensGetV3TrendingTokensAction,
  TokensGetNetworkConfigAction,
  TokensGetNetworkTokenStandardAction,
  TokensGetTopAssetsAction,
} from './TokensApiService-action-types';

// Price API action types
export type {
  PricesApiActions,
  PricesGetV1SupportedNetworksAction,
  PricesGetV2SupportedNetworksAction,
  PricesGetV1ExchangeRatesAction,
  PricesGetV1FiatExchangeRatesAction,
  PricesGetV1CryptoExchangeRatesAction,
  PricesGetV1SpotPricesByCoinIdsAction,
  PricesGetV1SpotPriceByCoinIdAction,
  PricesGetV1TokenPricesAction,
  PricesGetV1TokenPriceAction,
  PricesGetV2SpotPricesAction,
  PricesGetV3SpotPricesAction,
  PricesGetV1HistoricalPricesByCoinIdAction,
  PricesGetV1HistoricalPricesByTokenAddressesAction,
  PricesGetV1HistoricalPricesAction,
  PricesGetV3HistoricalPricesAction,
  PricesGetV1HistoricalPriceGraphByCoinIdAction,
  PricesGetV1HistoricalPriceGraphByTokenAddressAction,
} from './PriceApiService-action-types';

// HTTP Client
export { HttpClient, HttpError } from './HttpClient';
export type { HttpRequestOptions } from './HttpClient';

// Token API Service (token.api.cx.metamask.io)
export {
  TokenApiService,
  TOKEN_API_BASE_URL,
  TOKEN_API_METHODS,
} from './TokenApiService';
export type {
  TokenApiServiceOptions,
  GetTokenSupportedNetworksResponse,
  NetworkInfo,
  TopAsset,
  TokenDescriptionResponse,
  SuggestedOccurrenceFloorsResponse,
  TopGainersSortOption,
} from './TokenApiService';

// Tokens API Service (tokens.api.cx.metamask.io)
export {
  TokensApiService,
  TOKENS_API_BASE_URL,
  TOKENS_API_METHODS,
} from './TokensApiService';
export type {
  TokensApiServiceOptions,
  GetTokensSupportedNetworksV1Response,
  GetTokensSupportedNetworksV2Response,
  TokenDetails,
  AssetByIdResponse,
  TokensNetworkConfig,
  TokensTopAsset,
} from './TokensApiService';

// Accounts API Service
export { AccountsApiService, ACCOUNTS_API_METHODS } from './AccountsApiService';
export type {
  AccountsApiServiceOptions,
  GetV2ActiveNetworksResponse,
  TransactionByHashResponse,
  GetV4MultiAccountTransactionsResponse,
  GetV5MultiAccountBalancesResponse,
} from './AccountsApiService';

// Price API Service
export { PriceApiService, PRICE_API_METHODS } from './PriceApiService';
export type {
  PriceApiServiceOptions,
  GetV3SpotPricesResponse,
  GetExchangeRatesWithInfoResponse,
  GetPriceSupportedNetworksV1Response,
  GetPriceSupportedNetworksV2Response,
  CoinGeckoSpotPrice,
  ExchangeRateInfo,
  GetV3HistoricalPricesResponse,
} from './PriceApiService';

// Common Types
export type {
  // Base types
  ApiEnvironment,
  BaseApiServiceOptions,
  ApiErrorResponse,
  PageInfo,

  // Token types
  TokenMetadata,
  TokenSearchResult,
  TokenSearchResponse,
  TrendingSortBy,
  TrendingToken,
  GetTokenListOptions,
  SearchTokensOptions,
  GetTrendingTokensOptions,
  GetTokenMetadataOptions,

  // Accounts API types
  AccountsApiBalance,
  GetV2BalancesResponse,
  GetV4MultiAccountBalancesResponse,
  GetV1SupportedNetworksResponse,
  GetV2SupportedNetworksResponse,
  GetBalancesOptions,
  GetMultiAccountBalancesOptions,
  AccountTransaction,
  GetAccountTransactionsResponse,
  GetAccountTransactionsOptions,
  AccountRelationshipResult,
  GetAccountRelationshipOptions,

  // Price API types
  MarketDataDetails,
  GetTokenPricesResponse,
  GetTokenPricesWithMarketDataResponse,
  GetTokenPricesOptions,
  GetExchangeRatesResponse,
  SupportedCurrency,
  GetHistoricalPricesOptions,
  HistoricalPricePoint,
  GetHistoricalPricesResponse,
} from './types';

// API Base URLs
export { ACCOUNTS_API_BASE_URL, PRICE_API_BASE_URL } from './types';
