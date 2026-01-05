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
 * Base metadata attributes shared by ALL asset types.
 */
export interface BaseAssetMetadata {
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
}

/**
 * Metadata for fungible tokens
 * Asset Type: "fungible"
 * Includes: native, ERC-20, SPL, and other fungible token standards
 */
export interface FungibleAssetMetadata extends BaseAssetMetadata {
  type: 'native' | 'erc20' | 'spl';
  /** Spam detection flag */
  isSpam?: boolean;
  /** Verification status */
  verified?: boolean;
  /** Token list memberships */
  collections?: string[];
}

/**
 * Metadata for ERC721 NFTs
 * Asset Type: "nft"
 */
export interface ERC721AssetMetadata extends BaseAssetMetadata {
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
}

/**
 * Metadata for ERC1155 multi-tokens
 */
export interface ERC1155AssetMetadata extends BaseAssetMetadata {
  type: 'erc1155';
  /** Token URI */
  tokenUri?: string;
  /** Token category */
  category?: string;
  /** Spam detection flag */
  isSpam?: boolean;
}

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
export interface BaseAssetPrice {
  /** Current price in USD */
  price: number;
  /** 24h price change percentage */
  priceChange24h?: number;
  /** Timestamp of last price update */
  lastUpdated: number;
}

/**
 * Price data for fungible tokens (native, ERC20, SPL)
 */
export interface FungibleAssetPrice extends BaseAssetPrice {
  /** Market capitalization */
  marketCap?: number;
  /** 24h trading volume */
  volume24h?: number;
  /** Circulating supply */
  circulatingSupply?: number;
  /** Total supply */
  totalSupply?: number;
}

/**
 * Price data for NFT collections
 */
export interface NFTAssetPrice extends BaseAssetPrice {
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
}

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
export interface FungibleAssetBalance {
  /** Raw balance amount as string (e.g., "1000000000" for 1000 USDC) */
  amount: string;
}

/**
 * Balance data for ERC721 NFTs.
 * Each tokenId has its own CAIP-19 asset ID, so always "1".
 */
export interface ERC721AssetBalance {
  /** Always "1" for ERC721 (non-fungible) */
  amount: '1';
}

/**
 * Balance data for ERC1155 multi-tokens.
 */
export interface ERC1155AssetBalance {
  /** Quantity owned of this specific tokenId */
  amount: string;
}

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
 * Request for data from data sources
 */
export interface DataFetchRequest {
  /** Account IDs to fetch data for */
  accountIds: AccountId[];
  /** Account addresses corresponding to accountIds */
  addresses: string[];
  /** CAIP-2 chain IDs */
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
}

/**
 * Response from data sources
 */
export interface DataResponse {
  /** Metadata for assets (shared across accounts) */
  assetsMetadata?: Record<Caip19AssetId, AssetMetadata>;
  /** Price data for assets (shared across accounts) */
  assetsPrice?: Record<Caip19AssetId, AssetPrice>;
  /** Balance data per account */
  assetsBalance?: Record<AccountId, Record<Caip19AssetId, AssetBalance>>;
  /** Errors encountered during fetch */
  errors?: Record<AccountId, Record<ChainId, string>>;
}

/**
 * Context for fetch operations
 */
export interface FetchContext {
  type: 'fetch';
  request: DataFetchRequest;
  response: DataResponse;
}

/**
 * Context for subscribe operations
 */
export interface SubscribeContext {
  type: 'subscribe';
  request: DataFetchRequest;
  /**
   * Unique identifier for this subscription.
   * Data sources can use this to update existing subscriptions
   * instead of creating new ones when the same ID is used.
   */
  subscriptionId: string;
  /**
   * Whether this is an update to an existing subscription.
   * If true, data sources should update their existing subscription
   * rather than creating a new one.
   */
  isUpdate: boolean;
  /**
   * Callback for updates from data sources.
   * @param response - The update data
   * @param sourceId - Optional identifier of the data source that sent the update
   */
  onUpdate: (response: DataResponse, sourceId?: string) => void;
  /** Register cleanup function */
  addCleanup: (cleanup: () => void) => void;
  /**
   * Get the original subscription request.
   * Useful for update middlewares to know what data types were requested.
   */
  getRequest: () => DataFetchRequest;
}

/**
 * Union type for middleware context
 */
export type MiddlewareContext = FetchContext | SubscribeContext;

/**
 * Next function for middleware chain
 */
export type NextFunction = (
  context: MiddlewareContext,
) => Promise<MiddlewareContext>;

/**
 * Data source middleware function
 */
export type DataSourceMiddleware = (
  context: MiddlewareContext,
  next: NextFunction,
) => Promise<MiddlewareContext>;

// ============================================================================
// UPDATE MIDDLEWARE TYPES (for async responses)
// ============================================================================

/**
 * Functions available to update middleware for triggering additional fetches
 */
export interface UpdateMiddlewareFetchers {
  /** Fetch metadata for specific assets */
  fetchMetadata: (assetIds: Caip19AssetId[]) => Promise<void>;
  /** Fetch prices for specific assets */
  fetchPrice: (assetIds: Caip19AssetId[]) => Promise<void>;
  /** Fetch balances for specific assets */
  fetchBalance: (assetIds: Caip19AssetId[]) => Promise<void>;
}

/**
 * Context for update operations (async responses from data sources)
 */
export interface UpdateContext {
  /** The response data from a data source */
  response: DataResponse;
  /** Source of the update (data source ID) */
  sourceId?: string;
  /** Timestamp of the update */
  timestamp: number;
  /** Original subscription request that triggered this update */
  subscriptionRequest?: DataFetchRequest;
  /** Read-only access to current controller state */
  getState: () => {
    assetsMetadata: Record<string, unknown>;
    assetsPrice: Record<string, unknown>;
    assetsBalance: Record<string, Record<string, unknown>>;
  };
  /** Functions to trigger additional fetches */
  fetchers: UpdateMiddlewareFetchers;
}

/**
 * Next function for update middleware chain
 */
export type UpdateNextFunction = (context: UpdateContext) => Promise<void>;

/**
 * Update middleware function - processes async responses before state update.
 *
 * Use cases:
 * - Filter out spam/invalid data
 * - Transform/normalize response data
 * - Enrich data (add metadata, compute values)
 * - Log/monitor updates
 * - Validate data integrity
 * - Trigger additional fetches (metadata, price) for new assets
 *
 * @param context - The update context with response data, state access, and fetchers
 * @param next - Call to continue to the next middleware
 *
 * @example
 * ```typescript
 * // Fetch missing metadata for new assets
 * async (context, next) => {
 *   const state = context.getState();
 *   const newAssets = Object.keys(context.response.assetsBalance ?? {})
 *     .flatMap(accountId => Object.keys(context.response.assetsBalance[accountId]))
 *     .filter(assetId => !state.assetsMetadata[assetId]);
 *
 *   if (newAssets.length > 0) {
 *     await context.fetchers.fetchMetadata(newAssets);
 *   }
 *   await next(context);
 * }
 * ```
 */
export type UpdateMiddleware = (
  context: UpdateContext,
  next: UpdateNextFunction,
) => Promise<void>;

/**
 * Data source definition - provided when registering a data source.
 *
 * Data sources declare their active chains (supported AND available) and notify
 * when chains become active/inactive. The middleware handles all data fetching
 * and transformation logic.
 */
export interface DataSourceDefinition {
  /** Unique identifier for the data source */
  id: string;
  /** Priority (higher = processed first, preferred for active chains) */
  priority: number;
  /** The middleware function that handles fetch/subscribe requests */
  middleware: DataSourceMiddleware;
  /**
   * Get currently active chains (supported AND available).
   * Async to allow fetching from API on first call.
   */
  getActiveChains: () => Promise<ChainId[]>;
  /**
   * Subscribe to active chain changes (optional).
   * Called whenever chains become active or inactive.
   * Returns cleanup function.
   */
  onActiveChainChange?: (
    callback: (activeChains: ChainId[]) => void,
  ) => () => void;
}

/**
 * Registered data source with cached active chains
 */
export interface RegisteredDataSource extends DataSourceDefinition {
  /** Cached active chains (updated from async calls and change events) */
  cachedActiveChains: ChainId[];
  /** Last time active chains were refreshed */
  lastChainsRefresh: number;
}

/**
 * Subscription response
 */
export interface SubscriptionResponse {
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
}

// ============================================================================
// COMBINED ASSET TYPE (for UI)
// ============================================================================

/**
 * Combined asset type matching state structure: balance, metadata, price
 */
export interface Asset {
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
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event emitted when balances change
 */
export interface BalanceChangeEvent {
  accountId: AccountId;
  assetId: Caip19AssetId;
  previousAmount: string;
  newAmount: string;
  timestamp: number;
}

/**
 * Event emitted when prices change
 */
export interface PriceChangeEvent {
  assetIds: Caip19AssetId[];
  timestamp: number;
}

/**
 * Event emitted when metadata changes
 */
export interface MetadataChangeEvent {
  assetId: Caip19AssetId;
  changes: Partial<AssetMetadata>;
}

/**
 * Event emitted when new assets are detected
 */
export interface AssetsDetectedEvent {
  accountId: AccountId;
  assetIds: Caip19AssetId[];
}
