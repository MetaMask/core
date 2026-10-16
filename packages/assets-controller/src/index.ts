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
} from './defaults.js';
export type { PendingTokenMetadata } from './AssetsController.js';

// Snaps → AssetsController assets migration
export {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SNAPS_ASSETS_MIGRATION_NAMESPACES,
  SnapsAssetsMigrationStage,
} from './utils/snaps-assets-migration.js';
export type { SnapsAssetsMigrationNamespace } from './utils/snaps-assets-migration.js';

// State and messenger types
export type {
  AssetsControllerState,
  AssetsControllerMessenger,
  AssetsControllerOptions,
  AssetsControllerGetStateAction,
  AssetsControllerActions,
  AssetsControllerStateChangeEvent,
  AssetsControllerEvents,
} from './AssetsController.js';
export type {
  AssetsControllerGetAssetsAction,
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  AssetsControllerGetExchangeRatesForBridgeAction,
  AssetsControllerGetStateForTransactionPayAction,
  AssetsControllerAddCustomAssetAction,
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
  AssetsLoadingStatus,
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
} from './types.js';

// Data sources - base class and types
export { AbstractDataSource } from './data-sources/index.js';

export type {
  DataSourceState,
  SubscriptionRequest,
} from './data-sources/index.js';

// Data sources - AccountsApi
export { AccountsApiDataSource } from './data-sources/index.js';

export type {
  AccountsApiDataSourceConfig,
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceState,
} from './data-sources/index.js';

// Data sources - RPC
export { RpcDataSource } from './data-sources/index.js';

export type {
  RpcDataSourceConfig,
  RpcDataSourceOptions,
  RpcDataSourceState,
  ChainStatus,
} from './data-sources/index.js';

// Data sources - Unified Snap Data Source (dynamically discovers keyring snaps)
export {
  SnapDataSource,
  SNAP_DATA_SOURCE_NAME,
  KEYRING_PERMISSION,
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
  RpcFallbackMiddleware,
} from './middlewares/index.js';
export type {
  CustomAssetGraduationMiddlewareOptions,
  RpcFallbackMiddlewareOptions,
} from './middlewares/index.js';

// Utilities
export type {
  AccountForLegacyFormat,
  BridgeExchangeRatesFormat,
  FormatExchangeRatesForBridgeParams,
  FormatStateForTransactionPayParams,
  LegacyToken,
  TransactionPayLegacyFormat,
} from './utils/index.js';

// Selectors
export {
  calculateBalanceForAllWallets,
  calculateBalanceChangeForAccountGroup,
  getAggregatedBalanceForAccount,
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
