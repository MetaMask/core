import type { CaipAssetType } from '@metamask/utils';

import type { AccountId, Address, AssetType, ChainId } from './core';

/**
 * Core asset definition.
 */
export type Asset = {
  /** CAIP-19 asset identifier */
  assetId: CaipAssetType;
  /** Chain ID in hex format */
  chainId: ChainId;
  /** Contract address (zero address for native) */
  address: Address;
  /** Asset type */
  type: AssetType;
  /** Token symbol (e.g., "ETH", "USDC") */
  symbol?: string;
  /** Token name (e.g., "Ethereum", "USD Coin") */
  name?: string;
  /** Token decimals */
  decimals?: number;
  /** Logo image URL */
  image?: string;
  /** Whether this is the chain's native token */
  isNative: boolean;
  /** Spam detection flag */
  isSpam?: boolean;
  /** Verification status */
  verified?: boolean;
  /** Token list sources */
  aggregators?: string[];
};

/**
 * Asset balance for a specific account.
 */
export type AssetBalance = {
  /** CAIP-19 asset identifier */
  assetId: CaipAssetType;
  /** Account ID (UUID) */
  accountId: AccountId;
  /** Chain ID in hex format */
  chainId: ChainId;
  /** Raw balance as string (wei/smallest unit) */
  balance: string;
  /** Human-readable balance (balance / 10^decimals) */
  formattedBalance: string;
  /** Token decimals used for formatting */
  decimals: number;
  /** Block number when balance was fetched */
  blockNumber?: number;
  /** Timestamp when balance was fetched */
  timestamp: number;
};
