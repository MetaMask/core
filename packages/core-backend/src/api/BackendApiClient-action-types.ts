/**
 * Messenger action types for BackendApiClient
 *
 * BackendApiClient acts as a unified gateway to all backend API services.
 * Actions are namespaced as:
 * - BackendApiClient:Accounts:* - Routes to AccountsApiService
 * - BackendApiClient:Token:* - Routes to TokenApiService (token.api.cx.metamask.io)
 * - BackendApiClient:Tokens:* - Routes to TokensApiService (tokens.api.cx.metamask.io)
 * - BackendApiClient:Prices:* - Routes to PriceApiService
 */

// =============================================================================
// Re-export from individual service action type files
// =============================================================================

// Accounts API Actions
import type { AccountsApiActions } from './AccountsApiService-action-types';
import type { PricesApiActions } from './PriceApiService-action-types';
import type { TokenApiActions } from './TokenApiService-action-types';
import type { TokensApiActions } from './TokensApiService-action-types';

export type {
  AccountsApiActions,
  AccountsGetV1SupportedNetworksAction,
  AccountsGetV2SupportedNetworksAction,
  AccountsGetV2ActiveNetworksAction,
  AccountsGetV2BalancesAction,
  AccountsGetV2BalancesWithOptionsAction,
  AccountsGetV4MultiAccountBalancesAction,
  AccountsGetV1TransactionByHashAction,
  AccountsGetV1AccountTransactionsAction,
  AccountsGetV4MultiAccountTransactionsAction,
  AccountsGetV1AccountRelationshipAction,
} from './AccountsApiService-action-types';

// Token API Actions (token.api.cx.metamask.io)
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

// Tokens API Actions (tokens.api.cx.metamask.io)
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

// Price API Actions
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

// =============================================================================
// All BackendApiClient Actions
// =============================================================================

export type BackendApiClientActions =
  | AccountsApiActions
  | TokenApiActions
  | TokensApiActions
  | PricesApiActions;
