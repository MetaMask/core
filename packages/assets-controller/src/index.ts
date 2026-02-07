// Main controller export
export {
  AssetsController,
  getDefaultAssetsControllerState,
} from './AssetsController';

// State and messenger types
export type {
  AssetsControllerState,
  AssetsControllerMessenger,
  AssetsControllerOptions,
  AssetsControllerGetStateAction,
  AssetsControllerGetAssetsAction,
  AssetsControllerGetAssetsBalanceAction,
  AssetsControllerGetAssetMetadataAction,
  AssetsControllerGetAssetsPriceAction,
  AssetsControllerActiveChainsUpdateAction,
  AssetsControllerAssetsUpdateAction,
  AssetsControllerAddCustomAssetAction,
  AssetsControllerRemoveCustomAssetAction,
  AssetsControllerGetCustomAssetsAction,
  AssetsControllerHideAssetAction,
  AssetsControllerUnhideAssetAction,
  AssetsControllerActions,
  AssetsControllerStateChangeEvent,
  AssetsControllerBalanceChangedEvent,
  AssetsControllerPriceChangedEvent,
  AssetsControllerAssetsDetectedEvent,
  AssetsControllerEvents,
} from './AssetsController';

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
  DataType,
  DataRequest,
  DataResponse,
  // Middleware types
  Context,
  NextFunction,
  Middleware,
  FetchContext,
  FetchNextFunction,
  FetchMiddleware,
  // Data source registration
  DataSourceDefinition,
  RegisteredDataSource,
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
export {
  AccountsApiDataSource,
  createAccountsApiDataSource,
} from './data-sources';

export type {
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceState,
  AccountsApiDataSourceActions,
  AccountsApiDataSourceEvents,
  AccountsApiDataSourceMessenger,
} from './data-sources';

// Data sources - BackendWebsocket
export {
  BackendWebsocketDataSource,
  createBackendWebsocketDataSource,
} from './data-sources';

export type {
  BackendWebsocketDataSourceOptions,
  BackendWebsocketDataSourceState,
  BackendWebsocketDataSourceActions,
  BackendWebsocketDataSourceEvents,
  BackendWebsocketDataSourceMessenger,
  BackendWebsocketDataSourceAllowedActions,
  BackendWebsocketDataSourceAllowedEvents,
} from './data-sources';

// Data sources - RPC
export { RpcDataSource, createRpcDataSource } from './data-sources';

export type {
  RpcDataSourceOptions,
  RpcDataSourceState,
  RpcDataSourceActions,
  RpcDataSourceEvents,
  RpcDataSourceMessenger,
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
  SnapDataSourceActions,
  SnapDataSourceEvents,
  SnapDataSourceMessenger,
} from './data-sources';

// Enrichment data sources
export { TokenDataSource, PriceDataSource } from './data-sources';

export type {
  TokenDataSourceActions,
  TokenDataSourceMessenger,
  PriceDataSourceActions,
  PriceDataSourceEvents,
  PriceDataSourceMessenger,
} from './data-sources';

// Middlewares
export { DetectionMiddleware } from './middlewares';

export type {
  DetectionMiddlewareActions,
  DetectionMiddlewareMessenger,
} from './middlewares';

// Data source initialization
export { initMessengers, initDataSources } from './data-sources';

export type {
  DataSourceMessengers,
  DataSources,
  InitMessengersOptions,
  InitDataSourcesOptions,
  DataSourceActions,
  DataSourceEvents,
  DataSourceAllowedActions,
  DataSourceAllowedEvents,
  RootMessenger,
} from './data-sources';

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
