import type { ChainId } from './core';
import type {
  GetAccountFunction,
  TokenListState,
  UserTokensState,
} from './state';

/**
 * Minimal provider interface for RPC calls.
 */
export type Provider = {
  call(transaction: { to: string; data: string }): Promise<string>;
  getBalance(address: string): Promise<{ toString(): string }>;
};

/**
 * Function to get provider for a specific chain.
 */
export type GetProviderFunction = (chainId: ChainId) => Provider;

/**
 * RpcDatasource configuration options.
 */
export type RpcDatasourceConfig = {
  /** Base polling interval in milliseconds (default: 30000) */
  pollingIntervalMs?: number;
  /** Interval for balance fetching in milliseconds (default: 30000) */
  balanceIntervalMs?: number;
  /** Interval for token detection in milliseconds (default: 180000 = 3 minutes) */
  detectionIntervalMs?: number;
  /** Maximum tokens to check per detection batch */
  detectionBatchSize?: number;
  /** Maximum tokens to fetch per balance batch */
  balanceBatchSize?: number;
  /** Timeout for RPC operations in milliseconds */
  rpcTimeoutMs?: number;
};

/**
 * RpcDatasource dependencies (injected).
 */
export type RpcDatasourceDependencies = {
  /** Function to get account info by ID */
  getAccount: GetAccountFunction;
  /** Function to get token list state */
  getTokenListState: () => TokenListState;
  /** Function to get user tokens state */
  getUserTokensState: () => UserTokensState;
  /** Function to get provider for a chain */
  getProvider: GetProviderFunction;
  /** Function to check if token detection is enabled (dynamic toggle) */
  isTokenDetectionEnabled?: () => boolean;
};
