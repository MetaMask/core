import type { IBalanceFetcher } from './IBalanceFetcher';
import type { IMulticallClient } from './IMulticallClient';
import type { ITokenDetector } from './ITokenDetector';
import type {
  GetAccountFunction,
  TokenListState,
  UserTokensState,
} from '../types';

/**
 * RpcDatasource configuration options.
 */
export type RpcDatasourceConfig = {
  /** Polling interval in milliseconds (default: 30000) */
  pollingIntervalMs?: number;
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
  /**
   * Function to check if token detection is enabled.
   * Called on each poll cycle to allow dynamic toggling.
   * If not provided, token detection is disabled.
   */
  isTokenDetectionEnabled?: () => boolean;
  /** Optional: Custom multicall client */
  multicallClient?: IMulticallClient;
  /** Optional: Custom token detector */
  tokenDetector?: ITokenDetector;
  /** Optional: Custom balance fetcher */
  balanceFetcher?: IBalanceFetcher;
};
