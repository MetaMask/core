import type { Asset, AssetBalance } from './assets';
import type { AccountId, Address, CaipAssetType, ChainId } from './core';

/**
 * Token detection result.
 */
export type TokenDetectionResult = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address used for detection */
  accountAddress: Address;
  /** Newly detected tokens with non-zero balances */
  detectedAssets: Asset[];
  /** Balances for newly detected tokens */
  detectedBalances: AssetBalance[];
  /** Tokens that were checked but had zero balance */
  zeroBalanceAddresses: Address[];
  /** Tokens that failed to be checked */
  failedAddresses: Address[];
  /** Timestamp of detection */
  timestamp: number;
};

/**
 * Token detection options.
 */
export type TokenDetectionOptions = {
  /** Whether token detection is enabled */
  tokenDetectionEnabled?: boolean;
  /** Whether external services (e.g. token list API) are allowed; detection stops when false */
  useExternalService?: boolean;
  /** Maximum number of tokens to check per batch */
  batchSize?: number;
  /** Timeout for detection in milliseconds */
  timeout?: number;
};

/**
 * Balance fetch result.
 */
export type BalanceFetchResult = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address */
  accountAddress: Address;
  /** Fetched balances */
  balances: AssetBalance[];
  /** Token addresses that failed to fetch */
  failedAddresses: Address[];
  /** Block number when balances were fetched */
  blockNumber?: number;
  /** Timestamp of fetch */
  timestamp: number;
};

/**
 * Entry describing a single asset to fetch a balance for.
 * Bundles the CAIP-19 asset ID with the on-chain address (zero address for
 * native assets even when the chain has a native asset with a non-zero address)
 * and optional metadata
 */
export type AssetFetchEntry = {
  /** CAIP-19 asset type identifier */
  assetId: CaipAssetType;
  /** On-chain contract address (zero address for native assets regardless of the chain's native asset address) */
  address: Address;
  /** Token decimals (omit when unknown — balance fetcher returns raw balance for RpcDataSource to resolve). */
  decimals?: number;
};
