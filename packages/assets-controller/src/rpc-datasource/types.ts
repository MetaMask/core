import type { CaipAssetType, Hex } from '@metamask/utils';

// =============================================================================
// CORE IDENTIFIERS
// =============================================================================

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

// =============================================================================
// ASSET TYPES
// =============================================================================

/**
 * Asset type identifier for categorization.
 */
export type AssetType = 'native' | 'erc20' | 'erc721' | 'erc1155';

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
  /** Block number when balance was fetched */
  blockNumber?: number;
  /** Timestamp when balance was fetched */
  timestamp: number;
};

/**
 * Asset price data.
 */
export type AssetPrice = {
  /** CAIP-19 asset identifier */
  assetId: CaipAssetType;
  /** Currency code (e.g., "usd", "eur") */
  vsCurrency: string;
  /** Price value */
  price: number;
  /** 24h price change percentage */
  priceChange24h?: number;
  /** Market cap */
  marketCap?: number;
  /** 24h volume */
  volume24h?: number;
  /** Timestamp when price was fetched */
  timestamp: number;
};

// =============================================================================
// TOKEN LIST STATE (Input from TokenListController)
// =============================================================================

/**
 * Single token entry from token list.
 */
export type TokenListEntry = {
  /** Contract address */
  address: Address;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Logo URL */
  iconUrl?: string;
  /** Aggregator sources */
  aggregators?: string[];
  /** Occurrence count in lists */
  occurrences?: number;
};

/**
 * Token list state shape (from TokenListController).
 */
export type TokenListState = {
  /** Map of chain ID to token list */
  tokensChainsCache: Record<ChainId, Record<Address, TokenListEntry>>;
};

// =============================================================================
// IMPORTED/DETECTED TOKENS STATE (Input from TokensController)
// =============================================================================

/**
 * Token entry from user's imported/detected tokens.
 */
export type UserToken = {
  /** Contract address */
  address: Address;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name?: string;
  /** Token decimals */
  decimals: number;
  /** Logo URL */
  image?: string;
  /** Whether token was auto-detected */
  isERC721?: boolean;
  /** Aggregator sources */
  aggregators?: string[];
};

/**
 * User tokens state shape (from TokensController).
 */
export type UserTokensState = {
  /** All imported tokens: chainId -> accountAddress -> Token[] */
  allTokens: Record<ChainId, Record<Address, UserToken[]>>;
  /** All detected tokens: chainId -> accountAddress -> Token[] */
  allDetectedTokens: Record<ChainId, Record<Address, UserToken[]>>;
  /** Ignored tokens: chainId -> address[] */
  allIgnoredTokens: Record<ChainId, Record<Address, Address[]>>;
};

// =============================================================================
// ACCOUNT INFO
// =============================================================================

/**
 * Minimal account info needed for RPC operations.
 */
export type AccountInfo = {
  /** Account UUID */
  id: AccountId;
  /** Account address */
  address: Address;
  /** Account type (e.g., "eip155:eoa") */
  type: string;
};

/**
 * Function to get account info by ID.
 */
export type GetAccountFunction = (
  accountId: AccountId,
) => AccountInfo | undefined;

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Event payload for asset changes (new tokens detected).
 */
export type AssetsChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Newly detected/changed assets */
  assets: Asset[];
  /** Timestamp */
  timestamp: number;
};

/**
 * Event payload for balance changes.
 */
export type AssetsBalanceChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Updated balances */
  balances: AssetBalance[];
  /** Timestamp */
  timestamp: number;
};

/**
 * Event payload for price changes.
 */
export type AssetsPriceChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Updated prices */
  prices: AssetPrice[];
  /** Timestamp */
  timestamp: number;
};

// =============================================================================
// SUBSCRIPTION TYPES
// =============================================================================

/**
 * Callback for assets changed event.
 */
export type OnAssetsChangedCallback = (event: AssetsChangedEvent) => void;

/**
 * Callback for balance changed event.
 */
export type OnAssetsBalanceChangedCallback = (
  event: AssetsBalanceChangedEvent,
) => void;

/**
 * Callback for price changed event.
 */
export type OnAssetsPriceChangedCallback = (
  event: AssetsPriceChangedEvent,
) => void;

/**
 * Unsubscribe function returned by subscription methods.
 */
export type Unsubscribe = () => void;

// =============================================================================
// POLLING INPUT
// =============================================================================

/**
 * Input for polling operations.
 */
export type PollingInput = {
  /** Chain ID to poll */
  chainId: ChainId;
  /** Account ID to poll for */
  accountId: AccountId;
};
