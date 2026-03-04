import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType, CaipChainId, Json } from '@metamask/utils';

/**
 * CAIP-19 compliant asset identifier
 * Format: "{chainId}/{assetNamespace}:{assetReference}[/tokenId]"
 *
 * Examples:
 * - Native: "eip155:1/slip44:60" (ETH)
 * - ERC20: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" (USDC)
 * - ERC721: "eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D/1234" (BAYC #1234)
 * - SPL: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
 */
export type Caip19AssetId = CaipAssetType;

/**
 * InternalAccount UUID from AccountsController
 * Not the blockchain address!
 */
export type AccountId = string;

/**
 * CAIP-2 chain identifier
 */
export type ChainId = CaipChainId;

// ============================================================================
// ASSET TYPES - Defined by metadata structure
// ============================================================================

/**
 * Asset types define the metadata structure, not blockchain implementation.
 * - "fungible" includes: native, erc20, spl - all share balance, symbol, decimals
 * - "nft" includes: erc721, erc1155 - include tokenId, image, attributes
 */
export type AssetType = 'fungible' | 'nft' | 'collectible';

/**
 * Token standards - blockchain implementation details
 */
export type TokenStandard =
  | 'native'
  | 'erc20'
  | 'erc721'
  | 'erc1155'
  | 'spl'
  | string;

// ============================================================================
// METADATA TYPES (vary by asset type)
// ============================================================================

/**
 * UI preferences for an asset (stored in assetPreferences state, not in metadata).
 */
export type AssetPreferences = {
  /** Whether the asset is hidden from display */
  hidden?: boolean;
};

/**
 * Base metadata attributes shared by ALL asset types.
 */
export type BaseAssetMetadata = {
  /** Token standard - how it's implemented on the blockchain */
  type: TokenStandard;
  /** Display symbol (e.g., "ETH", "USDC") */
  symbol: string;
  /** Full name (e.g., "Ethereum", "USD Coin") */
  name: string;
  /** Token decimals (18 for ETH, 6 for USDC, etc.) */
  decimals: number;
  /** Logo URL or data URI */
  image?: string;
};

// ============================================================================
// TOKEN CONTRACT DATA TYPES
// ============================================================================

/** Fee information for token transfers */
export type TokenFees = {
  avgFee: number;
  maxFee: number;
  minFee: number;
};

/** Honeypot detection status */
export type HoneypotStatus = {
  honeypotIs: boolean;
  goPlus?: boolean;
};

/** Storage slot information for the contract */
export type StorageSlots = {
  balance: number;
  approval: number;
};

/** Localized description */
export type LocalizedDescription = {
  en: string;
};

// ============================================================================
// ASSET METADATA TYPES
// ============================================================================

/**
 * Metadata for fungible tokens.
 * Structure mirrors V3AssetResponse from the Tokens API.
 *
 * Differences from V3AssetResponse:
 * - `type` is derived from assetId namespace (not in API response)
 * - `image` maps from API's `iconUrl`
 * - `assetId` is not stored (used as the key)
 */
export type FungibleAssetMetadata = {
  /** Token type derived from assetId namespace */
  type: 'native' | 'erc20' | 'spl';
  /** CoinGecko ID for price lookups */
  coingeckoId?: string;
  /** Number of token list occurrences */
  occurrences?: number;
  /** DEX/aggregator integrations */
  aggregators?: string[];
  /** Asset labels/tags (e.g., "stable_coin") */
  labels?: string[];
  /** Whether the token supports ERC-20 permit */
  erc20Permit?: boolean;
  /** Fee information for token transfers */
  fees?: TokenFees;
  /** Honeypot detection status */
  honeypotStatus?: HoneypotStatus;
  /** Storage slot information for the contract */
  storage?: StorageSlots;
  /** Whether the contract is verified */
  isContractVerified?: boolean;
  /** Localized description */
  description?: LocalizedDescription;
} & BaseAssetMetadata;

/**
 * Metadata for ERC721 NFTs
 * Asset Type: "nft"
 */
export type ERC721AssetMetadata = {
  type: 'erc721';
  decimals: 0;
  /** Collection name */
  collectionName?: string;
  /** Collection size */
  collectionSize?: number;
  /** NFT traits/attributes - must be Json-serializable */
  traits?: Record<string, Json>;
  /** Rarity score */
  rarity?: number;
  /** Verification status */
  verified?: boolean;
} & BaseAssetMetadata;

/**
 * Metadata for ERC1155 multi-tokens
 */
export type ERC1155AssetMetadata = {
  type: 'erc1155';
  /** Token URI */
  tokenUri?: string;
  /** Token category */
  category?: string;
  /** Spam detection flag */
  isSpam?: boolean;
} & BaseAssetMetadata;

/**
 * Union type representing all possible asset metadata types.
 * All types must be JSON-serializable.
 */
export type AssetMetadata =
  | FungibleAssetMetadata
  | ERC721AssetMetadata
  | ERC1155AssetMetadata
  | (BaseAssetMetadata & { [key: string]: Json });

// ============================================================================
// PRICE TYPES (vary by asset type)
// ============================================================================

/**
 * Base price attributes.
 */
export type BaseAssetPrice = {
  /** Current price in USD */
  price: number;
  /** Timestamp of last price update */
  lastUpdated: number;
};

/**
 * Price data for fungible tokens (native, ERC20, SPL)
 * Matches V3SpotPricesResponse from the Price API.
 */
export type FungibleAssetPrice = {
  /** CoinGecko ID */
  id?: string;
  /** Current price in USD */
  price: number;
  /** Market capitalization */
  marketCap?: number;
  /** All-time high price */
  allTimeHigh?: number;
  /** All-time low price */
  allTimeLow?: number;
  /** 24h trading volume */
  totalVolume?: number;
  /** 24h high price */
  high1d?: number;
  /** 24h low price */
  low1d?: number;
  /** Circulating supply */
  circulatingSupply?: number;
  /** Fully diluted market cap */
  dilutedMarketCap?: number;
  /** 24h market cap change percentage */
  marketCapPercentChange1d?: number;
  /** 24h price change in USD */
  priceChange1d?: number;
  /** 1h price change percentage */
  pricePercentChange1h?: number;
  /** 24h price change percentage */
  pricePercentChange1d?: number;
  /** 7d price change percentage */
  pricePercentChange7d?: number;
  /** 14d price change percentage */
  pricePercentChange14d?: number;
  /** 30d price change percentage */
  pricePercentChange30d?: number;
  /** 200d price change percentage */
  pricePercentChange200d?: number;
  /** 1y price change percentage */
  pricePercentChange1y?: number;
  /** Timestamp of last price update (added by client) */
  lastUpdated: number;
};

/**
 * Price data for NFT collections
 */
export type NFTAssetPrice = {
  /** Floor price */
  floorPrice?: number;
  /** Last sale price */
  lastSalePrice?: number;
  /** Collection trading volume */
  collectionVolume?: number;
  /** Average price */
  averagePrice?: number;
  /** Number of sales in 24h */
  sales24h?: number;
} & BaseAssetPrice;

/**
 * Union type representing all possible asset price types.
 * All types must be JSON-serializable.
 */
export type AssetPrice =
  | FungibleAssetPrice
  | NFTAssetPrice
  | (BaseAssetPrice & { [key: string]: Json });

// ============================================================================
// BALANCE TYPES (vary by asset type)
// ============================================================================

/**
 * Balance data for fungible tokens (native, ERC20, SPL).
 */
export type FungibleAssetBalance = {
  /** Raw balance amount as string (e.g., "1000000000" for 1000 USDC) */
  amount: string;
};

/**
 * Balance data for ERC721 NFTs.
 * Each tokenId has its own CAIP-19 asset ID, so always "1".
 */
export type ERC721AssetBalance = {
  /** Always "1" for ERC721 (non-fungible) */
  amount: '1';
};

/**
 * Balance data for ERC1155 multi-tokens.
 */
export type ERC1155AssetBalance = {
  /** Quantity owned of this specific tokenId */
  amount: string;
};

/**
 * Union type representing all possible asset balance types.
 * All types must be JSON-serializable.
 */
export type AssetBalance =
  | FungibleAssetBalance
  | ERC721AssetBalance
  | ERC1155AssetBalance
  | { amount: string; [key: string]: Json };

// ============================================================================
// DATA SOURCE TYPES
// ============================================================================

/**
 * Data type dimension - what kind of data
 */
export type DataType = 'balance' | 'metadata' | 'price';

/**
 * Account with its supported chains (enabled chains ∩ account scope).
 * Pre-computed by the controller so data sources do not need to implement
 * account-scope logic; they iterate over supportedChains for each account.
 */
export type AccountWithSupportedChains = {
  account: InternalAccount;
  supportedChains: ChainId[];
};

/**
 * Request for data from data sources
 */
export type DataRequest = {
  /** Accounts with their supported chains (enabled ∩ account scope). Data sources use this instead of computing accountSupportsChain. */
  accountsWithSupportedChains: AccountWithSupportedChains[];
  /** CAIP-2 chain IDs (union of chains in this request) */
  chainIds: ChainId[];
  /** Filter by asset types */
  assetTypes?: AssetType[];
  /** Which data to fetch */
  dataTypes: DataType[];
  /** Specific CAIP-19 asset IDs */
  customAssets?: Caip19AssetId[];
  /** Force fresh fetch, bypass cache */
  forceUpdate?: boolean;
  /** Hint for polling interval (ms) - used by data sources that implement polling */
  updateInterval?: number;
  /** Specific CAIP-19 asset IDs for price update */
  assetsForPriceUpdate?: Caip19AssetId[];
};

/**
 * Response from data sources
 */
export type DataResponse = {
  /** Metadata for assets (shared across accounts) */
  assetsInfo?: Record<Caip19AssetId, AssetMetadata>;
  /** Price data for assets (shared across accounts) */
  assetsPrice?: Record<Caip19AssetId, AssetPrice>;
  /** Balance data per account */
  assetsBalance?: Record<AccountId, Record<Caip19AssetId, AssetBalance>>;
  /** Errors encountered, keyed by chain ID */
  errors?: Record<ChainId, string>;
  /** Detected assets (assets that do not have metadata) */
  detectedAssets?: Record<AccountId, Caip19AssetId[]>;
  /**
   * How to apply this response to state. See {@link AssetsUpdateMode}.
   * Defaults to `'merge'` if omitted.
   */
  updateMode?: AssetsUpdateMode;
};

/**
 * Type of {@link DataResponse.updateMode}: how the controller applies the response to state.
 *
 * - **full**: Response is the full set for the scope. Assets in state but not in the
 *   response are cleared (except custom assets). Use for initial fetch or full refresh.
 * - **merge**: Only assets present in the response are updated; nothing is removed.
 *   Use for event-driven or incremental updates.
 */
export type AssetsUpdateMode = 'full' | 'merge';

// ============================================================================
// DATA SOURCE <-> CONTROLLER (DIRECT CALLS, NO MESSENGER PER SOURCE)
// ============================================================================

/**
 * Callbacks for data sources to report to AssetsController.
 * Passed to data sources so they report by direct call instead of messenger.
 */
export type AssetsControllerReport = {
  onActiveChainsUpdate: (dataSourceId: string, activeChains: ChainId[]) => void;
  onAssetsUpdate: (response: DataResponse, sourceId: string) => Promise<void>;
};

/** Request passed from controller to data source when subscribing */
export type DataSourceSubscriptionRequest = {
  request: DataRequest;
  subscriptionId: string;
  isUpdate: boolean;
};

/**
 * Interface for balance data sources that the controller calls directly.
 * No messenger is required for controller <-> data source communication.
 */
export type BalanceDataSource = {
  getAssetsMiddleware: () => Middleware;
  subscribe: (request: DataSourceSubscriptionRequest) => Promise<void>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
  getName: () => string;
};

/**
 * Interface for the price data source (subscribe/unsubscribe + middleware).
 * Controller calls these methods directly.
 */
export type PriceDataSourceInterface = {
  getAssetsMiddleware: () => Middleware;
  subscribe: (request: DataSourceSubscriptionRequest) => Promise<void>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
};

/**
 * Middleware-only source (e.g. detection, token enrichment).
 * Controller calls getAssetsMiddleware() directly.
 */
export type MiddlewareDataSource = {
  getAssetsMiddleware: () => Middleware;
};

// ============================================================================
// UNIFIED MIDDLEWARE TYPES
// ============================================================================

/**
 * Internal state structure for AssetsController following normalized design.
 *
 * Keys use CAIP identifiers:
 * - assetsInfo keys: CAIP-19 asset IDs (e.g., "eip155:1/erc20:0x...")
 * - assetsBalance outer keys: Account IDs (InternalAccount.id UUIDs)
 * - assetsBalance inner keys: CAIP-19 asset IDs
 * - assetsPrice keys: CAIP-19 asset IDs
 * - customAssets outer keys: Account IDs (InternalAccount.id UUIDs)
 * - customAssets inner values: CAIP-19 asset IDs array
 * - assetPreferences keys: CAIP-19 asset IDs
 */
export type AssetsControllerStateInternal = {
  /** Shared metadata for all assets (stored once per asset) */
  assetsInfo: Record<Caip19AssetId, AssetMetadata>;
  /** Per-account balance data */
  assetsBalance: Record<AccountId, Record<Caip19AssetId, AssetBalance>>;
  /** Price data for assets */
  assetsPrice: Record<Caip19AssetId, AssetPrice>;
  /** Custom assets added by users per account */
  customAssets: Record<AccountId, Caip19AssetId[]>;
  /** UI preferences per asset (e.g. hidden) - separate from metadata */
  assetPreferences: Record<Caip19AssetId, AssetPreferences>;
};

/**
 * Base context for all middleware operations.
 * Contains the common interface shared by fetch and subscribe.
 */
export type Context = {
  /** The data request */
  request: DataRequest;
  /** The response data (mutated by middlewares) */
  response: DataResponse;
  /** Get current assets state */
  getAssetsState: () => AssetsControllerStateInternal;
};

/**
 * Next function for middleware chain
 */
export type NextFunction = (context: Context) => Promise<Context>;

/**
 * Middleware function - works for both fetch and subscribe operations.
 */
export type Middleware = (
  context: Context,
  next: NextFunction,
) => Promise<Context>;

/**
 * Wraps a middleware to only execute if specific dataTypes are requested.
 *
 * @param dataTypes - DataTypes that must be in the request for middleware to run
 * @param middleware - The middleware to conditionally execute
 * @returns A middleware that skips execution if none of the dataTypes are requested
 *
 * @example
 * ```typescript
 * // Only runs for metadata requests
 * const metadataMiddleware = forDataTypes(['metadata'], async (ctx, next) => {
 *   const result = await next(ctx);
 *   // Enrich metadata...
 *   return result;
 * });
 *
 * // Runs for balance or price requests
 * const balanceOrPriceMiddleware = forDataTypes(['balance', 'price'], async (ctx, next) => {
 *   const result = await next(ctx);
 *   // Process balances or prices...
 *   return result;
 * });
 * ```
 */
export function forDataTypes(
  dataTypes: DataType[],
  middleware: Middleware,
): Middleware {
  return async (ctx, next) => {
    const requestedTypes = ctx.request.dataTypes;
    const shouldRun = dataTypes.some((dt) => requestedTypes.includes(dt));

    if (!shouldRun) {
      return next(ctx);
    }

    return middleware(ctx, next);
  };
}

/**
 * Context for fetch operations.
 * Extends base Context - no additional fields needed for fetch.
 */
export type FetchContext = Context;

// Legacy aliases for backwards compatibility
export type FetchNextFunction = NextFunction;
export type FetchMiddleware = Middleware;

/**
 * Subscription response returned when subscribing to asset updates.
 */
export type SubscriptionResponse = {
  /** Chains actively subscribed */
  chains: ChainId[];
  /** Account ID being watched */
  accountId: AccountId;
  /** Asset types being watched */
  assetTypes: AssetType[];
  /** Data types being kept fresh */
  dataTypes: DataType[];
  /** Cleanup function */
  unsubscribe: () => void;
};

// ============================================================================
// COMBINED ASSET TYPE (for UI)
// ============================================================================

/**
 * Combined asset type matching state structure: balance, metadata, price
 */
export type Asset = {
  /** CAIP-19 asset ID */
  id: Caip19AssetId;
  /** CAIP-2 chain ID (extracted from id) */
  chainId: ChainId;
  /** Balance data */
  balance: AssetBalance;
  /** Metadata (symbol, name, decimals, etc.) */
  metadata: AssetMetadata;
  /** Price data */
  price: AssetPrice;
  /** Computed fiat value (balance × price) */
  fiatValue: number;
};

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event emitted when balances change
 */
export type BalanceChangeEvent = {
  accountId: AccountId;
  assetId: Caip19AssetId;
  previousAmount: string;
  newAmount: string;
  timestamp: number;
};

/**
 * Event emitted when prices change
 */
export type PriceChangeEvent = {
  assetIds: Caip19AssetId[];
  timestamp: number;
};

/**
 * Event emitted when metadata changes
 */
export type MetadataChangeEvent = {
  assetId: Caip19AssetId;
  changes: Partial<AssetMetadata>;
};

/**
 * Event emitted when assets without metadata are detected
 */
export type AssetsDetectedEvent = {
  accountId: AccountId;
  assetIds: Caip19AssetId[];
};
