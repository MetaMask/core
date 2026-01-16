// =============================================================================
// ASSETS CONTROLLER
// =============================================================================
export type {
  // State types
  AssetsControllerState,
  AssetMetadata,
  AssetPriceData,
  AssetBalanceData,
  // Options types
  AssetsControllerOptions,
  PollingTarget,
  // Action types
  AssetsControllerGetStateAction,
  AssetsControllerActions,
  // Event types
  AssetsControllerStateChangeEvent,
  AssetsControllerEvents,
  // Messenger types
  AssetsControllerMessenger,
} from './AssetsController';
export {
  AssetsController,
  getDefaultAssetsControllerState,
  controllerName,
} from './AssetsController';

// =============================================================================
// POLLING MIDDLEWARE
// =============================================================================
export type {
  AssetsPollingMiddlewareConfig,
  PollingAccount,
} from './AssetsPollingMiddleware';
export { AssetsPollingMiddleware } from './AssetsPollingMiddleware';

// =============================================================================
// RPC SERVICES
// =============================================================================
export {
  // Main Datasource
  RpcDatasource,
  // Components
  RpcEventEmitter,
  MulticallClient,
  TokenDetector,
  BalanceFetcher,
  // Constants
  MULTICALL3_ADDRESS_BY_CHAIN,
  // Types - Core
  type AccountId,
  type ChainId,
  type Address,
  type AssetType,
  type Asset,
  type AssetBalance,
  type AssetPrice,
  type CaipAssetType,
  // Types - State
  type TokenListEntry,
  type TokenListState,
  type UserToken,
  type UserTokensState,
  // Types - Account
  type AccountInfo,
  type GetAccountFunction,
  // Types - Events
  type AssetsChangedEvent,
  type AssetsBalanceChangedEvent,
  type AssetsPriceChangedEvent,
  type OnAssetsChangedCallback,
  type OnAssetsBalanceChangedCallback,
  type OnAssetsPriceChangedCallback,
  type Unsubscribe,
  // Types - Polling
  type PollingInput,
  // Interfaces
  type IRpcEventEmitter,
  type IMulticallClient,
  type ITokenDetector,
  type IBalanceFetcher,
  type IPoller,
  // Interface sub-types
  type MulticallRequest,
  type MulticallResponse,
  type BalanceOfRequest,
  type BalanceOfResponse,
  type TokenDetectionResult,
  type TokenDetectionOptions,
  type BalanceFetchResult,
  type BalanceFetchOptions,
  type PollerStatus,
  type PollerConfig,
  type RpcDatasourceConfig,
  type RpcDatasourceDependencies,
  // Config types
  type MulticallClientConfig,
  type TokenDetectorConfig,
  type BalanceFetcherConfig,
  type Provider,
  type GetProviderFunction,
} from './rpc-datasource';
