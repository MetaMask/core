// Main controller export
export {
  AssetsController,
  getDefaultAssetsControllerState,
} from './AssetsController';
export type { PendingTokenMetadata } from './AssetsController';

// State and messenger types
export type {
  AssetsControllerState,
  AssetsControllerMessenger,
  AssetsControllerOptions,
  AssetsControllerFirstInitFetchMetaMetricsPayload,
  AssetsControllerGetStateAction,
  AssetsControllerActions,
  AssetsControllerStateChangeEvent,
  AssetsControllerBalanceChangedEvent,
  AssetsControllerPriceChangedEvent,
  AssetsControllerAssetsDetectedEvent,
  AssetsControllerEvents,
} from './AssetsController';
export type {
  AssetsControllerGetAssetsAction,
  AssetsControllerGetAssetsBalanceAction,
  AssetsControllerGetAssetMetadataAction,
  AssetsControllerGetAssetsPriceAction,
  AssetsControllerAddCustomAssetAction,
  AssetsControllerRemoveCustomAssetAction,
  AssetsControllerGetCustomAssetsAction,
  AssetsControllerHideAssetAction,
  AssetsControllerUnhideAssetAction,
  AssetsControllerMethodActions,
} from './AssetsController-method-action-types';

// Core types
export type {
  // CAIP types
  Caip19AssetId,
  AccountId,
  ChainId,
  // Asset types
  AssetType,
  TokenStandard,
  // Contract data types
  TokenFees,
  HoneypotStatus,
  StorageSlots,
  LocalizedDescription,
  // Metadata types
  BaseAssetMetadata,
  FungibleAssetMetadata,
  ERC721AssetMetadata,
  ERC1155AssetMetadata,
  AssetMetadata,
  // Price types
  BaseAssetPrice,
  FungibleAssetPrice,
  NFTAssetPrice,
  AssetPrice,
  // Balance types
  FungibleAssetBalance,
  ERC721AssetBalance,
  ERC1155AssetBalance,
  AssetBalance,
  // Data source types
  AccountWithSupportedChains,
  DataType,
  DataRequest,
  DataResponse,
  AssetsUpdateMode,
  // Middleware types
  Context,
  NextFunction,
  Middleware,
  FetchContext,
  FetchNextFunction,
  FetchMiddleware,
  SubscriptionResponse,
  // Combined asset type
  Asset,
  // Event types
  BalanceChangeEvent,
  PriceChangeEvent,
  MetadataChangeEvent,
  AssetsDetectedEvent,
} from './types';

// Data sources - base class and types
export { AbstractDataSource } from './data-sources';

export type { DataSourceState, SubscriptionRequest } from './data-sources';

// Data sources - AccountsApi
export { AccountsApiDataSource } from './data-sources';

export type {
  AccountsApiDataSourceConfig,
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceState,
  AccountsApiDataSourceAllowedActions,
} from './data-sources';

// Data sources - BackendWebsocket
export {
  BackendWebsocketDataSource,
  createBackendWebsocketDataSource,
} from './data-sources';

export type {
  BackendWebsocketDataSourceOptions,
  BackendWebsocketDataSourceState,
  BackendWebsocketDataSourceAllowedActions,
  BackendWebsocketDataSourceAllowedEvents,
} from './data-sources';

// Data sources - RPC
export { RpcDataSource, createRpcDataSource } from './data-sources';

export type {
  RpcDataSourceConfig,
  RpcDataSourceOptions,
  RpcDataSourceState,
  RpcDataSourceAllowedActions,
  RpcDataSourceAllowedEvents,
  ChainStatus,
} from './data-sources';

// Data sources - Unified Snap Data Source (dynamically discovers keyring snaps)
export {
  SnapDataSource,
  createSnapDataSource,
  SNAP_DATA_SOURCE_NAME,
  // Constants
  KEYRING_PERMISSION,
  // Utility functions
  getChainIdsCaveat,
  extractChainFromAssetId,
} from './data-sources';

export type {
  SnapDataSourceState,
  SnapDataSourceOptions,
  SnapDataSourceAllowedActions,
  SnapDataSourceAllowedEvents,
} from './data-sources';

// Enrichment data sources
export { TokenDataSource, PriceDataSource } from './data-sources';

export type {
  TokenDataSourceOptions,
  TokenDataSourceAllowedActions,
  PriceDataSourceConfig,
  PriceDataSourceOptions,
} from './data-sources';

// Middlewares
export { DetectionMiddleware } from './middlewares';

// Utilities
export { normalizeAssetId } from './utils';

// Selectors
export {
  getAggregatedBalanceForAccount,
  getGroupIdForAccount,
  getInternalAccountsForGroup,
} from './selectors/balance';

export type {
  AccountsById,
  AggregatedBalanceEntry,
  AggregatedBalanceForAccount,
  EnabledNetworkMap,
} from './selectors/balance';
