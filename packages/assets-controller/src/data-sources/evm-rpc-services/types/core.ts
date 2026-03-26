import type { CaipAssetType, Hex } from '@metamask/utils';

// Re-export for convenience
export type { CaipAssetType };

/**
 * Account ID - UUID from InternalAccount.id
 */
export type AccountId = string;

/**
 * Chain ID in hex format (e.g., "0x1" for Ethereum mainnet)
 */
export type ChainId = Hex;

/**
 * Token/Contract address in hex format
 */
export type Address = Hex;

/**
 * Asset type identifier for categorization.
 */
export type AssetType = 'native' | 'erc20' | 'erc721' | 'erc1155';
