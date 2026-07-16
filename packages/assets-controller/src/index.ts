// Main controller export
export {
  AssetsController,
  getDefaultAssetsControllerState,
} from './AssetsController.js';
export { AssetsDataSourceError } from './errors.js';
export {
  DEFAULT_TRACKED_ASSETS_BY_CHAIN,
  CHAINS_WITH_DEFAULT_TRACKED_ASSETS,
  DEFAULT_ASSET_METADATA,
  buildDefaultAssetsInfo,
  getDefaultTrackedAssetsForChain,
  getDefaultAssetMetadata,
} from './defaults.js';
export type { PendingTokenMetadata } from './AssetsController.js';

// State and messenger types
export type {
  AssetsControllerState,
  AssetsControllerMessenger,
  AssetsControllerOptions,
  AssetsControllerGetStateAction,
  AssetsControllerActions,
  AssetsControllerStateChangeEvent,
  AssetsControllerBalanceChangedEvent,
  AssetsControllerPriceChangedEvent,
  AssetsControllerAssetsDetectedEvent,
  AssetsControllerEvents,
} from './AssetsController.js';
export type {
  AssetsControllerGetAssetsAction,
  AssetsControllerGetAssetsBalanceAction,
  AssetsControllerGetAssetMetadataAction,
  AssetsControllerGetAssetAction,
  AssetsControllerGetAssetsPriceAction,
  AssetsControllerAddCustomAssetAction,
  AssetsControllerRemoveCustomAssetAction,
  AssetsControllerGetCustomAssetsAction,
  AssetsControllerHideAssetAction,
  AssetsControllerUnhideAssetAction,
  AssetsControllerGetExchangeRatesForBridgeAction,
  AssetsControllerGetStateForTransactionPayAction,
  AssetsControllerSetSelectedCurrencyAction,
} from './AssetsController-method-action-types.js';

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
  AssetsDataSource,
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
} from './types.js';

// Data sources - base class and types
export { AbstractDataSource } from './data-sources/index.js';

export type { DataSourceState, SubscriptionRequest } from './data-sources/index.js';

// Data sources - AccountsApi
export { AccountsApiDataSource } from './data-sources/index.js';

export type {
  AccountsApiDataSourceConfig,
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceState,
} from './data-sources/index.js';

// Data sources - BackendWebsocket
export {
  BackendWebsocketDataSource,
  createBackendWebsocketDataSource,
} from './data-sources/index.js';

export type {
  BackendWebsocketDataSourceOptions,
  BackendWebsocketDataSourceState,
} from './data-sources/index.js';

// Data sources - RPC
export { RpcDataSource, createRpcDataSource } from './data-sources/index.js';

export type {
  RpcDataSourceConfig,
  RpcDataSourceOptions,
  RpcDataSourceState,
  ChainStatus,
} from './data-sources/index.js';

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
} from './data-sources/index.js';

export type {
  SnapDataSourceState,
  SnapDataSourceOptions,
} from './data-sources/index.js';

// Enrichment data sources
export { TokenDataSource, PriceDataSource } from './data-sources/index.js';

export type {
  TokenDataSourceOptions,
  PriceDataSourceConfig,
  PriceDataSourceOptions,
} from './data-sources/index.js';

// Middlewares
export {
  CustomAssetGraduationMiddleware,
  DetectionMiddleware,
  RpcFallbackMiddleware,
} from './middlewares/index.js';
export type {
  CustomAssetGraduationMiddlewareOptions,
  RpcFallbackMiddlewareOptions,
} from './middlewares/index.js';

// Utilities
export {
  normalizeAssetId,
  formatExchangeRatesForBridge,
  formatStateForTransactionPay,
} from './utils/index.js';
export type {
  AccountForLegacyFormat,
  BridgeExchangeRatesFormat,
  LegacyToken,
  TransactionPayLegacyFormat,
} from './utils/index.js';

// Selectors
export {
  calculateBalanceForAllWallets,
  calculateBalanceChangeForAccountGroup,
  getAggregatedBalanceForAccount,
  getGroupIdForAccount,
  getInternalAccountsForGroup,
} from './selectors/balance.js';

export type {
  AccountGroupBalance,
  AccountsById,
  AggregatedBalanceEntry,
  AggregatedBalanceForAccount,
  AllWalletsBalance,
  BalanceChangePeriod,
  BalanceChangeResult,
  EnabledNetworkMap,
  WalletBalance,
} from './selectors/balance.js';
