// =============================================================================
// TYPES
// =============================================================================
export type {
  // Core identifiers
  AccountId,
  ChainId,
  Address,
  // Asset types
  AssetType,
  Asset,
  AssetBalance,
  AssetPrice,
  // State types
  TokenListEntry,
  TokenListState,
  UserToken,
  UserTokensState,
  // Account
  AccountInfo,
  GetAccountFunction,
  // Events
  AssetsChangedEvent,
  AssetsBalanceChangedEvent,
  AssetsPriceChangedEvent,
  OnAssetsChangedCallback,
  OnAssetsBalanceChangedCallback,
  OnAssetsPriceChangedCallback,
  Unsubscribe,
  // Polling
  PollingInput,
} from './types';

// =============================================================================
// INTERFACES
// =============================================================================
export type {
  // Event Emitter
  IRpcEventEmitter,
  // Multicall Client
  IMulticallClient,
  MulticallRequest,
  MulticallResponse,
  BalanceOfRequest,
  BalanceOfResponse,
  // Token Detector
  ITokenDetector,
  TokenDetectionResult,
  TokenDetectionOptions,
  // Balance Fetcher
  IBalanceFetcher,
  BalanceFetchResult,
  BalanceFetchOptions,
  // Poller
  IPoller,
  PollerStatus,
  PollerConfig,
  // RPC Datasource
  RpcDatasourceConfig,
  RpcDatasourceDependencies,
} from './interfaces';

// =============================================================================
// IMPLEMENTATIONS
// =============================================================================

// Event Emitter
export { RpcEventEmitter } from './RpcEventEmitter';

// Multicall Client
export {
  MulticallClient,
  MULTICALL3_ADDRESS_BY_CHAIN,
  type MulticallClientConfig,
  type Provider,
  type GetProviderFunction,
} from './MulticallClient';

// Token Detector
export { TokenDetector, type TokenDetectorConfig } from './TokenDetector';

// Balance Fetcher
export { BalanceFetcher, type BalanceFetcherConfig } from './BalanceFetcher';

// RPC Datasource (main export)
export { RpcDatasource } from './RpcDatasource';

// =============================================================================
// UTILITIES
// =============================================================================
export { divideIntoBatches, reduceInBatchesSerially } from './utils';

// =============================================================================
// RE-EXPORTS FROM UTILS
// =============================================================================
export type { CaipAssetType } from '@metamask/utils';
